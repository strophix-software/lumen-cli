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
  resolveRegistryDependencyTree,
  fetchLumenRegistry,
  fetchShadcnRegistry,
  fetchFromRegistryUrl,
  listUiComponents,
  checkUiDependencies,
  installPeerDependencies,
  ensureCnUtil,
  executeApplyTheme,
  findComponentsJson,
  readComponentsJson,
  parseComponentIdentifier,
  resolveAliasToPath,
  rewriteUtilsImport,
  applyRscDirective,
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

    it('findComponentsJson and readComponentsJson find and parse components.json', () => {
      expect(readComponentsJson(tmpDir)).toBeNull();
      expect(findComponentsJson(tmpDir)).toBeNull();

      const sampleConfig = {
        style: 'new-york',
        rsc: true,
        aliases: {
          utils: '@/shared/utils/cn',
          ui: '@/components/ui',
        },
        registries: {
          '@lumen': 'https://custom-registry.lumen.dev/r',
        },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'components.json'),
        JSON.stringify(sampleConfig, null, 2)
      );

      const parsed = readComponentsJson(tmpDir);
      expect(parsed).toEqual(sampleConfig);

      // Verify nested subfolder walking up to project root
      const subDir = path.join(tmpDir, 'src', 'features', 'auth');
      fs.mkdirSync(subDir, { recursive: true });
      expect(readComponentsJson(subDir)).toEqual(sampleConfig);
    });

    it('fetchFromRegistryUrl fetches component JSON from specified registry base URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          name: 'navbar',
          type: 'block',
          files: [{ path: 'Navbar.tsx', contentTs: 'export function Navbar() {}' }],
        }),
      });

      const res = await fetchFromRegistryUrl('https://example.com/r', 'navbar', { fetch: mockFetch });
      expect(res).not.toBeNull();
      expect(res.name).toBe('navbar');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/r/navbar.json',
        expect.any(Object)
      );
    });

    it('parseComponentIdentifier extracts scope and component name', () => {
      expect(parseComponentIdentifier('button')).toEqual({
        scope: null,
        name: 'button',
        raw: 'button',
      });

      expect(parseComponentIdentifier('@lumen/app-shell')).toEqual({
        scope: '@lumen',
        name: 'app-shell',
        raw: '@lumen/app-shell',
      });

      expect(parseComponentIdentifier('@shadcn/dialog')).toEqual({
        scope: '@shadcn',
        name: 'dialog',
        raw: '@shadcn/dialog',
      });

      expect(parseComponentIdentifier('@acme_corp/hero-banner')).toEqual({
        scope: '@acme_corp',
        name: 'hero-banner',
        raw: '@acme_corp/hero-banner',
      });

      expect(() => parseComponentIdentifier('@bad scope/button')).toThrow(LumenError);
    });

    it('resolveAliasToPath resolves @/ and ~/ to relative paths', () => {
      // tmpDir has no src directory yet
      expect(resolveAliasToPath('@/components/ui', tmpDir)).toBe('components/ui');

      // Now create src directory in tmpDir
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      expect(resolveAliasToPath('@/components/ui', tmpDir)).toBe('src/components/ui');
      expect(resolveAliasToPath('~/shared/utils/cn', tmpDir)).toBe('src/shared/utils/cn');
      expect(resolveAliasToPath('src/custom/path', tmpDir)).toBe('src/custom/path');
    });

    it('rewriteUtilsImport rewrites @/lib/utils to target alias', () => {
      const code = `import { cn } from "@/lib/utils";\nimport { foo } from '@/lib/utils';\n`;
      const rewritten = rewriteUtilsImport(code, '@/shared/utils/cn');
      expect(rewritten).toContain('import { cn } from "@/shared/utils/cn";');
      expect(rewritten).toContain("import { foo } from '@/shared/utils/cn';");

      // No rewrite if target alias is default @/lib/utils
      expect(rewriteUtilsImport(code, '@/lib/utils')).toBe(code);
    });

    it('applyRscDirective applies or strips use client based on rsc setting', () => {
      const interactiveCode = `import { useState } from "react";\nexport function Counter() { const [c, setC] = useState(0); return <div/>; }`;
      const nonInteractiveCode = `export function Label() { return <span>Label</span>; }`;
      const existingClientCode = `'use client';\n\nimport { useState } from "react";`;

      // rsc: true adds 'use client' to interactive components
      const withRsc = applyRscDirective(interactiveCode, true);
      expect(withRsc.startsWith("'use client';\n\n")).toBe(true);

      // rsc: true does not duplicate 'use client' if already present
      expect(applyRscDirective(existingClientCode, true)).toBe(existingClientCode);

      // rsc: true does not add 'use client' to pure non-interactive components
      expect(applyRscDirective(nonInteractiveCode, true)).toBe(nonInteractiveCode);

      // rsc: false strips 'use client'
      const stripped = applyRscDirective(existingClientCode, false);
      expect(stripped.startsWith("'use client'")).toBe(false);
      expect(stripped).toContain('import { useState } from "react";');
    });
  });

  describe('components.json full integration (Punto 2)', () => {
    it('uses custom Lumen registry from components.json registries["@lumen"]', async () => {
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

      const customRegistryUrl = 'https://custom-registry.strophix.dev/r';
      fs.writeFileSync(
        path.join(tmpDir, 'components.json'),
        JSON.stringify(
          {
            registries: {
              '@lumen': customRegistryUrl,
            },
          },
          null,
          2
        )
      );

      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.startsWith(customRegistryUrl)) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              name: 'custom-card',
              type: 'block',
              dependencies: ['clsx'],
              files: [
                {
                  path: 'CustomCard.tsx',
                  contentTs: 'export function CustomCard() { return <div>Custom Card</div>; }',
                },
              ],
            }),
          };
        }
        return { status: 404, ok: false };
      });

      const result = await executeGenerateUi('custom-card', {
        cwd: tmpDir,
        fetch: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('lumen');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('custom-registry.strophix.dev'),
        expect.any(Object)
      );
      expect(fs.existsSync(path.join(tmpDir, fixture.manifest.paths.ui, 'CustomCard.tsx'))).toBe(true);
    });

    it('resolves scoped component @lumen/button and @shadcn/dialog', async () => {
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

      const resultLumen = await executeGenerateUi('@lumen/data-table', { cwd: tmpDir });
      expect(resultLumen.source).toBe('lumen');
      expect(resultLumen.scope).toBe('@lumen');
      expect(resultLumen.name).toBe('data-table');
      expect(resultLumen.fullName).toBe('@lumen/data-table');
      expect(fs.existsSync(path.join(tmpDir, fixture.manifest.paths.ui, 'DataTable.tsx'))).toBe(true);

      const resultShadcn = await executeGenerateUi('@shadcn/button', { cwd: tmpDir });
      expect(resultShadcn.source).toBe('shadcn');
      expect(resultShadcn.scope).toBe('@shadcn');
      expect(resultShadcn.name).toBe('button');
      expect(resultShadcn.fullName).toBe('@shadcn/button');
      expect(fs.existsSync(path.join(tmpDir, fixture.manifest.paths.ui, 'Button.tsx'))).toBe(true);
    });

    it('resolves custom scoped component @my-org/widget from components.json registries', async () => {
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

      const orgRegistryUrl = 'https://registry.my-org.io/r';
      fs.writeFileSync(
        path.join(tmpDir, 'components.json'),
        JSON.stringify(
          {
            registries: {
              '@my-org': orgRegistryUrl,
            },
          },
          null,
          2
        )
      );

      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.startsWith(orgRegistryUrl)) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              name: 'widget',
              type: 'block',
              dependencies: ['clsx'],
              files: [
                {
                  path: 'Widget.tsx',
                  contentTs: 'export function Widget() { return <div>My Org Widget</div>; }',
                },
              ],
            }),
          };
        }
        return { status: 404, ok: false };
      });

      const result = await executeGenerateUi('@my-org/widget', {
        cwd: tmpDir,
        fetch: mockFetch,
      });

      expect(result.source).toBe('@my-org');
      expect(result.scope).toBe('@my-org');
      expect(result.name).toBe('widget');
      expect(fs.existsSync(path.join(tmpDir, fixture.manifest.paths.ui, 'Widget.tsx'))).toBe(true);
    });

    it('rejects scoped component when scope is not configured in components.json', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await expect(
        executeGenerateUi('@unconfigured-scope/hero', { cwd: tmpDir })
      ).rejects.toThrow(LumenError);

      await expect(
        executeGenerateUi('@unconfigured-scope/hero', { cwd: tmpDir })
      ).rejects.toThrow(/Registry for scope "@unconfigured-scope" is not configured/);
    });

    it('rewrites utils import and creates utility at custom aliases.utils path', async () => {
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

      // Create src directory
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'components.json'),
        JSON.stringify(
          {
            aliases: {
              utils: '@/shared/utils/cn',
            },
          },
          null,
          2
        )
      );

      const result = await executeGenerateUi('button', { cwd: tmpDir });
      expect(result.success).toBe(true);

      const customCnPath = path.join(tmpDir, 'src/shared/utils/cn.ts');
      expect(fs.existsSync(customCnPath)).toBe(true);

      const buttonPath = path.join(tmpDir, fixture.manifest.paths.ui, 'Button.tsx');
      const buttonCode = fs.readFileSync(buttonPath, 'utf8');
      expect(buttonCode).toContain('from "@/shared/utils/cn"');
      expect(buttonCode).not.toContain('from "@/lib/utils"');
    });

    it('falls back to components.json aliases.ui when paths.ui is not in lumen.config.json', async () => {
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

      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'components.json'),
        JSON.stringify(
          {
            aliases: {
              ui: '@/components/ui',
            },
          },
          null,
          2
        )
      );

      const configModule = await import('../../../src/config/index.js');
      vi.spyOn(configModule, 'readConfig').mockReturnValue({
        manifest: fixture.manifest,
        paths: {
          features: 'src/features',
          components: 'src/components',
          services: 'src/services',
          hooks: 'src/hooks',
          pages: 'src/pages',
          // Note: ui omitted
        },
        root: tmpDir,
        file: path.join(tmpDir, 'lumen.config.json'),
      });

      const result = await executeGenerateUi('button', { cwd: tmpDir });
      expect(result.success).toBe(true);
      expect(result.targetDir).toBe('src/components/ui');
      expect(fs.existsSync(path.join(tmpDir, 'src/components/ui/Button.tsx'))).toBe(true);
    });

    it('prepends "use client" directive when rsc: true in components.json', async () => {
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

      fs.writeFileSync(
        path.join(tmpDir, 'components.json'),
        JSON.stringify(
          {
            rsc: true,
          },
          null,
          2
        )
      );

      const result = await executeGenerateUi('button', { cwd: tmpDir });
      expect(result.success).toBe(true);

      const buttonPath = path.join(tmpDir, fixture.manifest.paths.ui, 'Button.tsx');
      const buttonCode = fs.readFileSync(buttonPath, 'utf8');
      expect(buttonCode.startsWith("'use client';\n\n")).toBe(true);
    });

    it('shows registry source in --list output and includes registries in json', async () => {
      const customUrl = 'https://custom-registry.strophix.dev/r';
      fs.writeFileSync(
        path.join(tmpDir, 'components.json'),
        JSON.stringify(
          {
            registries: {
              '@lumen': customUrl,
              '@acme': 'https://acme.org/r',
            },
          },
          null,
          2
        )
      );

      const res = await executeGenerateUi(undefined, {
        cwd: tmpDir,
        list: true,
        json: true,
      });

      expect(res.registry).toBe(customUrl);
      expect(res.registries).toEqual({
        '@lumen': customUrl,
        '@acme': 'https://acme.org/r',
      });

      // Human output
      stdoutOutput = '';
      await executeGenerateUi(undefined, { cwd: tmpDir, list: true });
      expect(stdoutOutput).toContain('(from components.json)');
      expect(stdoutOutput).toContain(customUrl);
    });
  });

  describe('Registry resolution hierarchy, fallback notices, and recursive dependencies', () => {
    it('resolves 1st degree by default from Lumen Registry without fallback metadata', async () => {
      const resolved = await resolveUiComponent('data-table');
      expect(resolved.source).toBe('lumen');
      expect(resolved.scope).toBe('@lumen');
      expect(resolved.degree).toBe(1);
      expect(resolved.fallback).toBeNull();
    });

    it('resolves 2nd degree transparently with contingency notice for Shadcn base primitives', async () => {
      const resolved = await resolveUiComponent('button');
      expect(resolved.source).toBe('shadcn');
      expect(resolved.scope).toBe('@shadcn');
      expect(resolved.degree).toBe(2);
      expect(resolved.fallback).toEqual({
        active: true,
        degree: 2,
        from: 'lumen',
        to: 'shadcn',
        message: 'Component "button" was not found in Lumen Registry. Using Shadcn UI fallback as contingency.',
      });
    });

    it('resolves 3rd degree fallback to other registries in components.json with warning notice', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('acme-ui.dev')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              name: 'fancy-banner',
              type: 'block',
              dependencies: ['clsx'],
              files: [
                {
                  path: 'FancyBanner.tsx',
                  contentTs: 'export function FancyBanner() { return <div>Banner</div>; }',
                },
              ],
            }),
          };
        }
        return { status: 404, ok: false };
      });

      const componentsConfig = {
        registries: {
          '@acme': 'https://acme-ui.dev/r',
        },
      };

      const resolved = await resolveUiComponent('fancy-banner', {
        fetch: mockFetch,
        componentsConfig,
      });

      expect(resolved.source).toBe('@acme');
      expect(resolved.scope).toBe('@acme');
      expect(resolved.degree).toBe(3);
      expect(resolved.fallback).toEqual({
        active: true,
        degree: 3,
        from: 'lumen/shadcn',
        to: '@acme',
        message: 'Component "fancy-banner" resolved from third-party registry "@acme".',
      });
    });

    it('respects explicit scoped pattern without degree fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ status: 404, ok: false });
      const componentsConfig = {
        registries: {
          '@acme': 'https://acme-ui.dev/r',
        },
      };

      // Explicit @acme/button should NOT fall back to Shadcn button
      await expect(
        resolveUiComponent('@acme/button', {
          fetch: mockFetch,
          componentsConfig,
        })
      ).rejects.toThrow(LumenError);

      await expect(
        resolveUiComponent('@acme/button', {
          fetch: mockFetch,
          componentsConfig,
        })
      ).rejects.toThrow(/Component "button" was not found in registry "@acme"/);
    });

    it('prints informational notice on 2nd-degree fallback in human output', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(fixture.manifest, null, 2));
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2));

      stdoutOutput = '';
      await executeGenerateUi('button', { cwd: tmpDir });
      expect(stdoutOutput).toContain('ℹ Notice: Component "button" was not found in Lumen Registry. Using Shadcn UI fallback as contingency.');
      expect(stdoutOutput).not.toContain('⚠ Warning:');
    });

    it('prints warning notice on 3rd-degree fallback in human output', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(fixture.manifest, null, 2));
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2));

      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('third-party.dev')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              name: 'notification-badge',
              type: 'primitive',
              dependencies: ['clsx'],
              files: [
                {
                  path: 'NotificationBadge.tsx',
                  contentTs: 'export function NotificationBadge() { return <span>badge</span>; }',
                },
              ],
            }),
          };
        }
        return { status: 404, ok: false };
      });

      fs.writeFileSync(
        path.join(tmpDir, 'components.json'),
        JSON.stringify(
          {
            registries: {
              '@third-party': 'https://third-party.dev/r',
            },
          },
          null,
          2
        )
      );

      stdoutOutput = '';
      await executeGenerateUi('notification-badge', { cwd: tmpDir, fetch: mockFetch });
      expect(stdoutOutput).toContain('⚠ Warning: Component "notification-badge" resolved from third-party registry "@third-party".');
      expect(stdoutOutput).not.toContain('ℹ Notice:');
    });

    it('resolves recursive registry dependencies tree', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('hero-banner')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              name: 'hero-banner',
              registryDependencies: ['button', '@acme/card'],
              files: [{ path: 'HeroBanner.tsx', contentTs: 'export const Hero = () => null;' }],
            }),
          };
        }
        if (url.includes('card')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              name: 'card',
              scope: '@acme',
              registryDependencies: ['button'],
              files: [{ path: 'Card.tsx', contentTs: 'export const Card = () => null;' }],
            }),
          };
        }
        return { status: 404, ok: false };
      });

      const componentsConfig = {
        registries: {
          '@acme': 'https://acme.org/r',
        },
      };

      const rootComponent = {
        name: 'hero-banner',
        scope: '@lumen',
        source: 'lumen',
        registryDependencies: ['button', '@acme/card'],
        files: [{ path: 'HeroBanner.tsx', contentTs: 'export const Hero = () => null;' }],
      };

      const tree = await resolveRegistryDependencyTree(rootComponent, {
        fetch: mockFetch,
        componentsConfig,
      });

      const names = tree.map((c) => c.name);
      expect(names).toEqual(['hero-banner', 'button', 'card']);
      expect(tree.find((c) => c.name === 'button').source).toBe('shadcn');
      expect(tree.find((c) => c.name === 'card').source).toBe('@acme');
    });

    it('generates all recursive dependency files and updates index barrel in executeGenerateUi', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(fixture.manifest, null, 2));
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2));

      const mockFetch = vi.fn().mockImplementation(async (url) => {
        if (url.includes('stats-view')) {
          return {
            status: 200,
            ok: true,
            json: async () => ({
              name: 'stats-view',
              type: 'block',
              registryDependencies: ['button'],
              dependencies: ['recharts'],
              files: [
                {
                  path: 'StatsView.tsx',
                  contentTs: 'import { Button } from "./Button";\nexport function StatsView() { return <Button />; }',
                },
              ],
            }),
          };
        }
        return { status: 404, ok: false };
      });

      const result = await executeGenerateUi('stats-view', {
        cwd: tmpDir,
        fetch: mockFetch,
        json: true,
      });

      expect(result.success).toBe(true);
      expect(result.name).toBe('stats-view');
      expect(result.registryDependencies).toHaveLength(1);
      expect(result.registryDependencies[0].name).toBe('button');
      expect(result.registryDependencies[0].source).toBe('shadcn');

      // Both components generated on disk
      const statsViewFile = path.join(tmpDir, fixture.manifest.paths.ui, 'StatsView.tsx');
      const buttonFile = path.join(tmpDir, fixture.manifest.paths.ui, 'Button.tsx');
      const indexFile = path.join(tmpDir, fixture.manifest.paths.ui, 'index.ts');

      expect(fs.existsSync(statsViewFile)).toBe(true);
      expect(fs.existsSync(buttonFile)).toBe(true);
      expect(fs.existsSync(indexFile)).toBe(true);

      const indexContent = fs.readFileSync(indexFile, 'utf8');
      expect(indexContent).toContain("export * from './StatsView';");
      expect(indexContent).toContain("export * from './Button';");
    });
  });
});
