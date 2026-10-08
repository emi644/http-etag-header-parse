/**
 * Core implementation of HTTP ETag parsing and comparison.
 *
 * Why quoted-string comparison is character-exact rather than RFC 9110
 * obs-text tolerant: in practice, the only meaningful deviation a server
 * emits inside a quoted etag is an escaped backslash or quote. We deliberately
 * do not attempt to canonicalise obs-text byte values because no real client
 * distinguishes them; accepting them would silently mask malformed headers.
 */

import { formatETag, parseETag, satisfiesIfMatch, satisfiesIfNoneMatch, etagsMatch, WILDCARD, } from './logic.js';

export { formatETag, parseETag, satisfiesIfMatch, satisfiesIfNoneMatch, etagsMatch, WILDCARD, };
