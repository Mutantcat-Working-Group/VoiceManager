# VoiceManager

浏览器里的音频工作站：**在线扩音器、电吉他 / 贝斯监听与效果器、通用效果器架**。
纯前端实现（Vite + TypeScript + Web Audio API），无需安装、无需服务端，打开网页即可用。

部署：<https://mutantcat-working-group.github.io/VoiceManager/>

---

## 功能

### 四种模式

| 模式 | 代码 | 说明 |
| --- | --- | --- |
| 在线扩音器 | `PA` | 麦克风变扩音器：噪声门 → 均衡 → 压缩 → 变声 → 失真 → 录音 |
| 电吉他 | `GTR` | 吉他监听与效果器：噪声门 → 自动哇音 → 过载 → 音箱模拟 → 箱体 → 延迟 / 混响 |
| 贝斯 | `BASS` | 贝斯监听与效果器：压缩 → DI → 法兹 → 箱体 → 均衡 |
| 效果器架 | `FX` | 自由搭建效果链，任意顺序、任意数量 |

### 效果器（21 个）

- **动态**：噪声门（AudioWorklet 峰值包络 + 开/保持/关三态机）、压缩、限幅器
- **均衡 / 滤波**：五段图示均衡、滤波 / 哇音（含自动哇音）
- **失真 / 音箱**：失真 / 过载（5 种曲线）、激励器、音箱模拟（5 型号）、箱体模拟（5 型号 + IR）
- **调制**：合唱、移相器、镶边、颤音、环形调制、八度叠加
- **时间 / 空间**：延迟（含 ping-pong 与速度同步）、混响（程序化 IR）
- **音高 / 比特**：变调（颗粒移频 worklet）、比特破碎
- **工具**：音量

每个效果器都有干湿混合（等功率交叉淡变）与旁通，参数实时热更新。

### 工具

- **调音器**：归一化自相关 + 抛物线插值，A4 基准 415–466 Hz 可调
- **节拍器**：120 ms 预排窗口，重音 1600 Hz / 普通 1000 Hz，可同步延迟速度
- **循环录音**：按小节网格录音并自动无缝循环，可无限叠录，各层同相位
- **录音机**：录制效果链输出（不含节拍器），可试听与下载
- **电平 / 频谱**：输入输出 VU 表（惯性 + 峰值保持 + clip 指示）、对数频谱
- **预设**：28 个一键预设（扩音器变声 9 + 吉他 7 + 贝斯 7 + 效果器架 5），扩音器模式另有「自定义」存档位

### 音源与设备

- **麦克风 / 线路 / USB 声卡**：`getUserMedia`，可选输入设备、回声消除、降噪、自动增益
- **标签页 / 系统音频**：`getDisplayMedia` 捕获（video track 置 `enabled=false` 保持共享），可直接把
  [playvirtualinstruments.com](https://playvirtualinstruments.com/zh/) 等在线乐器当音源
- **内置测试音源**：正弦 / 粉噪 / Karplus-Strong 拨弦 / 扫频 / Am 和弦，无乐器也能验证整条链路
- **输出路由**：优先 `AudioContext.setSinkId()`，回退 `MediaStreamAudioDestinationNode` + `<audio>.setSinkId()`
- **输入微调**：−20…+20 dB，配合噪声门使用

### 防啸叫 / 防回声（三层）

扬声器放出的声音被麦克风拾回、再放大输出，就会形成越拖越长的回声，最终啸叫。由内到外三层防护：

1. **戴耳机** —— 最彻底，声音根本不回到麦克风。
2. **浏览器回声消除**（默认开启）—— 用扬声器信号做参考，从麦克风输入里减掉它。这是效果最好的一层，
   在「输入与设备」里可以关闭以换取最纯净的音质。
3. **反馈抑制**（默认开启）—— 见下。

#### 反馈抑制器

持续监测输入频谱，只对满足「**又窄、又亮、又持续**」三个条件的单峰动手（硬件反馈抑制器同思路）：

- 窄度：峰高出 ±8 bin 局部平均 ≥ 12 dB，且比峰低 8 dB 以内的 bin ≤ 8 个。
  人声共振峰约 300 Hz 宽（≈ 28 bin）、乐器谐波族更宽，都通不过这道判据。
- 亮度：峰电平 ≥ −30 dB（FFT bin 电平，比整体 RMS 低约 11 dB）。啸叫会越振越响，门限可以定高。
- 持续：峰需稳定存在 300 ms 以上，敲击、爆破音等瞬态直接被滤掉。

命中后在峰值频率上串入一个 `peaking` 滤波器（Q 22、−10 dB），最多 6 个槽位；该频率消失 2.2 秒后
增益缓慢回 0。凹槽刻意做浅、恢复刻意做快——万一误判在持续音上，也只是一道很轻的凹陷，不会出现音色空洞。

「输入与设备」面板里会实时显示当前压制了哪些频率。仅麦克风 / 线路输入参与分析，测试音源与标签页
数字音频没有声学回路，不参与。

### 交互与无障碍

- 旋钮 / 推子均支持拖拽、滚轮、双击复位；键盘 `↑↓←→` / `Home` / `End` / `PageUp` / `PageDown`，`Shift` 粗调
- 完整 `role="slider"` + `aria-valuenow` / `aria-valuetext`
- 快捷键：`空格` 电源 · `1`–`4` 模式 · `M` 节拍器 · `R` 录音 · `B` 旁通当前模块
- 全部参数与预设自动保存在 localStorage
- 尊重 `prefers-reduced-motion`

---

## 快速开始

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 类型检查 + 生产构建（输出 dist/）
npm run preview    # 预览生产构建
```

打开页面 → 点左上角 **电源** → 允许麦克风权限 → 戴上耳机监听。

> **戴耳机使用**，避免麦克风正对扬声器产生啸叫。

---

## 噪声门怎么调

噪声门是整条链的第一级，用来消除无信号时的底噪、电流声与环境噪声。

| 参数 | 建议值 | 说明 |
| --- | --- | --- |
| 阈值 | 吉他 / 贝斯 −45 dB，人声 −50 dB | 低于这个电平门才会关闭 |
| 开启 | 0.5–3 ms | 信号回来时多快放开，太小会有咔哒声 |
| 保持 | 90–200 ms | 音符之间的正常停顿不会被误切 |
| 关闭 | 120–300 ms | 掉到阈值以下后多久开始衰减 |
| 衰减深度 | −110 dB（静音）…−60 dB（保留呼吸感） | 关门后压到多低 |
| 回差 | 3–5 dB | 防止门在阈值附近反复开合 |

---

## 项目结构

```
index.html                  入口 HTML（lang=zh-CN）
vite.config.ts              base:'./'（GitHub Pages 相对路径）+ worker iife
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
  styles/                   设计令牌 + 控件 + 布局
.github/workflows/deploy.yml  push main → GitHub Pages
icon.png                    应用图标（favicon + apple-touch-icon）
LICENSE                     GNU GPL v3.0
```

### 界面分区

左栏是「机架」：模式说明 → 电平 / 频谱 → 当前效果器参数 → 预设 → 效果器仓库。
右栏是「工具」：调音器 → 节拍器 → 循环录音 → 录音机 → 输入与设备 → 使用说明。
两栏高度经过配平，宽屏下不会出现一侧空一大块的情况；窄屏（≤1100px）自动收成单栏，
侧栏改为自适应网格。
```

---

## 技术要点

- **AudioWorklet**：Vite `?worker&url` 导入 + `worker.format:'iife'`（classic script，兼容性最好），
  `ctx.audioWorklet.addModule(url)` 幂等注册
- **程序化 IR**：RBJ cookbook 双二阶 + mulberry32 确定性 PRNG，无外部音频文件
- **干湿混合**：等功率交叉淡变 `cos(x·π/2)` / `sin(x·π/2)`；`wet` 总线只由效果器输出馈入，
  避免出现绕过效果器的干信号通路
- **旁通**：`input.disconnect(内部) → input.connect(output)`，所有断开都做安全包装
- **重建链路**：整体 dispose 后重建，`inNode` / `outNode` 双侧断开，旧链路不会并联残留

## 浏览器兼容

| 特性 | 要求 |
| --- | --- |
| 基础音频链 | Chrome / Edge 66+、Firefox 76+、Safari 14.1+ |
| AudioWorklet | Chrome 66+、Firefox 76+、Safari 14.1+（不可用时自动降级为普通节点） |
| 输出设备选择 | Chrome 110+（`setSinkId`），其余浏览器保持系统默认输出 |
| 标签页音频捕获 | Chrome / Edge（`getDisplayMedia`） |
| 录音 | 支持 `MediaRecorder` 的浏览器 |

---

## 许可

本项目采用 **GNU General Public License v3.0 或更高版本** 开源，详见 [LICENSE](LICENSE)。

```
VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
Copyright (C) 2026 Mutantcat Working Group

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
```
