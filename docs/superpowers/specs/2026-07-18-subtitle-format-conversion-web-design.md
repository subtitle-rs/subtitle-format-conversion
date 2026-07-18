# 字幕格式转换网页 — 设计方案

> 基于 `subtitler` Rust 库的字幕格式转换网页应用
>
> 创建时间：2026-07-18

## 1. 产品定位

一个**纯客户端**的字幕格式转换网页。用户上传或粘贴字幕文件，选择目标格式，实时预览转换结果，下载或复制。

核心特征：

- **100% 浏览器内运行**：文件全程不离开设备，无后端、无上传。
- **隐私友好 + 零运维 + 免费托管**（GitHub Pages / Vercel / Cloudflare Pages）。
- **离线可用**：wasm 加载后即可脱网工作。
- **聚焦转换**：不做校验、编辑、批量、时间轴。单一职责。

## 2. 整体架构

```
┌─────────────────────────────────────────────────────┐
│  浏览器 (single-page app)                            │
│                                                      │
│  React + TS UI ──import──▶ subtitler_wasm.js        │
│  (Vite 构建)                 (wasm-pack 产物)        │
│       │                          │                   │
│       │ File / paste             ▼                   │
│       │                   subtitler.rs (本地 WASM)   │
│       │                   detect() / convert_format()│
│       ▼                          │                   │
│  Blob 下载 / 复制到剪贴板 ◀──────┘                   │
└─────────────────────────────────────────────────────┘
        │
        └─ 静态部署 (GitHub Pages / Vercel / Cloudflare Pages)
```

**技术栈：**

- 前端：React + TypeScript + Vite
- UI：shadcn/ui（Tailwind + Radix）
- WASM 引擎：`subtitler` Rust 库，经本项目内的「薄包装 crate」编译

**为什么纯客户端：** `subtitler` 已具备成熟的 WASM 绑定（`src/wasm.rs`），`detect_format` / `parse_bytes` / `SubtitleFormat::to_string_with_format` 三个 API 完全覆盖转换器需求。无后端带来隐私、运维、成本三重收益。

## 3. 目录结构与 WASM 集成

### 3.1 关键工程决策：薄包装 crate

`subtitler` 位于 `../subtitler`，是本项目（`subtitle-format-conversion/`）的兄弟目录。直接 `wasm-pack build ../subtitler` 会把产物生成到 subtitler 目录内，既不在本项目里，也不便于 Vite import 与 git 管理。

**解决方案：在本项目内放一个薄包装 crate `wasm/`**，通过 path 依赖引用 `subtitler`。

### 3.2 目录结构

```
subtitle-format-conversion/
├── Cargo.toml                 # workspace,仅声明 wasm 成员
├── wasm/                      # ← 薄包装 crate
│   ├── Cargo.toml             # subtitler = { path = "../../subtitler", default-features=false, features=[...] }
│   └── src/lib.rs             # #[wasm_bindgen] 函数,内部调 subtitler 库 API
├── package.json
├── vite.config.ts             # 配 vite-plugin-wasm + vite-plugin-top-level-await
├── tsconfig.json
├── components.json            # shadcn 配置
├── tailwind.config / index.css
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   ├── subtitler.ts       # WASM 初始化 + 类型化封装
│   │   └── utils.ts           # shadcn 的 cn()
│   ├── hooks/
│   │   └── useSubtitleConvert.ts
│   └── components/
│       ├── ui/                # shadcn 组件(Select/Button/Card/...)
│       ├── InputPanel.tsx     # 上传 / 粘贴 Tab
│       ├── FormatPicker.tsx   # 源格式(自动检测)+ 目标格式选择
│       ├── OutputPanel.tsx    # 预览 + 下载 + 复制
│       └── Header.tsx
├── pkg/                       # wasm-pack 输出(gitignore)
└── .gitignore
```

### 3.3 薄包装 crate 的价值

1. **产物落在本项目内**：`pkg/` 可 gitignore，Vite import 路径稳定。
2. **定制 JS-facing API**：返回干净的 JSON，而非复用 `SubtitlerResult`（其 `getter_with_clone` 字段在 JS 侧使用别扭）。
3. **按需裁剪 features**：默认全开 15 格式 + http/io，但 WASM 下 http/io 不可用，只保留文本类格式以减小体积。

### 3.4 构建与集成

**WASM 构建命令**（写入 `package.json` 的 `scripts.build:wasm`）：

```bash
wasm-pack build wasm --target web --out-dir ../pkg
```

**Vite 集成：** 安装 `vite-plugin-wasm` + `vite-plugin-top-level-await`，在 `src/lib/subtitler.ts` 内 `import init, { detect_subtitle, convert_subtitle, supported_formats } from '../../pkg'`，懒加载初始化。

## 4. 数据流与核心交互

### 4.1 单一数据源

一个 React state `subtitleState`，包含原始内容、检测结果、目标格式、转换输出：

```typescript
type ConvertState = {
  raw: string;                    // 用户输入的字幕原文
  sourceFormat: SubtitleFormat | null;  // detect() 的结果,null = 未检测出/空
  target: SubtitleFormat;         // 用户选的目标格式(有默认值)
  result: ConvertResult;          // convert() 的输出
};

type ConvertResult =
  | { status: 'idle' }                              // 还没输入
  | { status: 'detecting' }                          // 正在 detect
  | { status: 'ok'; output: string; count: number }  // 转换成功
  | { status: 'error'; message: string };            // 转换失败
```

### 4.2 核心数据流

WASM 调用均不阻塞 UI，放在 `useEffect` / 事件处理器内：

```
[用户上传文件 / 粘贴文本]
        │
        ▼
   setRaw(content)
        │
        ▼ (useEffect 监听 raw)
   detect(content) ──▶ setSourceFormat(fmt)
        │                    │
        │                    └─ 若 fmt 为 null → 显示「无法识别格式」
        ▼
   convert(content, target) ──▶ setResult({ ok, output, count } | error)
        │  (target 变化也触发同一个 convert)
        ▼
[OutputPanel 实时显示转换结果]
        │
        ▼ (用户点下载/复制)
[下载 .{ext} 文件 / 写入剪贴板]
```

### 4.3 关键交互决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 转换触发时机 | **debounce 自动转换**（源或目标变化后 ~150ms） | 即时反馈，无需「转换」按钮；wasm 很快（<10ms） |
| 文件上传 | 拖拽 + 点击，**单文件** | 纯转换器聚焦；多文件属「批量工具」范围 |
| 文件读取 | `FileReader.readAsText` → 喂给 wasm | 不依赖 wasm.rs 中没有的文件 API |
| 编码处理 | 先尝试 UTF-8；失败则用 `TextDecoder` 兜底 | subtitler 内部有 chardetng，但 wasm 绑定只吃 `&str`，前端先解码成字符串 |
| 大小限制 | 文本 > 5MB 时提示但不禁用 | wasm 处理字符串快，瓶颈在 DOM 渲染 |
| 下载文件名 | `{原名}.{目标格式扩展名}` | 如 `movie.srt` → `movie.vtt` |

### 4.4 错误处理边界

- **空输入** → idle 状态，OutputPanel 显示占位提示。
- **detect 失败** → 显示「无法识别格式，请检查文件或手动指定源格式」，允许用户**手动选源格式**（fallback）。
- **convert 失败** → 显示原始 error message，保留上次的成功输出（灰显）。

## 5. UI 布局与页面结构

### 5.1 布局

单页、双栏（桌面）/ 单栏堆叠（移动），响应式：

```
┌──────────────────────────────────────────────────────────────┐
│  Header: Logo + 名称 + GitHub 链接 + 「纯本地处理」徽章           │
├──────────────────────────────────────────────────────────────┤
│  FormatPicker(横向条):                                          │
│    [自动检测: SRT ✓]  ──▶  [目标: VTT ▾]                        │
├─────────────────────────────┬────────────────────────────────┤
│  InputPanel                 │  OutputPanel                     │
│  ┌───────────────────────┐  │  ┌──────────────────────────┐  │
│  │ [上传文件] [粘贴] Tab  │  │  │ 转换结果(只读)           │  │
│  │                       │  │  │                          │  │
│  │  拖拽区 / 文本框       │  │  │  WEBVTT                  │  │
│  │                       │  │  │  00:00:01.000 --> ...    │  │
│  │  1                     │  │  │  Hello                   │  │
│  │  00:00:01,000 --> ...  │  │  │  ...                     │  │
│  │  Hello                 │  │  │                          │  │
│  │  ...                   │  │  │  [3 条字幕 · 1.2KB]      │  │
│  │                       │  │  │  [复制] [下载 .vtt]       │  │
│  └───────────────────────┘  │  └──────────────────────────┘  │
├─────────────────────────────┴────────────────────────────────┤
│  Footer: 支持的格式列表 + 隐私说明                                │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 组件职责

| 组件 | 职责 | shadcn 组件 |
|------|------|-------------|
| `Header` | 品牌、GitHub、隐私徽章（`Lock` icon + tooltip） | `Badge`, `Tooltip` |
| `FormatPicker` | 源格式（只读展示检测结果，或手动选） + 目标格式下拉 | `Select` |
| `InputPanel` | Tab 切换「上传文件 / 粘贴文本」；拖拽区；文本框（可编辑） | `Tabs`, `Textarea`, dropzone |
| `OutputPanel` | 只读预览转换结果；元信息（条数/大小）；复制+下载按钮 | `Card`, `Button`, `ScrollArea` |
| `Footer` | 格式 chip 列表 + 「文件不出浏览器」说明 | `Badge` |

### 5.3 支持的格式

SRT · VTT · ASS · SSA · MicroDVD · SubViewer · TTML · SBV · LRC · SAMI · MPL2 · SCC · EBU STL（13 种，排除 WASM 不可用的 dfxp/whisper/http）。

**目标格式默认值：** 检测到源后，默认选一个**不同的**常见格式（源是 SRT→默认 VTT，反之亦然），避免「转成自己」。

### 5.4 交互细节

- 左栏输入框**可编辑** —— 用户能直接在网页里改字幕文本，转换实时更新（debounce）。
- 拖拽时整个左栏高亮（`DragOver` 态）。
- 移动端（<`md`）：双栏 → 单栏，Input 在上 Output 在下。
- 暗色模式：跟随系统 `prefers-color-scheme`（shadcn 原生支持）。

配色与字体在实现阶段以 shadcn 默认主题起步，后续可调。

## 6. WASM 包装 crate 的 API

### 6.1 暴露给 JS 的接口

```rust
// wasm/src/lib.rs
use subtitler::{detect_format, parse_bytes, model::{Format, SubtitleFormat}};
use wasm_bindgen::prelude::*;

/// 检测字幕格式,返回 "srt" / "vtt" / ... 或 null(检测不出)
#[wasm_bindgen]
pub fn detect_subtitle(content: &str) -> Option<String>;

/// 转换格式。成功返回 JSON,失败返回带 error 字段的 JSON。
#[wasm_bindgen]
pub fn convert_subtitle(content: &str, target: &str) -> String;

/// 列出所有支持的目标格式(前端构建下拉项用,避免硬编码)
#[wasm_bindgen]
pub fn supported_formats() -> String;
```

**返回类型全部用 JSON 字符串 + 前端 `JSON.parse`**（而非 `serde-wasm-bindgen` 的 JsValue）。原因：wasm-pack 对复杂返回类型的 codegen 在不同打包器下行为不一，字符串最稳，Vite 零配置通过。这是经过权衡的「无聊但可靠」选择。

### 6.2 `convert_subtitle` 返回契约

```typescript
// 成功
{ ok: true, format: "vtt", count: 142, output: "WEBVTT\n..." }

// 失败
{ ok: false, error: "Parse error: line 3: invalid timestamp ..." }
```

### 6.3 格式名映射

前后端统一使用小写 snake_case 字符串：

| 枚举 | 字符串 |
|------|--------|
| `Format::Srt` | `"srt"` |
| `Format::Vtt` | `"vtt"` |
| `Format::Ass` | `"ass"` |
| `Format::Ssa` | `"ssa"` |
| `Format::MicroDvd` | `"microdvd"` |
| `Format::SubViewer` | `"subviewer"` |
| `Format::Ttml` | `"ttml"` |
| `Format::Sbv` | `"sbv"` |
| `Format::Lrc` | `"lrc"` |
| `Format::Sami` | `"sami"` |
| `Format::Mpl2` | `"mpl2"` |
| `Format::Scc` | `"scc"` |
| `Format::EbuStl` | `"ebu_stl"` |

### 6.4 前端 TS 镜影类型

```typescript
// src/lib/subtitler.ts
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'ssa' | 'microdvd'
  | 'subviewer' | 'ttml' | 'sbv' | 'lrc' | 'sami' | 'mpl2' | 'scc' | 'ebu_stl';

export type ConvertResponse =
  | { ok: true; format: SubtitleFormat; count: number; output: string }
  | { ok: false; error: string };
```

### 6.5 错误处理边界（三层）

| 层 | 处理什么 | 怎么处理 |
|----|---------|---------|
| **WASM 初始化** | `.wasm` 加载失败/网络断 | `init()` Promise reject → UI 显示「引擎加载失败，请刷新」，禁用所有交互 |
| **输入层** | 空内容、未知格式 | detect 返回 null → InputPanel 提示「无法识别」，允许手动选源格式 |
| **转换层** | parse/serialize 抛错 | `convert_subtitle` 永不 panic（全 `match`/`Result`），总返回 JSON；`ok:false` 时 OutputPanel 显示 error，保留上次成功输出（灰显） |

**铁律：wasm-bindgen 函数永远不 panic。** 即使输入是乱码，也走 `Result` 分支返回结构化错误，而非触发 Rust panic（panic 在 wasm 里会变成 JS 异常，难处理）。通过在 Rust 端用 `match` 而非 `unwrap()` 保证。

### 6.6 wasm 体积优化

```toml
# wasm/Cargo.toml
[dependencies]
subtitler = { path = "../../subtitler", default-features = false, features = [
  "srt", "vtt", "ass", "ssa", "microdvd", "subviewer",
  "ttml", "sbv", "lrc", "sami", "mpl2", "scc", "ebu_stl", "wasm"
] }
# 排除 dfxp(基本没人用)、whisper(JSON 非字幕)、http、io(wasm 不可用)
```

外加 `console_error_panic_hook` 用于开发期调试，release 构建可去掉。

## 7. 范围之外（明确不做）

- 字幕质量校验（重叠/CPS/时长报告）
- 时间轴调整（偏移/帧率转换）
- 文本规范化（OCR 修复、标签剥离）
- 批量文件处理
- 在线编辑器 / 视频预览
- 任何后端服务、用户系统、计费

这些属于 `docs/product-designs.md` 中「在线字幕工具平台」的更大愿景，不在本项目范围。

## 8. 验收标准

- [ ] 可拖拽 / 粘贴上传 `.srt` / `.vtt` / `.ass` 等任一支持格式文件
- [ ] 自动检测源格式并展示
- [ ] 可选择 13 种目标格式中的任意一种
- [ ] 转换结果实时预览（debounce < 200ms 响应）
- [ ] 可下载转换后文件（正确扩展名），可复制到剪贴板
- [ ] 左栏文本可编辑，转换实时更新
- [ ] 格式识别失败时，可手动指定源格式作为 fallback
- [ ] 无后端，`npm run build` 产出纯静态文件，可直接托管
- [ ] 暗色模式跟随系统
- [ ] 移动端可用（单栏布局）
