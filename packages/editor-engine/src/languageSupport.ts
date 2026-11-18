import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { sql } from '@codemirror/lang-sql';

export interface OutlineSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'struct' | 'heading' | 'variable';
  line: number;
}

export function resolveLanguageExtension(filepath: string): Extension {
  const lower = filepath.toLowerCase();
  if (lower.endsWith('.tsx')) return javascript({ jsx: true, typescript: true });
  if (lower.endsWith('.ts') || lower.endsWith('.mts')) return javascript({ typescript: true });
  if (lower.endsWith('.jsx')) return javascript({ jsx: true });
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return javascript();
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.xml')) return html();
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return css();
  if (lower.endsWith('.json')) return json();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return markdown();
  if (lower.endsWith('.py')) return python();
  if (/\.(c|h|cpp|hpp|cc|cxx)$/.test(lower)) return cpp();
  if (lower.endsWith('.rs')) return rust();
  if (lower.endsWith('.go')) return go();
  if (lower.endsWith('.java') || lower.endsWith('.kt') || lower.endsWith('.kts')) return java();
  if (lower.endsWith('.sql')) return sql();
  return [];
}

export function detectLanguageBadge(filepath: string): string {
  const ext = filepath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TSX',
    js: 'JavaScript',
    jsx: 'JSX',
    html: 'HTML5',
    css: 'CSS3',
    json: 'JSON',
    md: 'Markdown',
    py: 'Python',
    c: 'C',
    cpp: 'C++20',
    cc: 'C++',
    h: 'C/C++ Header',
    rs: 'Rust',
    go: 'Go',
    java: 'Java',
    kt: 'Kotlin',
    xml: 'XML',
    sql: 'SQLite',
  };
  return map[ext] || 'Plain Text';
}

/**
 * Extracts navigable symbols (functions, classes, structs, headings) offline for quick mobile jump.
 */
export function extractDocumentSymbols(content: string, filepath: string): OutlineSymbol[] {
  const lines = content.split(/\r?\n/);
  const symbols: OutlineSymbol[] = [];
  const isMd = /\.md$/i.test(filepath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isMd) {
      const h = line.match(/^(#{1,4})\s+(.+)$/);
      if (h) symbols.push({ name: h[2].trim(), kind: 'heading', line: i + 1 });
      continue;
    }

    const classMatch = line.match(/^\s*(?:export\s+)?(?:public\s+|abstract\s+)?(class|interface|struct|enum)\s+([A-Za-z_]\w*)/);
    if (classMatch) {
      const k = classMatch[1];
      symbols.push({
        name: classMatch[2],
        kind: k === 'interface' ? 'interface' : k === 'struct' ? 'struct' : 'class',
        line: i + 1,
      });
      continue;
    }

    const fnMatch =
      line.match(/^\s*(?:export\s+)?(?:async\s+)?(?:function|def|fn|fun|func)\s+([A-Za-z_]\w*)/) ||
      line.match(/^\s*(?:int|void|double|float|bool|auto|std::\w+)\s+([A-Za-z_]\w*)\s*\([^;]*\{?\s*$/);
    if (fnMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(fnMatch[1])) {
      symbols.push({ name: fnMatch[1], kind: 'function', line: i + 1 });
    }
  }
  return symbols;
}
