# subtitler 2.8.0 跟进扩展 — 设计方案

> 跟进 subtitler 2.7.0 / 2.8.0 的功能迭代,丰富字幕工具台:升级库 + 4 种新格式、广播级校验预设、修复工具 Tab、EDL 镜头切换。
>
> 创建时间:2026-10-02
> 基础:当前 main(字幕工具台 v0.2.0 已上线)

## 1. 背景:subtitler 2.6.1 → 2.8.0 的增量

| 版本 | 关键新增 |
|------|---------|
| 2.7.0 | 广播级校验预设(guidelines 模块:Netflix/BBC/TED/ARD-ORF-SRF-ZDF/Channel 4);4 种新校验项(时长过短/过长、间隔过短、行数超限);3 个修复操作(enforce_min_gap、remove_repeating_lines、merge_identical) |
| 2.7.1 | 依赖安全更新(不影响库 API) |
| 2.8.0 | 镜头切换规则(shotlist 模块:解析 CMX3600 EDL,字幕自动避开切镜点);新格式 Spruce、ITT;ASS/TTML 格式保真改进 |

本次扩展暴露这些能力,范围(用户已确认):**升级 + 新格式(必选)、广播级校验预设、修复工具 Tab、EDL 镜头切换** 全做。

## 2. 升级与新格式

### 2.1 依赖升级

```toml
# wasm/Cargo.toml
[dependencies]
subtitler = { version = "2.8.0", default-features = false, features = [
  "srt", "vtt", "ass", "ssa", "microdvd", "spruce", "subviewer",
  "ttml", "dfxp", "itt", "whisper", "sbv", "lrc", "sami",
  "mpl2", "scc", "ebu_stl", "wasm"
] }
```

**格式从 13 → 17(全量)。** 之前排除 DFXP/Whisper 的理由(「没人用」)不再成立:

- **DFXP / ITT** 是 Netflix / iTunes 交付格式,与本次的 Netflix 预设受众完全重合
- **Whisper**(AI 转写 JSON 输出)配合修复 Tab 的 roll-up 修复是真实工作流(AI 转写常产生连续重复行)
- Spruce 是专业字幕设备格式,低成本启用

### 2.2 formats.ts 扩展

```typescript
spruce: "spruce",   // Spruce STL 文本格式
itt: "itt",         // iTunes Timed Text
dfxp: "dfxp",       // Distribution Format Exchange Profile
whisper: "json",    // OpenAI Whisper JSON(注意扩展名是 .json)
```

对应 `FORMAT_LABELS`:

```typescript
spruce: "Spruce STL",
itt: "iTunes TT (ITT)",
dfxp: "DFXP",
whisper: "Whisper JSON",
```

下拉列表跟随 `ALL_FORMATS`,UI 零改动。

### 2.3 格式保真改进

ASS 字体/位置解析、TTML layout 输出、XML 实体修复等随升级自动生效。**风险点**:2.8.0 的 `ass::to_string` 有 breaking change(加参数);若 `to_string_with_format` 内部已适配则无影响——升级后跑全量 wasm 测试即知,失败则就地修包装层。

### 2.4 决策:convert 签名不变

`convert_subtitle` **不**加 guideline 参数。转换和校验解耦:格式转换的目标是格式正确,不该因内容不合规(如行太长)拒绝输出。规范问题由校验 Tab 报告,用户自行决定是否修复。

## 3. 广播级校验预设(升级校验 Tab)

### 3.1 UI

```
[共享 InputPanel]  |  [ValidatePanel]
                   |  规则集: [基础 ▾]
                   |     基础
                   |     Netflix 出海规范
                   |     BBC
                   |     TED
                   |     ARD/ORF/SRF/ZDF
                   |     Channel 4
                   |  ─────────────────
                   |  (现有:格式/条数徽章 + 问题列表)
```

- `ValidatePanel` 头部加 `Select` 下拉,默认「基础」
- 切预设 = 更新 state → 重新 debounce 校验(复用懒计算模式)

### 3.2 wasm 契约

```rust
/// guideline: "basic" | "netflix" | "bbc" | "ted" | "ard" | "channel4"
#[wasm_bindgen]
pub fn validate_subtitle(content: &str, guideline: &str) -> String;
// "basic" → file.validate()(现有行为)
// 其余   → file.validate_guideline(&preset_to_guideline(g)?)
//          (组合基础校验 + 预设规则;非法值 → {ok:false, error})
// 返回:{ok, format, count, issue_count, issues[]} | {ok:false, error}
```

`validate_guideline` 是 trait 方法(`use SubtitleFormat as _`),自动包含基础校验 + 预设规则(per-line 长度、行数、时长上下限、最小间隔、阅读速度)。预设字符串 ↔ `GuidelinePreset` 枚举的映射在包装层写死(5 项)。

### 3.3 前端

`useValidate(raw, active, preset)` 加第三参;`preset` 变化触发同一 debounce effect。`ValidateResponse` 类型不变(issues 数组自然包含新的 4 种校验项文案)。

## 4. 修复工具(新增第 5 个 Tab)

### 4.1 UI

```
[共享 InputPanel]  |  [RepairPanel]
                   |  修复操作(可叠加):
                   |  ☑ 保证最小间隔   [500] ms
                   |  ☑ 合并重复文本   gap ≤ [2000] ms
                   |  ☐ Roll-up 修复(合并相邻相同文本)
                   |  ── 镜头切换规则(Netflix 出海)──
                   |  [选择 EDL 文件] cuts.edl · 12 个切镜点 ✓
                   |  帧率 [25 ▾]   切前留 [2] 帧   切后留 [12] 帧
                   |  [执行修复] 按钮
                   |  ─────────────────
                   |  修复结果预览 + [复制] [下载]
                   |  副作用提示:字幕 10 条 → 7 条
```

- **按钮触发**(破坏性操作,与规范化同模式);修复结果**不回写输入栏**(输入不可变原则,可反复调参重试)
- EDL 上传走 FileReader 读文本(同 InputPanel 模式);解析成功显示切镜点数量
- 帧率选项:23.976 / 24 / 25 / 29.97 / 30,默认 25
- 下载文件名:`{原名}.repaired.{ext}`

### 4.2 wasm 契约

```rust
/// min_gap_ms / merge_gap_ms 用 i64,-1 = 不启用
/// cuts_ms: 镜头切换点(毫秒)数组,空 = 不应用
#[wasm_bindgen]
pub fn repair_subtitle(
    content: &str,
    min_gap_ms: i64,
    merge_gap_ms: i64,
    rollup: bool,
    cuts_ms: &[u64],
) -> String;

#[wasm_bindgen]
pub fn parse_edl_cuts(edl: &str, fps: f64) -> String;
// parse_edl_cuts 返回 {ok, cuts: number[]} | {ok:false, error}
```

`repair_subtitle` 内部按序应用:`enforce_min_gap` → `merge_identical` → `remove_repeating_lines` → `apply_shot_changes`(cuts 非空时)。全 trait 方法(`use SubtitleFormat as _`)。返回:

```json
{ "ok": true, "output": "...", "before": 10, "after": 7 }
```

### 4.3 前端

- `src/hooks/useRepair.ts`:按钮触发(同 `useNormalize` 模式,useCallback 无 debounce),state 记录 `{status, output?, before?, after?, message?}`
- `src/types.ts`:`ToolId` 加 `"repair"`
- `ToolTabs`:插入「修复」Tab(图标 `Wrench`),位置在「文本规范化」之后、「字幕信息」之前(操作类工具聚在一起)
- `RepairTool` + `RepairPanel`:选项区(checkbox + 数字输入 + Select)+ EDL 区块 + 结果区(复用 ScrollArea + 复制/下载)

## 5. 文件结构

```
wasm/Cargo.toml                  # 改:2.8.0 + spruce/dfxp/itt/whisper feature
wasm/src/lib.rs                  # 改:validate_subtitle 加参数;
                                 #     +repair_subtitle +parse_edl_cuts
src/lib/formats.ts               # 改:+4 格式(扩展名/标签)
src/lib/subtitler.ts             # 改:validate 加 guideline;+repair/+parseEdlCuts
src/types.ts                     # 改:ToolId 加 "repair"
src/hooks/useValidate.ts         # 改:加 preset 参数
src/hooks/useRepair.ts           # 新
src/components/ToolTabs.tsx      # 改:+修复 Tab
src/components/ValidatePanel.tsx # 改:规则集下拉
src/components/tools/RepairTool.tsx # 新
src/components/RepairPanel.tsx   # 新
```

## 6. 迁移顺序(每步可验证)

```
1. 升级 subtitler 2.8.0 + 启用 4 新 feature → wasm-pack test 全量(发现 breaking 就地修)
2. formats.ts +4 格式 + pkg 重建 → 浏览器确认下拉 17 项
3. wasm: validate_subtitle 加 guideline 参数 + TDD(≥3 测试:basic/netflix/非法值)
4. ValidatePanel 规则集下拉 + useValidate 传参
5. wasm: parse_edl_cuts + repair_subtitle + TDD(≥4 测试)
6. useRepair + RepairPanel + RepairTool + ToolTabs 接入
7. e2e + 生产构建 + 发版(v0.3.0)
```

## 7. 测试策略

- wasm TDD:guideline 校验 ≥3 个、EDL 解析 ≥2 个、修复 ≥3 个(单操作 + 叠加 + 空操作),新增 ~8-10 个测试
- 前端:typecheck + 手动验证(预设切换、修复执行、EDL 上传)
- CI:现有 workflow 自动覆盖

## 8. 范围之外

- 校验/修复结果回写输入栏(输入不可变)
- 视频预览、字幕编辑器(重型独立项目)
- EDL 可视化时间轴
- 自定义校验规则(只做 5 个内置预设 + 基础)

## 9. 验收标准

- [ ] subtitler 升级到 2.8.0,全部 wasm 测试通过
- [ ] 格式下拉 17 项,可转 Spruce/ITT/DFXP/Whisper(whisper 下载扩展名 .json)
- [ ] 校验 Tab 可切 6 种规则集;Netflix 预设能报出行长/阅读速度等问题
- [ ] 修复 Tab 可叠加 4 种操作,按钮触发,显示前后条数变化,结果可复制/下载
- [ ] EDL 上传解析显示切镜点数;帧率可选;修复结果避开切镜点
- [ ] 懒计算、主题、响应式、错误兜底全部保持
- [ ] 新增 wasm 测试全过(总数 ~24-26),CI 全绿
