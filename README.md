# Subtitle Workbench

**English** | [简体中文](./README.zh-CN.md)

> 🌐 **[Try it online →](https://subtitle-rs.github.io/subtitle-format-conversion/)**

A fully client-side subtitle workbench. Built on the [subtitler](https://crates.io/crates/subtitler) Rust library compiled to WebAssembly — everything runs 100% in your browser. **No backend, no uploads: your files never leave your device.**

Supports **17 subtitle formats**: SRT · VTT · ASS · SSA · MicroDVD · Spruce · SubViewer · TTML · DFXP · ITT · Whisper · SBV · LRC · SAMI · MPL2 · SCC · EBU STL

Available in **14 languages**: English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Русский · Français · Deutsch · Español · Português · Italiano · Tiếng Việt · العربية · עברית (with full RTL support)

## Features

Five tools in top tabs, all sharing one input:

- **Convert** — 17-format conversion with auto source detection, live preview (debounced), copy / download
- **Validate** — basic checks (overlaps, negative durations, out-of-order) plus broadcaster guideline presets: Netflix / BBC / TED / ARD-ORF-SRF-ZDF / Channel 4
- **Normalize** — strip HTML/ASS tags (button-triggered, original stays intact)
- **Repair** — enforce minimum gap / merge duplicate lines / roll-up repair / EDL shot-change rules (Netflix delivery)
- **Info** — format / cue count / total duration / first & last timestamps, formatted as `HH:MM:SS.mmm`

Also:

- Drag & drop or paste input; switching tabs keeps your content
- Lazy computation — only the active tab runs, large files stay snappy
- Light / dark / system theme · mobile responsive · offline-capable after first load

## Tech Stack

- **WASM engine**: [subtitler 2.10.0](https://crates.io/crates/subtitler) via a thin wrapper crate (`wasm/`)
- **Frontend**: React 19 + TypeScript + Vite 8
- **UI**: Tailwind v4 + shadcn/ui (new-york) · **i18n**: react-i18next
- **Package manager**: pnpm

## Local Development

Prerequisites: Node ≥ 20, pnpm ≥ 11, Rust stable with the `wasm32-unknown-unknown` target, and `wasm-pack`.

```bash
# One-time setup
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# Install dependencies
pnpm install

# Build the WASM pkg (first time, or after changing wasm/)
pnpm build:wasm

# Start the dev server
pnpm dev          # → http://localhost:5173

# Verify (typecheck + production build)
pnpm verify
```

WASM unit tests (24):

```bash
cd wasm && wasm-pack test --node --lib
```

## Localization

UI strings live in `src/i18n/locales/{code}.json` (one file per language, all keyed against `en.json`). The language registry is `src/i18n/languages.ts`.

**To add a language (2 steps):**

1. Create `src/i18n/locales/{code}.json` — copy `en.json` and translate the values (keys stay in English)
2. Register it in `src/i18n/languages.ts`: add `{ code, nativeName, dir }` to `SUPPORTED_LANGUAGES`

The language dropdown renders from the registry automatically. Set `dir: "rtl"` for right-to-left languages — `<html dir>`, layout mirroring, and content direction are handled for you.

All locale files must have identical key sets; check parity with:

```bash
node -e "const fs=require('fs');const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?flat(v,p+k+'.'):[p+k]);const en=new Set(flat(JSON.parse(fs.readFileSync('src/i18n/locales/en.json','utf8'))));for(const f of fs.readdirSync('src/i18n/locales')){const k=new Set(flat(JSON.parse(fs.readFileSync('src/i18n/locales/'+f,'utf8'))));const m=[...en].filter(x=>!k.has(x)),e=[...k].filter(x=>!en.has(x));if(m.length||e.length)console.log(f,'MISSING:',m,'EXTRA:',e);else console.log(f,'✓')}"
```

## Deployment (GitHub Pages)

Deployment is **tag-triggered**, not on every main push:

- **main push / PR**: CI tests only (build-wasm + test-wasm + typecheck), no deploy
- **tag push** (e.g. `v0.5.0`): tests + deploy to GitHub Pages

The deploy pipeline: build wasm pkg (cached) → wasm unit tests → typecheck + production build → Pages.

**Live at**: <https://subtitle-rs.github.io/subtitle-format-conversion/>

### Release steps

```bash
git checkout main && git pull
git tag v0.6.0            # semver
git push origin v0.6.0    # watch the deploy in the Actions tab
```

### First-time setup (once)

In the repo **Settings → Pages → Build and deployment → Source**, select **"GitHub Actions"** (not "Deploy from a branch").

### `base` path note

Pages serves the app under `/subtitle-format-conversion/`, so Vite's `base` must match. It's driven by the `BASE_PATH` env var:

- Local `pnpm dev` / `pnpm build`: `base = "/"` (default)
- CI deploy: injects `BASE_PATH=/subtitle-format-conversion/`

To change the deploy path (custom domain or repo rename), update `env.BASE_PATH` in `.github/workflows/ci.yml`.

## Project Layout

```
├── wasm/              # Thin WASM wrapper crate around subtitler
├── src/
│   ├── i18n/          # Language registry + 14 locale files
│   ├── lib/           # Typed WASM wrappers + format metadata
│   ├── hooks/         # Per-tool hooks (debounce, lazy, button-triggered)
│   └── components/    # Tool tabs, panels, shadcn ui/
├── pkg/               # wasm-pack output (gitignored)
└── .github/workflows/ci.yml
```

## License

Apache-2.0 (same as subtitler)
