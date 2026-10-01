import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built page loads from file:// inside Electron.
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
