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
