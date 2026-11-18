import { describe, it, expect } from 'vitest';
import {
  computeUnifiedDiffLines,
  hasMergeConflictMarkers,
  resolveMergeConflicts,
} from '../src';
import { BrowserFSProvider } from '@pocketforge/runtime-bridge';
import { buildOfflinePreviewHtml } from '@pocketforge/preview-devtools';
import { extractFirstCodeBlock } from '@pocketforge/ai-copilot';

describe('Unified Touch Diff, Conflict Resolution, Preview Bundler & AI Patch Extractor', () => {
  it('computes single-column unified diff additions and removals accurately', () => {
    const rows = computeUnifiedDiffLines('const a = 1;\nconst b = 2;\n', 'const a = 1;\nconst b = 99;\n');
    expect(rows.some((r) => r.type === 'remove' && r.content === 'const b = 2;')).toBe(true);
    expect(rows.some((r) => r.type === 'add' && r.content === 'const b = 99;')).toBe(true);
  });

  it('detects and resolves 3-way merge conflicts for ours/theirs/both', () => {
    const conflicted = [
      'function greet() {',
      '<<<<<<< HEAD',
      '  return "Hello Mobile";',
      '=======',
      '  return "Hello Android";',
      '>>>>>>> feat-android',
      '}',
    ].join('\n');

    expect(hasMergeConflictMarkers(conflicted)).toBe(true);
    expect(resolveMergeConflicts(conflicted, 'ours')).toContain('Hello Mobile');
    expect(resolveMergeConflicts(conflicted, 'ours')).not.toContain('Hello Android');
    expect(resolveMergeConflicts(conflicted, 'theirs')).toContain('Hello Android');
  });

  it('inlines CSS, JS, and DevTools telemetry probe into offline HTML preview bundle', async () => {
    const fs = new BrowserFSProvider(true);
    const bundled = await buildOfflinePreviewHtml(fs, 'web-nebula-app/index.html');
    expect(bundled).toContain('pocketforge-preview');
    expect(bundled).toContain('<style data-source="./styles.css">');
    expect(bundled).toContain('<script data-source="./app.js">');
  });

  it('extracts fenced code blocks from AI streaming markdown replies', () => {
    const md = '建议修复如下：\n```typescript\nexport const ok = true;\n```\n已完成。';
    expect(extractFirstCodeBlock(md)).toBe('export const ok = true;');
  });
});
