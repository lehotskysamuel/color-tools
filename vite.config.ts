import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  build: {
    // three.js alone is ~550 kB minified; one chunk is fine for this app.
    chunkSizeWarningLimit: 800,
  },
});
