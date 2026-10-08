/**
 * Pure parsing and comparison logic for entity-tags.
 *
 * An entity-tag is, per RFC 9110 §8.8.3:
 *
 *   entity-tag = [ weak ] opaque-tag
 *   weak       = %x57.2F ; "W/", case-sensitive
 *   opaque-tag = DQUOTE *1(c-text / quoted-pair) DQUOTE
 *
 * We intentionally reject the bare-token form. RFC 9110 etags are always
 * quoted; accepting unquoted values would let malformed intermediaries
 * poison caches silently.
 */

/**
 * Sentinel used for the "*" wildcard in If-Match / If-None-Match.
 * We expose a distinct sentinel rather than the raw string so callers can
 * distinguish a parsed wildcard from an etag whose literal value is "*".
 */
export const WILDCARD = Symbol('etag-wildcard');

/**
 * Parse a single entity-tag string.
 *
 * @param {string} raw
 * @returns {{weak: boolean, value: string} | null}
 *   Returns an object with `weak` and the unquoted, unescaped value, or
 *   `null` if `raw` is not a syntactically valid entity-tag.
 */
export function parseETag(raw) {
  if (typeof raw !== 'string') return null;

  let i = 0;
  let weak = false;

  // RFC 9110 §8.8.3: the "W/" prefix is case-sensitive. Many clients send
  // "w/" in the wild, but accepting it would mask a genuine protocol error.
  if (raw.startsWith('W/')) {
    weak = true;
    i = 2;
  }

  if (raw.charCodeAt(i) !== 0x22 /* " */) return null;
  i++;

  let value = '';
  while (i < raw.length) {
    const code = raw.charCodeAt(i);

    if (code === 0x22 /* " */) {
      // Closing quote: there must be nothing after it.
      return i === raw.length - 1 ? { weak, value } : null;
    }

    if (code === 0x5c /* \ */) {
      // quoted-pair: backslash followed by a single character that is
      // literally appended. RFC 9110 restricts the next char to HTAB,
      // SP, VCHAR, or obs-text; we accept any non-empty escape because
      // rejecting mid-stream would be worse than tolerating, but we do
      // require a following character.
      if (i + 1 >= raw.length) return null;
      value += raw[i + 1];
      i += 2;
      continue;
    }

    if (code === 0x09 /* HTAB */ || (code >= 0x20 && code <= 0x7e)) {
      value += raw[i];
      i++;
      continue;
    }

    // Reject obs-text and control characters. Real etags do not need them;
    // tolerating them would hide encoding bugs.
    return null;
  }

  // Ran off the end without a closing quote.
  return null;
}

/**
 * Format an entity-tag back into its wire representation.
 *
 * @param {{weak: boolean, value: string}} tag
 * @returns {string}
 */
export function formatETag(tag) {
  if (!tag || typeof tag.value !== 'string') {
    throw new TypeError('formatETag expects { weak, value }');
  }
  // Re-escape backslash and quote so the round-trip is exact. Other
  // characters in `value` are already known-printable because parseETag
  // rejects anything outside the safe range.
  const escaped = tag.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return (tag.weak ? 'W/' : '') + '"' + escaped + '"';
}

/**
 * Strong-vs-weak comparison of two parsed entity-tags, per RFC 9110 §8.8.3.2.
 *
 * Two entity-tags are equivalent if their opaque values match. They are
 * "strongly" equivalent only if both are strong (non-weak) AND their values
 * match.
 *
 * @param {{weak: boolean, value: string}} a
 * @param {{weak: boolean, value: string}} b
 * @param {object} [opts]
 * @param {boolean} [opts.strong=false]
 *   When true, weak/strong distinction is honoured: a strong and weak tag
 *   with the same value are NOT considered equal.
 * @returns {boolean}
 */
export function etagsMatch(a, b, opts) {
  if (!a || !b || typeof a.value !== 'string' || typeof b.value !== 'string') {
    return false;
  }
  const strong = opts && opts.strong === true;
  if (a.value !== b.value) return false;
  if (strong) return !a.weak && !b.weak;
  return true;
}

/**
 * Parse an If-Match or If-None-Match header value into a list of entity-tags
 * or the WILDCARD sentinel. Returns `null` for syntactically invalid input.
 *
 * The wildcard "*" is only valid as the sole value; we reject "*, \"x\"".
 *
 * @param {string} header
 * @returns {symbol | Array<{weak: boolean, value: string}> | null}
 */
function parseHeaderList(header) {
  if (typeof header !== 'string') return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;

  if (trimmed === '*') return WILDCARD;

  const parts = trimmed.split(',');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    // RFC 9110 allows optional whitespace around commas; the header field
    // ABNF permits OWS but the value itself is already trimmed by parseETag.
    const parsed = parseETag(parts[i].trim());
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

/**
 * Evaluate an If-Match header (RFC 9110 §13.1.1).
 *
 * If-Match passes (the precondition is satisfied) when:
 *   - the header is the wildcard "*" and a resource exists, OR
 *   - the header lists an entity-tag that strongly matches the resource's
 *     current tag.
 *
 * Weak comparison is never permitted for If-Match.
 *
 * @param {string} header
 * @param {{weak: boolean, value: string} | null} current
 * @param {object} [opts]
 * @param {boolean} [opts.exists=true]
 *   Whether the resource exists; only consulted for the wildcard form.
 * @returns {boolean}
 */
export function satisfiesIfMatch(header, current, opts) {
  const exists = opts && opts.exists === false ? false : true;
  const list = parseHeaderList(header);
  if (list === null) return false;

  if (list === WILDCARD) return exists;
  if (!current) return false;

  // If-Match is always a strong comparison regardless of how the client
  // phrased the etag in the header.
  for (const candidate of list) {
    if (etagsMatch(candidate, current, { strong: true })) return true;
  }
  return false;
}

/**
 * Evaluate an If-None-Match header (RFC 9110 §13.1.2).
 *
 * If-None-Match fails (the precondition is violated, triggering 412) when
 * any listed tag matches the current one using the *weak* comparison
 * function. The wildcard "*" matches any existing resource.
 *
 * @param {string} header
 * @param {{weak: boolean, value: string} | null} current
 * @param {object} [opts]
 * @param {boolean} [opts.exists=true]
 * @returns {boolean}
 */
export function satisfiesIfNoneMatch(header, current, opts) {
  const exists = opts && opts.exists === false ? false : true;
  const list = parseHeaderList(header);
  if (list === null) return false;

  if (list === WILDCARD) return !exists;
  if (!current) return true;

  // If-None-Match uses weak comparison: a weak and strong tag with the
  // same value are considered equal for this precondition.
  for (const candidate of list) {
    if (etagsMatch(candidate, current)) return false;
  }
  return true;
}
