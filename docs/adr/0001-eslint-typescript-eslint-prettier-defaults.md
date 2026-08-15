# Lint/format stack: ESLint + typescript-eslint (recommended-type-checked) + Prettier defaults

The repo had no lint or format tooling. Considered Biome (single fast tool, combined lint+format) against ESLint + `typescript-eslint`. Chose ESLint + `typescript-eslint` on `recommended-type-checked`, plus `eslint-plugin-react-hooks`/`react-refresh` — it's the stack Vite's own React+TS scaffold ships, and its React-hooks rule coverage is more mature than Biome's. Paired with Prettier on **default** config (semicolons, double quotes) rather than configuring it to match the codebase's existing no-semicolon/single-quote style, so the whole `src/` tree was reformatted once, in its own commit, to avoid carrying a permanent custom-config fork of Prettier's defaults.

## Considered Options

- Biome — rejected for weaker React-hooks lint rules at time of decision.
- Prettier configured to match existing style (no reformat) — rejected in favor of adopting stock defaults outright, trading a one-time large diff for zero ongoing config drift from the Prettier standard.
