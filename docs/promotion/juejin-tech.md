# 用 Rust + WebAssembly 写了个字幕工具,文件全程不离开浏览器

> 本文从架构到实现,拆解一个纯客户端字幕工具台是怎么做出来的。
>
> 🌐 在线体验:<https://subtitle-rs.github.io/subtitle-format-conversion/>
> 📦 开源:<https://github.com/subtitle-rs/subtitle-format-conversion>

## 一、先说结论

我做了一个字幕工具台,支持 13 种主流字幕格式的互转、质量校验、文本规范化、元信息查看。整个应用**没有后端**,字幕文件全程在浏览器里通过 WebAssembly 处理——**不上传、不落地、零运维、免费托管**。

技术栈:

- **核心引擎**:[subtitler](https://crates.io/crates/subtitler) 2.6.1(Rust 字幕处理库,支持 15 种格式)
- **前端**:React 19 + TypeScript 7 + Vite 8
- **UI**:Tailwind v4 + shadcn/ui(new-york)
- **部署**:GitHub Pages,通过 Actions 自动部署

听起来很常规?但里面有几个值得聊的工程决策。

## 二、为什么是 Rust + WASM,而不是纯 JS?

字幕处理听起来简单,实际是个坑非常多的领域:

1. **格式碎片化严重**:SRT / VTT / ASS / SSA / MicroDVD / SubViewer / TTML / SBV / LRC / SAMI / MPL2 / SCC / EBU STL……每种格式的时间戳语法、结构、样式表达都不一样。EBU STL 甚至是个二进制格式。
2. **细节多**:时间戳解析要处理逗号/点分隔符、帧率换算、Cue 间隔、嵌套样式标签、编码检测(UTF-8/GBK/Shift-JIS)……
3. **已有 Rust 实现成熟**:[subtitler](https://crates.io/crates/subtitler) 已经把这些全做完了,216 个测试用例,生产级。

**选 Rust + WASM 的本质是「复用」**:把一个已经成熟的 Rust 库搬到浏览器,而不是用 JS 重写一遍解析逻辑。复制的代码不到 100 行(见下文),却换来了 15 种格式的完整支持。

## 三、整体架构:三层结构

```
┌─────────────────────────────────────────────────────┐
│  浏览器 (single-page app)                            │
│                                                      │
│  React + TS UI ──import──▶ subtitler_wasm.js        │
│  (Vite 构建)                 (wasm-pack 产物)        │
│       │                          │                   │
│       │ File / paste             ▼                   │
│       │                   subtitler.rs (本地 WASM)   │
│       │                   detect / convert /         │
│       │                   validate / normalize       │
│       ▼                          │                   │
│  Blob 下载 / 复制到剪贴板 ◀──────┘                   │
└─────────────────────────────────────────────────────┘
        │
        └─ 静态部署 (GitHub Pages)
```

三层职责清晰:

| 层 | 职责 | 代码量 |
|----|------|--------|
| Rust 包装 crate `wasm/` | 调 subtitler 库,返回 JSON 字符串 | ~150 行 |
| TS 封装 `lib/subtitler.ts` | 类型化包装 wasm 函数 | ~80 行 |
| React 组件 | UI、状态管理、debounce | ~1000 行 |

### 为什么要「薄包装 crate」,而不是直接编译 subtitler?

subtitler 本身已经支持 wasm 编译,它自带了 `src/wasm.rs` 暴露了 `parse_subtitles` / `convert_format` / `validate_subtitles` 等函数。我为什么不在前端直接用这些?

**因为它的返回类型是 `serde_wasm_bindgen` 的 JsValue,在浏览器里退化成 `Map`,不是普通对象/JSON。** 前端拿一个 `Map` 处理,既不能直接解构,也不能 `JSON.parse`,契约也不清晰。

所以我在自己项目内放了一个**薄包装 crate** `wasm/`,它做的事只有一件:**调 subtitler 的库 API,把结果序列化成 JSON 字符串返回**。例如:

```rust
#[wasm_bindgen]
pub fn convert_subtitle(content: &str, target: &str) -> String {
    use subtitler::model::SubtitleFormat as _;

    let target_fmt = match format_from_name(target) {
        Some(f) => f,
        None => return serde_json::json!({
            "ok": false,
            "error": format!("Unsupported target format: {}", target)
        }).to_string(),
    };

    let file = match subtitler::parse_bytes(content.as_bytes()) {
        Ok(f) => f,
        Err(e) => return serde_json::json!({
            "ok": false, "error": e.to_string()
        }).to_string(),
    };

    serde_json::json!({
        "ok": true,
        "format": format_to_name(target_fmt),
        "count": file.subtitles().len() as u32,
        "output": file.to_string_with_format(&target_fmt)
    }).to_string()
}
```

**所有函数的返回契约统一**:`{ ok: true, ...data } | { ok: false, error: string }`,前端 `JSON.parse` 后用 TypeScript discriminated union 类型化:

```typescript
export type ConvertResponse =
  | { ok: true; format: SubtitleFormat; count: number; output: string }
  | { ok: false; error: string };
```

**铁律:wasm-bindgen 函数永不 panic。** 任何错误都走 `Result` 分支返回结构化 JSON,而不是触发 Rust panic(panic 在 wasm 里会变成难处理的 JS 异常)。靠全 `match` 而非 `unwrap()` 保证。

## 四、关键工程决策:四个工具共享一份输入

工具台有 4 个 Tab:格式转换、质量校验、文本规范化、字幕信息。每个工具都吃同一份字幕输入。

这里有个数据流的关键设计:**`raw` 提升到 App 层,四个工具的 hook 共享**。

```
[上传文件 / 粘贴文本] (任意工具的左栏)
        │
        ▼
   App.setState({ raw })   ← 全局更新
        │
        ▼ (4 个 hook 各自 useEffect 触发)
        │
   ┌────┴────┬─────────┬──────────────┬─────────┐
   ▼         ▼         ▼              ▼
 useConvert  useValidate  useNormalize  useInfo
```

### 懒计算:只跑当前 Tab

四个 hook 都监听 `raw`,但用户一次只看一个 Tab。要不要四个都跑?

不要。**懒计算**——每个 hook 接收一个 `active: boolean` 参数,非当前 Tab 时直接 `return`:

```typescript
useEffect(() => {
  if (timer.current) clearTimeout(timer.current);
  if (!active) return;  // 懒计算守卫
  if (!raw.trim()) { ... return; }
  timer.current = setTimeout(() => { ... }, 150);
}, [raw, active]);
```

字幕可能几 MB,4 个工具同时跑会卡。懒计算省 3/4 的计算,切 Tab 后的 150ms debounce 延迟用户感知不到。

### 规范化特殊:按钮触发,不自动

其他三个工具都是输入变化即自动 debounce 跑。但**规范化用按钮触发**:

```typescript
export function useNormalize(raw: string) {
  const [state, setState] = useState<NormalizeState>({ status: "idle" });
  const run = useCallback(() => {
    if (!raw.trim()) { setState({ status: "idle" }); return; }
    const resp = normalize(raw);
    setState(resp.ok ? { status: "ok", output: resp.output }
                       : { status: "error", message: resp.error });
  }, [raw]);
  return { state, run };
}
```

理由:规范化是**破坏性操作**(改了字幕内容),不该在用户每次敲字时自动覆盖。用户可能只想看原始输入,不一定要规范化。点按钮才处理,结果展示在下方。

## 五、wasm 体积优化

subtitler 默认开了 15 种格式 + http + io,但 WASM 下 http/io 不可用。我在包装 crate 的 `Cargo.toml` 里按需裁剪:

```toml
[dependencies]
subtitler = { version = "2.6.1", default-features = false, features = [
  "srt", "vtt", "ass", "ssa", "microdvd", "subviewer",
  "ttml", "sbv", "lrc", "sami", "mpl2", "scc", "ebu_stl", "wasm"
] }
# 排除 dfxp(基本没人用)、whisper(JSON 非字幕)、http、io(wasm 不可用)
```

加上 release profile 的 `opt-level="z"` + `lto=true` + `codegen-units=1` + `strip=true`:

```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

**最终产物体积:**

| 资源 | 原始 | gzip |
|------|------|------|
| wasm | 1.4 MB | **584 KB** |
| JS | 386 KB | **119 KB** |
| CSS | 43 KB | **7.9 KB** |

584KB gzipped 不算小,但这是 13 种格式(含 SCC/EBU STL 这种广播级二进制格式)的完整引擎。如果是纯 SRT/VTT,能压到 250KB 以下。

## 六、CI / CD:tag 触发部署

部署用 GitHub Actions,4 个 job:

```
push / PR → 跑测试
打 tag (v*) → 跑测试 + 部署到 Pages

build-wasm (构建 pkg,upload-artifact)
   ├── test-wasm (9 个测试,并行)
   ├── typecheck (download pkg → tsc)
   └── deploy (仅 tag:download pkg → build → Pages)
```

**关键设计:wasm 只构建一次**,通过 artifact 在 job 间传递,避免重复编译。

踩过的坑(顺便分享一下):

1. **`pnpm/action-setup@v4` 不能传 `version`**——它会和 `package.json` 的 `packageManager` 冲突。正确做法是不传,让它自动读 packageManager。
2. **`jetli/wasm-pack-action` 已停更**(2022 年起没更新),触发 Node 20 deprecation。改用 `cargo install wasm-pack --locked`,被 rust-cache 缓存后也不慢。
3. **GitHub Pages environment 默认拒绝 tag 部署**——UI 里只能选 branch。解决:workflow 里去掉 `environment: github-pages` 声明,`deploy-pages@v4` 不强制要求它。

## 七、踩过的 Rust 坑

1. **feature 门控的枚举 variant 不存在**:`Format::Dfxp` / `Format::Whisper` 在没启用对应 feature 时根本不存在,match 分支要删掉(不是 `#[cfg]` 门控分支,是整个 variant 不存在)。
2. **trait 方法需要 use**:`SubtitleFile::format()` 和 `to_string()` 是 trait `SubtitleFormat` 的方法,必须 `use subtitler::model::SubtitleFormat as _;` 才能调用。报错信息会提示,但容易忽略。
3. **`wasm-opt` 在某些 toolchain 组合下校验失败**——禁用即可(`wasm-opt = false`),release profile 已经做了优化。

## 八、总结

这个项目的核心思路其实很简单:**「成熟的 Rust 库 + WASM + React」是个被低估的组合**。

适合的场景:

- 你已经有一个成熟的 Rust 库,想做网页版
- 处理逻辑重、JS 重写成本高(解析、压缩、加密、图像处理……)
- 数据敏感,不能上传服务器(字幕、文档、个人文件)
- 想零运维、免费托管

完整源码已开源:<https://github.com/subtitle-rs/subtitle-format-conversion>

如果你也有类似的 Rust 库想做网页版,欢迎参考。也欢迎给 [subtitler](https://crates.io/crates/subtitler) 点 star,这才是这个工具能存在的基础。

---

**相关链接:**

- 🌐 在线试用:<https://subtitle-rs.github.io/subtitle-format-conversion/>
- 📦 项目源码:<https://github.com/subtitle-rs/subtitle-format-conversion>
- 🦀 subtitler 库:<https://crates.io/crates/subtitler>
