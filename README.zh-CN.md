# 字幕工具台 · Subtitle Workbench

[English](./README.md) | **简体中文**

> 🌐 **[在线使用 →](https://subtitle-rs.github.io/subtitle-format-conversion/)**

纯客户端的字幕工具台。基于 [subtitler](https://crates.io/crates/subtitler) Rust 库编译为 WebAssembly,100% 在浏览器内运行 —— 文件不离开设备,无后端、无上传。

支持 **17 种字幕格式**:SRT · VTT · ASS · SSA · MicroDVD · Spruce · SubViewer · TTML · DFXP · ITT · Whisper · SBV · LRC · SAMI · MPL2 · SCC · EBU STL

界面支持 **14 种语言**:English · 简体中文 · 繁體中文 · 日本語 · 한국어 · Русский · Français · Deutsch · Español · Português · Italiano · Tiếng Việt · العربية · עברית(含完整 RTL 支持)

## 功能

顶部 5 个 Tab,共享一份输入:

- **格式转换** — 17 种格式互转,自动检测源格式,实时预览(debounce),复制 / 下载
- **质量校验** — 基础检查(重叠/负时长/倒序)+ 广播级规则集(Netflix / BBC / TED / ARD / Channel 4)
- **文本规范化** — 剥离 HTML/ASS 标签(按钮触发,不破坏原文)
- **修复** — 保证最小间隔 / 合并重复文本 / Roll-up 修复 / EDL 镜头切换规则(Netflix 出海)
- **字幕信息** — 格式 / 条数 / 总时长 / 首末时间戳,时间戳格式化为 `HH:MM:SS.mmm`

通用:

- 拖拽 / 粘贴上传,所有工具共享同一份输入(切 Tab 不丢内容)
- 懒计算:只跑当前激活的 Tab,大文件不卡
- 亮色 / 暗色 / 跟随系统 三态主题 · 移动端响应式 · 首次加载后可离线使用

## 技术栈

- **WASM 引擎**:[subtitler 2.10.0](https://crates.io/crates/subtitler),经 `wasm/` 薄包装 crate 编译
- **前端**:React 19 + TypeScript + Vite 8
- **UI**:Tailwind v4 + shadcn/ui(new-york) · **国际化**:react-i18next
- **包管理**:pnpm

## 本地开发

前置:Node ≥ 20、pnpm ≥ 11、Rust stable + `wasm32-unknown-unknown` target、`wasm-pack`。

```bash
# 一次性安装 wasm target 和 wasm-pack
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# 安装依赖
pnpm install

# 首次 / 修改 wasm 后构建 pkg
pnpm build:wasm

# 启动开发服务器
pnpm dev
# → http://localhost:5173

# 验证(typecheck + 生产构建)
pnpm verify
```

WASM 单元测试(24 个):

```bash
cd wasm && wasm-pack test --node --lib
```

## 多语言

UI 文案在 `src/i18n/locales/{code}.json`(一种语言一个文件,key 与 `en.json` 同构);语言注册表是 `src/i18n/languages.ts`。

**新增一种语言(两步):**

1. 创建 `src/i18n/locales/{code}.json` —— 复制 `en.json`,翻译 value(key 保持英文)
2. 在 `src/i18n/languages.ts` 的 `SUPPORTED_LANGUAGES` 加一行 `{ code, nativeName, dir }`

语言下拉自动渲染注册表。从右到左的语言(RTL)设 `dir: "rtl"` 即可 —— `<html dir>`、布局镜像、内容方向全部自动处理。

所有语言文件的 key 集合必须一致,校验脚本见英文版 README 的 Localization 一节。

## 部署(GitHub Pages)

部署由 **tag 触发**,不是每次 main push:

- **main push / PR**:只跑 CI 测试(build-wasm + test-wasm + typecheck),不部署
- **打 tag**(如 `v0.5.0`):跑测试 + 部署到 GitHub Pages

流水线:构建 wasm pkg(带缓存)→ wasm 单元测试 → typecheck + 生产构建 → Pages。

**线上地址**:<https://subtitle-rs.github.io/subtitle-format-conversion/>

### 发版步骤

```bash
git checkout main && git pull
git tag v0.6.0            # 语义化版本
git push origin v0.6.0    # 到 Actions tab 观察 deploy
```

### 首次配置(只需一次)

仓库 **Settings → Pages → Build and deployment → Source** 选择 **"GitHub Actions"**(不是 "Deploy from a branch")。

### `base` 路径说明

Pages 部署在 `/subtitle-format-conversion/` 子路径下,Vite 的 `base` 需要匹配,由环境变量 `BASE_PATH` 控制:

- 本地 `pnpm dev` / `pnpm build`:`base = "/"`(默认)
- CI 部署:注入 `BASE_PATH=/subtitle-format-conversion/`

如需改部署路径(自定义域名或仓库名变更),同步修改 `.github/workflows/ci.yml` 的 `env.BASE_PATH`。

## 目录结构

```
├── wasm/              # WASM 薄包装 crate(包装 subtitler)
├── src/
│   ├── i18n/          # 语言注册表 + 14 个语言文件
│   ├── lib/           # 类型化 WASM 封装 + 格式元数据
│   ├── hooks/         # 各工具 hook(debounce / 懒计算 / 按钮触发)
│   └── components/    # 工具 Tab、面板、shadcn ui/
├── pkg/               # wasm-pack 产物(gitignored)
└── .github/workflows/ci.yml
```

## License

Apache-2.0(跟随 subtitler)
