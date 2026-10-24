/**
 * VoiceManager — 在线扩音器 / 电吉他 / 贝斯 监听与效果器
 * Copyright (C) 2026 Mutantcat Working Group
 * License: GPL-3.0-or-later <https://www.gnu.org/licenses/>
 */
import { defineConfig } from 'vite';

// GitHub Pages 部署：使用相对路径，兼容 https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  worker: {
    // AudioWorklet 需要 classic script，iife 格式最稳妥（Chrome / Edge / Firefox / Safari 均支持）
    format: 'iife',
  },
  build: {
    target: 'es2022',
    cssTarget: 'chrome111',
    sourcemap: false,
  },
});
