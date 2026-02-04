# Strategies

External (vendored) strategies live here.

Hard rules:
- Keep upstream code isolated under `upstream/`
- Preserve LICENSE and attribution
- Our integration code lives **only** in `adapter.ts`
- Paper mode only

Each strategy folder:

```
strategies/<strategyName>/
  upstream/         # minimal upstream files (untouched)
  LICENSE           # copied from upstream (MIT required)
  meta.json         # our metadata + params schema
  adapter.ts        # ONLY place our code goes
```
