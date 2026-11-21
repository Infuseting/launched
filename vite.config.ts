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
    // Match Tauri's URL and fail clearly if another process owns this port.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
