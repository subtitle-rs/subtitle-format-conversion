# 字幕格式转换网页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个纯客户端的字幕格式转换网页：上传/粘贴字幕 → 选目标格式 → 实时预览 → 下载/复制，全程在浏览器内完成。

**Architecture:** React + TypeScript + Vite 前端，通过本项目内的薄包装 Rust crate（`wasm/`）把 `subtitler` 库编译成 WASM。无后端，静态部署。

**Tech Stack:** Rust/wasm-pack/wasm-bindgen，React 18，TypeScript，Vite，Tailwind CSS，shadcn/ui。

**Spec:** `docs/superpowers/specs/2026-07-18-subtitle-format-conversion-web-design.md`

**Subtitler API（包装 crate 内部调用）：**
- `subtitler::detect_format(&[u8]) -> Option<Format>`
- `subtitler::parse_bytes(&[u8]) -> Result<SubtitleFile, ParseError>`
- `SubtitleFormat::to_string_with_format(&self, &Format) -> String`（trait 方法，`SubtitleFile` 实现了它）
- `SubtitleFile::subtitles(&self) -> &[Subtitle]` / `format(&self) -> Format`

---

## File Structure

```
subtitle-format-conversion/
├── Cargo.toml                    # workspace,成员 [wasm]
├── wasm/
│   ├── Cargo.toml                # path 依赖 ../../subtitler
│   └── src/lib.rs                # 3 个 #[wasm_bindgen] 函数 + 测试
├── package.json
├── vite.config.ts                # wasm 插件 + 路径别名
├── tsconfig.json
├── tsconfig.node.json
├── components.json               # shadcn 配置
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── .gitignore
├── src/
│   ├── main.tsx                  # React 入口
│   ├── App.tsx                   # 顶层布局 + 状态编排
│   ├── index.css                 # Tailwind 指令 + shadcn 变量
│   ├── lib/
│   │   ├── utils.ts              # cn() helper
│   │   ├── formats.ts            # 格式元数据(名称/扩展名/显示名)
│   │   └── subtitler.ts          # WASM 初始化 + 类型化封装
│   ├── hooks/
│   │   └── useSubtitleConvert.ts # debounce detect+convert
│   └── components/
│       ├── ui/                   # shadcn 生成
│       ├── Header.tsx
│       ├── FormatPicker.tsx
│       ├── InputPanel.tsx
│       ├── OutputPanel.tsx
│       └── Footer.tsx
└── pkg/                          # gitignored,wasm-pack 输出
```

---

## Task 1: 项目骨架与 gitignore

**Files:**
- Create: `.gitignore`
- Create: `Cargo.toml`
- Create: `wasm/Cargo.toml`

- [ ] **Step 1: 创建 `.gitignore`**

```
# Rust / wasm-pack
pkg/
wasm/target/
target/

# Node
node_modules/
dist/
dist-ssr/
*.local

# Editor
.vscode/*
!.vscode/extensions.json
.idea/
.DS_Store

# Logs
*.log
npm-debug.log*
```

- [ ] **Step 2: 创建 workspace `Cargo.toml`**

```toml
[workspace]
members = ["wasm"]
resolver = "2"

[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

- [ ] **Step 3: 创建 `wasm/Cargo.toml`**

```toml
[package]
name = "subtitle-converter-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
subtitler = { path = "../../subtitler", default-features = false, features = [
  "srt", "vtt", "ass", "ssa", "microdvd", "subviewer",
  "ttml", "sbv", "lrc", "sami", "mpl2", "scc", "ebu_stl", "wasm"
] }
wasm-bindgen = "0.2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[dev-dependencies]
wasm-bindgen-test = "0.3"
```

注：`dfxp`/`whisper`/`http`/`io` 排除（前者无用，后者 wasm 不可用）。`subtitler` 路径是 `../../subtitler`（从 `wasm/` 目录看是 `../subtitler`，但 cargo 解析相对 crate 根即 `wasm/Cargo.toml` 所在目录，故 `../../subtitler` 指向 `subtitle-rs/subtitler`）。

- [ ] **Step 4: 提交**

```bash
git add .gitignore Cargo.toml wasm/Cargo.toml
git commit -m "chore: project skeleton — cargo workspace + wasm crate manifest"
```

---

## Task 2: WASM 包装 crate — 格式字符串映射

先做格式字符串 ⇄ `Format` 枚举的映射，这是后续 detect/convert 的基础。用 TDD。

**Files:**
- Create: `wasm/src/lib.rs`

- [ ] **Step 1: 写失败的测试（格式名 ↔ Format）**

`wasm/src/lib.rs`：

```rust
use wasm_bindgen::test::*;

#[wasm_bindgen_test]
fn parse_format_name_srt() {
    assert!(format_from_name("srt").is_some());
}

#[wasm_bindgen_test]
fn parse_format_name_unknown_returns_none() {
    assert!(format_from_name("garbage").is_none());
}

#[wasm_bindgen_test]
fn format_name_roundtrip() {
    let fmt = format_from_name("vtt").unwrap();
    assert_eq!(format_to_name(fmt), "vtt");
}

#[wasm_bindgen_test]
fn supported_formats_contains_core() {
    let list = supported_formats();
    assert!(list.contains("srt"));
    assert!(list.contains("vtt"));
    assert!(list.contains("ass"));
}
```

注：此处函数尚未定义，编译会失败。

- [ ] **Step 2: 运行测试，确认失败（编译错误）**

```bash
cd wasm && wasm-pack test --node --lib
```

预期：编译失败，`cannot find function format_from_name` 等。

- [ ] **Step 3: 实现格式映射**

在 `wasm/src/lib.rs` 顶部补上（测试代码保留在文件底部）：

```rust
use subtitler::model::{Format, SubtitleFormat as _};
use wasm_bindgen::prelude::*;

/// 字符串 → Format。不认识返回 None。
pub(crate) fn format_from_name(name: &str) -> Option<Format> {
    match name.to_lowercase().as_str() {
        "srt"      => Some(Format::Srt),
        "vtt"      => Some(Format::Vtt),
        "ass"      => Some(Format::Ass),
        "ssa"      => Some(Format::Ssa),
        "microdvd" => Some(Format::MicroDvd),
        "subviewer"=> Some(Format::SubViewer),
        "ttml"     => Some(Format::Ttml),
        "sbv"      => Some(Format::Sbv),
        "lrc"      => Some(Format::Lrc),
        "sami"     => Some(Format::Sami),
        "mpl2"     => Some(Format::Mpl2),
        "scc"      => Some(Format::Scc),
        "ebu_stl"  => Some(Format::EbuStl),
        _ => None,
    }
}

/// Format → 字符串。与 spec §6.3 表一致。
pub(crate) fn format_to_name(fmt: Format) -> &'static str {
    match fmt {
        Format::Srt       => "srt",
        Format::Vtt       => "vtt",
        Format::Ass       => "ass",
        Format::Ssa       => "ssa",
        Format::MicroDvd  => "microdvd",
        Format::SubViewer => "subviewer",
        Format::Ttml      => "ttml",
        Format::Sbv       => "sbv",
        Format::Lrc       => "lrc",
        Format::Sami      => "sami",
        Format::Mpl2      => "mpl2",
        Format::Scc       => "scc",
        Format::EbuStl    => "ebu_stl",
        Format::Dfxp      => "dfxp",
        Format::Whisper   => "whisper",
    }
}
```

（Dfxp/Whisper 分支必须存在，因为 `Format` 枚举含这两个 variant，即便 features 没启用编译期仍要求穷尽匹配——它们因 feature 关闭在运行时不会出现。）

- [ ] **Step 4: 实现 `supported_formats`（被测试用到的 #[wasm_bindgen] 函数先占位返回 JSON）**

在 `wasm/src/lib.rs` 继续补：

```rust
/// 列出所有支持的目标格式(JSON 数组字符串),前端 JSON.parse 用。
#[wasm_bindgen]
pub fn supported_formats() -> String {
    let names = [
        "srt", "vtt", "ass", "ssa", "microdvd", "subviewer",
        "ttml", "sbv", "lrc", "sami", "mpl2", "scc", "ebu_stl",
    ];
    serde_json::to_string(&names).expect("static array always serializes")
}
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
cd wasm && wasm-pack test --node --lib
```

预期：4 个测试 PASS。

- [ ] **Step 6: 提交**

```bash
git add wasm/src/lib.rs
git commit -m "feat(wasm): format name <-> Format enum mapping with tests"
```

---

## Task 3: WASM 包装 crate — detect_subtitle

**Files:**
- Modify: `wasm/src/lib.rs`

- [ ] **Step 1: 写失败的测试**

在 `wasm/src/lib.rs` 测试区追加：

```rust
#[wasm_bindgen_test]
fn detect_srt_content() {
    let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
    assert_eq!(detect_subtitle(srt), Some("srt".to_string()));
}

#[wasm_bindgen_test]
fn detect_garbage_returns_none() {
    assert_eq!(detect_subtitle("this is not a subtitle"), None);
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd wasm && wasm-pack test --node --lib
```

预期：编译失败，`cannot find function detect_subtitle`。

- [ ] **Step 3: 实现 `detect_subtitle`**

在 `wasm/src/lib.rs` 继续补：

```rust
/// 检测字幕格式。返回 "srt"/"vtt"/... 或 null(检测不出)。
#[wasm_bindgen]
pub fn detect_subtitle(content: &str) -> Option<String> {
    subtitler::detect_format(content.as_bytes()).map(format_to_name).map(str::to_string)
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd wasm && wasm-pack test --node --lib
```

预期：全部 PASS（含 Task 2 的 4 个）。

- [ ] **Step 5: 提交**

```bash
git add wasm/src/lib.rs
git commit -m "feat(wasm): detect_subtitle — auto-detect subtitle format"
```

---

## Task 4: WASM 包装 crate — convert_subtitle

**Files:**
- Modify: `wasm/src/lib.rs`

- [ ] **Step 1: 写失败的测试**

在测试区追加：

```rust
#[wasm_bindgen_test]
fn convert_srt_to_vtt() {
    let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
    let resp = convert_subtitle(srt, "vtt");
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["format"], "vtt");
    assert_eq!(v["count"], 1);
    assert!(v["output"].as_str().unwrap().contains("WEBVTT"));
}

#[wasm_bindgen_test]
fn convert_unknown_target_returns_error() {
    let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
    let resp = convert_subtitle(srt, "zzz");
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], false);
    assert!(v["error"].as_str().unwrap().contains("zzz"));
}

#[wasm_bindgen_test]
fn convert_invalid_content_returns_error() {
    let resp = convert_subtitle("not a subtitle at all", "vtt");
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], false);
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd wasm && wasm-pack test --node --lib
```

预期：编译失败，`cannot find function convert_subtitle`。

- [ ] **Step 3: 实现 `convert_subtitle`（永不 panic，全 match/Result）**

在 `wasm/src/lib.rs` 继续补：

```rust
/// 转换格式。返回 JSON 字符串:
///   成功 {"ok":true,"format":"vtt","count":N,"output":"..."}
///   失败 {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn convert_subtitle(content: &str, target: &str) -> String {
    // 1. 解析目标格式
    let target_fmt = match format_from_name(target) {
        Some(f) => f,
        None => {
            return serde_json::json!({
                "ok": false,
                "error": format!("Unsupported target format: {}", target)
            }).to_string();
        }
    };

    // 2. 解析源内容
    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({
                "ok": false,
                "error": e.to_string()
            }).to_string();
        }
    };

    // 3. 序列化为目标格式
    let count = file.subtitles().len() as u32;
    let output = file.to_string_with_format(&target_fmt);

    serde_json::json!({
        "ok": true,
        "format": format_to_name(target_fmt),
        "count": count,
        "output": output
    }).to_string()
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd wasm && wasm-pack test --node --lib
```

预期：全部 PASS（共 9 个测试）。

- [ ] **Step 5: 提交**

```bash
git add wasm/src/lib.rs
git commit -m "feat(wasm): convert_subtitle — JSON contract, never panics"
```

---

## Task 5: 构建 WASM pkg 并冒烟验证

**Files:** (无源码改动，仅构建验证)

- [ ] **Step 1: 构建 wasm pkg**

```bash
wasm-pack build wasm --target web --out-dir ../pkg
```

预期：在 `pkg/` 生成 `subtitle_converter_wasm.js`、`subtitle_converter_wasm_bg.wasm`、`subtitle_converter_wasm.d.ts`。

- [ ] **Step 2: 冒烟检查导出**

```bash
ls pkg/
grep -E "detect_subtitle|convert_subtitle|supported_formats" pkg/subtitle_converter_wasm.d.ts
```

预期：三个函数名都出现在 `.d.ts` 中。

- [ ] **Step 3: 确认 pkg/ 被 gitignore，不提交**

```bash
git status
```

预期：`pkg/` 不出现在 untracked 列表（已在 Task 1 的 .gitignore 内）。

---

## Task 6: Vite + React + TS 脚手架

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/main.tsx`

- [ ] **Step 1: 初始化 package.json**

```json
{
  "name": "subtitle-format-conversion",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:wasm": "wasm-pack build wasm --target web --out-dir ../pkg",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 2: 安装核心依赖**

```bash
npm install react react-dom
npm install -D typescript @types/react @types/react-dom vite @vitejs/plugin-react \
  vite-plugin-wasm vite-plugin-top-level-await
```

- [ ] **Step 3: 创建 `vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import path from "path";

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@wasm": path.resolve(__dirname, "./pkg"),
    },
  },
  server: {
    // pkg/ 在 dev 时需要存在
    fs: { allow: [".."] },
  },
});
```

- [ ] **Step 4: 创建 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"], "@wasm/*": ["./pkg/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: 创建 `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: 创建 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>字幕格式转换 · Subtitle Converter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 创建 `src/main.tsx`（最小 React 根）**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return <div style={{ padding: 24 }}>脚手架就绪</div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: 启动 dev server，确认能跑**

```bash
npm run dev
```

预期：浏览器打开 `http://localhost:5173`，显示「脚手架就绪」。Ctrl-C 停止。

- [ ] **Step 9: 提交**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/main.tsx
git commit -m "chore: vite + react + ts scaffold with wasm plugins"
```

---

## Task 7: Tailwind + shadcn/ui 配置

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/index.css`
- Create: `src/lib/utils.ts`
- Create: `components.json`
- Modify: `src/main.tsx`

- [ ] **Step 1: 安装 Tailwind 与 shadcn 依赖**

```bash
npm install -D tailwindcss@3 postcss autoprefixer
npm install class-variance-authority clsx tailwind-merge lucide-react \
  tailwindcss-animate @radix-ui/react-slot @radix-ui/react-select \
  @radix-ui/react-tabs @radix-ui/react-tooltip
```

（锁定 Tailwind v3，因为 shadcn 的组件 CSS 变量语法目前面向 v3。）

- [ ] **Step 2: 创建 `tailwind.config.ts`**（shadcn 标准配置）

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

- [ ] **Step 3: 创建 `postcss.config.js`**

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 4: 创建 `src/index.css`**（shadcn CSS 变量 + Tailwind 指令）

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
  html { color-scheme: light dark; }
}
```

- [ ] **Step 5: 创建 `src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: 创建 `components.json`**（shadcn CLI 配置）

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 7: 修改 `src/main.tsx` 引入 index.css**

将 `src/main.tsx` 顶部加一行：

```typescript
import "./index.css";
```

（其余不变）

- [ ] **Step 8: 启动 dev 确认 Tailwind 生效**

```bash
npm run dev
```

预期：页面背景变为白色/暗色（跟随系统），无样式报错。Ctrl-C 停止。

- [ ] **Step 9: 提交**

```bash
git add tailwind.config.ts postcss.config.js src/index.css src/lib/utils.ts components.json package.json package-lock.json src/main.tsx
git commit -m "chore: tailwind + shadcn/ui config"
```

---

## Task 8: 添加 shadcn UI 组件

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/scroll-area.tsx`
- Create: `src/components/ui/textarea.tsx`

（shadcn 组件是直接复制进项目的源码，不通过 npm。下面给出每个组件的标准内容。）

- [ ] **Step 1: `button.tsx`**

```typescript
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 2: `card.tsx`**

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("rounded-xl border bg-card text-card-foreground shadow", className)} {...props} />
  )
);
Card.displayName = "Card";
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";
const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";
const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
);
CardContent.displayName = "CardContent";
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
```

- [ ] **Step 3: `badge.tsx`**

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

- [ ] **Step 4: `textarea.tsx`**

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
```

- [ ] **Step 5: `select.tsx`**（Radix Select 包装）

```typescript
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
        position === "popper" && "data-[side=bottom]:translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem };
```

- [ ] **Step 6: `tabs.tsx`**

```typescript
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;
const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

- [ ] **Step 7: `tooltip.tsx`**

```typescript
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95",
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
```

- [ ] **Step 8: `scroll-area.tsx`**

```typescript
import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">{children}</ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
```

- [ ] **Step 9: 补装 scroll-area radix 依赖**

```bash
npm install @radix-ui/react-scroll-area
```

- [ ] **Step 10: 类型检查**

```bash
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 11: 提交**

```bash
git add src/components/ui/ package.json package-lock.json
git commit -m "feat(ui): add shadcn components (button/card/select/tabs/badge/tooltip/scroll-area/textarea)"
```

---

## Task 9: 前端格式元数据 + WASM 封装层

**Files:**
- Create: `src/lib/formats.ts`
- Create: `src/lib/subtitler.ts`

- [ ] **Step 1: 创建 `src/lib/formats.ts`**

```typescript
export const FORMAT_EXTENSIONS: Record<string, string> = {
  srt: "srt",
  vtt: "vtt",
  ass: "ass",
  ssa: "ssa",
  microdvd: "sub",
  subviewer: "sub",
  ttml: "ttml",
  sbv: "sbv",
  lrc: "lrc",
  sami: "smi",
  mpl2: "mpl",
  scc: "scc",
  ebu_stl: "stl",
};

export const FORMAT_LABELS: Record<string, string> = {
  srt: "SubRip (SRT)",
  vtt: "WebVTT (VTT)",
  ass: "Advanced SubStation (ASS)",
  ssa: "SubStation Alpha (SSA)",
  microdvd: "MicroDVD",
  subviewer: "SubViewer",
  ttml: "TTML / IMSC",
  sbv: "YouTube SBV",
  lrc: "LRC 歌词",
  sami: "SAMI",
  mpl2: "MPL2",
  scc: "SCC (广播)",
  ebu_stl: "EBU STL (广播)",
};

// 与 wasm supported_formats() 一致;硬编码作 fallback,wasm 加载后会被覆盖
export const ALL_FORMATS = Object.keys(FORMAT_EXTENSIONS);

// 默认目标:源是 srt 则默认 vtt,反之亦然;其余默认 vtt
export function defaultTarget(source: string | null): string {
  if (source === "srt") return "vtt";
  if (source === "vtt") return "srt";
  return "vtt";
}
```

（扩展名映射源自 `subtitler/src/cli.rs:48-92` 的推断规则。）

- [ ] **Step 2: 创建 `src/lib/subtitler.ts`**（WASM 初始化 + 类型化封装）

```typescript
import init, {
  detect_subtitle,
  convert_subtitle,
  supported_formats,
} from "@wasm/subtitle_converter_wasm";

export type SubtitleFormat = string;

export type ConvertResponse =
  | { ok: true; format: SubtitleFormat; count: number; output: string }
  | { ok: false; error: string };

let initPromise: Promise<void> | null = null;

/** 懒加载初始化 wasm(幂等) */
export async function ensureWasm(): Promise<void> {
  if (!initPromise) {
    initPromise = init();
  }
  await initPromise;
}

export function detect(content: string): string | null {
  return detect_subtitle(content);
}

export function convert(content: string, target: SubtitleFormat): ConvertResponse {
  const raw = convert_subtitle(content, target);
  return JSON.parse(raw) as ConvertResponse;
}

export function listFormats(): string[] {
  try {
    return JSON.parse(supported_formats()) as string[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: 重建 wasm pkg（确保 @wasm 能 import）**

```bash
npm run build:wasm
```

- [ ] **Step 4: 类型检查**

```bash
npx tsc --noEmit
```

预期：无错误。若报找不到 `@wasm/subtitle_converter_wasm` 的类型，确认 `pkg/subtitle_converter_wasm.d.ts` 已生成（Task 5）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/formats.ts src/lib/subtitler.ts
git commit -m "feat: format metadata + typed WASM wrapper"
```

---

## Task 10: 转换 hook（debounce + 状态机）

**Files:**
- Create: `src/hooks/useSubtitleConvert.ts`

- [ ] **Step 1: 创建 hook**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { convert, detect, type ConvertResponse, type SubtitleFormat } from "@/lib/subtitler";

export type ConvertStatus = "idle" | "detecting" | "ok" | "error";

export interface SubtitleState {
  raw: string;
  sourceFormat: SubtitleFormat | null;
  detectError: boolean; // detect 返回 null
  target: SubtitleFormat;
  result: ConvertResult;
}

export type ConvertResult =
  | { status: "idle" }
  | { status: "ok"; output: string; count: number }
  | { status: "error"; message: string };

export function useSubtitleConvert(initialTarget: SubtitleFormat = "vtt") {
  const [state, setState] = useState<SubtitleState>({
    raw: "",
    sourceFormat: null,
    detectError: false,
    target: initialTarget,
    result: { status: "idle" },
  });

  // 防抖计时器
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setRaw = useCallback((raw: string) => {
    setState((s) => ({ ...s, raw }));
  }, []);

  const setTarget = useCallback((target: SubtitleFormat) => {
    setState((s) => ({ ...s, target }));
  }, []);

  const setSourceFormat = useCallback((fmt: SubtitleFormat | null) => {
    // 手动指定源格式时只更新展示,detectError 清掉
    setState((s) => ({ ...s, sourceFormat: fmt, detectError: false }));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    const raw = state.raw;
    if (!raw.trim()) {
      setState((s) => ({
        ...s,
        sourceFormat: null,
        detectError: false,
        result: { status: "idle" },
      }));
      return;
    }

    // debounce 150ms
    timer.current = setTimeout(() => {
      // detect
      const detected = detect(raw);
      // convert
      const resp = convert(raw, state.target);
      if (resp.ok) {
        setState((s) => ({
          ...s,
          sourceFormat: detected,
          detectError: detected === null,
          result: { status: "ok", output: resp.output, count: resp.count },
        }));
      } else {
        setState((s) => ({
          ...s,
          sourceFormat: detected,
          detectError: detected === null,
          result: { status: "error", message: resp.error },
        }));
      }
    }, 150);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state.raw, state.target]);

  return { state, setRaw, setTarget, setSourceFormat };
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 3: 提交**

```bash
git add src/hooks/useSubtitleConvert.ts
git commit -m "feat: useSubtitleConvert hook — debounce detect + convert state machine"
```

---

## Task 11: 业务组件 — Header / Footer

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/Footer.tsx`

- [ ] **Step 1: `Header.tsx`**

```typescript
import { Github, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">字幕格式转换</h1>
        <Badge variant="secondary" className="font-mono text-xs">Subtitle Converter</Badge>
      </div>
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3 w-3" /> 纯本地处理
              </Badge>
            </TooltipTrigger>
            <TooltipContent>文件不离开你的浏览器,无需上传</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="ghost" size="icon" asChild>
          <a href="https://github.com/subtitle-rs/subtitler" target="_blank" rel="noreferrer">
            <Github className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: `Footer.tsx`**

```typescript
import { Badge } from "@/components/ui/badge";
import { ALL_FORMATS, FORMAT_LABELS } from "@/lib/formats";

export function Footer() {
  return (
    <footer className="border-t px-6 py-4 text-sm text-muted-foreground">
      <p className="mb-2">支持的字幕格式:</p>
      <div className="flex flex-wrap gap-1.5">
        {ALL_FORMATS.map((f) => (
          <Badge key={f} variant="outline" className="font-mono text-xs">
            {FORMAT_LABELS[f] ?? f}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-xs">
        基于 <a className="underline" href="https://crates.io/crates/subtitler" target="_blank" rel="noreferrer">subtitler</a> Rust 库 · 编译为 WebAssembly · 100% 浏览器内运行
      </p>
    </footer>
  );
}
```

- [ ] **Step 3: 类型检查并提交**

```bash
npx tsc --noEmit && git add src/components/Header.tsx src/components/Footer.tsx && git commit -m "feat: Header + Footer components"
```

---

## Task 12: 业务组件 — FormatPicker

**Files:**
- Create: `src/components/FormatPicker.tsx`

- [ ] **Step 1: 实现**

```typescript
import { ArrowRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_FORMATS, FORMAT_LABELS } from "@/lib/formats";
import type { SubtitleFormat } from "@/lib/subtitler";

interface Props {
  sourceFormat: SubtitleFormat | null;  // null = 未检测/检测失败
  detectError: boolean;
  manualSource: SubtitleFormat | null;  // 用户手动指定的源
  target: SubtitleFormat;
  onManualSource: (f: SubtitleFormat) => void;
  onTarget: (f: SubtitleFormat) => void;
}

export function FormatPicker({
  sourceFormat,
  detectError,
  manualSource,
  target,
  onManualSource,
  onTarget,
}: Props) {
  const displaySource = manualSource ?? sourceFormat;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">源格式</span>
        {detectError && !manualSource ? (
          // 检测失败:降级为下拉让用户手动选
          <Select onValueChange={onManualSource} value={manualSource ?? ""}>
            <SelectTrigger className="w-[180px] border-destructive">
              <SelectValue placeholder="无法识别,请选择" />
            </SelectTrigger>
            <SelectContent>
              {ALL_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="font-mono text-sm">
            {displaySource ? FORMAT_LABELS[displaySource] ?? displaySource : "—"}
          </span>
        )}
      </div>

      <ArrowRight className="h-4 w-4 text-muted-foreground" />

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">目标格式</span>
        <Select value={target} onValueChange={onTarget}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_FORMATS.map((f) => (
              <SelectItem key={f} value={f}>{FORMAT_LABELS[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查并提交**

```bash
npx tsc --noEmit && git add src/components/FormatPicker.tsx && git commit -m "feat: FormatPicker component — detected source + target dropdown"
```

---

## Task 13: 业务组件 — InputPanel

**Files:**
- Create: `src/components/InputPanel.tsx`

- [ ] **Step 1: 实现**

```typescript
import { useCallback, useRef, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onFileLoaded?: (fileName: string) => void;
}

export function InputPanel({ value, onChange, onFileLoaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        onChange(reader.result as string);
        onFileLoaded?.(file.name);
      };
      reader.readAsText(file);
    },
    [onChange, onFileLoaded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) readFile(file);
    },
    [readFile]
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">输入</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <Tabs defaultValue="upload" className="flex flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> 上传文件
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> 粘贴文本
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="flex-1">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex h-full min-h-[300px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:bg-muted/30",
                dragging && "border-primary bg-primary/5 text-primary"
              )}
            >
              <Upload className="h-8 w-8" />
              <p className="text-sm">拖拽字幕文件到此处,或点击选择</p>
              <p className="text-xs text-muted-foreground/70">支持 .srt / .vtt / .ass / .sub / .ttml 等格式</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".srt,.vtt,.ass,.ssa,.sub,.ttml,.xml,.sbv,.lrc,.smi,.sami,.mpl,.scc,.stl"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </TabsContent>

          <TabsContent value="paste" className="flex-1">
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="粘贴字幕内容..."
              className="h-full min-h-[300px] font-mono text-xs"
            />
          </TabsContent>
        </Tabs>

        {value && (
          <p className="text-xs text-muted-foreground">
            {value.length.toLocaleString()} 字符
            {value.length > 5_000_000 && <span className="ml-2 text-destructive">· 文件较大,可能影响渲染</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 类型检查并提交**

```bash
npx tsc --noEmit && git add src/components/InputPanel.tsx && git commit -m "feat: InputPanel — drag/drop upload + paste textarea"
```

---

## Task 14: 业务组件 — OutputPanel

**Files:**
- Create: `src/components/OutputPanel.tsx`

- [ ] **Step 1: 实现**

```typescript
import { useState } from "react";
import { Check, Copy, Download, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FORMAT_EXTENSIONS, FORMAT_LABELS } from "@/lib/formats";
import type { ConvertResult } from "@/hooks/useSubtitleConvert";
import type { SubtitleFormat } from "@/lib/subtitler";

interface Props {
  result: ConvertResult;
  target: SubtitleFormat;
  fileName: string | null;
}

export function OutputPanel({ result, target, fileName }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (result.status !== "ok") return;
    await navigator.clipboard.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onDownload = () => {
    if (result.status !== "ok") return;
    const base = fileName?.replace(/\.[^.]+$/, "") ?? "subtitle";
    const ext = FORMAT_EXTENSIONS[target] ?? target;
    const blob = new Blob([result.output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">转换结果 · {FORMAT_LABELS[target] ?? target}</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onCopy} disabled={result.status !== "ok"}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? "已复制" : "复制"}
          </Button>
          <Button size="sm" onClick={onDownload} disabled={result.status !== "ok"}>
            <Download className="mr-1 h-3.5 w-3.5" /> 下载
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {result.status === "idle" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            输入字幕内容后,转换结果将显示在此
          </div>
        )}
        {result.status === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-destructive">
            <AlertCircle className="h-8 w-8" />
            <p>转换失败</p>
            <pre className="max-w-full overflow-auto rounded bg-destructive/10 p-3 text-xs text-destructive">
              {result.message}
            </pre>
          </div>
        )}
        {result.status === "ok" && (
          <>
            <div className="mb-2 flex gap-2">
              <Badge variant="secondary" className="text-xs">{result.count} 条字幕</Badge>
              <Badge variant="outline" className="text-xs">
                {(new Blob([result.output]).size / 1024).toFixed(1)} KB
              </Badge>
            </div>
            <ScrollArea className="flex-1 rounded-md border">
              <pre className="p-3 font-mono text-xs leading-relaxed">{result.output}</pre>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 类型检查并提交**

```bash
npx tsc --noEmit && git add src/components/OutputPanel.tsx && git commit -m "feat: OutputPanel — preview + copy + download"
```

---

## Task 15: App 顶层编排

**Files:**
- Create: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: 创建 `src/App.tsx`**

```typescript
import { useEffect, useState } from "react";
import { ensureWasm, listFormats } from "@/lib/subtitler";
import { ALL_FORMATS, defaultTarget } from "@/lib/formats";
import { useSubtitleConvert } from "@/hooks/useSubtitleConvert";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FormatPicker } from "@/components/FormatPicker";
import { InputPanel } from "@/components/InputPanel";
import { OutputPanel } from "@/components/OutputPanel";

export default function App() {
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmError, setWasmError] = useState<string | null>(null);
  const [manualSource, setManualSource] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [formats, setFormats] = useState<string[]>(ALL_FORMATS);

  const { state, setRaw, setTarget, setSourceFormat } = useSubtitleConvert();

  // 初始化 wasm
  useEffect(() => {
    ensureWasm()
      .then(() => {
        setFormats(listFormats().length > 0 ? listFormats() : ALL_FORMATS);
        setWasmReady(true);
      })
      .catch((e) => setWasmError(String(e)));
  }, []);

  // 源变化时,重置手动源 & 智能选默认目标
  useEffect(() => {
    setManualSource(null);
    setTarget(defaultTarget(state.sourceFormat));
  }, [state.sourceFormat, setTarget]);

  if (wasmError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
        <p className="text-destructive">引擎加载失败</p>
        <p className="text-sm text-muted-foreground">{wasmError}</p>
        <button onClick={() => location.reload()} className="text-sm underline">刷新重试</button>
      </div>
    );
  }

  if (!wasmReady) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        正在加载字幕引擎...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <FormatPicker
        sourceFormat={state.sourceFormat}
        detectError={state.detectError}
        manualSource={manualSource}
        target={state.target}
        onManualSource={(f) => {
          setManualSource(f);
          setSourceFormat(f);
        }}
        onTarget={setTarget}
      />
      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:grid-cols-2">
        <InputPanel
          value={state.raw}
          onChange={setRaw}
          onFileLoaded={setFileName}
        />
        <OutputPanel
          result={state.result}
          target={state.target}
          fileName={fileName}
        />
      </main>
      <Footer />
      {/* formats 暂未直接渲染,留作未来用;Footer 用 ALL_FORMATS */}
      <span className="hidden">{formats.length}</span>
    </div>
  );
}
```

- [ ] **Step 2: 修改 `src/main.tsx` 用 App 默认导出**

替换为：

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 4: 提交**

```bash
git add src/App.tsx src/main.tsx
git commit -m "feat: App top-level orchestration + wasm init + responsive layout"
```

---

## Task 16: 端到端验证

**Files:** (无源码改动)

- [ ] **Step 1: 确认 wasm pkg 已构建**

```bash
ls pkg/ || npm run build:wasm
```

- [ ] **Step 2: 启动 dev server**

```bash
npm run dev
```

- [ ] **Step 3: 手动测试清单（在浏览器逐项验证）**

打开 `http://localhost:5173`,验证：

1. 页面正常加载,显示 Header / FormatPicker / InputPanel / OutputPanel / Footer
2. 切换系统暗色模式,UI 跟随切换
3. **粘贴测试**:把 `../subtitler/examples/example.srt` 内容粘进「粘贴文本」tab
   - 源格式显示「SubRip (SRT)」
   - 目标默认变为「WebVTT (VTT)」
   - 右侧 OutputPanel 显示 `WEBVTT` 开头的转换结果
   - 字幕条数 badge 显示正确数字
4. **换目标格式**:选 ASS,右侧实时更新为 ASS 输出
5. **下载**:点下载,得到 `example.ass` 文件
6. **复制**:点复制,剪贴板得到 ASS 内容
7. **上传测试**:切到「上传文件」tab,把 `../subtitler/examples/example.vtt` 拖进去
   - 源格式变为 VTT,目标默认变为 SRT
8. **错误兜底**:粘贴 `hello world garbage`
   - 源格式处显示红色下拉「无法识别,请选择」
   - OutputPanel 显示错误信息
9. **移动端**:浏览器开发者工具切手机视图,布局变为单栏

每项通过后打勾。Ctrl-C 停止 dev。

- [ ] **Step 4: 生产构建验证**

```bash
npm run build
```

预期：`dist/` 生成,含 `index.html`、JS、CSS、`.wasm` 文件,无错误。

- [ ] **Step 5: 预览生产构建**

```bash
npm run preview
```

打开提示的 URL,重复 Step 3 的第 3、4 项(粘贴 SRT → 转 VTT → 下载),确认生产构建功能正常。Ctrl-C 停止。

- [ ] **Step 6: 最终提交（若有调整）**

```bash
git status
# 如有改动:
git add -A && git commit -m "chore: e2e verification pass"
```

---

## Self-Review

**1. Spec 覆盖检查:**

| Spec 要求 | 覆盖任务 |
|----------|---------|
| §3 目录结构 + 薄包装 crate | Task 1 (Cargo), Task 6 (前端骨架) |
| §3.4 wasm 构建 + Vite 集成 | Task 5 (wasm-pack), Task 6 (vite-plugin-wasm) |
| §4 数据流 + 状态机 | Task 10 (hook) |
| §4.3 debounce 自动转换 | Task 10 (150ms timer) |
| §4.3 单文件 + FileReader | Task 13 (InputPanel) |
| §4.3 5MB 提示 | Task 13 (字符计数 + 警告) |
| §4.3 下载文件名规则 | Task 14 (base.{ext}) |
| §4.4 错误处理三层 | Task 4 (转换层 never panic), Task 12 (detect 失败降级下拉), Task 15 (wasm init 错误页) |
| §5 UI 布局与组件 | Task 8 (shadcn), 11–14 (业务组件), 15 (App 编排) |
| §5.3 13 种格式 + 默认目标 | Task 9 (formats.ts), Task 15 (defaultTarget effect) |
| §5.4 左栏可编辑 | Task 13 (paste tab textarea) |
| §5.4 移动端单栏 | Task 15 (grid md:grid-cols-2) |
| §5.4 暗色模式 | Task 7 (CSS 变量), Task 16 (验证) |
| §6 wasm API 3 函数 | Task 2–4 |
| §6.5 永不 panic | Task 4 (全 match) |
| §6.6 features 裁剪 | Task 1 (wasm/Cargo.toml) |
| §8 验收标准 | Task 16 (逐项对齐) |

无遗漏。

**2. 占位符扫描:** 无 TBD/TODO/「后续实现」。所有步骤含完整代码或确切命令。

**3. 类型一致性:**
- `ConvertResponse` / `SubtitleFormat` 在 `subtitler.ts` 定义,`useSubtitleConvert.ts` 与 `OutputPanel.tsx` 引用一致 ✅
- `ConvertResult` 在 hook 定义,`OutputPanel.tsx` 引用一致 ✅
- `format_from_name` / `format_to_name` 在 Task 2 定义,Task 3/4 引用一致 ✅
- `FORMAT_EXTENSIONS` / `FORMAT_LABELS` / `defaultTarget` 在 Task 9 定义,Task 11/12/14/15 引用一致 ✅
- shadcn 组件 props 与用法对齐(Task 12 用 Select,Task 13 用 Tabs,Task 14 用 ScrollArea)✅

无问题。
