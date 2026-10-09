import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any sub-path (e.g. GitHub Pages).
  base: './',
  build: {
    // three.js alone is ~550 kB minified; one chunk is fine for this app.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      // The pages, resolved against the project root: the atlas, the difference matrix and the set builder.
      input: { main: 'index.html', matrix: 'matrix.html', setBuilder: 'set-builder.html' },
    },
  },
});
