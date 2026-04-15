import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Use relative asset paths so packaged Tauri/AppImage can resolve files.
  base: './',
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        logs: './logs.html',
      },
    },
  },
});
