import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { runCli } from '../../../src/cli.js';
import { LumenError, EXIT } from '../../../src/errors.js';
import {
  loadThemesMetadata,
  getThemePreset,
  loadThemeCss,
  findThemesCssPath,
  mergeThemeIntoCss,
  generateNewThemesCss,
  isThemeApplied,
  checkMissingFontPackages,
  listThemePresets,
  applyThemePreset,
  parseCssDeclarations,
} from '../../../src/commands/generate/theme.js';

describe('Issue #10: UI Theme generator and preset tokens', () => {
  let tmpDir;
  let stdoutOutput;
  let stderrOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-theme-test-'));
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

  async function createTailwindProject({
    preset = 'feature-based',
    language = 'ts',
    withThemesCss = true,
    agentDocs = false,
    customThemesCssContent = null,
  } = {}) {
    const fixtures = await loadValidFixtures();
    const fixture =
      fixtures.find(
        (f) =>
          f.manifest.styling?.engine === 'tailwind' &&
          (f.manifest.architecture?.preset === preset || f.manifest.architecture?.type === preset) &&
          f.manifest.tooling?.language === language
      ) || fixtures.find((f) => f.manifest.styling?.engine === 'tailwind') || fixtures[0];

    const manifest = JSON.parse(JSON.stringify(fixture.manifest));
    manifest.styling = { engine: 'tailwind' };
    if (agentDocs) manifest.agentDocs = true;

    fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-app',
          dependencies: {},
          devDependencies: {},
        },
        null,
        2
      )
    );

    let themesCssRelPath = 'src/shared/styles/themes.css';
    if (manifest.architecture?.preset === 'type-based' || manifest.architecture?.type === 'type-based') {
      themesCssRelPath = 'src/styles/themes.css';
    }

    if (withThemesCss) {
      const themesCssFullPath = path.join(tmpDir, themesCssRelPath);
      fs.mkdirSync(path.dirname(themesCssFullPath), { recursive: true });

      const defaultContent = `/* themes.css — Tailwind v4 theme tokens
 * Synced with ThemeProvider / AppProvider via
 * document.documentElement.dataset.theme and .dark class.
 */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, .dark, .dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --radius: 0.625rem;
}

[data-theme="dark"], .dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.145 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.985 0 0);
  --primary-foreground: oklch(0.205 0 0);
}
`;

      fs.writeFileSync(themesCssFullPath, customThemesCssContent || defaultContent, 'utf8');
    }

    return { manifest, themesCssRelPath };
  }

  describe('Theme metadata & templates discovery', () => {
    it('loads 13 preset themes from themes.json', () => {
      const themes = loadThemesMetadata();
      expect(Array.isArray(themes)).toBe(true);
      expect(themes.length).toBe(13);

      const ids = themes.map((t) => t.id).sort();
      expect(ids).toEqual([
        'autumn-maple',
        'berry-blend',
        'calm-lake',
        'desert-sands',
        'forest-mist',
        'minimal-gray',
        'neon-noir',
        'ocean-breeze',
        'pastel-dream',
        'pebble-beach',
        'professional',
        'retro-vibes',
        'sunset-glow',
      ]);

      for (const theme of themes) {
        expect(theme.id).toBeDefined();
        expect(theme.name).toBeDefined();
        expect(theme.description).toBeDefined();
        expect(Array.isArray(theme.fonts)).toBe(true);
        expect(theme.fonts.length).toBeGreaterThan(0);
      }
    });

    it('loads corresponding CSS template for each theme', () => {
      const themes = loadThemesMetadata();
      for (const theme of themes) {
        const css = loadThemeCss(theme.id);
        expect(css).toContain(`[data-theme="${theme.id}"]`);
        expect(css).toContain(`[data-theme="${theme.id}"].dark`);
        expect(css).toContain('@theme inline');
        expect(css).toContain('@import');
      }
    });

    it('getThemePreset retrieves theme by ID case-insensitively', () => {
      const theme = getThemePreset('autumn-maple');
      expect(theme.id).toBe('autumn-maple');
      expect(theme.name).toBe('Autumn Maple');
      expect(theme.fonts).toEqual(['Fraunces', 'DM Sans']);

      const uppercase = getThemePreset('AUTUMN-MAPLE');
      expect(uppercase.id).toBe('autumn-maple');
    });

    it('getThemePreset throws LumenError for unknown preset ID', () => {
      expect(() => getThemePreset('non-existent-theme')).toThrow(LumenError);
      try {
        getThemePreset('non-existent-theme');
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('Unknown theme preset "non-existent-theme"');
        expect(err.hint).toContain('--list');
      }
    });

    it('getThemePreset throws LumenError when theme name is empty', () => {
      expect(() => getThemePreset('')).toThrow(LumenError);
      expect(() => getThemePreset(null)).toThrow(LumenError);
    });
  });

  describe('Theme listing: lumen g ui theme --list (or -l)', () => {
    it('prints formatted list of all presets with --list flag', async () => {
      await runCli(['node', 'lumen', 'g', 'ui', 'theme', '--list']).finished;
      expect(process.exitCode).toBeUndefined();

      expect(stdoutOutput).toContain('Available theme presets (13):');
      expect(stdoutOutput).toContain('autumn-maple');
      expect(stdoutOutput).toContain('Autumn Maple');
      expect(stdoutOutput).toContain('neon-noir');
      expect(stdoutOutput).toContain('Neon Noir');
      expect(stdoutOutput).toContain('sunset-glow');
      expect(stdoutOutput).toContain('Usage:');
      expect(stdoutOutput).toContain('lumen g ui theme-<name>');
    });

    it('supports -l alias for listing presets', async () => {
      await runCli(['node', 'lumen', 'g', 'ui', 'theme', '-l']).finished;
      expect(process.exitCode).toBeUndefined();
      expect(stdoutOutput).toContain('Available theme presets (13):');
      expect(stdoutOutput).toContain('calm-lake');
    });

    it('supports lumen g ui --list without "theme" keyword', async () => {
      await runCli(['node', 'lumen', 'g', 'ui', '--list']).finished;
      expect(process.exitCode).toBeUndefined();
      expect(stdoutOutput).toContain('Available theme presets (13):');
    });

    it('supports lumen g ui -l', async () => {
      await runCli(['node', 'lumen', 'g', 'ui', '-l']).finished;
      expect(process.exitCode).toBeUndefined();
      expect(stdoutOutput).toContain('Available theme presets (13):');
    });

    it('supports lumen g theme --list via theme alias', async () => {
      await runCli(['node', 'lumen', 'g', 'theme', '--list']).finished;
      expect(process.exitCode).toBeUndefined();
      expect(stdoutOutput).toContain('Available theme presets (13):');
    });

    it('outputs structured JSON when --json flag is provided with --list', async () => {
      await runCli(['node', 'lumen', 'g', 'ui', 'theme', '--list', '--json']).finished;
      expect(process.exitCode).toBeUndefined();

      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.themes)).toBe(true);
      expect(parsed.themes.length).toBe(13);
      expect(parsed.themes.find((t) => t.id === 'calm-lake')).toBeDefined();
    });

    it('programmatic listThemePresets function returns valid response', () => {
      const res = listThemePresets();
      expect(res.success).toBe(true);
      expect(res.list).toBe(true);
      expect(res.themes.length).toBe(13);
    });
  });

  describe('CSS path resolution: findThemesCssPath', () => {
    it('detects existing src/shared/styles/themes.css in feature-based layout', () => {
      const fullPath = path.join(tmpDir, 'src/shared/styles/themes.css');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, '/* test */');

      const resolved = findThemesCssPath(tmpDir, { architecture: { preset: 'feature-based' } });
      expect(resolved).toBe(fullPath);
    });

    it('detects existing src/styles/themes.css in type-based layout', () => {
      const fullPath = path.join(tmpDir, 'src/styles/themes.css');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, '/* test */');

      const resolved = findThemesCssPath(tmpDir, { architecture: { preset: 'type-based' } });
      expect(resolved).toBe(fullPath);
    });

    it('detects existing src/themes.css', () => {
      const fullPath = path.join(tmpDir, 'src/themes.css');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, '/* test */');

      const resolved = findThemesCssPath(tmpDir, {});
      expect(resolved).toBe(fullPath);
    });

    it('falls back to src/shared/styles/themes.css when none exists and feature-based preset is configured', () => {
      const resolved = findThemesCssPath(tmpDir, { architecture: { preset: 'feature-based' } });
      expect(resolved).toBe(path.join(tmpDir, 'src/shared/styles/themes.css'));
    });

    it('falls back to src/styles/themes.css when none exists and type-based preset is configured', () => {
      const resolved = findThemesCssPath(tmpDir, { architecture: { preset: 'type-based' } });
      expect(resolved).toBe(path.join(tmpDir, 'src/styles/themes.css'));
    });
  });

  describe('CSS operations: non-destructive merge & generation', () => {
    it('generateNewThemesCss creates full self-contained Tailwind v4 stylesheet', () => {
      const presetCss = loadThemeCss('autumn-maple');
      const { generatedCss, diff } = generateNewThemesCss({
        themeId: 'autumn-maple',
        themeName: 'Autumn Maple',
        presetCss,
      });

      expect(generatedCss).toContain("@import '@fontsource-variable/fraunces';");
      expect(generatedCss).toContain("@import '@fontsource-variable/dm-sans';");
      expect(generatedCss).toContain('@custom-variant dark');
      expect(generatedCss).toContain('@theme inline');
      expect(generatedCss).toContain(':root, [data-theme="autumn-maple"]');
      expect(generatedCss).toContain('[data-theme="dark"], .dark, [data-theme="autumn-maple"].dark');
      expect(generatedCss).toContain('--background: #FFF9F6;');
      expect(generatedCss).toContain('--radius: 0.875rem;');

      expect(diff.importsAdded.length).toBe(2);
      expect(diff.tokensUpdated).toBeGreaterThan(20);
    });

    it('mergeThemeIntoCss preserves existing custom properties and adds theme tokens', () => {
      const existingCss = `/* Custom app stylesheet */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, .dark, .dark *));

@theme inline {
  --color-background: var(--background);
  --color-custom-brand: #123456;
}

:root {
  --background: #FFFFFF;
  --custom-header-height: 70px;
}

[data-theme="dark"], .dark {
  --background: #000000;
  --custom-header-height: 70px;
}

.custom-card {
  padding: 1rem;
}
`;

      const presetCss = loadThemeCss('calm-lake');
      const { mergedCss, diff } = mergeThemeIntoCss({
        existingCss,
        themeId: 'calm-lake',
        themeName: 'Calm Lake',
        presetCss,
      });

      // Font imports added at top
      expect(mergedCss).toContain("@import '@fontsource-variable/outfit';");
      expect(mergedCss).toContain("@import '@fontsource-variable/inter';");

      // Custom property preserved in @theme inline
      expect(mergedCss).toContain('--color-custom-brand: #123456;');
      expect(mergedCss).toContain('--font-sans:');

      // Custom property preserved in :root
      expect(mergedCss).toContain('--custom-header-height: 70px;');

      // Active tokens updated
      expect(mergedCss).toContain(':root, [data-theme="calm-lake"]');
      expect(mergedCss).toContain('[data-theme="dark"], .dark, [data-theme="calm-lake"].dark');
      expect(mergedCss).toContain('--background: #F8FAFB;');

      // Custom class preserved
      expect(mergedCss).toContain('.custom-card {');

      expect(diff.summary.length).toBeGreaterThan(0);
    });

    it('mergeThemeIntoCss preserves previous theme block when switching themes', () => {
      const existingCss = `/* themes.css */
@import '@fontsource-variable/fraunces';
@import '@fontsource-variable/dm-sans';

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, .dark, .dark *));

@theme inline {
  --font-sans: 'DM Sans Variable', sans-serif;
  --color-background: var(--background);
}

:root, [data-theme="autumn-maple"] {
  --background: #FFF9F6;
  --foreground: #3B2E2A;
}

[data-theme="dark"], .dark, [data-theme="autumn-maple"].dark {
  --background: #3B2E2A;
  --foreground: #FBF7F2;
}
`;

      const presetCss = loadThemeCss('neon-noir');
      const { mergedCss } = mergeThemeIntoCss({
        existingCss,
        themeId: 'neon-noir',
        themeName: 'Neon Noir',
        presetCss,
      });

      // Neon noir is now active
      expect(mergedCss).toContain(':root, [data-theme="neon-noir"]');
      expect(mergedCss).toContain('[data-theme="dark"], .dark, [data-theme="neon-noir"].dark');
      expect(mergedCss).toContain('--background: #F7F9FB;'); // Neon noir light bg

      // Autumn maple is preserved as standalone block
      expect(mergedCss).toContain('[data-theme="autumn-maple"] {');
      expect(mergedCss).toContain('[data-theme="autumn-maple"].dark {');
      expect(mergedCss).toContain('--background: #FFF9F6;'); // Autumn maple light bg preserved
    });

    it('isThemeApplied detects theme presence in CSS', () => {
      const cssWithTheme = `:root, [data-theme="desert-sands"] { --background: #FDFBF7; }`;
      expect(isThemeApplied(cssWithTheme, 'desert-sands')).toBe(true);
      expect(isThemeApplied(cssWithTheme, 'autumn-maple')).toBe(false);
      expect(isThemeApplied('', 'calm-lake')).toBe(false);
    });

    it('checkMissingFontPackages reports fonts missing in package.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            '@fontsource-variable/dm-sans': '^5.0.0',
          },
        })
      );

      const presetCss = loadThemeCss('autumn-maple');
      const { fontPackages, missingPackages } = checkMissingFontPackages(tmpDir, presetCss);

      expect(fontPackages).toContain('@fontsource-variable/fraunces');
      expect(fontPackages).toContain('@fontsource-variable/dm-sans');
      expect(missingPackages).toContain('@fontsource-variable/fraunces');
      expect(missingPackages).not.toContain('@fontsource-variable/dm-sans');
    });
  });

  describe('CLI Command Execution', () => {
    it('applies theme preset via lumen g ui theme-<name>', async () => {
      const { themesCssRelPath } = await createTailwindProject();

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-autumn-maple']).finished;
      expect(process.exitCode).toBeUndefined();

      const themesCssFullPath = path.join(tmpDir, themesCssRelPath);
      expect(fs.existsSync(themesCssFullPath)).toBe(true);

      const updated = fs.readFileSync(themesCssFullPath, 'utf8');
      expect(updated).toContain("@import '@fontsource-variable/fraunces';");
      expect(updated).toContain("@import '@fontsource-variable/dm-sans';");
      expect(updated).toContain(':root, [data-theme="autumn-maple"]');
      expect(updated).toContain('[data-theme="dark"], .dark, [data-theme="autumn-maple"].dark');
      expect(updated).toContain('--background: #FFF9F6;');
      expect(updated).toContain('--radius: 0.875rem;');

      // Tailwind utility bridge check
      expect(updated).toContain("--font-sans: 'DM Sans Variable', sans-serif;");
      expect(updated).toContain("--font-heading: 'Fraunces Variable', serif;");
      expect(updated).toContain('--color-sidebar: var(--sidebar);');

      expect(stdoutOutput).toContain('MERGED');
      expect(stdoutOutput).toContain('autumn-maple');
    });

    it('applies theme preset via lumen g ui theme <name>', async () => {
      const { themesCssRelPath } = await createTailwindProject();

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme', 'berry-blend']).finished;
      expect(process.exitCode).toBeUndefined();

      const updated = fs.readFileSync(path.join(tmpDir, themesCssRelPath), 'utf8');
      expect(updated).toContain(':root, [data-theme="berry-blend"]');
      expect(updated).toContain('--primary: #D6347A;');
    });

    it('creates themes.css if file does not exist on disk', async () => {
      const { themesCssRelPath } = await createTailwindProject({ withThemesCss: false });
      const themesCssFullPath = path.join(tmpDir, themesCssRelPath);
      expect(fs.existsSync(themesCssFullPath)).toBe(false);

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-sunset-glow']).finished;
      expect(process.exitCode).toBeUndefined();

      expect(fs.existsSync(themesCssFullPath)).toBe(true);
      const created = fs.readFileSync(themesCssFullPath, 'utf8');
      expect(created).toContain(':root, [data-theme="sunset-glow"]');
      expect(created).toContain('@custom-variant dark');
      expect(stdoutOutput).toContain('CREATED');
    });

    it('supports --dry-run option and does not write to disk', async () => {
      const { themesCssRelPath } = await createTailwindProject();
      const themesCssFullPath = path.join(tmpDir, themesCssRelPath);
      const originalContent = fs.readFileSync(themesCssFullPath, 'utf8');

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-forest-mist', '--dry-run']).finished;
      expect(process.exitCode).toBeUndefined();

      // File on disk must remain strictly identical
      const currentContent = fs.readFileSync(themesCssFullPath, 'utf8');
      expect(currentContent).toBe(originalContent);

      expect(stdoutOutput).toContain('[DRY RUN]');
      expect(stdoutOutput).toContain('forest-mist');
    });

    it('skips existing theme on re-run without --force', async () => {
      const { themesCssRelPath } = await createTailwindProject();
      const themesCssFullPath = path.join(tmpDir, themesCssRelPath);

      // First run: applies theme
      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-pastel-dream']).finished;
      expect(process.exitCode).toBeUndefined();
      const firstRunContent = fs.readFileSync(themesCssFullPath, 'utf8');
      expect(firstRunContent).toContain(':root, [data-theme="pastel-dream"]');

      stdoutOutput = '';

      // Second run without --force: skips
      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-pastel-dream']).finished;
      expect(process.exitCode).toBeUndefined();
      expect(stdoutOutput).toContain('already applied');
      expect(stdoutOutput).toContain('--force');
    });

    it('parseCssDeclarations parses key-value variables into Map', () => {
      const decls = parseCssDeclarations(`
        --background: #FFF9F6;
        --foreground: #3B2E2A;
        /* ignored comment */
        --radius: 0.875rem;
      `);
      expect(decls.get('--background')).toBe('#FFF9F6');
      expect(decls.get('--foreground')).toBe('#3B2E2A');
      expect(decls.get('--radius')).toBe('0.875rem');
      expect(decls.size).toBe(3);
    });

    it('programmatic applyThemePreset function applies theme and returns result', async () => {
      await createTailwindProject();
      const res = await applyThemePreset({
        cwd: tmpDir,
        themeId: 'autumn-maple',
      });
      expect(res.success).toBe(true);
      expect(res.kind).toBe('ui-theme');
      expect(res.theme.id).toBe('autumn-maple');
      expect(res.action).toBe('merged');
    });

    it('overwrites existing theme on re-run when --force is provided', async () => {
      await createTailwindProject();

      // First run
      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-ocean-breeze']).finished;
      expect(process.exitCode).toBeUndefined();

      stdoutOutput = '';

      // Re-run with --force
      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-ocean-breeze', '--force']).finished;
      expect(process.exitCode).toBeUndefined();
      expect(stdoutOutput).toContain('OVERWRITTEN');
      expect(stdoutOutput).toContain('ocean-breeze');
    });

    it('supports --json flag and outputs structured JSON result', async () => {
      const { themesCssRelPath } = await createTailwindProject();

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-minimal-gray', '--json']).finished;
      expect(process.exitCode).toBeUndefined();

      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.success).toBe(true);
      expect(parsed.kind).toBe('ui-theme');
      expect(parsed.theme.id).toBe('minimal-gray');
      expect(parsed.file).toBe(themesCssRelPath);
      expect(parsed.action).toBe('merged');
      expect(parsed.dryRun).toBe(false);
      expect(parsed.diff).toBeDefined();
    });

    it('supports --json flag with --dry-run and skips disk write', async () => {
      const { themesCssRelPath } = await createTailwindProject();
      const themesCssFullPath = path.join(tmpDir, themesCssRelPath);
      const original = fs.readFileSync(themesCssFullPath, 'utf8');

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-pebble-beach', '--json', '--dry-run']).finished;
      expect(process.exitCode).toBeUndefined();

      const parsed = JSON.parse(stdoutOutput);
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.action).toBe('merged');

      // Verify no changes written
      expect(fs.readFileSync(themesCssFullPath, 'utf8')).toBe(original);
    });

    it('rejects when styling engine is not tailwind', async () => {
      const fixtures = await loadValidFixtures();
      const noneFixture = fixtures.find((f) => f.manifest.styling?.engine === 'none') || fixtures[0];
      const manifest = JSON.parse(JSON.stringify(noneFixture.manifest));
      manifest.styling = { engine: 'none' };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-calm-lake']).finished;
      expect(process.exitCode).toBe(EXIT.USER);
      expect(stderrOutput).toContain('Preset theme tokens require Tailwind v4');
      expect(stderrOutput).toContain('styling.engine = "tailwind"');
    });

    it('rejects when unknown preset theme name is given', async () => {
      await createTailwindProject();

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-cyber-glitch']).finished;
      expect(process.exitCode).toBe(EXIT.USER);
      expect(stderrOutput).toContain('Unknown theme preset "cyber-glitch"');
      expect(stderrOutput).toContain('Available presets:');
      expect(stderrOutput).toContain('--list');
    });

    it('rejects when lumen g ui theme is invoked with no theme name and no --list', async () => {
      await createTailwindProject();

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme']).finished;
      expect(process.exitCode).toBe(EXIT.USER);
      expect(stderrOutput).toContain('Theme preset name is required');
      expect(stderrOutput).toContain('--list');
    });

    it('rejects when lumen g ui is invoked with no arguments', async () => {
      await createTailwindProject();

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui']).finished;
      expect(process.exitCode).toBe(EXIT.USER);
      expect(stderrOutput).toContain('UI component or theme preset name is required');
    });

    it('rejects UI component resolution when not a theme preset (notifying of registry)', async () => {
      await createTailwindProject();

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'button']).finished;
      expect(process.exitCode).toBe(EXIT.USER);
      expect(stderrOutput).toContain('requires the Lumen UI registry');
    });

    it('supports direct preset name without theme- prefix (lumen g ui calm-lake)', async () => {
      const { themesCssRelPath } = await createTailwindProject();

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'calm-lake']).finished;
      expect(process.exitCode).toBeUndefined();

      const updated = fs.readFileSync(path.join(tmpDir, themesCssRelPath), 'utf8');
      expect(updated).toContain(':root, [data-theme="calm-lake"]');
    });

    it('syncs agent context when agentDocs: true', async () => {
      await createTailwindProject({ agentDocs: true });

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-professional']).finished;
      expect(process.exitCode).toBeUndefined();

      const lumenDir = path.join(tmpDir, '.lumen');
      expect(fs.existsSync(lumenDir)).toBe(true);
    });

    it('does not create .lumen when running with --dry-run even if agentDocs is true', async () => {
      await createTailwindProject({ agentDocs: true });

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'ui', 'theme-professional', '--dry-run']).finished;
      expect(process.exitCode).toBeUndefined();

      const lumenDir = path.join(tmpDir, '.lumen');
      expect(fs.existsSync(lumenDir)).toBe(false);
    });
  });
});
