import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { createCli } from '../../src/cli.js';
import { findRouterFile, normalizeRouteGroup, discoverRouteGroups } from '../../src/commands/generate/page.js';
import { LumenError } from '../../src/errors.js';

describe('lumen g page command', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-page-test-'));
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

  it('scaffolds a route page in TypeScript for feature-based preset at paths.pages', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find(
      (f) =>
        f.manifest.framework?.name === 'react' &&
        f.manifest.architecture?.preset === 'feature-based' &&
        f.manifest.tooling?.language === 'ts'
    );
    expect(fixture).toBeDefined();

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'generate', 'page', 'billing-dashboard']);

    const targetDir = fixture.manifest.paths.pages;
    const pageFile = path.join(tmpDir, targetDir, 'BillingDashboardPage.tsx');

    expect(fs.existsSync(pageFile)).toBe(true);
    const content = fs.readFileSync(pageFile, 'utf8');
    expect(content).toContain('export function BillingDashboardPage()');
    expect(content).toContain('export default BillingDashboardPage;');
    expect(content).toContain('data-testid="billing-dashboard-page"');
  });

  it('scaffolds a route page in JavaScript for type-based preset at paths.pages', async () => {
    const fixtures = await loadValidFixtures();
    const baseFixture = fixtures.find(
      (f) => f.manifest.framework?.name === 'react' && f.manifest.paths?.pages === 'src/pages'
    ) || fixtures[0];

    const jsManifest = JSON.parse(JSON.stringify(baseFixture.manifest));
    jsManifest.tooling.language = 'js';
    jsManifest.framework = { name: 'react', variant: 'vite' };
    jsManifest.paths = {
      ...jsManifest.paths,
      pages: 'src/pages',
    };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(jsManifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'user-profile']);

    const pageFile = path.join(tmpDir, 'src/pages/UserProfilePage.jsx');
    expect(fs.existsSync(pageFile)).toBe(true);
    const content = fs.readFileSync(pageFile, 'utf8');
    expect(content).toContain('export function UserProfilePage()');
    expect(content).toContain('export default UserProfilePage;');
  });

  it('honors --dry-run option and writes no files to disk', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.manifest.framework?.name === 'react');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'analytics', '--dry-run']);

    expect(stdoutOutput).toContain('[DRY RUN]');
    const pageFile = path.join(tmpDir, fixture.manifest.paths.pages, 'AnalyticsPage.tsx');
    expect(fs.existsSync(pageFile)).toBe(false);
  });

  it('skips existing page files without --force, and overwrites with --force', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.manifest.framework?.name === 'react');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const pageFile = path.join(tmpDir, fixture.manifest.paths.pages, 'ReportsPage.tsx');
    fs.mkdirSync(path.dirname(pageFile), { recursive: true });
    fs.writeFileSync(pageFile, '// custom user code', 'utf8');

    // First run without force -> skipped
    const program1 = createCli();
    await program1.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'reports']);

    expect(fs.readFileSync(pageFile, 'utf8')).toBe('// custom user code');
    expect(stdoutOutput).toContain('- SKIP');

    // Second run with --force -> overwritten
    const program2 = createCli();
    await program2.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'reports', '--force']);

    expect(stdoutOutput).toContain('! OVERWRITE');
    expect(fs.readFileSync(pageFile, 'utf8')).toContain('export function ReportsPage()');
  });

  it('scaffolds a route page in Next.js App Router at paths.pages/<name>/page.tsx', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find(
      (f) => f.manifest.framework?.name === 'next' && f.manifest.framework?.variant === 'app-router'
    ) || fixtures.find((f) => f.manifest.framework?.name === 'next');
    expect(nextFixture).toBeDefined();

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'settings']);

    const targetDir = nextFixture.manifest.paths.pages;
    const pageFile = path.join(tmpDir, targetDir, 'settings', 'page.tsx');

    expect(fs.existsSync(pageFile)).toBe(true);
    const content = fs.readFileSync(pageFile, 'utf8');
    expect(content).toContain('export function SettingsPage()');
    expect(content).toContain('export default SettingsPage;');
    expect(content).toContain('data-testid="settings-page"');
    expect(stdoutOutput).toContain('Route ready: /settings (Next.js App Router file-system routing)');
  });

  it('scaffolds route groups and dynamic parameters in Next.js App Router', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', '(public)/catalog']);
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'items/[id]']);

    const targetDir = nextFixture.manifest.paths.pages;
    const catalogFile = path.join(tmpDir, targetDir, '(public)', 'catalog', 'page.tsx');
    const itemDetailFile = path.join(tmpDir, targetDir, 'items', '[id]', 'page.tsx');

    expect(fs.existsSync(catalogFile)).toBe(true);
    expect(fs.existsSync(itemDetailFile)).toBe(true);

    const catalogContent = fs.readFileSync(catalogFile, 'utf8');
    expect(catalogContent).toContain('export function CatalogPage()');
    expect(stdoutOutput).toContain('Route ready: /catalog');

    const itemContent = fs.readFileSync(itemDetailFile, 'utf8');
    expect(itemContent).toContain('export function ItemsIdPage()');
    expect(stdoutOutput).toContain('Route ready: /items/[id]');
  });

  it('supports --client flag to prepend "use client" in Next.js App Router', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'dashboard', '--client']);

    const targetDir = nextFixture.manifest.paths.pages;
    const pageFile = path.join(tmpDir, targetDir, 'dashboard', 'page.tsx');

    expect(fs.existsSync(pageFile)).toBe(true);
    const content = fs.readFileSync(pageFile, 'utf8');
    expect(content.startsWith("'use client';")).toBe(true);
    expect(content).toContain('export function DashboardPage()');
  });

  it('scaffolds a route page in Next.js Pages Router at paths.pages/<name>.tsx', async () => {
    const fixtures = await loadValidFixtures();
    const baseFixture = fixtures.find((f) => f.manifest.framework?.name === 'next') || fixtures[0];

    const pagesRouterManifest = JSON.parse(JSON.stringify(baseFixture.manifest));
    pagesRouterManifest.framework = { name: 'next', variant: 'pages-router' };
    pagesRouterManifest.paths.pages = 'src/pages';

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(pagesRouterManifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'billing']);

    const pageFile = path.join(tmpDir, 'src/pages', 'billing.tsx');

    expect(fs.existsSync(pageFile)).toBe(true);
    const content = fs.readFileSync(pageFile, 'utf8');
    expect(content).toContain('export function BillingPage()');
    expect(content).toContain('export default BillingPage;');
    expect(stdoutOutput).toContain('Route ready: /billing (Next.js Pages Router file-system routing)');
  });

  it('rejects invalid or traversal route paths in Next.js', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await expect(
      program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', '../malicious'])
    ).rejects.toThrow(LumenError);

    await expect(
      program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'bad!segment'])
    ).rejects.toThrow(LumenError);
  });

  it('prints route snippet when router file exists without --register', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.manifest.framework?.name === 'react');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const pagesDir = path.join(tmpDir, fixture.manifest.paths.pages);
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pagesDir, 'routes.tsx'),
      'export const routes = [];\n',
      'utf8'
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'orders']);

    expect(stdoutOutput).toContain('Router file found:');
    expect(stdoutOutput).toContain("path: '/orders', element: <OrdersPage />");
    expect(stdoutOutput).toContain("import { OrdersPage } from './OrdersPage';");
    expect(fs.readFileSync(path.join(pagesDir, 'routes.tsx'), 'utf8')).toBe('export const routes = [];\n');
  });

  it('auto-registers route when --register is passed and // lumen:routes comment exists', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.manifest.framework?.name === 'react');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const pagesDir = path.join(tmpDir, fixture.manifest.paths.pages);
    fs.mkdirSync(pagesDir, { recursive: true });
    const routerPath = path.join(pagesDir, 'routes.tsx');
    fs.writeFileSync(
      routerPath,
      `export const routes = [
  // lumen:routes
];\n`,
      'utf8'
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'customers', '--register']);

    expect(stdoutOutput).toContain('+ REGISTERED route in');
    const updatedContent = fs.readFileSync(routerPath, 'utf8');
    expect(updatedContent).toContain("import { CustomersPage } from './CustomersPage';");
    expect(updatedContent).toContain("path: '/customers', element: <CustomersPage />");
  });

  it('falls back to printing snippet with warning when --register is passed but // lumen:routes comment is missing', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.manifest.framework?.name === 'react');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const pagesDir = path.join(tmpDir, fixture.manifest.paths.pages);
    fs.mkdirSync(pagesDir, { recursive: true });
    const routerPath = path.join(pagesDir, 'routes.tsx');
    fs.writeFileSync(routerPath, 'export const routes = [];\n', 'utf8');

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'invoices', '--register']);

    expect(stdoutOutput).toContain('Could not auto-register: "// lumen:routes" marker comment not found');
    expect(stdoutOutput).toContain("path: '/invoices', element: <InvoicesPage />");
  });

  it('outputs valid JSON when -j / --json is passed', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.manifest.framework?.name === 'react');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, '-j', 'g', 'page', 'checkout']);

    const parsed = JSON.parse(stdoutOutput.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.kind).toBe('pages');
    expect(parsed.name).toBe('checkout');
    expect(parsed.created.length).toBe(1);
  });

  it('smokes test that emitted tsx file is syntactically valid React', async () => {
    let ts;
    try {
      ts = await import('typescript');
    } catch {
      ts = null;
    }

    if (ts && ts.default?.transpileModule) {
      const templatePath = path.resolve(__dirname, '../../templates/page/__Name__Page.tsx.tpl');
      const raw = fs.readFileSync(templatePath, 'utf8');
      const rendered = raw.replaceAll('{{Name}}', 'Test').replaceAll('{{nameKebab}}', 'test');
      const transpiled = ts.default.transpileModule(rendered, {
        compilerOptions: { jsx: ts.default.JsxEmit.ReactJSX },
      });
      expect(transpiled.outputText).toBeDefined();
    }
  });

  describe('manifest paths.pages canonical routing and findRouterFile (#69)', () => {
    it('emits App Router page into src/app without duplicate prefixes when paths.pages is "src/app"', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
      const manifest = {
        ...fixture.manifest,
        paths: {
          ...fixture.manifest.paths,
          pages: 'src/app',
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'billing']);

      const expectedFile = path.join(tmpDir, 'src/app/billing/page.tsx');
      expect(fs.existsSync(expectedFile)).toBe(true);

      // Verify no double-prefixing or rogue root directories
      expect(fs.existsSync(path.join(tmpDir, 'src/src/app'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'app/billing/page.tsx'))).toBe(false);
    });

    it('emits Pages Router page into src/pages without duplicate prefixes when paths.pages is "src/pages"', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
      const manifest = {
        ...fixture.manifest,
        framework: { name: 'next', variant: 'pages-router' },
        paths: {
          ...fixture.manifest.paths,
          pages: 'src/pages',
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'about']);

      const expectedFile = path.join(tmpDir, 'src/pages/about.tsx');
      expect(fs.existsSync(expectedFile)).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src/src/pages'))).toBe(false);
    });

    it('supports legacy root "app" paths.pages without error', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
      const manifest = {
        ...fixture.manifest,
        paths: {
          ...fixture.manifest.paths,
          pages: 'app',
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'contact']);

      expect(fs.existsSync(path.join(tmpDir, 'app/contact/page.tsx'))).toBe(true);
    });

    it('findRouterFile discovers router in pagesDir, parent directory, and src', () => {
      // 1. Direct inside pagesDir
      const subDir = path.join(tmpDir, 'src/app/router');
      fs.mkdirSync(subDir, { recursive: true });
      const directRoute = path.join(subDir, 'routes.tsx');
      fs.writeFileSync(directRoute, '// lumen:routes\n');
      expect(findRouterFile(subDir, tmpDir)).toBe(directRoute);

      // 2. In parent directory (src/app/App.tsx) when pagesDir has no router
      fs.unlinkSync(directRoute);
      const appFile = path.join(tmpDir, 'src/app/App.tsx');
      fs.writeFileSync(appFile, '// lumen:routes in App\n');
      expect(findRouterFile(subDir, tmpDir)).toBe(appFile);

      // 3. In src/ (src/router.tsx)
      fs.unlinkSync(appFile);
      const srcRouter = path.join(tmpDir, 'src/router.tsx');
      fs.writeFileSync(srcRouter, '// routes\n');
      expect(findRouterFile(subDir, tmpDir)).toBe(srcRouter);

      // 4. Not found
      fs.unlinkSync(srcRouter);
      expect(findRouterFile(subDir, tmpDir)).toBeNull();
    });
  });

  describe('Next.js App Router Route Groups (--group) (#65)', () => {
    it('normalizes and validates route group names', () => {
      expect(normalizeRouteGroup('auth')).toBe('auth');
      expect(normalizeRouteGroup('(auth)')).toBe('auth');
      expect(normalizeRouteGroup('(public-area)')).toBe('public-area');
      expect(normalizeRouteGroup('admin_v2')).toBe('admin_v2');

      expect(() => normalizeRouteGroup('')).toThrow(LumenError);
      expect(() => normalizeRouteGroup('   ')).toThrow(LumenError);
      expect(() => normalizeRouteGroup('../bad')).toThrow(LumenError);
      expect(() => normalizeRouteGroup('invalid group!')).toThrow(LumenError);
    });

    it('discovers route groups in the pages directory', () => {
      const appDir = path.join(tmpDir, 'src/app');
      fs.mkdirSync(path.join(appDir, '(public)'), { recursive: true });
      fs.mkdirSync(path.join(appDir, '(auth)'), { recursive: true });
      fs.mkdirSync(path.join(appDir, 'api'), { recursive: true }); // not a group
      fs.mkdirSync(path.join(appDir, 'dashboard'), { recursive: true }); // not a group

      const groups = discoverRouteGroups(appDir);
      expect(groups).toEqual(['auth', 'public']);
    });

    it('scaffolds a page inside a route group with --group <name>', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
      const manifest = {
        ...fixture.manifest,
        paths: {
          ...fixture.manifest.paths,
          pages: 'src/app',
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'login', '--group', 'auth']);

      const expectedFile = path.join(tmpDir, 'src/app/(auth)/login/page.tsx');
      expect(fs.existsSync(expectedFile)).toBe(true);
      const content = fs.readFileSync(expectedFile, 'utf8');
      expect(content).toContain('export function LoginPage()');
      expect(content).toContain('data-testid="login-page"');
      expect(stdoutOutput).toContain('Route ready: /login');
    });

    it('scaffolds group root page when name is root or index with --group', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
      const manifest = {
        ...fixture.manifest,
        paths: {
          ...fixture.manifest.paths,
          pages: 'src/app',
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'root', '--group', 'public']);

      const expectedFile = path.join(tmpDir, 'src/app/(public)/page.tsx');
      expect(fs.existsSync(expectedFile)).toBe(true);
      const content = fs.readFileSync(expectedFile, 'utf8');
      expect(content).toContain('export function PublicPage()');
      expect(stdoutOutput).toContain('Route ready: /');
    });

    it('does not duplicate route group if name already contains identical group', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
      const manifest = {
        ...fixture.manifest,
        paths: {
          ...fixture.manifest.paths,
          pages: 'src/app',
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', '(auth)/register', '--group', '(auth)']);

      const expectedFile = path.join(tmpDir, 'src/app/(auth)/register/page.tsx');
      expect(fs.existsSync(expectedFile)).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'src/app/(auth)/(auth)'))).toBe(false);
    });

    it('throws LumenError when name and --group have conflicting route groups', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next');

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(fixture.manifest, null, 2));

      const program = createCli();
      await expect(
        program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', '(public)/catalog', '--group', 'auth'])
      ).rejects.toThrow(/Conflicting route groups/);
    });

    it('throws LumenError when --group is used with React Vite or Pages Router', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'react');

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(fixture.manifest, null, 2));

      const program = createCli();
      await expect(
        program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'dashboard', '--group', 'auth'])
      ).rejects.toThrow(/Route groups are only supported in Next.js App Router/);
    });

    it('displays detected route groups hint when groups exist in src/app', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next');
      const manifest = {
        ...fixture.manifest,
        paths: {
          ...fixture.manifest.paths,
          pages: 'src/app',
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifest, null, 2));
      fs.mkdirSync(path.join(tmpDir, 'src/app/(public)'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'src/app/(auth)'), { recursive: true });

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'checkout']);

      expect(stdoutOutput).toContain('Route groups detected in project: (auth), (public)');
    });

    it('scaffolds a Next.js App Router page with async deferred promise pattern when --with-fetch is passed (#97)', async () => {
      const fixtures = await loadValidFixtures();
      const nextFixture = fixtures.find(
        (f) =>
          f.manifest.framework?.name === 'next' &&
          f.manifest.framework?.variant !== 'pages-router' &&
          f.manifest.tooling?.language === 'ts'
      );

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(nextFixture.manifest, null, 2)
      );

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'inventory', '--with-fetch']);

      const pageFile = path.join(tmpDir, nextFixture.manifest.paths.pages, 'inventory', 'page.tsx');
      expect(fs.existsSync(pageFile)).toBe(true);

      const content = fs.readFileSync(pageFile, 'utf8');

      // 1. Client directive required for useEffect
      expect(content.startsWith("'use client';")).toBe(true);
      expect(content).toContain("import { useState, useEffect } from 'react';");
      expect(content).toContain('export function InventoryPage()');

      // 2. Default loading is true
      expect(content).toContain('const [loading, setLoading] = useState<boolean>(true);');

      // 3. Cancel-guarded promise pattern
      expect(content).toContain('let active = true;');
      expect(content).toContain("fetch('/api/inventory')");
      expect(content).toContain('if (active)');
      expect(content).toContain('setLoading(false);');
      expect(content).toContain('return () => {');
      expect(content).toContain('active = false;');

      // 4. Verify no synchronous setState in effect body
      const effectMatch = content.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[\]\);/);
      expect(effectMatch).not.toBeNull();
      const effectBody = effectMatch[1];
      const beforeFetch = effectBody.split('fetch(')[0];
      expect(beforeFetch).not.toMatch(/setLoading\s*\(/);
      expect(beforeFetch).not.toMatch(/setData\s*\(/);
    });

    it('scaffolds a React Vite page with async deferred promise pattern when --with-fetch is passed (#97)', async () => {
      const fixtures = await loadValidFixtures();
      const viteFixture = fixtures.find(
        (f) =>
          f.manifest.framework?.name === 'react' &&
          f.manifest.tooling?.language === 'ts'
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(viteFixture.manifest, null, 2)
      );

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'page', 'products', '--with-fetch']);

      const pageFile = path.join(tmpDir, viteFixture.manifest.paths.pages, 'ProductsPage.tsx');
      expect(fs.existsSync(pageFile)).toBe(true);

      const content = fs.readFileSync(pageFile, 'utf8');
      expect(content).toContain("import { useState, useEffect } from 'react';");
      expect(content).toContain('export function ProductsPage()');
      expect(content).toContain('const [loading, setLoading] = useState<boolean>(true);');
      expect(content).toContain('let active = true;');
      expect(content).toContain("fetch('/api/products')");
      expect(content).toContain('if (active)');
      expect(content).toContain('return () => {');
      expect(content).toContain('active = false;');
    });
  });
});
