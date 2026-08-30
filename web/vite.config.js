import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mini Life Game 人生护照',
        short_name: '人生护照',
        description: 'GCGCM 迎新互动游戏 · 电子人生护照',
        lang: 'zh-CN',
        theme_color: '#0d1220',
        background_color: '#0d1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 预缓存全部构建产物 —— 这是"第一次打开之后断网照常玩"的前提
        // 字体共 6MB（Noto Serif SC 有 300+ 个 unicode 子集），全量预缓存会拖垮入场时的弱网。
        // 改成运行时按需缓存：浏览器只下载页面真正用到的子集，之后离线可用。
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // 地标水印（约 260KB）同样不预缓存。它只是页面底纹，加载不到也不影响
        // 任何功能，但塞进预缓存会让 SW 安装变重 —— 安装是原子的，弱网下装不完
        // 就整个离线能力都没有。改成运行时按需缓存，核心 App 保持小而必装。
        globIgnores: ['**/wm/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/healthz/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // 水印：装饰性底纹，下过一次就一直用缓存
            urlPattern: ({ url }) => url.pathname.startsWith('/wm/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mlg-wm',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 字体：一旦下过就永久用缓存，断网后已经显示过的字仍然是宋体
            urlPattern: ({ url }) => url.pathname.startsWith('/fonts/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mlg-fonts',
              expiration: { maxEntries: 160, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 只读接口：优先走网络，3 秒拿不到就用缓存兜底，保证弱网下界面不空白
            urlPattern: ({ url }) =>
              url.pathname === '/api/config' ||
              url.pathname === '/api/leaderboard' ||
              url.pathname === '/api/me' ||
              url.pathname === '/api/awards',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mlg-api',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/healthz': { target: 'http://localhost:3000' },
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          qr: ['qrcode', 'jsqr'],
        },
      },
    },
  },
});
