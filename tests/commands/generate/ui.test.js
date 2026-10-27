import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { Command } from 'commander';
import {
  registerUi,
  executeGenerateUi,
  resolveUiComponent,
  fetchLumenRegistry,
  fetchShadcnRegistry,
  listUiComponents,
  checkUiDependencies,
  installPeerDependencies,
  ensureCnUtil,
  executeApplyTheme,
} from '../../../src/commands/generate/ui.js';
import { LumenError } from '../../../src/errors.js';

describe('lumen generate ui command', () => {
  let tmpDir;
  let stdoutOutput;
  let tsParser = null;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-ui-test-'));
    stdoutOutput = '';
    process.exitCode = undefined;

    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
      return true;
    });

    vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      return true;
    });

    try {
      tsParser = await import('typescript');
    } catch {
      tsParser = null;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
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

  function createTestProgram() {
    const program = new Command();
    program
      .option('-c, --cwd <dir>', 'Working directory', tmpDir)
      .option('-j, --json', 'Output in JSON format', false);

    const generate = program.command('generate').alias('g');
    registerUi(generate);
    return program;
  }

  describe('CLI command registration and help', () => {
    it('displays help text with options and examples', () => {
      const program = createTestProgram();
      program.exitOverride();

      let helpOutput = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        helpOutput += str;
        return true;
      });

      try {
        program.parse(['node', 'lumen', 'g', 'ui', '--help']);
      } catch {
        // commander exitOverride
      }

      expect(helpOutput).toContain('Resolve and generate UI components from the Lumen Registry');
      expect(helpOutput).toContain('--list');
      expect(helpOutput).toContain('--dry-run');
      expect(helpOutput).toContain('--force');
      expect(helpOutput).toContain('Examples:');
      expect(helpOutput).toContain('$ lumen g ui button');
      expect(helpOutput).toContain('$ lumen g ui card');
      expect(helpOutput).toContain('$ lumen g ui data-table');
      expect(helpOutput).toContain('$ lumen g ui --list');
    });

    it('rejects execution when name is missing and --list is not passed', async () => {
      await expect(executeGenerateUi('', { cwd: tmpDir })).rejects.toThrow(LumenError);
      await expect(executeGenerateUi('', { cwd: tmpDir })).rejects.toThrow(
        /Component name is required/i
      );
    });

    it('rejects path traversal in component name', async () => {
      await expect(executeGenerateUi('../button', { cwd: tmpDir })).rejects.toThrow(LumenError);
      await expect(executeGenerateUi('foo/bar', { cwd: tmpDir })).rejects.toThrow(LumenError);
    });
  });

  describe('Component listing (--list)', () => {
    it('lists available components from Lumen and Shadcn with --list', async () => {
      const program = createTestProgram();
      await program.parseAsync(['node', 'lumen', 'g', 'ui', '--list', '-c', tmpDir]);

      expect(stdoutOutput).toContain('Lumen UI Component Registry');
      expect(stdoutOutput).toContain('Lumen Registry Components (Blocks & Primitives):');
      expect(stdoutOutput).toContain('data-table');
      expect(stdoutOutput).toContain('metric-card');
      expect(stdoutOutput).toContain('stat-card');
      expect(stdoutOutput).toContain('Shadcn UI Fallback Components (Primitives):');
      expect(stdoutOutput).toContain('button');
      expect(stdoutOutput).toContain('card');
      expect(stdoutOutput).toContain('dialog');
      expect(stdoutOutput).toContain('Preset Visual Themes');
      expect(stdoutOutput).toContain('autumn-maple');
    });

    it('returns structured JSON with --list and -j flag', async () => {
      const result = await executeGenerateUi(undefined, { cwd: tmpDir, list: true, json: true });

      expect(result.success).toBe(true);
      expect(result.kind).toBe('ui-list');
      expect(Array.isArray(result.components)).toBe(true);
      expect(result.components.length).toBeGreaterThan(10);
      expect(Array.isArray(result.themes)).toBe(true);
      expect(result.themes.length).toBe(13);

      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.success).toBe(true);
      expect(parsed.components.some((c) => c.name === 'data-table' && c.source === 'lumen')).toBe(true);
      expect(parsed.components.some((c) => c.name === 'button' && c.source === 'shadcn')).toBe(true);
    });

    it('lists available preset themes with "theme --list"', async () => {
      const result = await executeGenerateUi('theme', { cwd: tmpDir, list: true });

      expect(result.success).toBe(true);
      expect(result.kind).toBe('theme-list');
      expect(result.themes.length).toBe(13);
      expect(stdoutOutput).toContain('Available Preset Themes:');
      expect(stdoutOutput).toContain('autumn-maple');
      expect(stdoutOutput).toContain('ocean-breeze');
      expect(stdoutOutput).toContain('neon-noir');
    });
  });

  describe('Registry resolver (Lumen Registry with Shadcn fallback)', () => {
    it('resolves proprietary Lumen components from Lumen Registry', async () => {
      const resolved = await resolveUiComponent('data-table');
      expect(resolved.source).toBe('lumen');
      expect(resolved.name).toBe('data-table');
      expect(resolved.type).toBe('block');
      expect(resolved.dependencies).toContain('@tanstack/react-table');
      expect(resolved.files.length).toBeGreaterThan(0);
    });

    it('resolves metric-card and stat-card from Lumen Registry', async () => {
      const metric = await resolveUiComponent('metric-card');
      expect(metric.source).toBe('lumen');
      expect(metric.name).toBe('metric-card');

      const stat = await resolveUiComponent('stat-card');
      expect(stat.source).toBe('lumen');
      expect(stat.name).toBe('stat-card');
    });

    it('falls back to Shadcn transparently for base primitives', async () => {
      const resolved = await resolveUiComponent('button');
      expect(resolved.source).toBe('shadcn');
      expect(resolved.name).toBe('button');
      expect(resolved.type).toBe('primitive');
      expect(resolved.dependencies).toContain('@radix-ui/react-slot');

      const card = await resolveUiComponent('card');
      expect(card.source).toBe('shadcn');
      expect(card.name).toBe('card');
    });

    it('falls back to Shadcn for dialog, avatar, tabs, input, and badge', async () => {
      for (const name of ['dialog', 'avatar', 'tabs', 'input', 'badge']) {
        const item = await resolveUiComponent(name);
        expect(item.source).toBe('shadcn');
        expect(item.name).toBe(name);
      }
    });

    it('resolves remote component from Lumen Registry via HTTP mock', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          name: 'remote-hero',
          type: 'block',
          dependencies: ['clsx', 'tailwind-merge'],
          files: [
            {
              path: 'RemoteHero.tsx',
              contentTs: 'export function RemoteHero() { return <div>Remote</div>; }',
            },
          ],
        }),
      });

      const resolved = await resolveUiComponent('remote-hero', { fetch: mockFetch });
      expect(resolved.source).toBe('lumen');
      expect(resolved.name).toBe('remote-hero');
      expect(resolved.files[0].path).toBe('RemoteHero.tsx');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('falls back to remote Shadcn registry when Lumen returns 404', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('registry.lumen.dev')) {
          return { status: 404, ok: false };
        }
        if (url.includes('ui.shadcn.com')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              name: 'remote-slider',
              type: 'primitive',
              dependencies: ['@radix-ui/react-slider'],
              files: [
                {
                  path: 'RemoteSlider.tsx',
                  contentTs: 'export function RemoteSlider() { return <div>Slider</div>; }',
                },
              ],
            }),
          };
        }
        return { status: 404, ok: false };
      });

      const resolved = await resolveUiComponent('remote-slider', { fetch: mockFetch });
      expect(resolved.source).toBe('shadcn');
      expect(resolved.name).toBe('remote-slider');
      expect(resolved.files[0].path).toBe('RemoteSlider.tsx');
    });

    it('throws LumenError when component is absent from both registries', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      });

      await expect(
        resolveUiComponent('non-existent-xyz-widget', { fetch: mockFetch })
      ).rejects.toThrow(LumenError);

      await expect(
        resolveUiComponent('non-existent-xyz-widget', { fetch: mockFetch })
      ).rejects.toThrow(/was not found in the Lumen Registry or Shadcn fallback/);
    });
  });

  describe('Component generation in project (paths.ui destination)', () => {
    it('generates component in feature-based TypeScript project at paths.ui', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2)
      );

      const result = await executeGenerateUi('button', { cwd: tmpDir });

      expect(result.success).toBe(true);
      expect(result.kind).toBe('ui');
      expect(result.source).toBe('shadcn');
      expect(result.name).toBe('button');
      expect(result.pascalName).toBe('Button');
      expect(result.targetDir).toBe(fixture.manifest.paths.ui);

      const componentFile = path.join(tmpDir, fixture.manifest.paths.ui, 'Button.tsx');
      const indexFile = path.join(tmpDir, fixture.manifest.paths.ui, 'index.ts');
      const utilsFile = path.join(tmpDir, 'src/lib/utils.ts');

      expect(fs.existsSync(componentFile)).toBe(true);
      expect(fs.existsSync(indexFile)).toBe(true);
      expect(fs.existsSync(utilsFile)).toBe(true);

      const buttonCode = fs.readFileSync(componentFile, 'utf8');
      expect(buttonCode).toContain('export interface ButtonProps');
      expect(buttonCode).toContain('const Button = React.forwardRef');
      expect(buttonCode).toContain('export { Button, buttonVariants };');

      const indexCode = fs.readFileSync(indexFile, 'utf8');
      expect(indexCode).toContain("export * from './Button';");

      const utilsCode = fs.readFileSync(utilsFile, 'utf8');
      expect(utilsCode).toContain('export function cn(');

      // Verify TypeScript compiles without diagnostics
      parseTsSmoke(componentFile);
      parseTsSmoke(utilsFile);
      parseTsSmoke(indexFile);
    });

    it('generates Lumen data-table block in feature-based TypeScript project', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2)
      );

      const result = await executeGenerateUi('data-table', { cwd: tmpDir });

      expect(result.source).toBe('lumen');
      expect(result.name).toBe('data-table');
      expect(result.pascalName).toBe('DataTable');

      const tableFile = path.join(tmpDir, fixture.manifest.paths.ui, 'DataTable.tsx');
      expect(fs.existsSync(tableFile)).toBe(true);

      const tableCode = fs.readFileSync(tableFile, 'utf8');
      expect(tableCode).toContain('export function DataTable<TData');
      expect(tableCode).toContain('border-border bg-muted/50');

      parseTsSmoke(tableFile);
    });

    it('generates JavaScript components when tooling.language is js in type-based project', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-type-based');

      const manifest = {
        ...fixture.manifest,
        styling: { engine: 'tailwind' },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app-js', dependencies: {} }, null, 2)
      );

      const result = await executeGenerateUi('card', { cwd: tmpDir });

      expect(result.targetDir).toBe(fixture.manifest.paths.ui); // 'src/ui'

      const cardFile = path.join(tmpDir, fixture.manifest.paths.ui, 'Card.jsx');
      const indexFile = path.join(tmpDir, fixture.manifest.paths.ui, 'index.js');
      const utilsFile = path.join(tmpDir, 'src/lib/utils.js');

      expect(fs.existsSync(cardFile)).toBe(true);
      expect(fs.existsSync(indexFile)).toBe(true);
      expect(fs.existsSync(utilsFile)).toBe(true);

      const cardCode = fs.readFileSync(cardFile, 'utf8');
      expect(cardCode).toContain('export const Card = React.forwardRef(');
      expect(cardCode).not.toContain('React.HTMLAttributes<');
    });

    it('respects custom paths.ui configured in lumen.config.json', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      const manifest = {
        ...fixture.manifest,
        paths: {
          ...fixture.manifest.paths,
          ui: 'src/custom-components/primitives',
        },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2)
      );

      const result = await executeGenerateUi('badge', { cwd: tmpDir });

      expect(result.targetDir).toBe('src/custom-components/primitives');
      const badgeFile = path.join(tmpDir, 'src/custom-components/primitives/Badge.tsx');
      expect(fs.existsSync(badgeFile)).toBe(true);
    });

    it('rejects when paths.ui is not configured in manifest', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const configModule = await import('../../../src/config/index.js');
      vi.spyOn(configModule, 'readConfig').mockReturnValue({
        manifest: fixture.manifest,
        paths: { features: 'src/features' },
        root: tmpDir,
        file: path.join(tmpDir, 'lumen.config.json'),
      });

      await expect(executeGenerateUi('button', { cwd: tmpDir })).rejects.toThrow(LumenError);
      await expect(executeGenerateUi('button', { cwd: tmpDir })).rejects.toThrow(
        /Missing "paths\.ui" in manifest configuration/
      );
    });

    it('rejects when styling.engine is not tailwind', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      const manifest = {
        ...fixture.manifest,
        styling: {
          engine: 'none',
        },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      await expect(executeGenerateUi('button', { cwd: tmpDir })).rejects.toThrow(LumenError);
      await expect(executeGenerateUi('button', { cwd: tmpDir })).rejects.toThrow(
        /UI kit components require styling engine "tailwind"/
      );
    });
  });

  describe('Peer dependencies and package.json management', () => {
    it('adds missing peer dependencies to package.json automatically', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: { react: '^19.0.0' } }, null, 2)
      );

      const result = await executeGenerateUi('button', { cwd: tmpDir });

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['@radix-ui/react-slot']).toBeDefined();
      expect(pkg.dependencies.clsx).toBeDefined();
      expect(pkg.dependencies['tailwind-merge']).toBeDefined();

      const addedSlot = result.packages.find((p) => p.name === '@radix-ui/react-slot');
      expect(addedSlot.added).toBe(true);
      expect(addedSlot.installed).toBe(true);
    });

    it('does not touch package.json if peer dependencies are already installed', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            dependencies: {
              '@radix-ui/react-slot': '^1.1.0',
              clsx: '^2.1.1',
              'tailwind-merge': '^2.5.4',
              'class-variance-authority': '^0.7.1',
            },
          },
          null,
          2
        )
      );

      const result = await executeGenerateUi('button', { cwd: tmpDir });

      const slot = result.packages.find((p) => p.name === '@radix-ui/react-slot');
      expect(slot.added).toBe(false);
      expect(slot.installed).toBe(true);
    });
  });

  describe('Flags: --dry-run and --force', () => {
    it('creates no files on disk and does not modify package.json with --dry-run', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const initialPkg = JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2);
      fs.writeFileSync(path.join(tmpDir, 'package.json'), initialPkg);

      const result = await executeGenerateUi('button', { cwd: tmpDir, dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.created.length).toBeGreaterThan(0);

      // Verify no files exist on disk
      const componentFile = path.join(tmpDir, fixture.manifest.paths.ui, 'Button.tsx');
      expect(fs.existsSync(componentFile)).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'src/lib/utils.ts'))).toBe(false);

      // package.json remains unchanged
      const currentPkg = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');
      expect(currentPkg).toBe(initialPkg);

      expect(stdoutOutput).toContain('[DRY RUN] Plan for UI component "Button"');
    });

    it('outputs structured JSON with --dry-run and -j', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeGenerateUi('card', { cwd: tmpDir, dryRun: true, json: true });

      expect(result.dryRun).toBe(true);
      expect(result.created.length).toBeGreaterThan(0);

      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.name).toBe('card');
      expect(parsed.pascalName).toBe('Card');
    });

    it('skips existing files on re-run without --force and overwrites with --force', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2)
      );

      // First run: files created
      const run1 = await executeGenerateUi('button', { cwd: tmpDir });
      expect(run1.created.length).toBeGreaterThan(0);
      expect(run1.skipped.length).toBe(0);

      const componentFile = path.join(tmpDir, fixture.manifest.paths.ui, 'Button.tsx');
      fs.writeFileSync(componentFile, '// CUSTOM BUTTON CONTENT\n');

      // Second run without force: file skipped
      const run2 = await executeGenerateUi('button', { cwd: tmpDir });
      expect(run2.skipped).toContain(path.posix.join(fixture.manifest.paths.ui, 'Button.tsx'));
      expect(fs.readFileSync(componentFile, 'utf8')).toBe('// CUSTOM BUTTON CONTENT\n');

      // Third run with --force: file overwritten
      const run3 = await executeGenerateUi('button', { cwd: tmpDir, force: true });
      expect(run3.overwritten).toContain(path.posix.join(fixture.manifest.paths.ui, 'Button.tsx'));
      expect(fs.readFileSync(componentFile, 'utf8')).not.toBe('// CUSTOM BUTTON CONTENT\n');
      expect(fs.readFileSync(componentFile, 'utf8')).toContain('export interface ButtonProps');
    });
  });

  describe('Agent context sync (.lumen)', () => {
    it('syncs agent context when agentDocs: true and not in dry-run', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      const manifest = {
        ...fixture.manifest,
        agentDocs: true,
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2)
      );

      await executeGenerateUi('button', { cwd: tmpDir });

      const lumenDir = path.join(tmpDir, '.lumen');
      expect(fs.existsSync(lumenDir)).toBe(true);
    });

    it('does not sync agent context in --dry-run mode even if agentDocs is true', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      const manifest = {
        ...fixture.manifest,
        agentDocs: true,
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      await executeGenerateUi('button', { cwd: tmpDir, dryRun: true });

      const lumenDir = path.join(tmpDir, '.lumen');
      expect(fs.existsSync(lumenDir)).toBe(false);
    });
  });

  describe('Theme token generator (Issue #10: lumen g ui theme-<name>)', () => {
    it('applies theme preset to project themes.css', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeGenerateUi('theme-ocean-breeze', { cwd: tmpDir });

      expect(result.kind).toBe('theme');
      expect(result.theme).toBe('ocean-breeze');
      expect(result.created.length).toBe(1);

      const themeDest = path.join(tmpDir, 'src/shared/styles/themes.css');
      expect(fs.existsSync(themeDest)).toBe(true);

      const css = fs.readFileSync(themeDest, 'utf8');
      expect(css).toContain('Ocean Breeze');
      expect(css).toContain('@theme inline');
      expect(css).toContain('--color-primary');
    });

    it('supports --dry-run when applying a theme', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeGenerateUi('theme-autumn-maple', { cwd: tmpDir, dryRun: true });

      expect(result.dryRun).toBe(true);
      const themeDest = path.join(tmpDir, 'src/shared/styles/themes.css');
      expect(fs.existsSync(themeDest)).toBe(false);
    });

    it('rejects unknown theme preset with helpful error', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await expect(
        executeGenerateUi('theme-invalid-xyz', { cwd: tmpDir })
      ).rejects.toThrow(LumenError);

      await expect(
        executeGenerateUi('theme-invalid-xyz', { cwd: tmpDir })
      ).rejects.toThrow(/Theme "invalid-xyz" not found/);
    });

    it('applies theme directly using executeApplyTheme', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeApplyTheme('calm-lake', { cwd: tmpDir });
      expect(result.theme).toBe('calm-lake');
      expect(result.created.length).toBe(1);
    });
  });

  describe('Exported helper functions unit tests', () => {
    it('fetchLumenRegistry returns built-in component when available', async () => {
      const comp = await fetchLumenRegistry('data-table');
      expect(comp).not.toBeNull();
      expect(comp.name).toBe('data-table');
      expect(comp.source).toBe('lumen');
    });

    it('fetchShadcnRegistry returns built-in primitive when available', async () => {
      const comp = await fetchShadcnRegistry('button');
      expect(comp).not.toBeNull();
      expect(comp.name).toBe('button');
      expect(comp.source).toBe('shadcn');
    });

    it('listUiComponents returns lumen, shadcn, and themes catalogs', () => {
      const catalog = listUiComponents();
      expect(catalog.lumen.length).toBeGreaterThan(0);
      expect(catalog.shadcn.length).toBeGreaterThan(0);
      expect(catalog.themes.length).toBe(13);
    });

    it('checkUiDependencies accurately checks installed packages', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { clsx: '^2.1.1' } }, null, 2)
      );

      const checks = checkUiDependencies(tmpDir, ['clsx', 'tailwind-merge']);
      expect(checks).toEqual([
        { name: 'clsx', installed: true },
        { name: 'tailwind-merge', installed: false },
      ]);
    });

    it('installPeerDependencies writes new packages to package.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} }, null, 2)
      );

      const added = installPeerDependencies(tmpDir, ['clsx', '@radix-ui/react-slot']);
      expect(added).toEqual(['clsx', '@radix-ui/react-slot']);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies.clsx).toBeDefined();
      expect(pkg.dependencies['@radix-ui/react-slot']).toBeDefined();
    });

    it('ensureCnUtil creates cn helper in TypeScript and JavaScript', () => {
      const tsPlan = ensureCnUtil(tmpDir, true);
      expect(tsPlan).not.toBeNull();
      expect(tsPlan.relPath).toBe('src/lib/utils.ts');
      expect(tsPlan.contents).toContain('ClassValue');

      const jsPlan = ensureCnUtil(tmpDir, false);
      expect(jsPlan).not.toBeNull();
      expect(jsPlan.relPath).toBe('src/lib/utils.js');
      expect(jsPlan.contents).not.toContain('ClassValue');
    });
  });
});
