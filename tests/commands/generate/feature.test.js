import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { Command } from 'commander';
import { registerFeature } from '../../../src/commands/generate/feature.js';
import { LumenError, EXIT } from '../../../src/errors.js';

describe('lumen g feature command', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-feature-test-'));
    stdoutOutput = '';

    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    registerFeature(generate);
    return program;
  }

  it('generates a full feature module in TypeScript for feature-based preset', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find(
      (f) => f.manifest.architecture?.preset === 'feature-based' && f.manifest.tooling?.language === 'ts'
    ) || fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'feature', 'billing']);

    const featureDir = path.join(tmpDir, fixture.manifest.paths.features, 'billing');
    expect(fs.existsSync(path.join(featureDir, 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'components', 'Billing.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'hooks', 'useBilling.ts'))).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'types', 'index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'services'))).toBe(true);

    const indexContent = fs.readFileSync(path.join(featureDir, 'index.ts'), 'utf8');
    expect(indexContent).toContain("export * from './components/Billing';");
    expect(indexContent).toContain("export * from './hooks/useBilling';");
    expect(indexContent).toContain("export * from './types/index';");

    const compContent = fs.readFileSync(path.join(featureDir, 'components', 'Billing.tsx'), 'utf8');
    expect(compContent).toContain('Billing: FC<BillingProps>');
    expect(compContent).toContain('data-testid="billing-feature"');
  });

  it('generates a full feature module in JavaScript for type-based preset fallback', async () => {
    const fixtures = await loadValidFixtures();
    const baseFixture = fixtures[0];
    const jsManifest = JSON.parse(JSON.stringify(baseFixture.manifest));
    jsManifest.tooling.language = 'js';
    jsManifest.architecture = { preset: 'type-based', validation: 'strict' };
    jsManifest.paths.features = 'src/features';

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(jsManifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'feature', 'user-profile']);

    const featureDir = path.join(tmpDir, 'src/features', 'user-profile');
    expect(fs.existsSync(path.join(featureDir, 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'components', 'UserProfile.jsx'))).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'hooks', 'useUserProfile.js'))).toBe(true);
    expect(fs.existsSync(path.join(featureDir, 'types', 'index.js'))).toBe(true);

    const indexContent = fs.readFileSync(path.join(featureDir, 'index.js'), 'utf8');
    expect(indexContent).toContain("export * from './components/UserProfile';");
    expect(indexContent).toContain("export * from './hooks/useUserProfile';");
  });

  it('throws LumenError when architecture preset is "none"', async () => {
    const fixtures = await loadValidFixtures();
    const noneManifest = JSON.parse(JSON.stringify(fixtures[0].manifest));
    noneManifest.architecture = { preset: 'none' };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(noneManifest, null, 2)
    );

    const program = createTestProgram();
    await expect(
      program.parseAsync(['node', 'lumen', 'g', 'feature', 'orders'])
    ).rejects.toThrow(LumenError);

    try {
      await program.parseAsync(['node', 'lumen', 'g', 'feature', 'orders']);
    } catch (err) {
      expect(err.code).toBe(EXIT.USER);
      expect(err.message).toContain('architecture preset is "none"');
      expect(err.message).toContain('feature-based or type-based fallback');
      expect(err.message).not.toContain('hybrid');
    }
  });

  it('respects --dry-run and creates no files on disk', async () => {
    const fixtures = await loadValidFixtures();
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixtures[0].manifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'feature', 'checkout', '--dry-run']);

    expect(stdoutOutput).toContain('[DRY RUN]');
    const featureDir = path.join(tmpDir, fixtures[0].manifest.paths.features, 'checkout');
    expect(fs.existsSync(featureDir)).toBe(false);
  });

  it('skips existing files on re-run without --force, overwrites with --force', async () => {
    const fixtures = await loadValidFixtures();
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixtures[0].manifest, null, 2)
    );

    const program1 = createTestProgram();
    await program1.parseAsync(['node', 'lumen', 'g', 'feature', 'dashboard']);

    const compFile = path.join(tmpDir, fixtures[0].manifest.paths.features, 'dashboard', 'components', 'Dashboard.tsx');
    expect(fs.existsSync(compFile)).toBe(true);
    fs.writeFileSync(compFile, '// custom user changes');

    // Re-run without --force
    stdoutOutput = '';
    const program2 = createTestProgram();
    await program2.parseAsync(['node', 'lumen', 'g', 'feature', 'dashboard']);
    expect(fs.readFileSync(compFile, 'utf8')).toBe('// custom user changes');
    expect(stdoutOutput).toContain('SKIP');

    // Re-run with --force
    stdoutOutput = '';
    const program3 = createTestProgram();
    await program3.parseAsync(['node', 'lumen', 'g', 'feature', 'dashboard', '--force']);
    expect(fs.readFileSync(compFile, 'utf8')).not.toBe('// custom user changes');
    expect(stdoutOutput).toContain('OVERWRITE');
  });

  it('prints hints for --with-store and --with-service', async () => {
    const fixtures = await loadValidFixtures();
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixtures[0].manifest, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync([
      'node',
      'lumen',
      'g',
      'feature',
      'auth',
      '--with-store',
      '--with-service',
      '--dry-run',
    ]);

    expect(stdoutOutput).toContain('Hint: Use "lumen g store auth"');
    expect(stdoutOutput).toContain('Hint: Use "lumen g service auth"');
  });

  it('skips test generation with a note when package.json lacks vitest', async () => {
    const fixtures = await loadValidFixtures();
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixtures[0].manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-test-app', dependencies: {} }, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'feature', 'search', '--with-tests']);

    expect(stdoutOutput).toContain('Skipped test generation: vitest was not found in project dependencies');
    const testFile = path.join(tmpDir, fixtures[0].manifest.paths.features, 'search', 'components', 'Search.test.tsx');
    expect(fs.existsSync(testFile)).toBe(false);
  });

  it('generates test file when --with-tests is provided and vitest is in package.json', async () => {
    const fixtures = await loadValidFixtures();
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixtures[0].manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-test-app', devDependencies: { vitest: '^2.0.0' } }, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'feature', 'search', '--with-tests']);

    const testFile = path.join(tmpDir, fixtures[0].manifest.paths.features, 'search', 'components', 'Search.test.tsx');
    expect(fs.existsSync(testFile)).toBe(true);
    const content = fs.readFileSync(testFile, 'utf8');
    expect(content).toContain("describe('Search component'");
  });

  it('smokes tests that emitted .ts/.tsx files parse if typescript is available', async () => {
    const fixtures = await loadValidFixtures();
    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixtures[0].manifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ devDependencies: { vitest: '^2.0.0' } })
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'feature', 'smoke', '--with-tests']);

    let ts;
    try {
      ts = await import('typescript');
    } catch {
      // typescript not installed in node_modules, skip smoke assertion as per task requirements
      return;
    }

    if (ts && ts.transpileModule) {
      const files = [
        path.join(tmpDir, fixtures[0].manifest.paths.features, 'smoke', 'index.ts'),
        path.join(tmpDir, fixtures[0].manifest.paths.features, 'smoke', 'components', 'Smoke.tsx'),
        path.join(tmpDir, fixtures[0].manifest.paths.features, 'smoke', 'hooks', 'useSmoke.ts'),
        path.join(tmpDir, fixtures[0].manifest.paths.features, 'smoke', 'types', 'index.ts'),
        path.join(tmpDir, fixtures[0].manifest.paths.features, 'smoke', 'components', 'Smoke.test.tsx'),
      ];

      for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        expect(() => {
          ts.transpileModule(source, {
            compilerOptions: { jsx: ts.JsxEmit?.ReactJSX || 4 },
          });
        }).not.toThrow();
      }
    }
  });

  it('keeps AGENTS.md in sync after feature generation when agentDocs: true (#31, #63)', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find(
      (f) => f.manifest.architecture?.preset === 'feature-based' && f.manifest.paths?.features
    ) || fixtures[0];

    const manifestWithAgentDocs = {
      ...fixture.manifest,
      agentDocs: true,
    };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifestWithAgentDocs, null, 2)
    );

    const program1 = createTestProgram();
    await program1.parseAsync(['node', 'lumen', 'g', 'feature', 'orders']);

    const agentsMd = path.join(tmpDir, 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.lumen'))).toBe(false);
    const content1 = fs.readFileSync(agentsMd, 'utf8');
    expect(content1).toContain('Single Source of Truth (SSOT)');
    expect(content1).toContain('lumen.config.json');

    // Generate a second feature and ensure AGENTS.md is maintained
    const program2 = createTestProgram();
    await program2.parseAsync(['node', 'lumen', 'g', 'feature', 'auth']);

    expect(fs.existsSync(agentsMd)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.lumen'))).toBe(false);
    const content2 = fs.readFileSync(agentsMd, 'utf8');
    expect(content2).toContain('Single Source of Truth (SSOT)');
  });

  it('does not create or modify AGENTS.md when agentDocs is false (#31, #63)', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    const manifestWithoutAgentDocs = {
      ...fixture.manifest,
      agentDocs: false,
    };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifestWithoutAgentDocs, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'feature', 'products']);

    const agentsMd = path.join(tmpDir, 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(false);
  });

  it('does not create AGENTS.md when running with --dry-run even if agentDocs is true (#31, #63)', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    const manifestWithAgentDocs = {
      ...fixture.manifest,
      agentDocs: true,
    };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifestWithAgentDocs, null, 2)
    );

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'feature', 'checkout', '--dry-run']);

    const agentsMd = path.join(tmpDir, 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(false);
  });
});
