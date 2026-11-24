import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@pocketforge/m3-theme': path.resolve(__dirname, 'packages/m3-theme/src/index.ts'),
      '@pocketforge/ui-kit': path.resolve(__dirname, 'packages/ui-kit/src/index.ts'),
      '@pocketforge/runtime-bridge': path.resolve(__dirname, 'packages/runtime-bridge/src/index.ts'),
      '@pocketforge/editor-engine': path.resolve(__dirname, 'packages/editor-engine/src/index.ts'),
      '@pocketforge/terminal-runner': path.resolve(__dirname, 'packages/terminal-runner/src/index.ts'),
      '@pocketforge/preview-devtools': path.resolve(__dirname, 'packages/preview-devtools/src/index.ts'),
      '@pocketforge/git-workbench': path.resolve(__dirname, 'packages/git-workbench/src/index.ts'),
      '@pocketforge/dev-toolbox': path.resolve(__dirname, 'packages/dev-toolbox/src/index.ts'),
      '@pocketforge/ai-copilot': path.resolve(__dirname, 'packages/ai-copilot/src/index.ts'),
      '@pocketforge/workbench-ui': path.resolve(__dirname, 'packages/workbench-ui/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['packages/**/__tests__/**/*.test.{ts,tsx}', 'apps/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
