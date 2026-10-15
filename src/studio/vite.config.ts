import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [tailwindcss(), react()],
  build: {
    outDir: path.resolve(__dirname, '../../dist/studio'),
    emptyOutDir: true,
  },
  server: {
    port: 50095,
  },
});
