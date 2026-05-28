import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['index.js', 'tools.js', 'store.js', 'syslog.js'],
      exclude: ['test/**', 'dashboard/**', 'node_modules/**'],
    },
  },
});
