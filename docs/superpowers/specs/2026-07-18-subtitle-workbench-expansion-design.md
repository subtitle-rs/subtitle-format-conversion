# 字幕工具台扩展 — 设计方案

> 把字幕格式转换网页从「纯转换器」升级为「字幕工具台」:一份输入,四个工具,顶部 Tab 切换。
>
> 创建时间:2026-07-18
> 基础项目:`subtitle-format-conversion`(已部署,commit `4d20d4d`)

## 1. 产品定位演进

当前产品是聚焦的字幕格式转换器。本次扩展暴露 subtitler 库已具备但未使用的能力,升级为**字幕工具台**:用户上传/粘贴一份字幕,可在四个工具间切换,对同一份内容做不同处理。

四个工具:

| 工具 | subtitler 底层能力 | 用途 |
|------|-------------------|------|
| 格式转换 | `parse_bytes` + `to_string_with_format` | 已有,13 格式互转 |
| 质量校验 | `SubtitleFile::validate()` | 检测重叠、负时长、时间倒序 |
| 文本规范化 | `Subtitle::strip_tags()` | 剥离 HTML/ASS 标签 |
| 字幕信息 | `SubtitleFile` 元数据 | 条数、总时长、首末时间戳 |

**仍是纯客户端** —— 无后端、无上传,所有处理在浏览器 WASM 内完成。

## 2. 关键技术发现

探测 subtitler 原生 wasm 绑定的真实返回结构后发现:

| 原生函数 | 返回类型 | 问题 |
|---------|---------|------|
| `get_info(content)` | JS `Map` | 用 `serde_wasm_bindgen` 序列化,前端拿到 Map 非普通对象 |
| `validate_subtitles(content)` | JS `Map` | 同上,`issues` 是 string[] |
| `normalize_text(content)` | `string` | 可直接用 |

**决策:不复用原生 `get_info` / `validate_subtitles`。** 它们返回 Map,前端处理麻烦且契约不稳。我们在 `wasm/src/lib.rs` 包装层直接调 `subtitler::parse_bytes` + 自己组装 JSON(跟现有 `convert_subtitle` 完全一致的模式)。

## 3. 整体架构

```
┌─────────────────────────────────────────────────────┐
│  Header: Logo + 名称 + 主题切换 + GitHub              │
├─────────────────────────────────────────────────────┤
│  ToolTabs(顶部全局):                                  │
│    [格式转换] [质量校验] [文本规范化] [字幕信息]        │
├─────────────────────────────────────────────────────┤
│  <active tool 的主区域>                                │
│  每个工具 = 左输入(共享)+ 右输出(各自)              │
│                                                       │
│  共享 state:raw(字幕原文)                            │
│  各自 state:target 格式 / 校验结果 / 规范化选项 / 等   │
└─────────────────────────────────────────────────────┘
```

**state 提升与工具分离:**

```
当前:                          扩展后:
App                            App
 └─ useSubtitleConvert         ├─ raw (共享输入,提升到 App)
    (raw + target + result)    ├─ fileName
                               ├─ activeTool: 'convert'|'validate'|'normalize'|'info'
                               └─ <ToolPanel activeTool raw>
                                   ├─ ConvertTool   (raw + 自己的 target)
                                   ├─ ValidateTool  (raw)
                                   ├─ NormalizeTool (raw + 自己的 options)
                                   └─ InfoTool      (raw)
```

**核心原则:** `raw` 在 App 层(全局共享),每个工具只负责自己的处理逻辑 + 输出展示。工具之间无依赖,可独立理解、独立测试。

## 4. wasm 包装层 API

在 `wasm/src/lib.rs` 新增 3 个 `#[wasm_bindgen]` 函数,沿用现有 `convert_subtitle` 的契约:**永不 panic + 返回 JSON 字符串 + `{ok,...} | {ok:false, error}`**。

### 4.1 新增函数签名

```rust
/// 字幕信息。
///   {"ok":true,"format":"srt","count":N,"total_duration_ms":N,
///    "first_timestamp":N,"last_timestamp":N}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn get_info_subtitle(content: &str) -> String;

/// 质量校验。
///   {"ok":true,"format":"srt","count":N,"issue_count":N,
///    "issues":["subtitle 0 overlaps..."]}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn validate_subtitle(content: &str) -> String;

/// 文本规范化(剥离标签)。
///   {"ok":true,"output":"..."}
///   {"ok":false,"error":"..."}
#[wasm_bindgen]
pub fn normalize_subtitle(content: &str) -> String;
```

### 4.2 实现要点

三个函数都遵循同一模式:

```rust
#[wasm_bindgen]
pub fn get_info_subtitle(content: &str) -> String {
    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => return serde_json::json!({ "ok": false, "error": e.to_string() }).to_string(),
    };
    let subs = file.subtitles();
    let (first, last) = match (subs.first(), subs.last()) {
        (Some(f), Some(l)) => (f.start, l.end),
        _ => (0, 0),
    };
    serde_json::json!({
        "ok": true,
        "format": format_to_name(file.format()),
        "count": subs.len() as u32,
        "total_duration_ms": if subs.is_empty() { 0 } else { last - first },
        "first_timestamp": first,
        "last_timestamp": last,
    }).to_string()
}
```

`validate_subtitle` 调 `file.validate()` 返回 `Vec<Issue>`,每条 `issue.to_string()` 组成 `issues` 数组。`normalize_subtitle` 调 `file.subtitles_mut()` 对每条 `sub.strip_tags()`,再 `file.to_string()`。

### 4.3 前端 TS 镜影类型

```typescript
// src/lib/subtitler.ts 扩展
export type InfoResponse = {
  ok: true; format: SubtitleFormat; count: number;
  total_duration_ms: number; first_timestamp: number; last_timestamp: number;
} | { ok: false; error: string };

export type ValidateResponse = {
  ok: true; format: SubtitleFormat; count: number;
  issue_count: number; issues: string[];
} | { ok: false; error: string };

export type NormalizeResponse =
  | { ok: true; output: string }
  | { ok: false; error: string };

export function getInfo(content: string): InfoResponse;
export function validate(content: string): ValidateResponse;
export function normalize(content: string): NormalizeResponse;
```

### 4.4 测试

TDD,每个新函数 ≥2 测试(成功 + 错误路径),共 ~6-8 个新测试,跑 `wasm-pack test --node --lib`。

## 5. state 提升与共享输入

### 5.1 state 结构

```typescript
// App 层(全局)
interface AppState {
  raw: string;                    // 共享输入,所有工具共用
  fileName: string | null;        // 上传的文件名(下载时用)
  activeTool: ToolId;             // 当前激活的工具
}

type ToolId = 'convert' | 'validate' | 'normalize' | 'info';
```

### 5.2 hook 边界改造

```typescript
// 改造前:hook 自己管 raw
const { state, setRaw, ... } = useSubtitleConvert();

// 改造后:raw 由 App 传入,hook 只管处理逻辑
function useConvert(raw: string) { /* target + result */ }
function useValidate(raw: string) { /* result */ }
function useNormalize(raw: string) { /* options + result */ }
function useInfo(raw: string) { /* result */ }
```

### 5.3 懒计算决策(关键)

4 个 hook 都监听 `raw`,但用户一次只看一个 Tab。

| 方案 | 说明 | 取舍 |
|------|------|------|
| 全计算(所有 hook 永远跑) | 切 Tab 瞬间就有结果 | wasm 都很快(<10ms),但 4 倍无用计算,大文件浪费 |
| **懒计算(选)** | hook 内部用 `activeTool === 自己` 守卫,切走就停 | 略延迟(切 Tab 后 ~150ms debounce),省 3/4 计算 |

**选懒计算。** 理由:字幕可能几 MB,4 个工具同时跑会卡;守卫实现极简(一行 `if (activeTool !== 'convert') return;`),切 Tab 的 150ms 延迟用户感知不到。

### 5.4 数据流

```
[上传文件 / 粘贴文本] (任意工具的左栏)
        │
        ▼
   App.setState({ raw })   ← 全局更新
        │
        ▼ (4 个 hook 各自 useEffect 触发,被 activeTool 守卫)
        │
   ┌────┴────┬─────────┬──────────────┬─────────┐
   ▼         ▼         ▼              ▼
 useConvert  useValidate  useNormalize  useInfo
 (仅当前 Tab 激活时跑 debounce convert/validate/normalize/get_info)
   │         │            │              │
   ▼         ▼            ▼              ▼
 [各自结果 state,只在对应 Tab 激活时渲染]
```

debounce 保留 150ms,每个 hook 内部各自维护 timer,互不干扰。

### 5.5 共享输入组件

`InputPanel` 提升到 App 层(在 ToolTabs 下方,所有工具共用同一个左栏)。props 改为接收 `raw` + `onChange`(从 App 传入)。

## 6. 四个工具的 UI 与逻辑

共享布局:所有工具都是「左输入(共享)+ 右输出(各自)」。差异全在右栏。

### 6.1 工具 1:格式转换(复用现有)

```
[共享 InputPanel]  |  [FormatPicker + OutputPanel]
                   |  源格式(检测)→ 目标格式
                   |  转换结果预览 + 复制 + 下载
```

把现有 `FormatPicker` + `OutputPanel` 包进 `ConvertTool` 组件。逻辑零改动,只是搬位置。`useSubtitleConvert` 改签名为 `useConvert(raw)`。

### 6.2 工具 2:质量校验

```
[共享 InputPanel]  |  [ValidatePanel]
                   |  ✅ 检测到 SRT · 10 条字幕
                   |  ⚠️ 发现 2 个问题:
                   |     • subtitle 0 (ends at 1500ms) overlaps...
                   |     • subtitle 3: 负时长
                   |  [问题列表,每条一行,等宽字体,可滚动]
```

- `useValidate(raw)` → `{ok, count, issue_count, issues[]}`
- 顶部摘要:格式 + 条数 + 问题数(绿/黄/红徽章)
- 问题列表:每条 issue 一个 `•` + 等宽字体(ScrollArea 可滚动)
- **无问题**时显示绿色「✓ 未发现问题」

### 6.3 工具 3:文本规范化

```
[共享 InputPanel]  |  [NormalizePanel]
                   |  规范化选项:
                   |  ☑ 剥离 HTML/ASS 标签
                   |  [规范化] 按钮
                   |  ─────────────────
                   |  结果预览 + [复制] [下载]
```

- `useNormalize(raw)` → `{ok, output}`
- **关键决策:规范化用按钮触发,不自动 debounce。** 理由:规范化是破坏性操作(改内容),不该在用户每次敲字时自动覆盖;用户可能只想看原始输入。点按钮 → 调 `normalize_subtitle` → 下方展示结果 + 复制/下载。

### 6.4 工具 4:字幕信息

```
[共享 InputPanel]  |  [InfoPanel]
                   |  ┌─────────────────────────┐
                   |  │ 格式        SubRip (SRT) │
                   |  │ 字幕条数    10           │
                   |  │ 总时长      00:00:29.500 │
                   |  │ 首时间戳    00:00:01.000 │
                   |  │ 末时间戳    00:00:30.500 │
                   |  └─────────────────────────┘
```

- `useInfo(raw)` → `{ok, format, count, total_duration_ms, first/last_timestamp}`
- key-value 表格(`<dl>` 语义)
- 时间戳格式化为 `HH:MM:SS.mmm`
- 最轻量:纯只读展示,无交互

### 6.5 ToolTabs 组件

```typescript
const TOOLS = [
  { id: 'convert',   label: '格式转换',   icon: Repeat },
  { id: 'validate',  label: '质量校验',   icon: ShieldCheck },
  { id: 'normalize', label: '文本规范化', icon: Wand2 },
  { id: 'info',      label: '字幕信息',   icon: Info },
] as const;
```

用 shadcn `Tabs`(已在 ui/)。切换时 `setActiveTool(id)` → App 渲染对应 `*Tool`。

### 6.6 移动端

保持现有响应式:左输入在上、右输出在下,单栏堆叠。Tab 在顶部,窄屏横向滚动。

## 7. 文件结构

```
src/
├── App.tsx                    # 改:加 activeTool state + ToolTabs + 共享 raw
├── types.ts                   # 新:ToolId 等共享类型
├── hooks/
│   ├── useSubtitleConvert.ts  # 改:接收 raw 参数(改名 useConvert 语义更清,但保持文件名不动)
│   ├── useValidate.ts         # 新
│   ├── useNormalize.ts        # 新
│   └── useInfo.ts             # 新
├── components/
│   ├── Header.tsx             # 不变
│   ├── Footer.tsx             # 不变
│   ├── InputPanel.tsx         # 改:props 接收 raw + onChange(提升到 App)
│   ├── ToolTabs.tsx           # 新:顶部 4 Tab
│   ├── tools/                 # 新目录:每个工具一个组件
│   │   ├── ConvertTool.tsx    # 包装 FormatPicker + OutputPanel
│   │   ├── ValidateTool.tsx   # 新
│   │   ├── NormalizeTool.tsx  # 新
│   │   └── InfoTool.tsx       # 新
│   ├── FormatPicker.tsx       # 不变(被 ConvertTool 用)
│   ├── OutputPanel.tsx        # 不变(被 ConvertTool 用)
│   ├── ValidatePanel.tsx      # 新
│   ├── NormalizePanel.tsx     # 新
│   ├── InfoPanel.tsx          # 新
│   └── ui/                    # 不变(shadcn)
└── lib/
    ├── subtitler.ts           # 改:加 getInfo/validate/normalize 封装
    └── formats.ts             # 不变
```

## 8. 迁移策略

**渐进式重构,不一次性推倒重来。** 每步都能编译、能跑、能验证。

```
1. wasm 层:加 3 个函数 + 测试(独立,不影响前端)
2. 前端 lib/subtitler.ts:加 3 个类型化封装
3. state 提升:把 raw 从 useSubtitleConvert 提到 App
   → 此刻现有转换功能仍正常工作(验证点)
4. 加 ToolTabs + ConvertTool(包装现有组件)
   → UI 多了 Tab,但只有「转换」能用(验证点)
5. 逐个加新工具:Validate → Info → Normalize
   → 每加一个都能独立验证
```

### 复用 vs 新建

| 现有组件 | 命运 |
|---------|------|
| `InputPanel` | 复用,props 改为接收 `raw` + `onChange`(从 App 传入) |
| `FormatPicker` | 复用,被 `ConvertTool` 直接渲染 |
| `OutputPanel` | 复用,被 `ConvertTool` 直接渲染 |
| `useSubtitleConvert` | 改签名,接收 `raw` 参数 |
| `Header` / `Footer` | 不变 |
| shadcn `ui/*` | 不变(Tabs 已在) |

新建 7 个文件:`ToolTabs`、4 个 `*Tool`、3 个 `*Panel`。新逻辑集中在 4 个 hook + 3 个 Panel + wasm 3 函数。

## 9. 测试策略

- **wasm 层**:TDD,每个新函数 ≥2 测试(成功 + 错误),共 ~6-8 个新测试,跑 `wasm-pack test --node --lib`
- **前端**:无 JS 测试框架(项目现状),靠 typecheck + 手动验证每个 Tab
- **CI**:现有 workflow 自动覆盖(wasm 测试 + typecheck + build)

## 10. 范围之外(明确不做)

- 时间轴可视化编辑器(重型,独立项目)
- 批量文件处理
- CPS / 字符数等扩展校验参数(subtitler 的 `validate` 当前只返回重叠/负时长等基础问题,不含 CPS)
- 规范化的 OCR 修复 / 引号标准化(subtitler 的 `normalize_text` 当前只做 strip_tags)
- 视频预览、字幕翻译、任何后端服务

## 11. 验收标准

- [ ] 顶部 4 个 Tab 可切换,每个激活时左输入共享同一份 `raw`
- [ ] 切 Tab 后 ~150ms 内显示该工具的结果(懒计算生效)
- [ ] 格式转换:行为与扩展前完全一致(回归不破坏)
- [ ] 质量校验:正确显示格式/条数/问题列表;无问题时显示绿色通过态
- [ ] 文本规范化:按钮触发(不自动),剥离标签后结果可预览/复制/下载
- [ ] 字幕信息:正确显示 5 项元数据,时间戳格式化为 HH:MM:SS.mmm
- [ ] 主题切换、响应式、错误兜底保持工作
- [ ] wasm 新增 ~6-8 个测试全过,CI 全绿
- [ ] 生产构建成功,wasm 体积无显著膨胀(仍 < 600KB gz)
