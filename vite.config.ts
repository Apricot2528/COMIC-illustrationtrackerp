import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // 大きめの依存を vendor チャンクに分けて、アプリ本体の更新時に
          // ブラウザキャッシュが無駄にならないようにする
          manualChunks(id: string) {
            const path = id.replace(/[\\]/g, '/');
            if (!path.includes('/node_modules/')) return;
            if (/\/node_modules\/(@firebase|firebase)\//.test(path)) return 'firebase';
            if (/\/node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//.test(path)) return 'motion';
            if (/\/node_modules\/lucide-react\//.test(path)) return 'lucide-react';
            return;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
