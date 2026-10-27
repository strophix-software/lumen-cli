import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { createCli } from '../../src/cli.js';
import { LumenError } from '../../src/errors.js';

describe('lumen g route command (#53)', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-route-test-'));
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

  it('scaffolds a Next.js App Router route handler with GET and POST methods by default', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
    expect(nextFixture).toBeDefined();

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'users']);

    const targetDir = nextFixture.manifest.paths.pages;
    const routeFile = path.join(tmpDir, targetDir, 'api', 'users', 'route.ts');

    expect(fs.existsSync(routeFile)).toBe(true);
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain('export async function GET(');
    expect(content).toContain('export async function POST(');
    expect(content).toContain("import { NextResponse } from 'next/server';");
    expect(stdoutOutput).toContain('Route Handler ready: /api/users [GET, POST]');
  });

  it('scaffolds route handler with dynamic parameters and RouteContext typing', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'api', 'users/[id]']);

    const targetDir = nextFixture.manifest.paths.pages;
    const routeFile = path.join(tmpDir, targetDir, 'api', 'users', '[id]', 'route.ts');

    expect(fs.existsSync(routeFile)).toBe(true);
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain('type RouteContext');
    expect(content).toContain('id: string');
    expect(content).toContain('const { id } = await context.params');
  });

  it('supports custom HTTP methods e.g. GET,POST,PUT,DELETE', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync([
      'node',
      'lumen',
      '-c',
      tmpDir,
      'g',
      'route',
      'products',
      '--methods',
      'GET,POST,PUT,DELETE',
    ]);

    const targetDir = nextFixture.manifest.paths.pages;
    const routeFile = path.join(tmpDir, targetDir, 'api', 'products', 'route.ts');

    expect(fs.existsSync(routeFile)).toBe(true);
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain('export async function GET(');
    expect(content).toContain('export async function POST(');
    expect(content).toContain('export async function PUT(');
    expect(content).toContain('export async function DELETE(');
    expect(stdoutOutput).toContain('[GET, POST, PUT, DELETE]');
  });

  it('injects authorization check pattern when --auth is passed', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync([
      'node',
      'lumen',
      '-c',
      tmpDir,
      'g',
      'route',
      'auth/refresh',
      '--methods',
      'POST',
      '--auth',
    ]);

    const targetDir = nextFixture.manifest.paths.pages;
    const routeFile = path.join(tmpDir, targetDir, 'api', 'auth', 'refresh', 'route.ts');

    expect(fs.existsSync(routeFile)).toBe(true);
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain("request.cookies.get('token')");
    expect(content).toContain('{ status: 401 }');
  });

  it('rejects in React + Vite projects with actionable LumenError hint', async () => {
    const fixtures = await loadValidFixtures();
    const reactFixture = fixtures.find((f) => f.manifest.framework?.name === 'react');
    expect(reactFixture).toBeDefined();

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(reactFixture.manifest, null, 2)
    );

    const program = createCli();
    await expect(
      program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'users'])
    ).rejects.toThrow(LumenError);

    try {
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'users']);
    } catch (err) {
      expect(err.message).toContain('API Route Handlers are a Next.js App Router feature');
      expect(err.hint).toContain('lumen g service');
    }
  });

  it('honors --dry-run option and creates no files on disk', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'bids', '--dry-run']);

    expect(stdoutOutput).toContain('[DRY RUN]');
    const routeFile = path.join(tmpDir, nextFixture.manifest.paths.pages, 'api', 'bids', 'route.ts');
    expect(fs.existsSync(routeFile)).toBe(false);
  });

  it('skips existing route files without --force, and overwrites with --force', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const routeFile = path.join(tmpDir, nextFixture.manifest.paths.pages, 'api', 'status', 'route.ts');
    fs.mkdirSync(path.dirname(routeFile), { recursive: true });
    fs.writeFileSync(routeFile, '// existing code', 'utf8');

    // Without force -> skip
    const p1 = createCli();
    await p1.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'status']);
    expect(fs.readFileSync(routeFile, 'utf8')).toBe('// existing code');
    expect(stdoutOutput).toContain('- SKIP');

    // With force -> overwrite
    const p2 = createCli();
    await p2.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'status', '--force']);
    expect(stdoutOutput).toContain('! OVERWRITE');
    expect(fs.readFileSync(routeFile, 'utf8')).toContain('export async function GET');
  });

  it('scaffolds route handler in JavaScript when language is js', async () => {
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
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'orders']);

    const routeFile = path.join(tmpDir, jsManifest.paths.pages, 'api', 'orders', 'route.js');
    expect(fs.existsSync(routeFile)).toBe(true);
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).not.toContain('NextRequest');
  });

  it('outputs structured JSON when --json is passed', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, '-j', 'g', 'route', 'metrics']);

    const parsed = JSON.parse(stdoutOutput.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.kind).toBe('route');
    expect(parsed.endpoint).toBe('metrics');
    expect(parsed.created.length).toBe(1);
  });

  it('rejects invalid HTTP methods with LumenError', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await expect(
      program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'test', '--methods', 'FOO'])
    ).rejects.toThrow(LumenError);
  });

  it('rejects traversal in endpoint path with LumenError', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await expect(
      program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', '../escape'])
    ).rejects.toThrow(LumenError);
  });

  it('emits route handler into src/app without duplicate prefixes when paths.pages is "src/app" (#69)', async () => {
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

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'route', 'analytics']);

    const routeFile = path.join(tmpDir, 'src/app/api/analytics/route.ts');
    expect(fs.existsSync(routeFile)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src/src/app'))).toBe(false);
  });
});
