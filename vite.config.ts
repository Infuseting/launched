import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Use relative asset paths so packaged Tauri/AppImage can resolve files.
  base: './',
  plugins: [tailwindcss(), react()],
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        logs: './logs.html',
      },
      output: {
        // Keep the lazy skin studio and its WebGL engine independently cacheable.
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
        },
      },
    },
  },
  server: {
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
