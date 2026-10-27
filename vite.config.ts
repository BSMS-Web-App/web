import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'bsms-copy-chess-bundle',
        closeBundle() {
          try {
            const distJsDir = path.resolve(__dirname, 'dist', 'js');
            const rootJsDir = path.resolve(__dirname, 'js');
            if (!fs.existsSync(rootJsDir)) {
              fs.mkdirSync(rootJsDir, { recursive: true });
            }
            for (const file of ['chess-bundle.js', 'chess-bundle.css']) {
              const srcFile = path.join(distJsDir, file);
              if (fs.existsSync(srcFile)) {
                fs.copyFileSync(srcFile, path.join(rootJsDir, file));
              }
            }
          } catch (err) {
            console.warn('[BSMS Chess Build] Could not copy bundle to /js:', err);
          }
        },
      },
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/main.tsx'),
        output: {
          format: 'es',
          inlineDynamicImports: true,
          entryFileNames: 'js/chess-bundle.js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return 'js/chess-bundle.css';
            }
            return 'js/[name][extname]';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
