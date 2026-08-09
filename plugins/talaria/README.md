# plugins/talaria — desktop runtime plugin

Hermes Electron runtime plugin (`id: talaria`, route `/talaria`).

## Files

| File | Source (workspace) |
|---|---|
| `desktop/plugin.js` | `noble-trader-agent/.hermes/plugins/talaria/desktop/plugin.js` |
| `plugin.js` (root) | byte-identical copy of `desktop/plugin.js` (sync after every edit) |
| `desktop/test_talaria_render_harness.mjs` | `noble-trader-agent/.hermes/plugins/talaria/desktop/test_talaria_render_harness.mjs` |

## Constraints (do not violate)

- Imports limited to `react` + `@hermes/plugin-sdk` (plain ESM, `React.createElement`, no JSX)
- Helpers MUST be defined BEFORE the component that uses them (ESM ordering → error #310)
- daisyUI bundle is **prefixed** (`dui-`) + preflight-free — never inject an unprefixed bundle
- Only anon key + RLS-granted views — **never** a service-role key

## Fill step

Copy the three source files above into place, then run:
`node --check`, the render harness, and `cmp` the two plugin.js copies.
