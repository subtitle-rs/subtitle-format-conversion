# [分享创造] 做了个字幕工具台,纯客户端,17 种格式互转,文件不上传

**地址**:<https://subtitle-rs.github.io/subtitle-format-conversion/>
**源码**:<https://github.com/subtitle-rs/subtitle-format-conversion>

## 是什么

一个纯网页字幕工具,打开即用,无需注册。5 个功能:

- **格式转换**:17 种格式互转(SRT / VTT / ASS / SSA / MicroDVD / Spruce / SubViewer / TTML / DFXP / ITT / Whisper / SBV / LRC / SAMI / MPL2 / SCC / EBU STL)
- **质量校验**:基础检查(重叠/负时长/倒序)+ 广播级规则集(Netflix / BBC / TED / ARD / Channel 4,查行长/行数/时长/间隔/阅读速度)
- **文本规范化**:剥离 HTML/ASS 标签,保留纯文本
- **修复**:保证最小间隔 / 合并重复文本 / Roll-up 修复 / EDL 镜头切换规则(Netflix 出海)
- **字幕信息**:格式 / 条数 / 总时长 / 时间戳

## 两个卖点

**1. 文件不上传。** 所有处理在浏览器里通过 WebAssembly 完成,字幕内容不离开你的设备。这也是为什么它能一直免费——根本没后端。

**2. 复用了成熟的 Rust 库。** 底层是 [subtitler](https://crates.io/crates/subtitler)(Rust 实现的字幕处理库,17 种格式,几百个测试),编译成 WASM。所以这个网页的 Rust 代码只有 ~300 行(薄包装层),却支持 17 种格式和广播级校验——因为解析逻辑都来自已有库。

## 技术栈

- Rust + wasm-pack(包装 subtitler 库)
- React 19 + TypeScript + Vite 8
- Tailwind v4 + shadcn/ui
- GitHub Actions + Pages

## 一些工程决策(完整版写在了掘金,这里只列要点)

- **薄包装 crate**:subtitler 原生 wasm 绑定返回 `Map`(serde_wasm_bindgen),前端处理麻烦。我在自己项目里加了一层包装,调库 API 后序列化成 JSON 字符串返回,契约统一为 `{ ok, ... } | { ok: false, error }`,wasm 函数永不 panic。
- **懒计算**:4 个工具的 hook 都监听输入,但只有当前激活 Tab 的会跑(用 `active` 参数守卫)。大字幕不会 4 倍计算。
- **tag 触发部署**:main push 只跑测试,打 tag 才部署。wasm pkg 只构建一次,通过 artifact 在 CI jobs 间传递。

## 体积

gzip 后 wasm 622KB(17 格式含 SCC/EBU STL 这种二进制广播格式)、JS 132KB、CSS 8KB。

## 寻求反馈

- UI / 交互上有什么改进建议?
- 还想加什么工具?(目前排除在外的是:编辑器、批量处理、视频预览——太重了)
- 如果有 Rust + WASM 的同行,想聊聊这种「成熟库 + WASM」的玩法

底层 subtitler 库也是同组织开源的,欢迎 star:<https://github.com/subtitle-rs/subtitler>
