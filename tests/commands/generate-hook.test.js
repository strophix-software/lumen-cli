import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { Command } from 'commander';
import { registerHook, executeGenerateHook, normalizeHookName } from '../../src/commands/generate/hook.js';
import { LumenError } from '../../src/errors.js';

describe('lumen g hook command (#97)', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-hook-test-'));
    stdoutOutput = '';

    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
      return true;
    });

    vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function createTestProgram() {
    const program = new Command();
    program
      .option('-c, --cwd <dir>', 'Working directory', tmpDir)
      .option('-j, --json', 'Output in JSON format', false);

    const generate = program.command('generate').alias('g');
    registerHook(generate);
    return program;
  }

  describe('normalizeHookName', () => {
    it('normalizes names with various prefixes', () => {
      expect(normalizeHookName('cart')).toBe('cart');
      expect(normalizeHookName('useCart')).toBe('Cart');
      expect(normalizeHookName('use-cart')).toBe('cart');
      expect(normalizeHookName('use-user-profile')).toBe('user-profile');
      expect(normalizeHookName('useUserProfile')).toBe('UserProfile');
      expect(normalizeHookName('')).toBe('');
      expect(normalizeHookName(null)).toBe('');
    });
  });

  it('scaffolds a custom hook in TypeScript with React 19 cancel-guarded promise pattern', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find(
      (f) =>
        f.manifest.framework?.name === 'react' &&
        f.manifest.tooling?.language === 'ts' &&
        f.manifest.paths?.hooks
    ) || fixtures[0];

    const manifest = JSON.parse(JSON.stringify(fixture.manifest));
    manifest.paths = {
      ...manifest.paths,
      hooks: 'src/hooks',
    };
    manifest.tooling = {
      ...manifest.tooling,
      language: 'ts',
    };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'hook', 'cart', '-c', tmpDir]);

    const hookFile = path.join(tmpDir, 'src/hooks/useCart.ts');
    expect(fs.existsSync(hookFile)).toBe(true);

    const content = fs.readFileSync(hookFile, 'utf8');

    // 1. Hook function and exports
    expect(content).toContain('export function useCart<T = unknown>(): UseCartResult<T>');
    expect(content).toContain('export default useCart;');

    // 2. Initial state initialized to true (avoids cascading render lint error in React 19)
    expect(content).toContain('const [loading, setLoading] = useState<boolean>(true);');
    expect(content).toContain('const [data, setData] = useState<T | null>(null);');
    expect(content).toContain('const [error, setError] = useState<Error | null>(null);');

    // 3. Effect body must NOT call setLoading/setState synchronously
    const effectMatch = content.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[\]\);/);
    expect(effectMatch).not.toBeNull();
    const effectBody = effectMatch[1];

    // Must start with let active = true
    expect(effectBody).toContain('let active = true;');

    // Must NOT contain synchronous setState or setLoading calls before async fetch
    const beforeFetch = effectBody.split('fetch(')[0];
    expect(beforeFetch).not.toMatch(/setLoading\s*\(/);
    expect(beforeFetch).not.toMatch(/setData\s*\(/);
    expect(beforeFetch).not.toMatch(/setState\s*\(/);

    // 4. Cancel-guarded promise resolution
    expect(effectBody).toContain('if (active)');
    expect(effectBody).toContain('setData(result);');
    expect(effectBody).toContain('setLoading(false);');

    // 5. Cleanup function resets active = false
    expect(effectBody).toContain('return () => {');
    expect(effectBody).toContain('active = false;');

    // 6. Transpile check
    let ts;
    try {
      ts = await import('typescript');
    } catch {
      ts = null;
    }
    if (ts && ts.transpileModule) {
      expect(() => {
        ts.transpileModule(content, {
          compilerOptions: { jsx: ts.JsxEmit?.ReactJSX || 4 },
        });
      }).not.toThrow();
    }
  });

  it('scaffolds a custom hook in JavaScript for JS projects', async () => {
    const fixtures = await loadValidFixtures();
    const baseFixture = fixtures[0];
    const jsManifest = JSON.parse(JSON.stringify(baseFixture.manifest));
    jsManifest.tooling.language = 'js';
    jsManifest.paths = {
      ...jsManifest.paths,
      hooks: 'src/hooks',
    };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(jsManifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'generate', 'hook', 'use-user-profile', '-c', tmpDir]);

    const hookFile = path.join(tmpDir, 'src/hooks/useUserProfile.js');
    expect(fs.existsSync(hookFile)).toBe(true);

    const content = fs.readFileSync(hookFile, 'utf8');
    expect(content).toContain('export function useUserProfile()');
    expect(content).toContain('const [loading, setLoading] = useState(true);');
    expect(content).toContain('let active = true;');
    expect(content).toContain('if (active)');
    expect(content).toContain('return () => {');
    expect(content).toContain('active = false;');
  });

  it('generates hook inside feature directory with --feature flag', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find(
      (f) => f.manifest.architecture?.preset === 'feature-based'
    ) || fixtures[0];

    const manifest = JSON.parse(JSON.stringify(fixture.manifest));
    manifest.architecture = { preset: 'feature-based', validation: 'strict' };
    manifest.paths = {
      ...manifest.paths,
      features: 'src/features',
    };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'hook', 'subscription', '--feature', 'billing', '-c', tmpDir]);

    const hookFile = path.join(tmpDir, 'src/features/billing/hooks/useSubscription.ts');
    expect(fs.existsSync(hookFile)).toBe(true);

    const content = fs.readFileSync(hookFile, 'utf8');
    expect(content).toContain('export function useSubscription');
    expect(content).toContain("fetch('/api/subscription')");
  });

  it('rejects --feature flag when architecture preset is none', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = JSON.parse(JSON.stringify(fixtures[0].manifest));
    manifest.architecture = { preset: 'none' };
    manifest.paths = { hooks: 'src/hooks' };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifest, null, 2)
    );

    const program = createTestProgram();
    await expect(
      program.parseAsync(['node', 'lumen', 'g', 'hook', 'notifications', '--feature', 'alerts', '-c', tmpDir])
    ).rejects.toThrow(LumenError);
  });

  it('fails when paths.hooks is not configured in manifest', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = JSON.parse(JSON.stringify(fixtures[0].manifest));
    delete manifest.paths.hooks;

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifest, null, 2)
    );

    const program = createTestProgram();
    await expect(
      program.parseAsync(['node', 'lumen', 'g', 'hook', 'settings', '-c', tmpDir])
    ).rejects.toThrow(LumenError);
  });

  it('supports --dry-run option and creates no files on disk', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = JSON.parse(JSON.stringify(fixtures[0].manifest));
    manifest.paths.hooks = 'src/hooks';

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'hook', 'analytics', '--dry-run', '-c', tmpDir]);

    const hookFile = path.join(tmpDir, 'src/hooks/useAnalytics.ts');
    expect(fs.existsSync(hookFile)).toBe(false);
    expect(stdoutOutput).toContain('[DRY RUN] Would create');
  });

  it('supports --json flag and outputs structured JSON', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = JSON.parse(JSON.stringify(fixtures[0].manifest));
    manifest.paths.hooks = 'src/hooks';

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'hook', 'metrics', '-j', '-c', tmpDir]);

    expect(stdoutOutput).toContain('"success": true');
    expect(stdoutOutput).toContain('"kind": "hooks"');
    expect(stdoutOutput).toContain('"name": "useMetrics"');

    const parsed = JSON.parse(stdoutOutput);
    expect(parsed.success).toBe(true);
    expect(parsed.created).toHaveLength(1);
  });

  it('can be invoked programmatically via executeGenerateHook', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = JSON.parse(JSON.stringify(fixtures[0].manifest));
    manifest.paths.hooks = 'src/hooks';

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifest, null, 2)
    );

    const result = await executeGenerateHook('useTheme', { cwd: tmpDir });
    expect(result.success).toBe(true);
    expect(result.name).toBe('useTheme');
    expect(fs.existsSync(path.join(tmpDir, 'src/hooks/useTheme.ts'))).toBe(true);
  });

  it('protects against overwriting existing files unless --force is passed', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = JSON.parse(JSON.stringify(fixtures[0].manifest));
    manifest.paths.hooks = 'src/hooks';

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifest, null, 2)
    );

    const hooksDir = path.join(tmpDir, 'src/hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookFile = path.join(hooksDir, 'useProfile.ts');
    fs.writeFileSync(hookFile, '// existing custom hook', 'utf8');

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'hook', 'profile', '-c', tmpDir]);

    expect(stdoutOutput).toContain('- SKIP');
    expect(fs.readFileSync(hookFile, 'utf8')).toBe('// existing custom hook');

    // With --force
    stdoutOutput = '';
    await program.parseAsync(['node', 'lumen', 'g', 'hook', 'profile', '--force', '-c', tmpDir]);

    expect(stdoutOutput).toContain('! OVERWRITE');
    expect(fs.readFileSync(hookFile, 'utf8')).toContain('export function useProfile');
  });
});
