# 字幕工具台扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把字幕格式转换网页从纯转换器升级为字幕工具台:顶部 4 个 Tab(转换/校验/规范化/信息),共享一份输入,各自处理。

**Architecture:** `raw` 提升到 App 层全局共享;每个工具 = 一个 hook(懒计算,只当前 Tab 激活时跑)+ 一个 Panel 组件;wasm 包装层新增 3 个 JSON-returning 函数(复用 `convert_subtitle` 模式,避开 subtitler 原生 Map)。

**Tech Stack:** Rust/wasm-pack(已建),React 19 + TS + Tailwind v4 + shadcn/ui(已建)。

**Spec:** `docs/superpowers/specs/2026-07-18-subtitle-workbench-expansion-design.md`

**关键 API 参考(subtitler 库,已验证):**
- `subtitler::parse_bytes(&[u8]) -> Result<SubtitleFile, ParseError>`
- `SubtitleFile::subtitles(&self) -> &[Subtitle]` / `subtitles_mut(&mut self) -> &mut [Subtitle]` / `format(&self) -> Format`
- `SubtitleFile::validate(&self) -> Vec<ValidationIssue>`(trait 方法,`ValidationIssue` 实现 `Display`)
- `Subtitle::strip_tags(&mut self)`(`start: u64` / `end: u64` 毫秒)

**现有文件参考(实现时需读取的实际代码):**
- `src/hooks/useSubtitleConvert.ts` — 当前 hook(要改签名)
- `src/App.tsx` — 当前顶层(要重构)
- `src/lib/subtitler.ts` — 当前 wasm 封装(要扩展)
- `wasm/src/lib.rs` — 当前包装层(要加 3 函数)
- `src/components/InputPanel.tsx` / `FormatPicker.tsx` / `OutputPanel.tsx` — 要复用

---

## File Structure

```
src/
├── App.tsx                    # 改:加 activeTool state + ToolTabs + 共享 raw/fileName
├── types.ts                   # 新:ToolId 共享类型
├── hooks/
│   ├── useSubtitleConvert.ts  # 改:接收 raw 参数,去掉内部 raw state
│   ├── useValidate.ts         # 新
│   ├── useNormalize.ts        # 新
│   └── useInfo.ts             # 新
├── components/
│   ├── InputPanel.tsx         # 改:props 不变(已接收 value/onChange),只是被 App 直接渲染
│   ├── ToolTabs.tsx           # 新:顶部 4 Tab
│   ├── tools/
│   │   ├── ConvertTool.tsx    # 新:包装 FormatPicker + OutputPanel + useSubtitleConvert
│   │   ├── ValidateTool.tsx   # 新
│   │   ├── NormalizeTool.tsx  # 新
│   │   └── InfoTool.tsx       # 新
│   ├── FormatPicker.tsx       # 不变
│   ├── OutputPanel.tsx        # 不变
│   ├── ValidatePanel.tsx      # 新
│   ├── NormalizePanel.tsx     # 新
│   └── InfoPanel.tsx          # 新
└── lib/
    └── subtitler.ts           # 改:加 getInfo/validate/normalize 封装
wasm/
└── src/lib.rs                 # 改:加 3 个 #[wasm_bindgen] 函数 + 测试
```

---

## Task 1: wasm 包装层 — `get_info_subtitle`(TDD)

**Files:**
- Modify: `wasm/src/lib.rs`

- [ ] **Step 1: 写失败的测试**

在 `wasm/src/lib.rs` 的 `#[cfg(test)] mod tests` 内追加:

```rust
#[wasm_bindgen_test]
fn get_info_subtitle_srt() {
    let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n2\n00:00:05,000 --> 00:00:07,000\nWorld\n\n";
    let resp = get_info_subtitle(srt);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["format"], "srt");
    assert_eq!(v["count"], 2);
    assert_eq!(v["total_duration_ms"], 6000); // 7000 - 1000
    assert_eq!(v["first_timestamp"], 1000);
    assert_eq!(v["last_timestamp"], 7000);
}

#[wasm_bindgen_test]
fn get_info_subtitle_invalid() {
    let resp = get_info_subtitle("garbage content");
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], false);
    assert!(v["error"].as_str().unwrap().len() > 0);
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:编译失败,`cannot find function get_info_subtitle`。

- [ ] **Step 3: 实现 `get_info_subtitle`**

在 `wasm/src/lib.rs` 的 `convert_subtitle` 之后追加:

```rust
/// 字幕信息。
///   {"ok":true,"format":"srt","count":N,"total_duration_ms":N,
///    "first_timestamp":N,"last_timestamp":N}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn get_info_subtitle(content: &str) -> String {
    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    let subs = file.subtitles();
    let (first, last) = match (subs.first(), subs.last()) {
        (Some(f), Some(l)) => (f.start, l.end),
        _ => (0, 0),
    };
    let total = if subs.is_empty() { 0 } else { last.saturating_sub(first) };
    serde_json::json!({
        "ok": true,
        "format": format_to_name(file.format()),
        "count": subs.len() as u32,
        "total_duration_ms": total,
        "first_timestamp": first,
        "last_timestamp": last,
    })
    .to_string()
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:全部 PASS(现有 9 + 新增 2 = 11 个)。

- [ ] **Step 5: 提交**

```bash
git add wasm/src/lib.rs
git commit -m "feat(wasm): get_info_subtitle — subtitle metadata as JSON"
```

---

## Task 2: wasm 包装层 — `validate_subtitle`(TDD)

**Files:**
- Modify: `wasm/src/lib.rs`

- [ ] **Step 1: 写失败的测试**

在测试区追加(注意:用一条有重叠的字幕触发 issue):

```rust
#[wasm_bindgen_test]
fn validate_subtitle_clean() {
    let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n2\n00:00:05,000 --> 00:00:07,000\nWorld\n\n";
    let resp = validate_subtitle(srt);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["count"], 2);
    assert_eq!(v["issue_count"], 0);
    assert!(v["issues"].as_array().unwrap().is_empty());
}

#[wasm_bindgen_test]
fn validate_subtitle_with_overlap() {
    // 两条重叠:第一条结束 1500,第二条开始 1200
    let srt = "1\n00:00:01,000 --> 00:00:01,500\nA\n\n2\n00:00:01,200 --> 00:00:03,000\nB\n\n";
    let resp = validate_subtitle(srt);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    assert!(v["issue_count"].as_u64().unwrap() >= 1);
    let issues = v["issues"].as_array().unwrap();
    assert!(!issues.is_empty());
    // 至少有一条提到 overlap
    assert!(issues.iter().any(|i| i.as_str().unwrap().contains("overlap")));
}

#[wasm_bindgen_test]
fn validate_subtitle_invalid() {
    let resp = validate_subtitle("not a subtitle");
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], false);
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:编译失败,`cannot find function validate_subtitle`。

- [ ] **Step 3: 实现 `validate_subtitle`**

在 `wasm/src/lib.rs` 追加(`validate()` 是 trait 方法,需 `use SubtitleFormat as _` 或全路径;这里用全路径避免 trait import 混乱):

```rust
/// 质量校验。
///   {"ok":true,"format":"srt","count":N,"issue_count":N,
///    "issues":["subtitle 0 overlaps..."]}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn validate_subtitle(content: &str) -> String {
    use subtitler::model::SubtitleFormat as _;

    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    let count = file.subtitles().len() as u32;
    let issues: Vec<String> = file.validate().iter().map(|i| i.to_string()).collect();
    let issue_count = issues.len() as u32;
    serde_json::json!({
        "ok": true,
        "format": format_to_name(file.format()),
        "count": count,
        "issue_count": issue_count,
        "issues": issues,
    })
    .to_string()
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:全部 PASS(11 + 3 = 14 个)。

- [ ] **Step 5: 提交**

```bash
git add wasm/src/lib.rs
git commit -m "feat(wasm): validate_subtitle — quality checks as JSON"
```

---

## Task 3: wasm 包装层 — `normalize_subtitle`(TDD)

**Files:**
- Modify: `wasm/src/lib.rs`

- [ ] **Step 1: 写失败的测试**

```rust
#[wasm_bindgen_test]
fn normalize_subtitle_strips_tags() {
    // VTT 里带 <i> 标签,规范化后应剥离
    let vtt = "WEBVTT\n\n00:00:01,000 --> 00:00:03,500\n<i>Hello</i>\n";
    let resp = normalize_subtitle(vtt);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    let out = v["output"].as_str().unwrap();
    assert!(!out.contains("<i>"));
    assert!(out.contains("Hello"));
}

#[wasm_bindgen_test]
fn normalize_subtitle_invalid() {
    let resp = normalize_subtitle("totally garbage");
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], false);
}
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:编译失败,`cannot find function normalize_subtitle`。

- [ ] **Step 3: 实现 `normalize_subtitle`**

在 `wasm/src/lib.rs` 追加:

```rust
/// 文本规范化(剥离 HTML/ASS 标签)。
///   {"ok":true,"output":"..."}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn normalize_subtitle(content: &str) -> String {
    let mut file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    for sub in file.subtitles_mut() {
        sub.strip_tags();
    }
    serde_json::json!({ "ok": true, "output": file.to_string() }).to_string()
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:全部 PASS(14 + 2 = 16 个)。

- [ ] **Step 5: 重建 wasm pkg + 提交**

```bash
wasm-pack build wasm --target web --out-dir ../pkg
git add wasm/src/lib.rs
git commit -m "feat(wasm): normalize_subtitle — strip tags as JSON"
```

---

## Task 4: 前端 lib — 扩展 `subtitler.ts` 封装

**Files:**
- Modify: `src/lib/subtitler.ts`

- [ ] **Step 1: 扩展封装**

读取当前 `src/lib/subtitler.ts`,在文件末尾追加(保留现有 `ensureWasm` / `detect` / `convert` / `listFormats` 不动):

```typescript
export type InfoResponse =
  | {
      ok: true;
      format: SubtitleFormat;
      count: number;
      total_duration_ms: number;
      first_timestamp: number;
      last_timestamp: number;
    }
  | { ok: false; error: string };

export type ValidateResponse =
  | {
      ok: true;
      format: SubtitleFormat;
      count: number;
      issue_count: number;
      issues: string[];
    }
  | { ok: false; error: string };

export type NormalizeResponse =
  | { ok: true; output: string }
  | { ok: false; error: string };

export function getInfo(content: string): InfoResponse {
  const raw = get_info_subtitle(content);
  return JSON.parse(raw) as InfoResponse;
}

export function validate(content: string): ValidateResponse {
  const raw = validate_subtitle(content);
  return JSON.parse(raw) as ValidateResponse;
}

export function normalize(content: string): NormalizeResponse {
  const raw = normalize_subtitle(content);
  return JSON.parse(raw) as NormalizeResponse;
}
```

并在文件顶部的 `import init, { ... } from "@wasm/..."` 里补上三个新函数:

```typescript
import init, {
  detect_subtitle,
  convert_subtitle,
  supported_formats,
  get_info_subtitle,
  validate_subtitle,
  normalize_subtitle,
} from "@wasm/subtitle_converter_wasm";
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

预期:无错误。若报找不到 `get_info_subtitle` 等,确认 `pkg/subtitle_converter_wasm.d.ts` 含这三个导出(Task 3 的 `wasm-pack build` 应已生成)。

- [ ] **Step 3: 提交**

```bash
git add src/lib/subtitler.ts
git commit -m "feat: typed wrappers for getInfo/validate/normalize"
```

---

## Task 5: 共享类型 + state 提升改造

这是结构改动最大的一步。把 `raw` 从 hook 提到 App,改造 hook 接收外部 `raw`。

**Files:**
- Create: `src/types.ts`
- Modify: `src/hooks/useSubtitleConvert.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/types.ts`**

```typescript
export type ToolId = "convert" | "validate" | "normalize" | "info";
```

- [ ] **Step 2: 改造 `src/hooks/useSubtitleConvert.ts` 接收 `raw` 参数**

把当前 hook 改为接收 `raw: string` 参数(不再内部维护 raw)。完整新文件:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { convert, detect, type SubtitleFormat } from "@/lib/subtitler";

export type ConvertResult =
  | { status: "idle" }
  | { status: "ok"; output: string; count: number }
  | { status: "error"; message: string };

export interface ConvertState {
  sourceFormat: SubtitleFormat | null;
  detectError: boolean;
  target: SubtitleFormat;
  result: ConvertResult;
}

/**
 * 转换 hook。raw 由外部(App)传入并共享。
 * active 控制是否计算(懒计算:非当前 Tab 时跳过)。
 */
export function useSubtitleConvert(
  raw: string,
  active: boolean,
  initialTarget: SubtitleFormat = "vtt"
) {
  const [state, setState] = useState<ConvertState>({
    sourceFormat: null,
    detectError: false,
    target: initialTarget,
    result: { status: "idle" },
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTarget = useCallback((target: SubtitleFormat) => {
    setState((s) => ({ ...s, target }));
  }, []);

  const setSourceFormat = useCallback((fmt: SubtitleFormat | null) => {
    setState((s) => ({ ...s, sourceFormat: fmt, detectError: false }));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (!active) return; // 懒计算守卫
    if (!raw.trim()) {
      setState((s) => ({
        ...s,
        sourceFormat: null,
        detectError: false,
        result: { status: "idle" },
      }));
      return;
    }

    timer.current = setTimeout(() => {
      const detected = detect(raw);
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
  }, [raw, state.target, active]);

  return { state, setTarget, setSourceFormat };
}
```

关键改动:
- 去掉 `raw` state 和 `setRaw`(移到 App)
- 新增 `active: boolean` 参数,首行 `if (!active) return;` 守卫
- `useEffect` 依赖加 `active`
- `SubtitleState` 改名 `ConvertState`(去掉 raw 字段)
- 默认导出名保持 `useSubtitleConvert`(文件名不动,避免 git 改名混乱)

- [ ] **Step 3: 临时改造 `src/App.tsx` 适配新签名**

此步**只让转换功能在新结构下跑通**,Tab 还没加。读取当前 `src/App.tsx`,把 `Converter` 函数改为:

```typescript
function Converter() {
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [manualSource, setManualSource] = useState<string | null>(null);
  // 临时:active 永远 true(Tab 还没加)
  const { state, setTarget, setSourceFormat } = useSubtitleConvert(raw, true);

  useEffect(() => {
    setManualSource(null);
    setTarget(defaultTarget(state.sourceFormat));
  }, [state.sourceFormat, setTarget]);

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
        <InputPanel value={raw} onChange={setRaw} onFileLoaded={setFileName} />
        <OutputPanel result={state.result} target={state.target} fileName={fileName} />
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: typecheck + 手动验证转换仍工作**

```bash
pnpm typecheck && pnpm dev
```

浏览器打开 `http://localhost:5173`,粘贴 SRT → 转换仍正常工作(回归不破坏)。验证后 Ctrl-C。

- [ ] **Step 5: 提交**

```bash
git add src/types.ts src/hooks/useSubtitleConvert.ts src/App.tsx
git commit -m "refactor: lift raw state to App, useSubtitleConvert takes raw+active params"
```

---

## Task 6: ToolTabs 组件

**Files:**
- Create: `src/components/ToolTabs.tsx`

- [ ] **Step 1: 创建 `src/components/ToolTabs.tsx`**

```typescript
import { Repeat, ShieldCheck, Wand2, Info } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ToolId } from "@/types";

const TOOLS: { id: ToolId; label: string; icon: typeof Repeat }[] = [
  { id: "convert", label: "格式转换", icon: Repeat },
  { id: "validate", label: "质量校验", icon: ShieldCheck },
  { id: "normalize", label: "文本规范化", icon: Wand2 },
  { id: "info", label: "字幕信息", icon: Info },
];

interface Props {
  active: ToolId;
  onChange: (id: ToolId) => void;
}

export function ToolTabs({ active, onChange }: Props) {
  return (
    <Tabs value={active} onValueChange={(v) => onChange(v as ToolId)}>
      <TabsList className="m-4 mb-0 flex w-fit">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            className={cn("gap-1.5")}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
```

- [ ] **Step 2: typecheck + 提交**

```bash
pnpm typecheck && git add src/components/ToolTabs.tsx && git commit -m "feat: ToolTabs component — top-level tool switcher"
```

---

## Task 7: ConvertTool + 接入 ToolTabs(回归验证点)

把现有转换逻辑包进 `ConvertTool`,App 接入 ToolTabs。**此刻只有「转换」Tab 可用,但布局成型。**

**Files:**
- Create: `src/components/tools/ConvertTool.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/components/tools/ConvertTool.tsx`**

```typescript
import { useEffect, useState } from "react";
import { defaultTarget } from "@/lib/formats";
import { useSubtitleConvert } from "@/hooks/useSubtitleConvert";
import { FormatPicker } from "@/components/FormatPicker";
import { OutputPanel } from "@/components/OutputPanel";

interface Props {
  raw: string;
  fileName: string | null;
}

export function ConvertTool({ raw, fileName }: Props) {
  const [manualSource, setManualSource] = useState<string | null>(null);
  const { state, setTarget, setSourceFormat } = useSubtitleConvert(raw, true);

  useEffect(() => {
    setManualSource(null);
    setTarget(defaultTarget(state.sourceFormat));
  }, [state.sourceFormat, setTarget]);

  return (
    <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:grid-cols-2">
      {/* 左栏 InputPanel 由 App 渲染(共享),这里只放右栏 */}
      <div className="flex flex-col gap-3">
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
        <div className="flex-1 overflow-hidden">
          <OutputPanel result={state.result} target={state.target} fileName={fileName} />
        </div>
      </div>
    </main>
  );
}
```

注意:此版本布局暂时只有右栏(`InputPanel` 仍在 App,后续 Task 11 统一改双栏)。为保持回归,这步先让 App 同时渲染 InputPanel + ConvertTool。

- [ ] **Step 2: 改造 `src/App.tsx` 接入 ToolTabs**

```typescript
import { useEffect, useState } from "react";
import { ensureWasm } from "@/lib/subtitler";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { InputPanel } from "@/components/InputPanel";
import { ToolTabs } from "@/components/ToolTabs";
import { ConvertTool } from "@/components/tools/ConvertTool";
import type { ToolId } from "@/types";

function Workbench() {
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("convert");

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <ToolTabs active={activeTool} onChange={setActiveTool} />
      <main className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:grid-cols-2">
        <InputPanel value={raw} onChange={setRaw} onFileLoaded={setFileName} />
        {activeTool === "convert" && <ConvertTool raw={raw} fileName={fileName} />}
        {/* 其他工具在后续 Task 接入 */}
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmError, setWasmError] = useState<string | null>(null);

  useEffect(() => {
    ensureWasm()
      .then(() => setWasmReady(true))
      .catch((e) => setWasmError(String(e)));
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={200}>
        {wasmError ? (
          <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
            <p className="text-destructive">引擎加载失败</p>
            <p className="text-sm text-muted-foreground">{wasmError}</p>
            <button onClick={() => location.reload()} className="text-sm underline">
              刷新重试
            </button>
          </div>
        ) : !wasmReady ? (
          <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
            正在加载字幕引擎...
          </div>
        ) : (
          <Workbench />
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: 修正 ConvertTool 的双栏嵌套**

上面的 `ConvertTool` 自带 `<main>` 又被 App 的 `<main>` 包裹,会有嵌套问题。把 `ConvertTool` 的外层 `<main>` 去掉,只保留内容 div:

将 `src/components/tools/ConvertTool.tsx` 的 return 改为(去掉 `<main>` 包裹,改成普通 div):

```typescript
  return (
    <div className="flex flex-col gap-3 overflow-hidden">
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
      <div className="flex-1 overflow-hidden">
        <OutputPanel result={state.result} target={state.target} fileName={fileName} />
      </div>
    </div>
  );
```

- [ ] **Step 4: typecheck + 手动验证**

```bash
pnpm typecheck && pnpm dev
```

浏览器验证:
- 顶部出现 4 个 Tab(其他 3 个点了无反应,因为还没接入)
- 「格式转换」Tab 激活时,转换功能正常工作(回归)
- 左栏输入在,右栏转换结果在

Ctrl-C。

- [ ] **Step 5: 提交**

```bash
git add src/components/tools/ConvertTool.tsx src/App.tsx
git commit -m "feat: ConvertTool + ToolTabs integration (convert still works, other tabs pending)"
```

---

## Task 8: ValidatePanel + ValidateTool + useValidate

**Files:**
- Create: `src/hooks/useValidate.ts`
- Create: `src/components/ValidatePanel.tsx`
- Create: `src/components/tools/ValidateTool.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/hooks/useValidate.ts`**

```typescript
import { useEffect, useRef, useState } from "react";
import { validate, type ValidateResponse } from "@/lib/subtitler";

export type ValidateState =
  | { status: "idle" }
  | { status: "ok"; data: Extract<ValidateResponse, { ok: true }> }
  | { status: "error"; message: string };

export function useValidate(raw: string, active: boolean) {
  const [state, setState] = useState<ValidateState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) return;
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    timer.current = setTimeout(() => {
      const resp = validate(raw);
      setState(
        resp.ok
          ? { status: "ok", data: resp }
          : { status: "error", message: resp.error }
      );
    }, 150);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [raw, active]);

  return state;
}
```

- [ ] **Step 2: 创建 `src/components/ValidatePanel.tsx`**

```typescript
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FORMAT_LABELS } from "@/lib/formats";
import type { ValidateState } from "@/hooks/useValidate";

export function ValidatePanel({ state }: { state: ValidateState }) {
  if (state.status === "idle") {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="text-sm text-muted-foreground">
          输入字幕后,质量校验结果将显示在此
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="text-center text-sm text-destructive">
          <XCircle className="mx-auto mb-2 h-8 w-8" />
          <p>校验失败</p>
          <pre className="mt-2 max-w-full overflow-auto rounded bg-destructive/10 p-2 text-xs">
            {state.message}
          </pre>
        </CardContent>
      </Card>
    );
  }

  const { format, count, issue_count, issues } = state.data;
  const clean = issue_count === 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {clean ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          )}
          {FORMAT_LABELS[format] ?? format}
          <Badge variant="secondary">{count} 条字幕</Badge>
          <Badge variant={clean ? "secondary" : "destructive"}>
            {issue_count} 个问题
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        {clean ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <CheckCircle2 className="mr-2 h-5 w-5 text-green-500" />
            未发现问题
          </div>
        ) : (
          <ScrollArea className="h-full rounded-md border">
            <ul className="p-3 text-sm">
              {issues.map((issue, i) => (
                <li key={i} className="flex gap-2 py-1 font-mono text-xs">
                  <span className="text-yellow-500">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 创建 `src/components/tools/ValidateTool.tsx`**

```typescript
import { useValidate } from "@/hooks/useValidate";
import { ValidatePanel } from "@/components/ValidatePanel";

interface Props {
  raw: string;
  active: boolean;
}

export function ValidateTool({ raw, active }: Props) {
  const state = useValidate(raw, active);
  return <ValidatePanel state={state} />;
}
```

- [ ] **Step 4: 在 `src/App.tsx` 的 Workbench 接入**

在 `src/App.tsx` 顶部 import 加:

```typescript
import { ValidateTool } from "@/components/tools/ValidateTool";
```

在 `<main>` 内的 `{activeTool === "convert" && ...}` 后追加:

```typescript
{activeTool === "validate" && <ValidateTool raw={raw} active={activeTool === "validate"} />}
```

- [ ] **Step 5: typecheck + 手动验证**

```bash
pnpm typecheck && pnpm dev
```

浏览器:
- 切到「质量校验」Tab
- 粘贴干净 SRT → 显示绿色「未发现问题」+ 条数
- 粘贴有重叠的 SRT(见 Task 2 测试里的 badSrt) → 显示黄色警告 + 问题列表

Ctrl-C。

- [ ] **Step 6: 提交**

```bash
git add src/hooks/useValidate.ts src/components/ValidatePanel.tsx src/components/tools/ValidateTool.tsx src/App.tsx
git commit -m "feat: validate tool — quality checks with issue list"
```

---

## Task 9: InfoPanel + InfoTool + useInfo

**Files:**
- Create: `src/hooks/useInfo.ts`
- Create: `src/components/InfoPanel.tsx`
- Create: `src/components/tools/InfoTool.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/hooks/useInfo.ts`**

```typescript
import { useEffect, useRef, useState } from "react";
import { getInfo, type InfoResponse } from "@/lib/subtitler";

export type InfoState =
  | { status: "idle" }
  | { status: "ok"; data: Extract<InfoResponse, { ok: true }> }
  | { status: "error"; message: string };

export function useInfo(raw: string, active: boolean) {
  const [state, setState] = useState<InfoState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) return;
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    timer.current = setTimeout(() => {
      const resp = getInfo(raw);
      setState(
        resp.ok
          ? { status: "ok", data: resp }
          : { status: "error", message: resp.error }
      );
    }, 150);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [raw, active]);

  return state;
}
```

- [ ] **Step 2: 创建时间格式化 helper(内联在 InfoPanel)**

创建 `src/components/InfoPanel.tsx`:

```typescript
import { Info as InfoIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FORMAT_LABELS } from "@/lib/formats";
import type { InfoState } from "@/hooks/useInfo";

/** 毫秒 → HH:MM:SS.mmm */
function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(millis, 3)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export function InfoPanel({ state }: { state: InfoState }) {
  if (state.status === "idle") {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="text-sm text-muted-foreground">
          输入字幕后,字幕信息将显示在此
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="text-sm text-destructive">
          无法解析字幕:{state.message}
        </CardContent>
      </Card>
    );
  }

  const { format, count, total_duration_ms, first_timestamp, last_timestamp } = state.data;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <InfoIcon className="h-5 w-5" />
          字幕信息
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="mx-auto max-w-md">
          <Row label="格式" value={FORMAT_LABELS[format] ?? format} />
          <Row label="字幕条数" value={String(count)} />
          <Row label="总时长" value={fmtMs(total_duration_ms)} />
          <Row label="首时间戳" value={fmtMs(first_timestamp)} />
          <Row label="末时间戳" value={fmtMs(last_timestamp)} />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 创建 `src/components/tools/InfoTool.tsx`**

```typescript
import { useInfo } from "@/hooks/useInfo";
import { InfoPanel } from "@/components/InfoPanel";

interface Props {
  raw: string;
  active: boolean;
}

export function InfoTool({ raw, active }: Props) {
  const state = useInfo(raw, active);
  return <InfoPanel state={state} />;
}
```

- [ ] **Step 4: 在 `src/App.tsx` 接入**

import 加:

```typescript
import { InfoTool } from "@/components/tools/InfoTool";
```

`<main>` 内追加:

```typescript
{activeTool === "info" && <InfoTool raw={raw} active={activeTool === "info"} />}
```

- [ ] **Step 5: typecheck + 手动验证**

```bash
pnpm typecheck && pnpm dev
```

浏览器切到「字幕信息」Tab,粘贴 SRT → 显示 5 行 key-value,时间戳格式 `HH:MM:SS.mmm`。Ctrl-C。

- [ ] **Step 6: 提交**

```bash
git add src/hooks/useInfo.ts src/components/InfoPanel.tsx src/components/tools/InfoTool.tsx src/App.tsx
git commit -m "feat: info tool — subtitle metadata display"
```

---

## Task 10: NormalizePanel + NormalizeTool + useNormalize

规范化与其他三个不同:**按钮触发,不自动 debounce。**

**Files:**
- Create: `src/hooks/useNormalize.ts`
- Create: `src/components/NormalizePanel.tsx`
- Create: `src/components/tools/NormalizeTool.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/hooks/useNormalize.ts`**

```typescript
import { useCallback, useState } from "react";
import { normalize } from "@/lib/subtitler";

export type NormalizeState =
  | { status: "idle" }
  | { status: "ok"; output: string }
  | { status: "error"; message: string };

/**
 * 规范化 hook —— 按钮触发,不自动 debounce。
 * 返回 run() 触发规范化 + state。
 */
export function useNormalize(raw: string) {
  const [state, setState] = useState<NormalizeState>({ status: "idle" });

  const run = useCallback(() => {
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    const resp = normalize(raw);
    setState(
      resp.ok
        ? { status: "ok", output: resp.output }
        : { status: "error", message: resp.error }
    );
  }, [raw]);

  return { state, run };
}
```

- [ ] **Step 2: 创建 `src/components/NormalizePanel.tsx`**

```typescript
import { useState } from "react";
import { Check, Copy, Download, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import type { NormalizeState } from "@/hooks/useNormalize";

interface Props {
  state: NormalizeState;
  onRun: () => void;
}

export function NormalizePanel({ state, onRun }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (state.status !== "ok") return;
    await navigator.clipboard.writeText(state.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onDownload = () => {
    if (state.status !== "ok") return;
    const blob = new Blob([state.output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "normalized.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-5 w-5" />
          文本规范化
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked disabled />
            剥离 HTML/ASS 标签
          </label>
          <Button onClick={onRun} size="sm">
            <Wand2 className="mr-1 h-3.5 w-3.5" /> 规范化
          </Button>
        </div>

        {state.status === "idle" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            点击「规范化」处理字幕
          </div>
        )}
        {state.status === "error" && (
          <div className="flex flex-1 items-center justify-center text-sm text-destructive">
            规范化失败:{state.message}
          </div>
        )}
        {state.status === "ok" && (
          <>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? "已复制" : "复制"}
              </Button>
              <Button size="sm" onClick={onDownload}>
                <Download className="mr-1 h-3.5 w-3.5" /> 下载
              </Button>
            </div>
            <ScrollArea className="flex-1 rounded-md border">
              <pre className="p-3 font-mono text-xs leading-relaxed">{state.output}</pre>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 创建 `src/components/tools/NormalizeTool.tsx`**

```typescript
import { useNormalize } from "@/hooks/useNormalize";
import { NormalizePanel } from "@/components/NormalizePanel";

interface Props {
  raw: string;
}

export function NormalizeTool({ raw }: Props) {
  const { state, run } = useNormalize(raw);
  return <NormalizePanel state={state} onRun={run} />;
}
```

- [ ] **Step 4: 安装 checkbox 组件 + 在 `src/App.tsx` 接入**

shadcn checkbox 需要 radix 包 + 组件文件:

```bash
pnpm add @radix-ui/react-checkbox
```

创建 `src/components/ui/checkbox.tsx`:

```typescript
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
```

在 `src/App.tsx` import 加:

```typescript
import { NormalizeTool } from "@/components/tools/NormalizeTool";
```

`<main>` 内追加:

```typescript
{activeTool === "normalize" && <NormalizeTool raw={raw} />}
```

- [ ] **Step 5: typecheck + 手动验证**

```bash
pnpm typecheck && pnpm dev
```

浏览器切到「文本规范化」Tab:
- 粘贴带 `<i>` 标签的 VTT → 点「规范化」→ 结果区显示剥离标签后的文本
- 复制 / 下载按钮工作
- 改输入后再点按钮 → 结果更新(不自动)

Ctrl-C。

- [ ] **Step 6: 提交**

```bash
git add src/hooks/useNormalize.ts src/components/NormalizePanel.tsx src/components/tools/NormalizeTool.tsx src/components/ui/checkbox.tsx src/App.tsx package.json pnpm-lock.yaml
git commit -m "feat: normalize tool — button-triggered tag stripping"
```

---

## Task 11: 端到端验证 + 生产构建

**Files:** 无源码改动

- [ ] **Step 1: 确认 wasm pkg 是最新**

```bash
ls pkg/subtitle_converter_wasm.d.ts && grep -E "get_info_subtitle|validate_subtitle|normalize_subtitle" pkg/subtitle_converter_wasm.d.ts
```

预期:三个函数都在。若不在,跑 `pnpm build:wasm`。

- [ ] **Step 2: wasm 测试全跑**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:16 个测试全过(9 原有 + 7 新增)。

- [ ] **Step 3: typecheck + 生产构建**

```bash
pnpm typecheck && pnpm build
```

预期:typecheck 零错误,build 成功,wasm 体积仍 < 600KB gz(本次只加了少量代码,不应显著膨胀)。

- [ ] **Step 4: 启动 dev 做完整手动验证**

```bash
pnpm dev
```

逐项验证(对应 spec §11 验收标准):
1. 顶部 4 Tab 可切换,切回「格式转换」时输入仍在(共享 raw 生效)
2. 粘贴 SRT 后,快速切 4 个 Tab,每个都在 ~150ms 内显示结果(懒计算)
3. 格式转换:行为与扩展前一致(回归不破坏)
4. 质量校验:干净字幕显示绿色通过态;有问题的显示黄色问题列表
5. 文本规范化:按钮触发,不自动;剥离标签后可复制/下载
6. 字幕信息:5 行 key-value,时间戳 `HH:MM:SS.mmm`
7. 主题切换、响应式、错误兜底仍工作
8. 切到移动端视图,单栏堆叠正常

每项打勾。Ctrl-C。

- [ ] **Step 5: 若有调整则提交**

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
| §3 整体架构(state 提升 + 工具分离) | Task 5(state 提升), Task 7(ConvertTool 包装) |
| §4 wasm 3 个 JSON 函数 | Task 1-3 |
| §4.4 测试(TDD,~6-8 个) | Task 1-3(共 7 个新测试) |
| §4.3 前端 TS 类型 + 封装 | Task 4 |
| §5 state 提升 + 共享 raw | Task 5 |
| §5.3 懒计算(active 守卫) | Task 5(hook 加 active 参数), Task 8/9(传 active) |
| §6.1 转换工具(复用) | Task 7 |
| §6.2 校验工具 | Task 8 |
| §6.3 规范化(按钮触发) | Task 10(useNormalize 用 useCallback,无 useEffect/debounce) |
| §6.4 信息工具 | Task 9 |
| §6.5 ToolTabs | Task 6 |
| §7 文件结构 | 全部任务文件路径对齐 |
| §8 迁移策略(渐进式) | Task 5→7→8→9→10 顺序,每步可验证 |
| §11 验收标准 | Task 11 逐项对齐 |

无遗漏。

**2. 占位符扫描:** 无 TBD/TODO/「类似 Task N」。每个步骤含完整代码或确切命令。

**3. 类型一致性:**
- `ConvertResult` / `ConvertState` 在 Task 5 定义,Task 7 引用一致 ✅
- `ValidateState` / `ValidateResponse` 在 Task 4(类型)+ Task 8(hook)引用一致 ✅
- `InfoState` / `InfoResponse` 在 Task 4 + Task 9 引用一致 ✅
- `NormalizeState` / `NormalizeResponse` 在 Task 4 + Task 10 引用一致 ✅
- `ToolId` 在 Task 5(types.ts)定义,Task 6/7 引用一致 ✅
- wasm 函数名 `get_info_subtitle` / `validate_subtitle` / `normalize_subtitle` 在 Task 1-3(Rust)+ Task 4(TS import)引用一致 ✅
- hook 签名 `useSubtitleConvert(raw, active, initialTarget?)` / `useValidate(raw, active)` / `useInfo(raw, active)` / `useNormalize(raw)` 在定义处与 App 调用处一致 ✅

无问题。

**注意点(执行时易踩):**
- Task 7 的 ConvertTool 布局经历了「先嵌套 main → 再去掉」的修正(Step 1 → Step 3),执行时直接用 Step 3 的最终版本
- Task 10 的 checkbox 需要装 `@radix-ui/react-checkbox` 并创建 ui 组件(Step 4)
- 所有 `pnpm dev` 验证步骤记得 Ctrl-C 停止,避免长驻进程
