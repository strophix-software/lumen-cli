import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { runCli } from '../../src/cli.js';
import {
  shouldIgnoreItem,
  collectExportableModules,
  generateBarrelContent,
  discoverBarrelDirectories,
  executeSyncBarrels,
} from '../../src/commands/sync-barrels.js';

describe('lumen sync-barrels command', () => {
  let tmpDir;
  let stdoutOutput;
  let stderrOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-barrels-test-'));
    stdoutOutput = '';
    stderrOutput = '';
    process.exitCode = undefined;

    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
      return true;
    });

    vi.spyOn(process.stderr, 'write').mockImplementation((str) => {
      stderrOutput += str;
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

  describe('unit helpers', () => {
    it('shouldIgnoreItem handles hidden, private, node_modules, and tests', () => {
      expect(shouldIgnoreItem('/p/.hidden', '.hidden', false)).toBe(true);
      expect(shouldIgnoreItem('/p/_private.ts', '_private.ts', false)).toBe(true);
      expect(shouldIgnoreItem('/p/node_modules', 'node_modules', true)).toBe(true);
      expect(shouldIgnoreItem('/p/__tests__', '__tests__', true)).toBe(true);
      expect(shouldIgnoreItem('/p/__mocks__', '__mocks__', true)).toBe(true);
      expect(shouldIgnoreItem('/p/index.ts', 'index.ts', false)).toBe(true);
      expect(shouldIgnoreItem('/p/index.js', 'index.js', false)).toBe(true);
      expect(shouldIgnoreItem('/p/button.test.tsx', 'button.test.tsx', false)).toBe(true);
      expect(shouldIgnoreItem('/p/button.spec.ts', 'button.spec.ts', false)).toBe(true);
      expect(shouldIgnoreItem('/p/user.mock.ts', 'user.mock.ts', false)).toBe(true);
      expect(shouldIgnoreItem('/p/types.d.ts', 'types.d.ts', false)).toBe(true);
      expect(shouldIgnoreItem('/p/style.css', 'style.css', false)).toBe(true);
      expect(shouldIgnoreItem('/p/doc.md', 'doc.md', false)).toBe(true);
    });

    it('shouldIgnoreItem recognizes @barrel-ignore pragma in header', () => {
      const file = path.join(tmpDir, 'internal.ts');
      fs.writeFileSync(file, '// @barrel-ignore\nexport const secret = 42;\n');
      expect(shouldIgnoreItem(file, 'internal.ts', false)).toBe(true);

      const normalFile = path.join(tmpDir, 'public.ts');
      fs.writeFileSync(normalFile, 'export const visible = 100;\n');
      expect(shouldIgnoreItem(normalFile, 'public.ts', false)).toBe(false);
    });

    it('collectExportableModules collects valid modules deterministically sorted', () => {
      const dir = path.join(tmpDir, 'components');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'zeta.tsx'), 'export const Zeta = () => null;');
      fs.writeFileSync(path.join(dir, 'alpha.tsx'), 'export const Alpha = () => null;');
      fs.writeFileSync(path.join(dir, 'beta.ts'), 'export const beta = true;');
      fs.writeFileSync(path.join(dir, 'beta.test.ts'), 'test');
      fs.writeFileSync(path.join(dir, '_secret.ts'), 'secret');

      // Subdir with index
      const subDirWithIndex = path.join(dir, 'card');
      fs.mkdirSync(subDirWithIndex);
      fs.writeFileSync(path.join(subDirWithIndex, 'index.ts'), 'export const Card = () => null;');

      // Subdir without index
      const subDirNoIndex = path.join(dir, 'modal');
      fs.mkdirSync(subDirNoIndex);

      const modules = collectExportableModules(dir);
      expect(modules).toEqual(['alpha', 'beta', 'card', 'zeta']);
    });

    it('generateBarrelContent generates deterministic export lines', () => {
      expect(generateBarrelContent([])).toBe('');
      expect(generateBarrelContent(['alpha', 'beta'])).toBe(
        "export * from './alpha';\nexport * from './beta';\n"
      );
    });

    it('discoverBarrelDirectories finds canonical directories', () => {
      fs.mkdirSync(path.join(tmpDir, 'components'), { recursive: true });
      const discovered = discoverBarrelDirectories(tmpDir, {
        components: 'components',
      });
      expect(discovered).toContain(path.resolve(tmpDir, 'components'));
    });
  });

  describe('executeSyncBarrels in project workspace', () => {
    let projectDir;

    beforeEach(async () => {
      projectDir = path.join(tmpDir, 'app');
      fs.mkdirSync(projectDir, { recursive: true });

      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'next-app-minimal') || fixtures[0];
      const manifest = {
        ...fixture.manifest,
        paths: {
          ...fixture.manifest.paths,
          components: 'src/components',
          services: 'src/services',
          features: 'src/features',
        },
      };

      fs.writeFileSync(
        path.join(projectDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Create directories with modules
      const compDir = path.join(projectDir, 'src/components');
      fs.mkdirSync(compDir, { recursive: true });
      fs.writeFileSync(path.join(compDir, 'Button.tsx'), 'export const Button = () => null;');
      fs.writeFileSync(path.join(compDir, 'Input.tsx'), 'export const Input = () => null;');

      // Feature directory
      const authFeat = path.join(projectDir, 'src/features/auth/components');
      fs.mkdirSync(authFeat, { recursive: true });
      fs.writeFileSync(path.join(authFeat, 'LoginForm.tsx'), 'export const LoginForm = () => null;');
    });

    it('generates missing barrels and reports staleCount', () => {
      const res = executeSyncBarrels({ cwd: projectDir });
      expect(res.success).toBe(true);
      expect(res.staleCount).toBeGreaterThanOrEqual(1);

      const buttonBarrel = path.join(projectDir, 'src/components/index.ts');
      expect(fs.existsSync(buttonBarrel)).toBe(true);
      const content = fs.readFileSync(buttonBarrel, 'utf8');
      expect(content).toBe("export * from './Button';\nexport * from './Input';\n");

      // Running a second time is idempotent (staleCount = 0)
      const res2 = executeSyncBarrels({ cwd: projectDir });
      expect(res2.staleCount).toBe(0);
    });

    it('supports --dry-run without creating or updating files', () => {
      const res = executeSyncBarrels({ cwd: projectDir, dryRun: true });
      expect(res.staleCount).toBeGreaterThanOrEqual(1);

      const buttonBarrel = path.join(projectDir, 'src/components/index.ts');
      expect(fs.existsSync(buttonBarrel)).toBe(false);
    });

    it('supports --check returning failure when barrels are missing or stale', () => {
      const check1 = executeSyncBarrels({ cwd: projectDir, check: true });
      expect(check1.success).toBe(false);
      expect(check1.staleCount).toBeGreaterThan(0);

      // Fix barrels
      executeSyncBarrels({ cwd: projectDir });

      const check2 = executeSyncBarrels({ cwd: projectDir, check: true });
      expect(check2.success).toBe(true);
      expect(check2.staleCount).toBe(0);
    });

    it('targets a single directory when targetDir option is provided', () => {
      const compDir = path.join(projectDir, 'src/components');
      const res = executeSyncBarrels({ cwd: projectDir, targetDir: compDir });
      expect(res.barrels.length).toBe(1);
      expect(res.barrels[0].file).toBe(path.normalize('src/components/index.ts'));
    });
  });

  describe('CLI command registration and output', () => {
    let projectDir;

    beforeEach(async () => {
      projectDir = path.join(tmpDir, 'cli-app');
      fs.mkdirSync(projectDir, { recursive: true });

      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'next-app-minimal') || fixtures[0];
      fs.writeFileSync(
        path.join(projectDir, 'lumen.config.json'),
        JSON.stringify(
          {
            ...fixture.manifest,
            paths: { ...fixture.manifest.paths, components: 'src/components' },
          },
          null,
          2
        )
      );

      const compDir = path.join(projectDir, 'src/components');
      fs.mkdirSync(compDir, { recursive: true });
      fs.writeFileSync(path.join(compDir, 'Header.tsx'), 'export const Header = () => null;');
    });

    it('executes via lumen sync-barrels and writes files', async () => {
      await runCli(['node', 'lumen', '-c', projectDir, 'sync-barrels', 'src/components']).finished;
      expect(stdoutOutput).toContain('Lumen Sync Barrels');
      expect(stdoutOutput).toContain('SYNCED');
      expect(fs.existsSync(path.join(projectDir, 'src/components/index.ts'))).toBe(true);
    });

    it('supports -j / --json output with alias sb', async () => {
      await runCli(['node', 'lumen', '-c', projectDir, '-j', 'sb', 'src/components']).finished;
      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed).toHaveProperty('totalBarrels');
      expect(parsed.totalBarrels).toBeGreaterThanOrEqual(1);
    });

    it('fails when --check detects stale barrels', async () => {
      await runCli(['node', 'lumen', '-c', projectDir, 'sync-barrels', '--check']).finished;
      expect(stderrOutput).toContain('Barrels are out of sync');
      expect(process.exitCode).toBe(1);
    });
  });
});
