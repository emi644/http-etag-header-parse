import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseETag,
  formatETag,
  etagsMatch,
  satisfiesIfMatch,
  satisfiesIfNoneMatch,
  WILDCARD,
} from '../src/index.js';

test('parseETag parses a basic strong etag', () => {
  const t = parseETag('"abc123"');
  assert.deepEqual(t, { weak: false, value: 'abc123' });
});

test('parseETag parses a weak etag', () => {
  const t = parseETag('W/"abc123"');
  assert.deepEqual(t, { weak: true, value: 'abc123' });
});

test('parseETag rejects lowercase w/ prefix', () => {
  assert.strictEqual(parseETag('w/"abc123"'), null);
});

test('parseETag rejects an unquoted value', () => {
  assert.strictEqual(parseETag('abc123'), null);
});

test('parseETag rejects a trailing character after the closing quote', () => {
  assert.strictEqual(parseETag('"abc"x'), null);
});

test('parseETag rejects an unterminated quoted string', () => {
  assert.strictEqual(parseETag('"abc'), null);
});

test('parseETag rejects control characters inside the quoted value', () => {
  assert.strictEqual(parseETag('"ab\u0001cd"'), null);
});

test('parseETag handles escaped backslash and quote', () => {
  const t = parseETag('"a\\\\b\\"c"');
  assert.deepEqual(t, { weak: false, value: 'a\\b"c' });
});

test('parseETag rejects a dangling backslash escape', () => {
  assert.strictEqual(parseETag('"abc\\'), null);
});

test('parseETag accepts an empty quoted value', () => {
  assert.deepEqual(parseETag('""'), { weak: false, value: '' });
});

test('parseETag rejects non-string input', () => {
  assert.strictEqual(parseETag(123), null);
  assert.strictEqual(parseETag(null), null);
});

test('formatETag round-trips a strong tag', () => {
  assert.strictEqual(formatETag({ weak: false, value: 'abc123' }), '"abc123"');
});

test('formatETag round-trips a weak tag', () => {
  assert.strictEqual(formatETag({ weak: true, value: 'abc123' }), 'W/"abc123"');
});

test('formatETag escapes backslash and quote', () => {
  assert.strictEqual(formatETag({ weak: false, value: 'a\\b"c' }), '"a\\\\b\\"c"');
});

test('formatETag throws on malformed input', () => {
  assert.throws(() => formatETag(null), TypeError);
  assert.throws(() => formatETag({ weak: false }), TypeError);
});

test('etagsMatch treats same value as equal regardless of weakness', () => {
  const a = parseETag('"v1"');
  const b = parseETag('W/"v1"');
  assert.strictEqual(etagsMatch(a, b), true);
});

test('etagsMatch with strong=true distinguishes weak from strong', () => {
  const a = parseETag('"v1"');
  const b = parseETag('W/"v1"');
  assert.strictEqual(etagsMatch(a, b, { strong: true }), false);
});

test('etagsMatch with strong=true accepts two matching strong tags', () => {
  const a = parseETag('"v1"');
  const b = parseETag('"v1"');
  assert.strictEqual(etagsMatch(a, b, { strong: true }), true);
});

test('etagsMatch returns false for differing values', () => {
  const a = parseETag('"v1"');
  const b = parseETag('"v2"');
  assert.strictEqual(etagsMatch(a, b), false);
});

test('satisfiesIfMatch wildcard passes when the resource exists', () => {
  assert.strictEqual(satisfiesIfMatch('*', parseETag('"v1"')), true);
});

test('satisfiesIfMatch wildcard fails when the resource does not exist', () => {
  assert.strictEqual(satisfiesIfMatch('*', null, { exists: false }), false);
});

test('satisfiesIfMatch passes on a strong tag match', () => {
  assert.strictEqual(
    satisfiesIfMatch('"v1"', parseETag('"v1"')),
    true,
  );
});

test('satisfiesIfMatch fails when the header lists only a weak tag', () => {
  // Even though the values match, If-Match requires a strong comparison,
  // and the client's weak-tag cannot strongly match a strong resource tag.
  assert.strictEqual(
    satisfiesIfMatch('W/"v1"', parseETag('"v1"')),
    false,
  );
});

test('satisfiesIfMatch fails when the resource is weak and header is strong', () => {
  assert.strictEqual(
    satisfiesIfMatch('"v1"', parseETag('W/"v1"')),
    false,
  );
});

test('satisfiesIfMatch matches any tag in a comma-separated list', () => {
  assert.strictEqual(
    satisfiesIfMatch('"v0", "v1", "v2"', parseETag('"v1"')),
    true,
  );
});

test('satisfiesIfMatch returns false when no tag matches', () => {
  assert.strictEqual(
    satisfiesIfMatch('"v0", "v2"', parseETag('"v1"')),
    false,
  );
});

test('satisfiesIfMatch returns false when current is null', () => {
  assert.strictEqual(satisfiesIfMatch('"v1"', null), false);
});

test('satisfiesIfMatch returns false on malformed header', () => {
  assert.strictEqual(satisfiesIfMatch('not-an-etag', parseETag('"v1"')), false);
});

test('satisfiesIfNoneMatch wildcard fails when the resource exists', () => {
  assert.strictEqual(satisfiesIfNoneMatch('*', parseETag('"v1"')), false);
});

test('satisfiesIfNoneMatch wildcard passes when the resource does not exist', () => {
  assert.strictEqual(satisfiesIfNoneMatch('*', null, { exists: false }), true);
});

test('satisfiesIfNoneMatch passes when current is null', () => {
  assert.strictEqual(satisfiesIfNoneMatch('"v1"', null), true);
});

test('satisfiesIfNoneMatch fails on a matching tag (weak comparison)', () => {
  // If-None-Match uses weak comparison: the weak header tag matches the
  // strong resource tag, so the precondition is violated.
  assert.strictEqual(
    satisfiesIfNoneMatch('W/"v1"', parseETag('"v1"')),
    false,
  );
});

test('satisfiesIfNoneMatch passes when no tag matches', () => {
  assert.strictEqual(
    satisfiesIfNoneMatch('"v0", "v2"', parseETag('"v1"')),
    true,
  );
});

test('satisfiesIfNoneMatch returns false on malformed header', () => {
  assert.strictEqual(satisfiesIfNoneMatch('garbage', parseETag('"v1"')), false);
});

test('satisfiesIfNoneMatch with empty header returns false', () => {
  assert.strictEqual(satisfiesIfNoneMatch('', parseETag('"v1"')), false);
});

test('WILDCARD is a distinct symbol', () => {
  assert.equal(typeof WILDCARD, 'symbol');
});
