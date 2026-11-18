import type { DiagnosticLocation } from './types';

/**
 * Parses compiler and runtime error lines across Clang/GCC, Rustc, Go, Python,
 * TypeScript/Node.js, and Javac/Kotlinc into clickable editor jump locations.
 */
export function parseCompilerDiagnostics(output: string): DiagnosticLocation[] {
  const diagnostics: DiagnosticLocation[] = [];
  const seen = new Set<string>();
  const lines = output.split(/\r?\n/);

  const pushUnique = (diag: DiagnosticLocation) => {
    const key = `${diag.file}:${diag.line}:${diag.column}:${diag.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diag);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // 1. Clang / GCC / Kotlinc / Javac: path/to/file.cpp:42:10: error: expected ';'
    const gccMatch = rawLine.match(
      /^([^\s:]+\.[a-zA-Z0-9_+]+):(\d+):(\d+):\s*(fatal error|error|warning|info|note):\s*(.+)$/i
    );
    if (gccMatch) {
      const sevRaw = gccMatch[4].toLowerCase();
      pushUnique({
        file: normalizeDiagPath(gccMatch[1]),
        line: Math.max(1, Number(gccMatch[2])),
        column: Math.max(1, Number(gccMatch[3])),
        severity: sevRaw.includes('error') ? 'error' : sevRaw === 'warning' ? 'warning' : 'info',
        message: gccMatch[5],
        rawLine,
      });
      continue;
    }

    // 2. Rustc: --> src/main.rs:18:5
    const rustArrow = rawLine.match(/^-->\s+([^\s:]+\.rs):(\d+):(\d+)$/);
    if (rustArrow) {
      const prevHeader = i > 0 ? lines[i - 1].trim() : '';
      const headerMatch = prevHeader.match(/^(error|warning)(?:\[[A-Z0-9]+\])?:\s*(.+)$/i);
      pushUnique({
        file: normalizeDiagPath(rustArrow[1]),
        line: Math.max(1, Number(rustArrow[2])),
        column: Math.max(1, Number(rustArrow[3])),
        severity: headerMatch && headerMatch[1].toLowerCase() === 'warning' ? 'warning' : 'error',
        message: headerMatch ? headerMatch[2] : 'Rust 编译诊断定位',
        rawLine,
      });
      continue;
    }

    // 3. TypeScript tsc: src/index.ts(12,7): error TS2322: Type 'string' is not assignable...
    const tsParen = rawLine.match(
      /^([^\s()]+\.[mc]?[jt]sx?)\((\d+),(\d+)\):\s*(error|warning)\s+TS\d+:\s*(.+)$/i
    );
    if (tsParen) {
      pushUnique({
        file: normalizeDiagPath(tsParen[1]),
        line: Math.max(1, Number(tsParen[2])),
        column: Math.max(1, Number(tsParen[3])),
        severity: tsParen[4].toLowerCase() === 'warning' ? 'warning' : 'error',
        message: tsParen[5],
        rawLine,
      });
      continue;
    }

    // 4. Python traceback: File "/workspace/main.py", line 24, in <module>
    const pyMatch = rawLine.match(/^File\s+"([^"]+\.py)",\s+line\s+(\d+)/);
    if (pyMatch) {
      let errMsg = 'Python 运行时异常';
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
        const next = lines[j].trim();
        if (/^[A-Za-z0-9_]*(Error|Exception):/.test(next)) {
          errMsg = next;
          break;
        }
      }
      pushUnique({
        file: normalizeDiagPath(pyMatch[1]),
        line: Math.max(1, Number(pyMatch[2])),
        column: 1,
        severity: 'error',
        message: errMsg,
        rawLine,
      });
      continue;
    }

    // 5. Go compiler / Node stack trace: ./main.go:15:4: undefined: foo
    const goOrStack = rawLine.match(/^([^\s:()]+\.(?:go|js|ts|jsx|tsx|py|kt|java)):(\d+):(\d+):\s*(.+)$/);
    if (goOrStack) {
      pushUnique({
        file: normalizeDiagPath(goOrStack[1]),
        line: Math.max(1, Number(goOrStack[2])),
        column: Math.max(1, Number(goOrStack[3])),
        severity: 'error',
        message: goOrStack[4],
        rawLine,
      });
    }
  }

  return diagnostics;
}

function normalizeDiagPath(raw: string): string {
  return raw.replace(/^\.\//, '').replace(/^\/+/, '');
}
