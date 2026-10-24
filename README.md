<div align=center>
<img src="icon.png" style="width:100px;" width="100"/>
<h2>VoiceManager</h2>
<p>在线扩音器 · 电吉他 / 贝斯监听与效果器 · 通用效果器架</p>
</div>

### 一、产品概述

- 浏览器里的音频工作站：麦克风变扩音器、电吉他 / 贝斯监听与效果器、自由搭建的效果器架。
- 纯前端实现（Vite + TypeScript + Web Audio API + AudioWorklet），无需安装、无需服务端。
- 21 个效果器、28 个预设，配调音器 / 节拍器 / 循环录音站 / 录音机。
- 支持耳机线与 USB 声卡监听，音源可用麦克风、标签页音频或内置测试音源。
- 9 种语言，首次打开按浏览器语言自动选择。

线上地址：<https://voicemanager.mutantcat.org/>

核心价值：

- 打开网页就能用，不装插件、不下载软件，混响等脉冲响应也是程序化实时生成的。
- 用扬声器放音的场景专门做了三层防啸叫 / 防回声，配错会实时标红并给一键修复。
- 效果链可自由编排：任意顺序、任意数量，可以拖到链中间插入。
- 全部参数与预设存在本地，刷新不丢。

### 二、功能说明

#### 四种模式

| 模式 | 代码 | 链路 |
| --- | --- | --- |
| 在线扩音器 | `PA` | 噪声门 → 均衡 → 压缩 → 变声 → 失真 → 录音 |
| 电吉他 | `GTR` | 噪声门 → 自动哇音 → 过载 → 音箱 → 箱体 → 延迟 / 混响 |
| 贝斯 | `BASS` | 压缩 → DI → 法兹 → 箱体 → 均衡 |
| 效果器架 | `FX` | 自由搭建，任意顺序、任意数量 |

扩音器模式附带 9 个变声预设；吉他 7 个、贝斯 7 个、效果器架 5 个，共 28 个。

#### 效果器（21 个）

- 动态：噪声门、压缩、限幅器
- 均衡 / 滤波：五段图示均衡、滤波 / 哇音（含自动哇音）
- 失真 / 音箱：失真 / 过载（5 种曲线）、激励器、音箱模拟（5 型号）、箱体模拟（5 型号 + IR）
- 调制：合唱、移相器、镶边、颤音、环形调制、八度叠加
- 时间 / 空间：延迟（ping-pong 与速度同步）、混响（程序化 IR）
- 音高 / 比特：变调（颗粒移频 worklet）、比特破碎
- 工具：音量

每个效果器都有干湿混合（等功率交叉淡变）与旁通，参数实时热更新。

#### 防啸叫 / 防回声

扬声器放出的声音被麦克风拾回、再放大输出，就会形成越拖越长的回声，最终啸叫。三层防护：

1. **戴耳机**——最彻底，声音根本不回到麦克风。
2. **浏览器回声消除**（默认开）——用扬声器信号做参考，从麦克风输入里减掉它。
3. **反馈抑制**（默认开）——持续监测输入频谱，只对「又窄、又亮、又持续」的单峰动手，在峰值频率凿一道浅凹槽（Q 22、−10 dB，最多 6 槽），频率消失 2.2 秒后自动恢复，不会在音色上留疤痕。

另外噪声门是整条链第一级，阈值需 ≤ −30 dB，否则门关不上、什么都切不断。

「输入与设备」面板顶部有回声防护检查表实时盯着这三层加噪声门，配错就标红、说清原因，多数情况旁边直接给修复按钮。最常见的两种配错：噪声门阈值被拖到 0 dB 以上；混响 / 延迟湿声超过 40%。「自动增益控制」建议保持关闭——它会把安静的反馈残余一起放大，更容易起振。

#### 音源与设备

- 麦克风 / 线路 / USB 声卡：`getUserMedia`，可选输入设备与回声消除 / 降噪 / 自动增益
- 标签页 / 系统音频：`getDisplayMedia` 捕获，可直接把在线乐器当音源
- 内置测试音源：正弦 / 粉噪 / 拨弦 / 扫频 / Am 和弦，无乐器也能验证整条链路
- 输出路由：优先 `AudioContext.setSinkId()`，回退 `MediaStreamAudioDestinationNode` + `<audio>.setSinkId()`

打开网页有时列不出设备，是浏览器在授权前不透露设备名称的隐私设计，点「授权并刷新设备列表」即可。此外 `devicechange` 在 macOS / Chrome 上不可靠，所以还有 2.5 秒定时轮询兜底：插入新设备会自动出现在下拉里，已选中的设备被拔掉会自动回落系统默认并 toast 告知。

#### 管道编排

| 操作 | 桌面端 | 手机 / 平板 |
| --- | --- | --- |
| 加到队尾 | 点仓库里的效果器 | 同左 |
| 插到中间 | 从仓库拖着效果器到链上任意间隙，落点有竖线指示 | 仓库顶部选「插入位置」再点效果器 |
| 换顺序 | 拖着链上的模块互换位置 | 模块上的 ▲ / ▼ 按钮 |
| 旁通 | 点小绿灯 / 右键 / 长按 | 点小绿灯 / 长按 0.5 秒 |

插入位置选择器会实时提示目标；从仓库拖入用自定义 MIME `application/x-voicemanager-fx` 与「链上既有模块」的拖拽区分；插入 / 换序都走同一个状态源，音频图与界面不会不一致。

#### 手机 / 平板

窄屏（≤ 640 px）单独一档，不是把桌面版硬缩：触控目标全部 ≥ 44 px、三个设备下拉排成两列、输入框字号 16 px（避免 iOS 聚焦时放大页面）、链很长时左右滑动、旋钮走指针事件并设 `touch-action: none`、留 `env(safe-area-inset-*)`、`overflow-x: hidden` 兜底。实测 320 至 1920 及横屏 844×390 均无文档级横向溢出。

#### 多语言

9 种语言：简体中文（源语言）、English、日本語、Français、Deutsch、Español、Português (Brasil)、Русский、한국어。切换入口在右栏「输入与设备」面板顶部。

首次打开按浏览器语言自动挑，优先级：`localStorage` 里上次手动选过的 → `navigator.languages` 逐个匹配（精确 → 主语言 → 方言回退）→ 简体中文。首次检测不写入 localStorage，之后改浏览器语言下次打开仍生效。

实现方式是「中文即键」：词典键就是简体中文原文，`t(key)` 查不到就原样返回 key，缺译时优雅退化为中文而不是把键名显示给用户。效果器与预设是模块级常量，定义处包 `t()` 会被冻住，所以在使用点过一层访问器（`fxName` / `fxBlurb` / `presetName` 等，见 `src/i18n/fx.ts`）。翻译数据在 `tools/i18n/.data*.py`，改完跑 `python3 tools/i18n/gen.py` 重新生成 8 个词典。

### 三、快速上手

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建（输出 dist/）
npm run preview    # 预览生产构建
```

打开页面 → 点左上角 **电源** → 允许麦克风权限 → 戴上耳机监听。

> 用扬声器放音时务必戴耳机，或按上面的回声防护检查表把四层配好。

### 四、部署

push 到 `main` 即由 GitHub Actions 构建并发布到 GitHub Pages，自定义域名 `voicemanager.mutantcat.org`。

```bash
npm run build      # 产物在 dist/
git push origin main
```

- `vite.config.ts` 里 `base:'./'` 用相对路径，兼容自定义域名与项目页
- 自定义域名写在 `public/CNAME`，跟随版本控制，不依赖仓库设置
- `public/robots.txt`、`public/sitemap.xml` 由 Vite 原样拷到 `dist/` 根
- AudioWorklet 需 `worker.format:'iife'`（classic script，兼容性最好）
- sitemap 的 `<lastmod>` 由流水线按构建日期自动盖章

### 五、参数建议

噪声门是整条链第一级，用来消除无信号时的底噪、电流声与环境噪声。

| 参数 | 建议值 | 说明 |
| --- | --- | --- |
| 阈值 | 吉他 / 贝斯 −45 dB，人声 −50 dB | 低于这个电平门才会关闭 |
| 开启 | 0.5–3 ms | 信号回来时多快放开，太小会有咔哒声 |
| 保持 | 90–200 ms | 音符之间的正常停顿不会被误切 |
| 关闭 | 120–300 ms | 掉到阈值以下后多久开始衰减 |
| 衰减深度 | −110 dB（静音）…−60 dB（保留呼吸感） | 关门后压到多低 |
| 回差 | 3–5 dB | 防止门在阈值附近反复开合 |

采集处理做成了两档一键预设：「防啸叫优先」（默认，回声消除 + 降噪开、自动增益关）与「音质优先」（全关，戴耳机弹吉他 / 贝斯时用）。上面三个开关仍可单独微调。

### 六、项目结构

```
index.html                  入口 HTML（lang 由 initI18n 同步）
vite.config.ts              base:'./' + worker iife
src/
  main.ts                   主编排：状态 → 引擎 → 视图
  types.ts                  ModeId / FxBlockState / AppState
  state/                    自建 store（深合并 hydrate + localStorage 持久化）
  audio/
    engine.ts               音频引擎（输入三态 / 输出路由 / 电平 / 限幅）
    chain.ts                信号链构建与热更新
    tempo.ts                速度与延迟分度
    test-tone.ts            内置测试音源
    tuner.ts                调音器
    metronome.ts            节拍器
    recorder.ts             录音机 + 循环录音站
    presets.ts              28 个预设
    fx/                     21 个效果器 + 契约层 + 工具
    worklets/               4 个 AudioWorklet（噪声门 / 移调 / 比特 / 包络）
  ui/                       DOM 组件（旋钮 / 推子 / 开关 / 分段 / 面板 / 链条 / 表头）
  i18n/                     多语言：核心 / 访问器 / 静态文案重译 / 8 个词典
  styles/                   设计令牌 + 控件 + 布局
.github/workflows/deploy.yml  push main → GitHub Pages
public/                     robots.txt / sitemap.xml / CNAME / manifest / og-cover.png
tools/i18n/                 翻译数据 + 词典生成脚本
tools/og/                   社交分享图生成脚本
icon.png                    应用图标
LICENSE                     GNU GPL v3.0
```

界面分两栏：左栏「机架」（模式说明 → 电平 / 频谱 → 效果器参数 → 预设 → 效果器仓库），右栏「工具」（调音器 → 节拍器 → 循环录音 → 录音机 → 输入与设备 → 使用说明）。窄屏（≤ 1100 px）自动收成单栏。

### 七、技术要点

- AudioWorklet：Vite `?worker&url` 导入 + `worker.format:'iife'`，`addModule()` 幂等注册，不可用时自动降级为普通节点
- 程序化 IR：RBJ cookbook 双二阶 + mulberry32 确定性 PRNG，无外部音频文件
- 干湿混合：等功率交叉淡变 `cos(x·π/2)` / `sin(x·π/2)`；`wet` 总线只由效果器输出馈入，避免绕过效果器的干信号通路
- 旁通与重建：所有断开都做安全包装，重建链路时 `inNode` / `outNode` 双侧断开，旧链路不会并联残留
- 调音器：归一化自相关 + 抛物线插值，A4 基准 415–466 Hz 可调
- 无障碍：完整 `role="slider"` + `aria-valuenow` / `aria-valuetext`，键盘可操作，尊重 `prefers-reduced-motion`
- 快捷键：`空格` 电源 · `1`–`4` 模式 · `M` 节拍器 · `R` 录音 · `B` 旁通当前模块

浏览器兼容：基础音频链 Chrome / Edge 66+、Firefox 76+、Safari 14.1+；输出设备选择需 Chrome 110+（`setSinkId`），其余保持系统默认输出；标签页音频捕获需 `getDisplayMedia`（Chrome / Edge）。

### 八、SEO

单页应用 + 客户端渲染，核心难点是爬虫拿到的 HTML 里没有正文。分五层处理：

1. **可抓取的兜底正文**——`<body>` 末尾的 `<noscript>` 放了一份语义化内容（`header` / `main` / `section` / `footer`，`h1` + 八个 `h2`），约 1800 字，覆盖模式、效果器、工具、防啸叫、噪声门调法、多语言、快捷键。配 `layout.css` 里的 `noscript` 样式，禁 JS 的访问者看到的也是像样的页面。这份内容不是关键词堆砌，就是「关掉 JS 后这个应用能干什么」。
2. **Meta 与社交卡片**——`description` / `keywords` / `robots` / `canonical` / `license`，Open Graph 20 处（`og:image` 带尺寸与 alt），Twitter `summary_large_image`，PWA manifest。`public/og-cover.png` 由 `tools/og/make_cover.py` 生成，配色取自 `tokens.css`、文案取自页面 `<title>`。
3. **结构化数据**——`WebApplication`（featureList / inLanguage / offers / license / screenshot）+ `FAQPage`（五条真实问答，答案取自帮助面板）。
4. **抓取协议**——`public/robots.txt` 放行全部并指向 sitemap，**不屏蔽 `/assets/`**（那里的 JS / CSS 是渲染页面本身必需的）；`public/sitemap.xml` 单页应用只有一个可索引 URL；`public/CNAME` 把自定义域名纳入版本控制。
5. **站长平台**——Bing 与 Google Search Console 均已添加并完成所有权验证，sitemap 已提交。验证标签在 `index.html` 的 `<head>`：

```html
<meta name="msvalidate.01" content="09EFDE13A2FAD0169413AF8FAFCC323A" />
<meta name="google-site-verification" content="F2sua3DZBffLnWmEI2XlR7fTfLgCS5BQwAOm5QoxoZs" />
```

两家都要求验证通过后也不要移除这两行，否则资源会重新变成未验证状态。

用元标记而不是 DNS TXT / XML 文件，是因为 DNS 不在本项目手里，而 meta 标签跟着 `index.html` 走，一次部署即生效、迁主机可带走。

关于 hreflang：本项目 9 种语言但语言不体现在 URL 上（运行时按浏览器语言切换，共用同一地址），而 hreflang 的硬性前提是每种语言有独立 URL，九个语言指向同一个 URL 会被判重复内容。所以故意不放，改用 `og:locale:alternate` 与 JSON-LD 的 `inLanguage` / `availableLanguage` 表达。

### 九、开发进度

- [X] 四种模式（扩音器 / 电吉他 / 贝斯 / 效果器架）
- [X] 21 个效果器 + 干湿混合与旁通
- [X] 28 个预设
- [X] 噪声门（AudioWorklet 峰值包络 + 开 / 保持 / 关三态机）
- [X] 三层防啸叫 / 防回声 + 回声防护检查表
- [X] 调音器 / 节拍器 / 循环录音站 / 录音机
- [X] 音源三态（麦克风 / 标签页音频 / 内置测试音源）
- [X] 输出设备选择（耳机线 / USB 声卡）+ 设备轮询兜底
- [X] 管道编排：拖动换序、插入中间、长按旁通
- [X] 手机 / 平板适配（三档断点 + 触控目标 ≥ 44 px）
- [X] 9 种语言 + 按浏览器语言自动选择
- [X] SEO：可抓取正文 / meta / JSON-LD / 抓取协议 / 站长平台验证
- [X] GitHub Pages 部署 + 自定义域名

### 十、许可

本项目采用 **GNU General Public License v3.0 或更高版本** 开源，详见 [LICENSE](LICENSE)。

```
VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
Copyright (C) 2026 Mutantcat Working Group
```
