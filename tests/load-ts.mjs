import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// The tested modules only import types, so they can execute directly after
// transpilation in memory. This creates no build output and needs no test runner
// dependency beyond node:test.
export async function loadTs(relativePath) {
  const filename = new URL(relativePath, import.meta.url);
  const source = await readFile(filename, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: filename.pathname,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (value) => value,
    getNewLine: () => '\n',
  }));
  return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString('base64')}`);
}
