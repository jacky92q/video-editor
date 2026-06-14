import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// base: GitHub Pages 프로젝트 경로(/<repo>/)에 맞춰 에셋 경로를 설정합니다.
export default defineConfig({
  base: '/video-editor/',
  plugins: [react()],
})
