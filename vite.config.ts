/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages では https://mu4096.github.io/random-type/ で公開する。
  // 開発サーバーは http://localhost:5173/ のままにしたいので、ビルドとプレビューのときだけ付ける
  base: command === 'build' || isPreview ? '/random-type/' : '/',
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
