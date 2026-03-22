import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        howItWorks: resolve(__dirname, 'how-it-works.html')
      }
    }
  }
});
