import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { Command } from 'commander';
import { registerStore } from '../../src/commands/generate/store.js';
import { LumenError } from '../../src/errors.js';

describe('lumen generate store command', () => {
  let tmpDir;
  let stdoutOutput;
  let program;
  let generateCmd;

  // Optional typescript check helper
  let tsParser = null;
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-store-test-'));
    stdoutOutput = '';

    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
      return true;
    });

    try {
      tsParser = await import('typescript');
    } catch {
      tsParser = null;
    }

    program = new Command();
    program.option('-c, --cwd <dir>', 'Working directory');
    program.option('-j, --json', 'Output JSON');
    program.option('-v, --verbose', 'Verbose output');
    program.option('--no-color', 'No color');

    generateCmd = program.command('generate').alias('g');
    registerStore(generateCmd);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function parseTsSmoke(filePath) {
    if (!tsParser || !tsParser.transpileModule) return;
    const code = fs.readFileSync(filePath, 'utf8');
    const result = tsParser.transpileModule(code, {
      compilerOptions: {
        target: tsParser.ScriptTarget?.ESNext || 99,
        jsx: tsParser.JsxEmit?.ReactJSX || 4,
      },
      reportDiagnostics: true,
    });
    expect(result.diagnostics?.length || 0).toBe(0);
  }

  it('displays help and examples for store command', async () => {
    program.exitOverride();
    let helpOutput = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      helpOutput += str;
      return true;
    });

    try {
      program.parse(['node', 'lumen', 'generate', 'store', '--help']);
    } catch {
      // ignore Commander exit
    }

    expect(helpOutput).toContain('Generate global state store');
    expect(helpOutput).toContain('--feature <name>');
    expect(helpOutput).toContain('--persist');
    expect(helpOutput).toContain('--dry-run');
    expect(helpOutput).toContain('--force');
    expect(helpOutput).toContain('Examples:');
    expect(helpOutput).toContain('$ lumen generate store auth');
  });

  it('generates React context store by default when no state library in package.json (TS)', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { react: '^19.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'cart']);

    // Shared store dir: dirname(paths.services) + '/stores' -> 'src/shared/stores'
    const targetDir = path.join(tmpDir, 'src/shared/stores');
    const contextFile = path.join(targetDir, 'CartContext.ts');
    const providerFile = path.join(targetDir, 'CartProvider.tsx');
    const hookFile = path.join(targetDir, 'useCart.ts');
    const indexFile = path.join(targetDir, 'index.ts');

    expect(fs.existsSync(contextFile)).toBe(true);
    expect(fs.existsSync(providerFile)).toBe(true);
    expect(fs.existsSync(hookFile)).toBe(true);
    expect(fs.existsSync(indexFile)).toBe(true);

    const contextContent = fs.readFileSync(contextFile, 'utf8');
    expect(contextContent).toContain('createContext<CartContextValue | null>(null)');

    const providerContent = fs.readFileSync(providerFile, 'utf8');
    expect(providerContent).toContain('export function CartProvider(');

    const hookContent = fs.readFileSync(hookFile, 'utf8');
    expect(hookContent).toContain('export function useCart(): CartContextValue');

    const indexContent = fs.readFileSync(indexFile, 'utf8');
    expect(indexContent).toContain("export * from './CartContext'");
    expect(indexContent).toContain("export * from './CartProvider'");
    expect(indexContent).toContain("export * from './useCart'");

    parseTsSmoke(contextFile);
    parseTsSmoke(providerFile);
    parseTsSmoke(hookFile);
    parseTsSmoke(indexFile);
  });

  it('generates React context store for JS projects when tooling.language is js', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-type-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { react: '^19.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'theme']);

    // For react-vite-type-based: services is 'src/services' -> dirname is 'src' -> 'src/stores'
    const targetDir = path.join(tmpDir, 'src/stores');
    const contextFile = path.join(targetDir, 'ThemeContext.js');
    const providerFile = path.join(targetDir, 'ThemeProvider.jsx');
    const hookFile = path.join(targetDir, 'useTheme.js');
    const indexFile = path.join(targetDir, 'index.js');

    expect(fs.existsSync(contextFile)).toBe(true);
    expect(fs.existsSync(providerFile)).toBe(true);
    expect(fs.existsSync(hookFile)).toBe(true);
    expect(fs.existsSync(indexFile)).toBe(true);

    const hookContent = fs.readFileSync(hookFile, 'utf8');
    expect(hookContent).toContain('export function useTheme()');
    expect(hookContent).not.toContain(': ThemeContextValue');
  });

  it('generates zustand store when zustand is detected in package.json (TS)', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'auth']);

    const targetDir = path.join(tmpDir, 'src/shared/stores');
    const storeFile = path.join(targetDir, 'auth-store.ts');
    const indexFile = path.join(targetDir, 'index.ts');

    expect(fs.existsSync(storeFile)).toBe(true);
    expect(fs.existsSync(indexFile)).toBe(true);

    const storeContent = fs.readFileSync(storeFile, 'utf8');
    expect(storeContent).toContain("import { create } from 'zustand'");
    expect(storeContent).toContain('export interface AuthState');
    expect(storeContent).toContain('export const useAuthStore = create<AuthState>');

    const indexContent = fs.readFileSync(indexFile, 'utf8');
    expect(indexContent).toContain("export * from './auth-store'");

    parseTsSmoke(storeFile);
    parseTsSmoke(indexFile);
  });

  it('generates zustand store with --persist flag', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'settings', '--persist']);

    const targetDir = path.join(tmpDir, 'src/shared/stores');
    const storeFile = path.join(targetDir, 'settings-store.ts');
    expect(fs.existsSync(storeFile)).toBe(true);

    const storeContent = fs.readFileSync(storeFile, 'utf8');
    expect(storeContent).toContain("import { persist } from 'zustand/middleware'");
    expect(storeContent).toContain("name: 'settings-storage'");

    parseTsSmoke(storeFile);
  });

  it('generates clean zustand store when --empty is passed', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'user', '--empty']);

    const targetDir = path.join(tmpDir, 'src/shared/stores');
    const storeFile = path.join(targetDir, 'user-store.ts');
    expect(fs.existsSync(storeFile)).toBe(true);

    const storeContent = fs.readFileSync(storeFile, 'utf8');
    expect(storeContent).toContain("import { create } from 'zustand'");
    expect(storeContent).toContain('export interface UserState');
    expect(storeContent).toContain('// Define state properties and actions here');
    expect(storeContent).toContain('// Initial state and actions');
    expect(storeContent).not.toContain('count: number');
    expect(storeContent).not.toContain('increment: () => void');

    parseTsSmoke(storeFile);
  });

  it('generates clean zustand store with --persist and -e', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'auth', '--persist', '-e']);

    const targetDir = path.join(tmpDir, 'src/shared/stores');
    const storeFile = path.join(targetDir, 'auth-store.ts');
    expect(fs.existsSync(storeFile)).toBe(true);

    const storeContent = fs.readFileSync(storeFile, 'utf8');
    expect(storeContent).toContain("import { persist } from 'zustand/middleware'");
    expect(storeContent).toContain('export interface AuthState');
    expect(storeContent).toContain('// Define state properties and actions here');
    expect(storeContent).toContain("name: 'auth-storage'");
    expect(storeContent).not.toContain('count: number');

    parseTsSmoke(storeFile);
  });

  it('generates clean React context store when --empty is passed', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { react: '^19.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'workspace', '--empty']);

    const targetDir = path.join(tmpDir, 'src/shared/stores');
    const contextFile = path.join(targetDir, 'WorkspaceContext.ts');
    const providerFile = path.join(targetDir, 'WorkspaceProvider.tsx');

    expect(fs.existsSync(contextFile)).toBe(true);
    expect(fs.existsSync(providerFile)).toBe(true);

    const contextContent = fs.readFileSync(contextFile, 'utf8');
    expect(contextContent).toContain('// Define context values and methods here');
    expect(contextContent).not.toContain('count: number');

    const providerContent = fs.readFileSync(providerFile, 'utf8');
    expect(providerContent).toContain('const value = {};');
    expect(providerContent).toContain('value={{ ...value }}');
    expect(providerContent).not.toContain('setCount');

    parseTsSmoke(contextFile);
    parseTsSmoke(providerFile);
  });

  it('fails with LumenError when --persist is passed but state library is not zustand', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { '@reduxjs/toolkit': '^2.0.0' } }, null, 2)
    );

    await expect(
      program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'cart', '--persist'])
    ).rejects.toThrow(LumenError);
  });

  it('generates Redux Toolkit slice when @reduxjs/toolkit is detected', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { '@reduxjs/toolkit': '^2.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'counter']);

    const targetDir = path.join(tmpDir, 'src/shared/stores');
    const sliceFile = path.join(targetDir, 'counter-slice.ts');
    const indexFile = path.join(targetDir, 'index.ts');

    expect(fs.existsSync(sliceFile)).toBe(true);
    expect(fs.existsSync(indexFile)).toBe(true);

    const sliceContent = fs.readFileSync(sliceFile, 'utf8');
    expect(sliceContent).toContain("import { createSlice");
    expect(sliceContent).toContain("export const counterSlice = createSlice");
    expect(sliceContent).toContain("export const { increment, decrement, setValue, reset } = counterSlice.actions");
    expect(sliceContent).toContain("Typed hooks integration note:");

    const indexContent = fs.readFileSync(indexFile, 'utf8');
    expect(indexContent).toContain("export * from './counter-slice'");
    expect(indexContent).toContain("export { default as counterReducer } from './counter-slice'");

    parseTsSmoke(sliceFile);
    parseTsSmoke(indexFile);
  });

  it('generates feature store with --feature flag in feature-based architecture', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'billing', '--feature', 'checkout']);

    const targetDir = path.join(tmpDir, 'src/features/checkout/store');
    const storeFile = path.join(targetDir, 'billing-store.ts');
    const indexFile = path.join(targetDir, 'index.ts');

    expect(fs.existsSync(storeFile)).toBe(true);
    expect(fs.existsSync(indexFile)).toBe(true);
  });

  it('rejects --feature flag when architecture preset is none', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-none');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    await expect(
      program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'billing', '--feature', 'checkout'])
    ).rejects.toThrow(LumenError);
  });

  it('supports --dry-run option and creates no files on disk', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'cart', '--dry-run']);

    expect(stdoutOutput).toContain('[DRY RUN]');
    expect(fs.existsSync(path.join(tmpDir, 'src/shared/stores/cart-store.ts'))).toBe(false);
  });

  it('supports --json flag and outputs structured JSON', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    await program.parseAsync(['node', 'lumen', '-c', tmpDir, '-j', 'g', 'store', 'cart']);

    const parsed = JSON.parse(stdoutOutput.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.kind).toBe('store');
    expect(parsed.stateLib).toBe('zustand');
    expect(parsed.created.length).toBeGreaterThan(0);
  });

  it('protects against clobbering existing files unless --force is provided', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { zustand: '^5.0.0' } }, null, 2)
    );

    // Initial creation
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'cart']);
    const storePath = path.join(tmpDir, 'src/shared/stores/cart-store.ts');
    fs.writeFileSync(storePath, '// modified content');

    stdoutOutput = '';
    // Run again without force
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'cart']);
    expect(fs.readFileSync(storePath, 'utf8')).toBe('// modified content');
    expect(stdoutOutput).toContain('- SKIP');

    // Run again with --force
    stdoutOutput = '';
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'store', 'cart', '--force']);
    expect(fs.readFileSync(storePath, 'utf8')).not.toBe('// modified content');
    expect(stdoutOutput).toContain('! OVERWRITE');
  });
});
