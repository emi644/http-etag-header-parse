# HTTP ETag Header Parse

Parses and compares HTTP entity-tag values, handling the `W/` weak prefix, quoted-string escapes, and `If-Match` / `If-None-Match` validation rules per RFC 9110.

## Usage

```js
import {
  parseETag,
  formatETag,
  etagsMatch,
  satisfiesIfMatch,
  satisfiesIfNoneMatch,
} from './src/index.js';

const tag = parseETag('W/"abc123"');
// { weak: true, value: 'abc123' }

formatETag(tag); // 'W/"abc123"'

etagsMatch(parseETag('"v1"'), parseETag('W/"v1"'));        // true
etagsMatch(parseETag('"v1"'), parseETag('W/"v1"'), { strong: true }); // false

satisfiesIfMatch('"v1", "v2"', parseETag('"v2"'));        // true
satisfiesIfNoneMatch('W/"v1"', parseETag('"v1"'));       // false
```

## Exports

- `parseETag(raw)` → `{ weak, value }` or `null`
- `formatETag({ weak, value })` → wire-formatted string
- `etagsMatch(a, b, opts?)` → boolean; `opts.strong` honours weak/strong distinction
- `satisfiesIfMatch(header, current, opts?)` → boolean; `opts.exists` (default `true`)
- `satisfiesIfNoneMatch(header, current, opts?)` → boolean; `opts.exists` (default `true`)
- `WILDCARD` — symbol sentinel for the `*` header form

## Why

Writing `If-Match` / `If-None-Match` handlers by hand tends to forget one of three things: the `W/` prefix is case-sensitive, `If-Match` requires a *strong* comparison while `If-None-Match` uses the *weak* one, and quoted-string backslash escapes round-trip. This library is a single focused module that does exactly those things and nothing else.

The deliberate trade-off: the parser rejects unquoted token etags and `obs-text` bytes inside the quoted value. RFC 9110 technically permits obs-text; we refuse it because every real-world etag is printable ASCII and tolerating obs-text silently masks encoding bugs.

## Edge you will hit

The `W/` prefix is case-sensitive. `w/"v1"` is rejected as `null`, not parsed as weak. If your client sends lowercase, that is a protocol error and this library will not paper over it.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

