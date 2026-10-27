import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { Command } from 'commander';
import { registerUi, executeGenerateUi } from '../../src/commands/generate/ui.js';

describe('lumen g ui - barrel index sync (#96)', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-ui-barrel-test-'));
    stdoutOutput = '';
    process.exitCode = undefined;

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
    registerUi(generate);
    return program;
  }

  it('updates existing index.ts with new export without requiring --force', async () => {
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

    const uiDir = path.join(tmpDir, fixture.manifest.paths.ui);
    fs.mkdirSync(uiDir, { recursive: true });

    // Pre-populate index.ts with an initial export
    const indexFile = path.join(uiDir, 'index.ts');
    fs.writeFileSync(indexFile, "export * from './Button';\n", 'utf8');

    // Generate metric-card without --force
    const result = await executeGenerateUi('metric-card', {
      cwd: tmpDir,
      json: true,
    });

    expect(result.success).toBe(true);

    // Component file was created
    const metricCardFile = path.join(uiDir, 'MetricCard.tsx');
    expect(fs.existsSync(metricCardFile)).toBe(true);

    // index.ts was updated with the new export and NOT skipped
    const indexRelPath = path.posix.join(fixture.manifest.paths.ui, 'index.ts');
    expect(result.skipped).not.toContain(indexRelPath);
    expect(result.overwritten).toContain(indexRelPath);

    const indexContent = fs.readFileSync(indexFile, 'utf8');
    expect(indexContent).toContain("export * from './Button';");
    expect(indexContent).toContain("export * from './MetricCard';");
  });

  it('updates existing index.js with new export in a JavaScript project without --force', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-type-based');
    const jsManifest = JSON.parse(JSON.stringify(fixture.manifest));
    jsManifest.tooling.language = 'js';
    jsManifest.styling = { engine: 'tailwind' };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(jsManifest, null, 2)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2)
    );

    const uiDir = path.join(tmpDir, jsManifest.paths.ui);
    fs.mkdirSync(uiDir, { recursive: true });

    // Pre-populate index.js with an initial export
    const indexFile = path.join(uiDir, 'index.js');
    fs.writeFileSync(indexFile, "export * from './Button';\n", 'utf8');

    // Generate stat-card without --force
    const result = await executeGenerateUi('stat-card', {
      cwd: tmpDir,
      json: true,
    });

    expect(result.success).toBe(true);

    const statCardFile = path.join(uiDir, 'StatCard.jsx');
    expect(fs.existsSync(statCardFile)).toBe(true);

    const indexRelPath = path.posix.join(jsManifest.paths.ui, 'index.js');
    expect(result.skipped).not.toContain(indexRelPath);
    expect(result.overwritten).toContain(indexRelPath);

    const indexContent = fs.readFileSync(indexFile, 'utf8');
    expect(indexContent).toContain("export * from './Button';");
    expect(indexContent).toContain("export * from './StatCard';");
  });

  it('updates existing index.js when present in a TypeScript project without --force', async () => {
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

    const uiDir = path.join(tmpDir, fixture.manifest.paths.ui);
    fs.mkdirSync(uiDir, { recursive: true });

    // Existing barrel is index.js
    const indexFile = path.join(uiDir, 'index.js');
    fs.writeFileSync(indexFile, "export * from './Badge';\n", 'utf8');

    const result = await executeGenerateUi('auth-card', {
      cwd: tmpDir,
      json: true,
    });

    expect(result.success).toBe(true);

    const indexRelPath = path.posix.join(fixture.manifest.paths.ui, 'index.js');
    expect(result.skipped).not.toContain(indexRelPath);
    expect(result.overwritten).toContain(indexRelPath);

    const indexContent = fs.readFileSync(indexFile, 'utf8');
    expect(indexContent).toContain("export * from './Badge';");
    expect(indexContent).toContain("export * from './AuthCard';");
  });

  it('does not duplicate export if already present in index.ts', async () => {
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

    const uiDir = path.join(tmpDir, fixture.manifest.paths.ui);
    fs.mkdirSync(uiDir, { recursive: true });

    const indexFile = path.join(uiDir, 'index.ts');
    fs.writeFileSync(
      indexFile,
      "export * from './Button';\nexport * from './MetricCard';\n",
      'utf8'
    );

    const result = await executeGenerateUi('metric-card', {
      cwd: tmpDir,
      json: true,
    });

    expect(result.success).toBe(true);

    const indexRelPath = path.posix.join(fixture.manifest.paths.ui, 'index.ts');
    expect(result.overwritten).not.toContain(indexRelPath);

    const indexContent = fs.readFileSync(indexFile, 'utf8');
    const matches = indexContent.match(/export \* from '\.\/MetricCard';/g);
    expect(matches).toHaveLength(1);
  });

  it('updates existing index.ts via CLI command invocation', async () => {
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

    const uiDir = path.join(tmpDir, fixture.manifest.paths.ui);
    fs.mkdirSync(uiDir, { recursive: true });

    const indexFile = path.join(uiDir, 'index.ts');
    fs.writeFileSync(indexFile, "export * from './Button';\n", 'utf8');

    const program = createTestProgram();
    await program.parseAsync(['node', 'lumen', 'g', 'ui', 'page-header', '-c', tmpDir]);

    expect(stdoutOutput).toContain('! OVERWRITE');
    expect(stdoutOutput).toContain('index.ts');

    const indexContent = fs.readFileSync(indexFile, 'utf8');
    expect(indexContent).toContain("export * from './Button';");
    expect(indexContent).toContain("export * from './PageHeader';");
  });

  it('respects --dry-run without modifying existing index.ts on disk', async () => {
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

    const uiDir = path.join(tmpDir, fixture.manifest.paths.ui);
    fs.mkdirSync(uiDir, { recursive: true });

    const indexFile = path.join(uiDir, 'index.ts');
    const initialContent = "export * from './Button';\n";
    fs.writeFileSync(indexFile, initialContent, 'utf8');

    const result = await executeGenerateUi('empty-state', {
      cwd: tmpDir,
      dryRun: true,
      json: true,
    });

    expect(result.dryRun).toBe(true);
    const indexRelPath = path.posix.join(fixture.manifest.paths.ui, 'index.ts');
    expect(result.overwritten).toContain(indexRelPath);

    // On disk, index.ts was NOT modified
    const diskContent = fs.readFileSync(indexFile, 'utf8');
    expect(diskContent).toBe(initialContent);
  });
});
