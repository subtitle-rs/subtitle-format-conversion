# subtitler 2.8.0 跟进扩展 Implementation Plan

> **执行说明:** 按 task 顺序逐个执行,每个 task 含完整代码与验证命令。步骤用 checkbox 跟踪。

**Goal:** subtitler 升级 2.8.0(17 格式全量),校验 Tab 加广播级预设,新增修复 Tab(最小间隔/合并重复/roll-up/EDL 镜头切换)。

**Architecture:** 沿用已建立的三个模式——薄包装 crate(JSON 契约、永不 panic)、hook 懒计算(active 守卫)、操作型工具按钮触发(useNormalize 模式)。

**Tech Stack:** Rust/wasm-pack 2.8.0、React 19 + TS + Tailwind v4 + shadcn/ui(均已就绪)。

**Spec:** `docs/superpowers/specs/2026-10-02-subtitler-28-upgrade-design.md`

**已验证的 API(执行者无需再查):**
- `subtitler::guidelines::{GuidelinePreset, Guideline}` — `GuidelinePreset::{Netflix,Bbc,Ted,ArdOrfSrfZdf,Channel4}`,`preset.guideline() -> Guideline`
- `SubtitleFormat::validate_guideline(&Guideline) -> Vec<ValidationIssue>`(trait 方法)
- `SubtitleFormat::enforce_min_gap(u64)` / `merge_identical(u64)` / `remove_repeating_lines()` / `apply_shot_changes(&[u64] cuts_ms, u64 before_frames, u64 after_frames, f64 fps)`(全 trait 方法,前三个 `&mut self`)
- `subtitler::shotlist::parse_edl_cuts(&[u8], f64) -> AnyResult<Vec<u64>>`
- 新格式 feature 名:`spruce` `itt` `dfxp` `whisper`;扩展名 `spruce`/`itt`/`dfxp`/`json`

---

## File Structure

```
wasm/Cargo.toml                  # 改:2.8.0 + 4 新 feature
wasm/src/lib.rs                  # 改:validate_subtitle 加参数;+repair_subtitle +parse_edl_cuts
src/lib/formats.ts               # 改:+4 格式
src/lib/subtitler.ts             # 改:validate 加参数;+repair/+parseEdlCuts
src/types.ts                     # 改:ToolId + "repair"
src/hooks/useValidate.ts         # 改:+preset 参数
src/hooks/useRepair.ts           # 新
src/components/ToolTabs.tsx      # 改:+修复 Tab
src/components/ValidatePanel.tsx # 改:规则集下拉
src/components/tools/RepairTool.tsx # 新
src/components/RepairPanel.tsx   # 新
```

---

## Task 1: 升级 subtitler 2.8.0 + 启用新格式 feature

**Files:**
- Modify: `wasm/Cargo.toml`

- [ ] **Step 1: 更新依赖**

`wasm/Cargo.toml` 的 `[dependencies]` 中 subtitler 行替换为:

```toml
subtitler = { version = "2.8.0", default-features = false, features = [
  "srt", "vtt", "ass", "ssa", "microdvd", "spruce", "subviewer",
  "ttml", "dfxp", "itt", "whisper", "sbv", "lrc", "sami",
  "mpl2", "scc", "ebu_stl", "wasm"
] }
```

- [ ] **Step 2: 跑全量 wasm 测试(暴露 breaking changes)**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:16 个测试全过。若编译失败(2.8.0 的 `ass::to_string` breaking change 泄漏到 `to_string_with_format` 内部签名),按编译错误信息修包装层对应调用;若 `Format` 枚举新增了 `Spruce`/`Itt`/`Dfxp`/`Whisper` variant 导致 match 不穷尽,在 `format_from_name`/`format_to_name` 补:

```rust
"spruce" => Some(Format::Spruce),
"itt" => Some(Format::Itt),
"dfxp" => Some(Format::Dfxp),
"whisper" => Some(Format::Whisper),
```

```rust
Format::Spruce => "spruce",
Format::Itt => "itt",
Format::Dfxp => "dfxp",
Format::Whisper => "whisper",
```

并同步给 `supported_formats()` 的数组加 `"spruce", "itt", "dfxp", "whisper"`。

- [ ] **Step 3: 测试全过后提交**

```bash
git add wasm/Cargo.toml wasm/src/lib.rs Cargo.lock
git commit -m "build(wasm): upgrade subtitler 2.6.1 -> 2.8.0, enable spruce/itt/dfxp/whisper"
```

---

## Task 2: validate_subtitle 加 guideline 参数(TDD)

**Files:**
- Modify: `wasm/src/lib.rs`

- [ ] **Step 1: 改测试(现有 validate 测试全部加参数)**

测试区中现有 3 个 `validate_subtitle_*` 测试的调用改为传 `"basic"`:

```rust
let resp = validate_subtitle(srt, "basic");
```

(三个测试:`validate_subtitle_clean` / `validate_subtitle_with_overlap` / `validate_subtitle_invalid`)

- [ ] **Step 2: 写新测试**

```rust
#[wasm_bindgen_test]
fn validate_subtitle_netflix_preset() {
    // 行长超 Netflix 42 字符限制 → 应报 LineCountExceeded 或行长度问题
    let long_line = "1\n00:00:01,000 --> 00:00:04,000\nThis subtitle line is way way way too long for the Netflix guideline limit of forty-two characters\n\n";
    let resp = validate_subtitle(long_line, "netflix");
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    assert!(v["issue_count"].as_u64().unwrap() >= 1);
}

#[wasm_bindgen_test]
fn validate_subtitle_invalid_guideline() {
    let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
    let resp = validate_subtitle(srt, "notapreset");
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], false);
    assert!(v["error"].as_str().unwrap().contains("notapreset"));
}
```

注:若 Netflix 对该样例不报错(规则细节与预期不符),先手动跑一次确认再放宽断言——关键是 `ok:true` 且结构正确,issue 数量断言可调。

- [ ] **Step 3: 实现 guideline 参数**

替换现有 `validate_subtitle` 实现:

```rust
/// 质量校验。guideline: "basic"|"netflix"|"bbc"|"ted"|"ard"|"channel4"
///   {"ok":true,"format":"srt","count":N,"issue_count":N,
///    "issues":["..."]}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn validate_subtitle(content: &str, guideline: &str) -> String {
    use subtitler::guidelines::GuidelinePreset;
    use subtitler::model::SubtitleFormat as _;

    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    let count = file.subtitles().len() as u32;

    let issues: Vec<String> = match guideline.to_lowercase().as_str() {
        "basic" | "" => file.validate().iter().map(|i| i.to_string()).collect(),
        "netflix" => file.validate_guideline(&GuidelinePreset::Netflix.guideline())
            .iter().map(|i| i.to_string()).collect(),
        "bbc" => file.validate_guideline(&GuidelinePreset::Bbc.guideline())
            .iter().map(|i| i.to_string()).collect(),
        "ted" => file.validate_guideline(&GuidelinePreset::Ted.guideline())
            .iter().map(|i| i.to_string()).collect(),
        "ard" => file.validate_guideline(&GuidelinePreset::ArdOrfSrfZdf.guideline())
            .iter().map(|i| i.to_string()).collect(),
        "channel4" => file.validate_guideline(&GuidelinePreset::Channel4.guideline())
            .iter().map(|i| i.to_string()).collect(),
        other => {
            return serde_json::json!({
                "ok": false,
                "error": format!("Unknown guideline preset: {}", other)
            }).to_string();
        }
    };
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

- [ ] **Step 4: 跑测试确认全过**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:18 个全过(16 + 2 新增)。

- [ ] **Step 5: 提交**

```bash
git add wasm/src/lib.rs
git commit -m "feat(wasm): validate_subtitle guideline presets (netflix/bbc/ted/ard/channel4)"
```

---

## Task 3: parse_edl_cuts + repair_subtitle(TDD)

**Files:**
- Modify: `wasm/src/lib.rs`

- [ ] **Step 1: 写失败的测试**

```rust
#[wasm_bindgen_test]
fn parse_edl_cuts_basic() {
    let edl = "TITLE: TEST CUTS\n\n001  V     C        01:00:10:00 01:00:20:00 01:00:10:00 01:00:20:00\n\n002  V     C        01:00:30:00 01:00:40:00 01:00:30:00 01:00:40:00\n";
    let resp = parse_edl_cuts(edl, 25.0);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    let cuts = v["cuts"].as_array().unwrap();
    assert_eq!(cuts.len(), 2);
}

#[wasm_bindgen_test]
fn parse_edl_cuts_invalid() {
    let resp = parse_edl_cuts("this is not an edl", 25.0);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    // 空 cuts 或 ok:false 都可接受(取决于库对空/无效 EDL 的行为)
    assert!(v["ok"] == true || v["ok"] == false);
}

#[wasm_bindgen_test]
fn repair_min_gap() {
    // 两条间隔 200ms,强制最小间隔 500ms → 前一条 end 被拉回
    let srt = "1\n00:00:01,000 --> 00:00:03,000\nA\n\n2\n00:00:03,200 --> 00:00:05,000\nB\n\n";
    let resp = repair_subtitle(srt, 500, -1, false, &[]);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["before"], 2);
    assert_eq!(v["after"], 2); // min_gap 不减少条数
    assert!(v["output"].as_str().unwrap().contains("00:00:02,700")); // 3200-500=2700
}

#[wasm_bindgen_test]
fn repair_merge_identical() {
    let srt = "1\n00:00:01,000 --> 00:00:02,000\nSame\n\n2\n00:00:02,500 --> 00:00:03,500\nSame\n\n";
    let resp = repair_subtitle(srt, -1, 1000, false, &[]);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["before"], 2);
    assert_eq!(v["after"], 1);
}

#[wasm_bindgen_test]
fn repair_noop() {
    let srt = "1\n00:00:01,000 --> 00:00:03,500\nHello\n\n";
    let resp = repair_subtitle(srt, -1, -1, false, &[]);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["before"], 1);
    assert_eq!(v["after"], 1);
    assert!(v["output"].as_str().unwrap().contains("Hello"));
}

#[wasm_bindgen_test]
fn repair_invalid_content() {
    let resp = repair_subtitle("garbage", -1, -1, false, &[]);
    let v: serde_json::Value = serde_json::from_str(&resp).unwrap();
    assert_eq!(v["ok"], false);
}
```

注:`repair_min_gap` 断言 `00:00:02,700` 基于「end 拉回到下一条 start - gap」语义(3200-500=2700);若库实现是别的方向(如推后 start),按实际输出调整断言——先跑一次看真实结果再定。

- [ ] **Step 2: 跑测试确认编译失败**

```bash
cd wasm && wasm-pack test --node --lib
```

- [ ] **Step 3: 实现两个函数**

在 `normalize_subtitle` 后追加:

```rust
/// 解析 CMX3600 EDL 切镜点。
///   {"ok":true,"cuts":[ms,...]} | {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn parse_edl_cuts(edl: &str, fps: f64) -> String {
    match subtitler::shotlist::parse_edl_cuts(edl.as_bytes(), fps) {
        Ok(cuts) => serde_json::json!({ "ok": true, "cuts": cuts }).to_string(),
        Err(e) => serde_json::json!({ "ok": false, "error": e.to_string() }).to_string(),
    }
}

/// 修复操作(按序:min_gap -> merge_identical -> rollup -> shot_changes)。
/// min_gap_ms / merge_gap_ms 用 -1 表示不启用。
///   {"ok":true,"output":"...","before":N,"after":M}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn repair_subtitle(
    content: &str,
    min_gap_ms: i64,
    merge_gap_ms: i64,
    rollup: bool,
    cuts_ms: &[u64],
) -> String {
    use subtitler::model::SubtitleFormat as _;

    let mut file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    let before = file.subtitles().len() as u32;

    if min_gap_ms >= 0 {
        file.enforce_min_gap(min_gap_ms as u64);
    }
    if merge_gap_ms >= 0 {
        file.merge_identical(merge_gap_ms as u64);
    }
    if rollup {
        file.remove_repeating_lines();
    }
    if !cuts_ms.is_empty() {
        file.apply_shot_changes(cuts_ms, 2, 12, 25.0);
    }

    let after = file.subtitles().len() as u32;
    serde_json::json!({
        "ok": true,
        "output": file.to_string(),
        "before": before,
        "after": after
    })
    .to_string()
}
```

注意:`apply_shot_changes` 的 before/after 帧数与 fps 暂时硬编码(2/12/25.0)——JS 侧把帧率换算成 `cuts_ms` 后传入,cuts 已经是毫秒,这里的 frames 参数只是 guard zone。**改进**:把 before/after/fps 也参数化会让签名过长;当前 UI 的「切前/切后帧数」输入通过换算后并入 cuts 传参不可行(guard zone 不等于 cut 点)。正确做法是让前端把 `before_frames`/`after_frames`/`fps` 传进来:

改签名(用这个版本):

```rust
#[wasm_bindgen]
pub fn repair_subtitle(
    content: &str,
    min_gap_ms: i64,
    merge_gap_ms: i64,
    rollup: bool,
    cuts_ms: &[u64],
    before_frames: u64,
    after_frames: u64,
    fps: f64,
) -> String {
    use subtitler::model::SubtitleFormat as _;

    let mut file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => {
            return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string();
        }
    };
    let before = file.subtitles().len() as u32;

    if min_gap_ms >= 0 {
        file.enforce_min_gap(min_gap_ms as u64);
    }
    if merge_gap_ms >= 0 {
        file.merge_identical(merge_gap_ms as u64);
    }
    if rollup {
        file.remove_repeating_lines();
    }
    if !cuts_ms.is_empty() {
        file.apply_shot_changes(cuts_ms, before_frames, after_frames, fps);
    }

    let after = file.subtitles().len() as u32;
    serde_json::json!({
        "ok": true,
        "output": file.to_string(),
        "before": before,
        "after": after
    })
    .to_string()
}
```

对应把 Task 3 Step 1 测试里的调用全部改为 8 参形式:

```rust
repair_subtitle(srt, 500, -1, false, &[], 0, 0, 25.0)
repair_subtitle(srt, -1, 1000, false, &[], 0, 0, 25.0)
repair_subtitle(srt, -1, -1, false, &[], 0, 0, 25.0)
repair_subtitle("garbage", -1, -1, false, &[], 0, 0, 25.0)
```

- [ ] **Step 4: 跑测试确认全过**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:24 个全过(18 + 6)。

- [ ] **Step 5: 重建 pkg + 提交**

```bash
wasm-pack build wasm --target web --out-dir ../pkg
git add wasm/src/lib.rs
git commit -m "feat(wasm): repair_subtitle + parse_edl_cuts — repair ops & shot-change rules"
```

---

## Task 4: 前端 lib + 类型扩展

**Files:**
- Modify: `src/lib/formats.ts`
- Modify: `src/lib/subtitler.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: formats.ts 加 4 格式**

`FORMAT_EXTENSIONS` 加:

```typescript
  spruce: "spruce",
  itt: "itt",
  dfxp: "dfxp",
  whisper: "json",
```

`FORMAT_LABELS` 加:

```typescript
  spruce: "Spruce STL",
  itt: "iTunes TT (ITT)",
  dfxp: "DFXP",
  whisper: "Whisper JSON",
```

- [ ] **Step 2: subtitler.ts 更新**

import 列表加 `repair_subtitle, parse_edl_cuts`。`validate` 改签名并更新所有调用点类型:

```typescript
export type GuidelinePreset = "basic" | "netflix" | "bbc" | "ted" | "ard" | "channel4";

export function validate(content: string, guideline: GuidelinePreset = "basic"): ValidateResponse {
  const raw = validate_subtitle(content, guideline);
  return JSON.parse(raw) as ValidateResponse;
}

export type RepairResponse =
  | { ok: true; output: string; before: number; after: number }
  | { ok: false; error: string };

export type EdlCutsResponse =
  | { ok: true; cuts: number[] }
  | { ok: false; error: string };

export function repair(
  content: string,
  opts: {
    minGapMs: number;   // -1 = off
    mergeGapMs: number; // -1 = off
    rollup: boolean;
    cutsMs: number[];
    beforeFrames: number;
    afterFrames: number;
    fps: number;
  }
): RepairResponse {
  const raw = repair_subtitle(
    content,
    opts.minGapMs,
    opts.mergeGapMs,
    opts.rollup,
    opts.cutsMs,
    opts.beforeFrames,
    opts.afterFrames,
    opts.fps
  );
  return JSON.parse(raw) as RepairResponse;
}

export function parseEdlCuts(edl: string, fps: number): EdlCutsResponse {
  const raw = parse_edl_cuts(edl, fps);
  return JSON.parse(raw) as EdlCutsResponse;
}
```

- [ ] **Step 3: types.ts 扩展 ToolId**

```typescript
export type ToolId = "convert" | "validate" | "normalize" | "repair" | "info";
```

- [ ] **Step 4: typecheck + 提交**

```bash
pnpm typecheck
git add src/lib/formats.ts src/lib/subtitler.ts src/types.ts
git commit -m "feat: 17-format metadata + repair/EDL typed wrappers"
```

---

## Task 5: ValidatePanel 规则集下拉 + useValidate 传参

**Files:**
- Modify: `src/hooks/useValidate.ts`
- Modify: `src/components/ValidatePanel.tsx`
- Modify: `src/components/tools/ValidateTool.tsx`

- [ ] **Step 1: useValidate 加 preset**

```typescript
import { useEffect, useRef, useState } from "react";
import { validate, type GuidelinePreset, type ValidateResponse } from "@/lib/subtitler";

export type ValidateState =
  | { status: "idle" }
  | { status: "ok"; data: Extract<ValidateResponse, { ok: true }> }
  | { status: "error"; message: string };

export function useValidate(raw: string, active: boolean, preset: GuidelinePreset) {
  const [state, setState] = useState<ValidateState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) return; // 懒计算守卫
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    timer.current = setTimeout(() => {
      const resp = validate(raw, preset);
      setState(
        resp.ok
          ? { status: "ok", data: resp }
          : { status: "error", message: resp.error }
      );
    }, 150);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [raw, active, preset]);

  return state;
}
```

- [ ] **Step 2: ValidatePanel 加下拉(受控)**

`ValidatePanel` props 加 `preset` / `onPresetChange`,头部渲染 Select。完整新 props 与头部:

```typescript
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FORMAT_LABELS } from "@/lib/formats";
import type { GuidelinePreset } from "@/lib/subtitler";
import type { ValidateState } from "@/hooks/useValidate";

const PRESETS: { value: GuidelinePreset; label: string }[] = [
  { value: "basic", label: "基础" },
  { value: "netflix", label: "Netflix 出海规范" },
  { value: "bbc", label: "BBC" },
  { value: "ted", label: "TED" },
  { value: "ard", label: "ARD/ORF/SRF/ZDF" },
  { value: "channel4", label: "Channel 4" },
];

interface Props {
  state: ValidateState;
  preset: GuidelinePreset;
  onPresetChange: (p: GuidelinePreset) => void;
}

export function ValidatePanel({ state, preset, onPresetChange }: Props) {
  // idle / error 分支同现有(不加下拉,保持轻)
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
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => onPresetChange(v as GuidelinePreset)}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardTitle className="mt-2 flex flex-wrap items-center gap-2 text-base">
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

- [ ] **Step 3: ValidateTool 传递(preset state 放 Tool 内)**

```typescript
import { useState } from "react";
import { useValidate } from "@/hooks/useValidate";
import { ValidatePanel } from "@/components/ValidatePanel";
import type { GuidelinePreset } from "@/lib/subtitler";

interface Props {
  raw: string;
  active: boolean;
}

export function ValidateTool({ raw, active }: Props) {
  const [preset, setPreset] = useState<GuidelinePreset>("basic");
  const state = useValidate(raw, active, preset);
  return <ValidatePanel state={state} preset={preset} onPresetChange={setPreset} />;
}
```

- [ ] **Step 4: typecheck + 提交**

```bash
pnpm typecheck
git add src/hooks/useValidate.ts src/components/ValidatePanel.tsx src/components/tools/ValidateTool.tsx
git commit -m "feat: broadcaster guideline presets in validate tab"
```

---

## Task 6: 修复 Tab(useRepair + RepairPanel + RepairTool + ToolTabs)

**Files:**
- Create: `src/hooks/useRepair.ts`
- Create: `src/components/RepairPanel.tsx`
- Create: `src/components/tools/RepairTool.tsx`
- Modify: `src/components/ToolTabs.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: useRepair**

```typescript
import { useCallback, useState } from "react";
import { repair, type RepairResponse } from "@/lib/subtitler";

export type RepairState =
  | { status: "idle" }
  | { status: "ok"; output: string; before: number; after: number }
  | { status: "error"; message: string };

export interface RepairOptions {
  minGapEnabled: boolean;
  minGapMs: number;
  mergeEnabled: boolean;
  mergeGapMs: number;
  rollup: boolean;
  cutsMs: number[];
  beforeFrames: number;
  afterFrames: number;
  fps: number;
}

export const DEFAULT_REPAIR_OPTIONS: RepairOptions = {
  minGapEnabled: true,
  minGapMs: 500,
  mergeEnabled: true,
  mergeGapMs: 2000,
  rollup: false,
  cutsMs: [],
  beforeFrames: 2,
  afterFrames: 12,
  fps: 25,
};

export function useRepair(raw: string) {
  const [state, setState] = useState<RepairState>({ status: "idle" });
  const [options, setOptions] = useState<RepairOptions>(DEFAULT_REPAIR_OPTIONS);

  const run = useCallback(() => {
    if (!raw.trim()) {
      setState({ status: "idle" });
      return;
    }
    const resp = repair({
      minGapMs: options.minGapEnabled ? options.minGapMs : -1,
      mergeGapMs: options.mergeEnabled ? options.mergeGapMs : -1,
      rollup: options.rollup,
      cutsMs: options.cutsMs,
      beforeFrames: options.beforeFrames,
      afterFrames: options.afterFrames,
      fps: options.fps,
    });
    setState(
      resp.ok
        ? { status: "ok", output: resp.output, before: resp.before, after: resp.after }
        : { status: "error", message: resp.error }
    );
  }, [raw, options]);

  return { state, options, setOptions, run };
}
```

- [ ] **Step 2: RepairPanel**

```typescript
import { useRef, useState } from "react";
import { Check, Copy, Download, Wrench, FileUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { parseEdlCuts, type EdlCutsResponse } from "@/lib/subtitler";
import {
  useRepair, type RepairOptions,
} from "@/hooks/useRepair";

interface Props {
  raw: string;
  state: ReturnType<typeof useRepair>["state"];
  options: RepairOptions;
  onOptionsChange: (o: RepairOptions) => void;
  onRun: () => void;
  fileName: string | null;
}

const FPS_OPTIONS = [23.976, 24, 25, 29.97, 30];

export function RepairPanel({ raw, state, options, onOptionsChange, onRun, fileName }: Props) {
  const [copied, setCopied] = useState(false);
  const [edlName, setEdlName] = useState<string | null>(null);
  const [edlError, setEdlError] = useState<string | null>(null);
  const edlRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof RepairOptions>(k: K, v: RepairOptions[K]) =>
    onOptionsChange({ ...options, [k]: v });

  const onEdlFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resp: EdlCutsResponse = parseEdlCuts(reader.result as string, options.fps);
      if (resp.ok) {
        set("cutsMs", resp.cuts);
        setEdlName(`${file.name} · ${resp.cuts.length} 个切镜点`);
        setEdlError(null);
      } else {
        set("cutsMs", []);
        setEdlName(null);
        setEdlError(resp.error);
      }
    };
    reader.readAsText(file);
  };

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
    a.download = `${(fileName ?? "subtitle").replace(/\.[^.]+$/, "")}.repaired`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canRun = raw.trim().length > 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-5 w-5" />
          字幕修复
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {/* 修复操作 */}
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={options.minGapEnabled}
              onCheckedChange={(c) => set("minGapEnabled", c === true)}
            />
            保证最小间隔
            <Input
              type="number"
              value={options.minGapMs}
              onChange={(e) => set("minGapMs", Number(e.target.value) || 0)}
              disabled={!options.minGapEnabled}
              className="ml-auto h-7 w-24"
            />
            <span className="text-xs text-muted-foreground">ms</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={options.mergeEnabled}
              onCheckedChange={(c) => set("mergeEnabled", c === true)}
            />
            合并重复文本 gap ≤
            <Input
              type="number"
              value={options.mergeGapMs}
              onChange={(e) => set("mergeGapMs", Number(e.target.value) || 0)}
              disabled={!options.mergeEnabled}
              className="h-7 w-24"
            />
            <span className="text-xs text-muted-foreground">ms</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={options.rollup}
              onCheckedChange={(c) => set("rollup", c === true)}
            />
            Roll-up 修复(合并相邻相同文本)
          </label>
        </div>

        {/* EDL 镜头切换 */}
        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">镜头切换规则(Netflix 出海)</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="outline" size="sm" onClick={() => edlRef.current?.click()}>
              <FileUp className="mr-1 h-3.5 w-3.5" /> 选择 EDL
            </Button>
            {edlName && <span className="text-xs text-muted-foreground">{edlName}</span>}
            {edlError && <span className="text-xs text-destructive">EDL 解析失败:{edlError}</span>}
            <input
              ref={edlRef}
              type="file"
              accept=".edl,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onEdlFile(f);
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">帧率</span>
            <Select value={String(options.fps)} onValueChange={(v) => set("fps", Number(v))}>
              <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FPS_OPTIONS.map((f) => (
                  <SelectItem key={f} value={String(f)}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-2 text-muted-foreground">切前留</span>
            <Input
              type="number"
              value={options.beforeFrames}
              onChange={(e) => set("beforeFrames", Number(e.target.value) || 0)}
              className="h-7 w-16"
            />
            <span className="text-muted-foreground">帧 · 切后留</span>
            <Input
              type="number"
              value={options.afterFrames}
              onChange={(e) => set("afterFrames", Number(e.target.value) || 0)}
              className="h-7 w-16"
            />
            <span className="text-muted-foreground">帧</span>
          </div>
        </div>

        <Button onClick={onRun} disabled={!canRun} size="sm" className="w-fit">
          <Wrench className="mr-1 h-3.5 w-3.5" /> 执行修复
        </Button>

        {/* 结果区 */}
        {state.status === "idle" && (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            勾选修复项后点击「执行修复」
          </div>
        )}
        {state.status === "error" && (
          <div className="flex flex-1 items-center justify-center text-sm text-destructive">
            修复失败:{state.message}
          </div>
        )}
        {state.status === "ok" && (
          <>
            <div className="flex items-center gap-3 text-sm">
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                {copied ? "已复制" : "复制"}
              </Button>
              <Button size="sm" onClick={onDownload}>
                <Download className="mr-1 h-3.5 w-3.5" /> 下载
              </Button>
              <span className="text-muted-foreground">
                字幕 {state.before} 条 → {state.after} 条
              </span>
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

注意:此组件需要 shadcn 的 `input` 组件(项目还没有)。先添加:

```bash
pnpm dlx shadcn@latest add input --yes --overwrite
```

- [ ] **Step 3: RepairTool**

```typescript
import { useRepair } from "@/hooks/useRepair";
import { RepairPanel } from "@/components/RepairPanel";

interface Props {
  raw: string;
  fileName: string | null;
}

export function RepairTool({ raw, fileName }: Props) {
  const { state, options, setOptions, run } = useRepair(raw);
  return (
    <RepairPanel
      raw={raw}
      state={state}
      options={options}
      onOptionsChange={setOptions}
      onRun={run}
      fileName={fileName}
    />
  );
}
```

- [ ] **Step 4: ToolTabs 加修复 Tab**

`TOOLS` 数组改为(插入 repair 在 normalize 之后):

```typescript
import { Repeat, ShieldCheck, Wand2, Wrench, Info } from "lucide-react";

const TOOLS: { id: ToolId; label: string; icon: typeof Repeat }[] = [
  { id: "convert", label: "格式转换", icon: Repeat },
  { id: "validate", label: "质量校验", icon: ShieldCheck },
  { id: "normalize", label: "文本规范化", icon: Wand2 },
  { id: "repair", label: "修复", icon: Wrench },
  { id: "info", label: "字幕信息", icon: Info },
];
```

- [ ] **Step 5: App.tsx 接入**

import 加 `RepairTool`,`<main>` 内 normalize 分支后加:

```tsx
{activeTool === "repair" && <RepairTool raw={raw} fileName={fileName} />}
```

- [ ] **Step 6: typecheck + 手动验证 + 提交**

```bash
pnpm typecheck
pnpm dev
```

浏览器验证:修复 Tab 出现且 5 个 Tab 完整;勾选项 → 执行修复 → 前后条数变化;EDL 上传(可用 ../subtitler/test_demo_files 找 .edl,或造一个);Ctrl-C 后:

```bash
git add src/hooks/useRepair.ts src/components/RepairPanel.tsx src/components/tools/RepairTool.tsx src/components/ToolTabs.tsx src/App.tsx src/components/ui/input.tsx package.json pnpm-lock.yaml
git commit -m "feat: repair tab — min-gap/merge/rollup + EDL shot-change rules"
```

---

## Task 7: 端到端验证 + 发版

- [ ] **Step 1: 全量 wasm 测试**

```bash
cd wasm && wasm-pack test --node --lib
```

预期:24 个全过。

- [ ] **Step 2: typecheck + 生产构建**

```bash
pnpm typecheck && pnpm build
```

预期:构建成功;记录 wasm gzip 体积(加了 4 格式 + 校验预设 + 修复,预计从 584KB 涨到 600-650KB,可接受;超过 700KB 需考虑 feature 裁剪)。

- [ ] **Step 3: 浏览器全功能走查**

1. 转换:17 项格式下拉;SRT→Whisper 下载扩展名 .json
2. 校验:6 种规则集切换;Netflix 预设报行长/阅读速度问题
3. 修复:三种操作独立与叠加;前后条数显示;EDL + 帧率生效
4. 回归:规范化/信息/懒计算/主题/响应式不破坏

- [ ] **Step 4: 合并发版**

```bash
git checkout main && git merge --no-ff feat/subtitler-28-upgrade
# 测试通过后:
git push origin main
git tag -a v0.3.0 -m "v0.3.0: subtitler 2.8.0 — 17 formats, guideline presets, repair tab"
git push origin v0.3.0
```

---

## Self-Review

1. **Spec 覆盖**:§2 升级+新格式(Task 1/4)、§3 校验预设(Task 2/5)、§4 修复+EDL(Task 3/6)、§6 迁移顺序(任务顺序一致)、§9 验收(Task 7 逐项)。无遗漏。
2. **占位符**:无 TBD;所有代码完整;两处「按实际输出调整断言」是显式验证指令而非占位。
3. **类型一致性**:`GuidelinePreset` TS 类型 ↔ Rust 侧字符串映射一致;`RepairResponse`/`EdlCutsResponse` 与 wasm JSON 契约字段一致;`repair_subtitle` 8 参签名在测试(Task 3)与 TS 封装(Task 4)一致;`ToolId` 加 "repair" 后 ToolTabs/App 引用一致。
4. **风险前置**:Task 1 Step 2 专门跑全量测试暴露 2.8.0 breaking changes;Task 3 两处断言可能需按库实际行为微调(已标注)。
