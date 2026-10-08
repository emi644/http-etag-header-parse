/**
 * HTTP ETag header parsing library.
 *
 * Exports a small, focused surface for parsing entity-tag values and
 * evaluating If-Match / If-None-Match conditional request headers per
 * RFC 9110 §13.1.1, §13.1.2 and §8.8.3.
 */

export { parseETag } from './core.js';
export { formatETag } from './core.js';
export { etagsMatch } from './core.js';
export { satisfiesIfMatch } from './core.js';
export { satisfiesIfNoneMatch } from './core.js';
export { WILDCARD } from './core.js';
