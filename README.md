# 字幕格式转换 · Subtitle Converter

纯客户端的字幕格式转换网页。基于 [subtitler](https://crates.io/crates/subtitler) Rust 库编译为 WebAssembly,100% 在浏览器内运行 —— 文件不离开设备,无后端、无上传。

支持 13 种字幕格式互转:SRT · VTT · ASS · SSA · MicroDVD · SubViewer · TTML · SBV · LRC · SAMI · MPL2 · SCC · EBU STL。

## 功能

- 拖拽 / 粘贴上传字幕文件
- 自动检测源格式
- 选择目标格式,实时预览转换结果(debounce)
- 复制到剪贴板 / 下载转换后的文件
- 亮色 / 暗色 / 跟随系统 三态主题
- 移动端响应式

## 技术栈

- **WASM 引擎**:`subtitler 2.6.1`,经 `wasm/` 薄包装 crate 编译
- **前端**:React 19 + TypeScript + Vite 8
- **UI**:Tailwind v4 + shadcn/ui(new-york)
- **包管理**:pnpm

## 本地开发

前置:Node ≥ 20、pnpm ≥ 11、Rust stable + `wasm32-unknown-unknown` target、`wasm-pack`。

```bash
# 安装 wasm target 和 wasm-pack(一次性)
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

WASM 单元测试(9 个):

```bash
cd wasm && wasm-pack test --node --lib
```

## 部署(GitHub Pages)

部署由 **tag 触发**,不是每次 main push:

- **main push / PR**:只跑 CI 测试(build-wasm + test-wasm + typecheck),不部署
- **打 tag**(如 `v0.1.0`):跑测试 + 部署到 GitHub Pages

打 tag 部署的流程:

1. 构建 wasm pkg(缓存 Rust 编译产物)
2. 跑 wasm 单元测试
3. typecheck + 生产构建
4. 部署到 GitHub Pages

部署 URL:`https://subtitle-rs.github.io/subtitle-format-conversion/`

### 发版步骤

```bash
# 1. 确保 main 上的代码已通过 CI
git checkout main && git pull

# 2. 打 tag(语义化版本)
git tag v0.1.0
git push origin v0.1.0

# 3. 到 Actions tab 观察 deploy job,完成后访问部署 URL
```

### 首次配置(只需一次)

仓库 **Settings → Pages → Build and deployment → Source** 选择 **"GitHub Actions"**(不是 "Deploy from a branch")。

配置完成后,打 tag 即自动部署。PR 和 main push 只触发测试。

### `base` 路径说明

因为 Pages 部署在 `/subtitle-format-conversion/` 子路径下,Vite 的 `base` 需要匹配。本仓库用环境变量 `BASE_PATH` 控制:

- 本地 `pnpm dev` / `pnpm build`:`base = "/"`(默认)
- CI 部署:注入 `BASE_PATH=/subtitle-format-conversion/`

如需改部署路径(如自定义域名或仓库名变更),同步修改:
- `.github/workflows/ci.yml` 的 `env.BASE_PATH`
- 仓库 Settings → Pages 配置

## 目录结构

```
├── wasm/              # WASM 薄包装 crate(subtitler path 依赖)
├── src/
│   ├── lib/           # WASM 封装 + 格式元数据
│   ├── hooks/         # useSubtitleConvert(debounce 状态机)
│   └── components/    # 业务组件 + shadcn ui/
├── pkg/               # wasm-pack 产物(gitignored)
└── .github/workflows/ci.yml
```

## License

Apache-2.0(跟随 subtitler)
