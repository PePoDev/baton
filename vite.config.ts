/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is one self-contained index.html (scripts and styles inlined), so the
// game deploys as a single file to GitHub Pages, a claude.ai artifact, or anywhere else.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: 'es2022', modulePreload: false },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
