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
    },
  },
});
