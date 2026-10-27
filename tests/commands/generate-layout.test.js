import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { createCli } from '../../src/cli.js';

describe('lumen g layout command (#54)', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-layout-test-'));
    stdoutOutput = '';

    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
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

  it('scaffolds a layout in Next.js App Router for a route group e.g. (auth)', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
    expect(nextFixture).toBeDefined();

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', '(auth)']);

    const targetDir = nextFixture.manifest.paths.pages;
    const layoutFile = path.join(tmpDir, targetDir, '(auth)', 'layout.tsx');

    expect(fs.existsSync(layoutFile)).toBe(true);
    const content = fs.readFileSync(layoutFile, 'utf8');
    expect(content).toContain('export function AuthLayout');
    expect(content).toContain('children: React.ReactNode');
    expect(content).toContain('export default AuthLayout;');
    expect(content).toContain('data-testid="auth-layout"');
    expect(stdoutOutput).toContain('Layout ready:');
  });

  it('scaffolds root layout in Next.js App Router (lumen g layout root)', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', 'root']);

    const targetDir = nextFixture.manifest.paths.pages;
    const layoutFile = path.join(tmpDir, targetDir, 'layout.tsx');

    expect(fs.existsSync(layoutFile)).toBe(true);
    const content = fs.readFileSync(layoutFile, 'utf8');
    expect(content).toContain('export function RootLayout');
    expect(content).toContain('export default RootLayout;');
  });

  it('supports --client flag to mark layout with "use client"', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', 'dashboard', '--client']);

    const targetDir = nextFixture.manifest.paths.pages;
    const layoutFile = path.join(tmpDir, targetDir, 'dashboard', 'layout.tsx');

    expect(fs.existsSync(layoutFile)).toBe(true);
    const content = fs.readFileSync(layoutFile, 'utf8');
    expect(content.startsWith("'use client';")).toBe(true);
    expect(content).toContain('export function DashboardLayout');
  });

  it('honors --dry-run option and writes no layout files to disk', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', 'admin', '--dry-run']);

    expect(stdoutOutput).toContain('[DRY RUN]');
    const layoutFile = path.join(tmpDir, nextFixture.manifest.paths.pages, 'admin', 'layout.tsx');
    expect(fs.existsSync(layoutFile)).toBe(false);
  });

  it('skips existing layout files without --force, and overwrites with --force', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const layoutFile = path.join(tmpDir, nextFixture.manifest.paths.pages, '(admin)', 'layout.tsx');
    fs.mkdirSync(path.dirname(layoutFile), { recursive: true });
    fs.writeFileSync(layoutFile, '// existing custom layout', 'utf8');

    // Without force -> skip
    const p1 = createCli();
    await p1.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', '(admin)']);
    expect(fs.readFileSync(layoutFile, 'utf8')).toBe('// existing custom layout');
    expect(stdoutOutput).toContain('- SKIP');

    // With force -> overwrite
    const p2 = createCli();
    await p2.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', '(admin)', '--force']);
    expect(stdoutOutput).toContain('! OVERWRITE');
    expect(fs.readFileSync(layoutFile, 'utf8')).toContain('export function AdminLayout');
  });

  it('scaffolds layout in JavaScript when language is js', async () => {
    const fixtures = await loadValidFixtures();
    const baseFixture = fixtures.find((f) => f.manifest.framework?.name === 'next') || fixtures[0];

    const jsManifest = JSON.parse(JSON.stringify(baseFixture.manifest));
    jsManifest.tooling.language = 'js';
    jsManifest.framework = { name: 'next', variant: 'app-router' };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(jsManifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', '(public)']);

    const layoutFile = path.join(tmpDir, jsManifest.paths.pages, '(public)', 'layout.jsx');
    expect(fs.existsSync(layoutFile)).toBe(true);
    const content = fs.readFileSync(layoutFile, 'utf8');
    expect(content).toContain('export function PublicLayout({ children })');
  });

  it('outputs valid JSON when --json / -j is passed', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, '-j', 'g', 'layout', '(private)']);

    const parsed = JSON.parse(stdoutOutput.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.kind).toBe('layout');
    expect(parsed.name).toBe('(private)');
    expect(parsed.created.length).toBe(1);
  });

  it('scaffolds layout in React + Vite projects under paths.components/layouts', async () => {
    const fixtures = await loadValidFixtures();
    const reactFixture = fixtures.find((f) => f.manifest.framework?.name === 'react');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(reactFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', 'auth']);

    const expectedPath = path.join(
      tmpDir,
      reactFixture.manifest.paths.components,
      'layouts',
      'AuthLayout.tsx'
    );
    expect(fs.existsSync(expectedPath)).toBe(true);
    const content = fs.readFileSync(expectedPath, 'utf8');
    expect(content).toContain('export function AuthLayout');
  });

  it('emits root and nested layouts into src/app without duplicate prefixes when paths.pages is "src/app" (#69)', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
    const manifest = {
      ...nextFixture.manifest,
      paths: {
        ...nextFixture.manifest.paths,
        pages: 'src/app',
      },
    };

    fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));

    const program1 = createCli();
    await program1.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', 'root']);

    const rootLayout = path.join(tmpDir, 'src/app/layout.tsx');
    expect(fs.existsSync(rootLayout)).toBe(true);

    const program2 = createCli();
    await program2.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'layout', 'dashboard']);

    const nestedLayout = path.join(tmpDir, 'src/app/dashboard/layout.tsx');
    expect(fs.existsSync(nestedLayout)).toBe(true);

    // Verify no double-prefixing
    expect(fs.existsSync(path.join(tmpDir, 'src/src/app'))).toBe(false);
  });
});
