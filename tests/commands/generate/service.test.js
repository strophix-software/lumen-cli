import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { runCli } from '../../../src/cli.js';
import { detectHttpClient, calculateRelativeImport } from '../../../src/generators/detect-stack.js';

describe('lumen generate service command', () => {
  let tmpDir;
  let stdoutOutput;
  let stderrOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-service-test-'));
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

  describe('detectHttpClient helper', () => {
    it('detects fetch by default if no axios in package.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2)
      );

      const result = detectHttpClient(tmpDir, 'src/services');
      expect(result.client).toBe('fetch');
      expect(result.hasCustomClient).toBe(false);
      expect(result.importStatement).toContain('BASE_URL');
    });

    it('detects axios when in dependencies without custom instance', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: { axios: '^1.7.0' } }, null, 2)
      );

      const result = detectHttpClient(tmpDir, 'src/services');
      expect(result.client).toBe('axios');
      expect(result.hasCustomClient).toBe(false);
      expect(result.importStatement).toContain('// TODO: Import your configured axios instance');
    });

    it('detects axios with custom instance at shared/lib/axios.ts', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: { axios: '^1.7.0' } }, null, 2)
      );
      fs.mkdirSync(path.join(tmpDir, 'src/shared/lib'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src/shared/lib/axios.ts'), 'export default {};');

      const result = detectHttpClient(tmpDir, 'src/shared/services');
      expect(result.client).toBe('axios');
      expect(result.hasCustomClient).toBe(true);
      expect(result.importStatement).toBe("import api from '../lib/axios';");
    });

    it('detects custom fetch client at shared/lib/api.ts', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-app', dependencies: {} }, null, 2)
      );
      fs.mkdirSync(path.join(tmpDir, 'src/shared/lib'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src/shared/lib/api.ts'), 'export const apiClient = {};');

      const result = detectHttpClient(tmpDir, 'src/shared/services');
      expect(result.client).toBe('fetch');
      expect(result.hasCustomClient).toBe(true);
      expect(result.importStatement).toBe("import { apiClient } from '../lib/api';");
    });

    it('calculates posix relative import correctly', () => {
      expect(calculateRelativeImport('src/shared/services', 'src/shared/lib/axios.ts')).toBe('../lib/axios');
      expect(calculateRelativeImport('src/services', 'src/lib/api.ts')).toBe('../lib/api');
      expect(calculateRelativeImport('src/features/auth/services', 'src/shared/lib/axios.ts')).toBe('../../../shared/lib/axios');
    });
  });

  describe('CLI execution and templates', () => {
    it('generates TypeScript service in feature-based preset with CRUD methods', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find(
        (f) => f.name === 'react-vite-feature-based' || (f.manifest.architecture?.type === 'feature-based' && f.manifest.tooling?.language === 'ts')
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: {} }, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'user']).finished;
      expect(process.exitCode).toBeUndefined();

      const servicePath = path.join(tmpDir, fixture.manifest.paths.services, 'user.service.ts');
      expect(fs.existsSync(servicePath)).toBe(true);

      const content = fs.readFileSync(servicePath, 'utf8');
      expect(content).toContain('export interface User {');
      expect(content).toContain('id: string;');
      expect(content).toContain('export const userService = {');
      expect(content).toContain('async get(): Promise<User[]>');
      expect(content).toContain('async getById(id: string): Promise<User>');
      expect(content).toContain('async create(data: CreateUserInput): Promise<User>');
      expect(content).toContain('async update(id: string, data: UpdateUserInput): Promise<User>');
      expect(content).toContain('async delete(id: string): Promise<void>');
      // Without --with-mocks, mocks should not be created
      expect(fs.existsSync(path.join(tmpDir, fixture.manifest.paths.services, 'user.mocks.ts'))).toBe(false);
    });

    it('generates JavaScript service in type-based preset', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find(
        (f) => f.name === 'react-vite-type-based' || f.manifest.tooling?.language === 'js'
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: {} }, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'generate', 'service', 'product']).finished;
      expect(process.exitCode).toBeUndefined();

      const servicePath = path.join(tmpDir, fixture.manifest.paths.services, 'product.service.js');
      expect(fs.existsSync(servicePath)).toBe(true);

      const content = fs.readFileSync(servicePath, 'utf8');
      expect(content).toContain('export const productService = {');
      expect(content).toContain('async get()');
      expect(content).toContain('async getById(id)');
      expect(content).toContain('async create(data)');
      expect(content).toContain('async update(id, data)');
      expect(content).toContain('async delete(id)');
    });

    it('generates service with --paginated options', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find(
        (f) => f.manifest.tooling?.language === 'ts'
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: { axios: '^1.7.0' } }, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'order', '--paginated']).finished;
      expect(process.exitCode).toBeUndefined();

      const servicePath = path.join(tmpDir, fixture.manifest.paths.services, 'order.service.ts');
      const content = fs.readFileSync(servicePath, 'utf8');

      expect(content).toContain('export interface OrderListParams');
      expect(content).toContain('export interface PageResult<T>');
      expect(content).toContain('async get(params?: OrderListParams): Promise<PageResult<Order>>');
      expect(content).toContain('api.get(BASE_PATH, { params })');
    });

    it('generates service with --with-mocks option', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find(
        (f) => f.manifest.tooling?.language === 'ts'
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'item', '--with-mocks']).finished;
      expect(process.exitCode).toBeUndefined();

      const servicePath = path.join(tmpDir, fixture.manifest.paths.services, 'item.service.ts');
      const mocksPath = path.join(tmpDir, fixture.manifest.paths.services, 'item.mocks.ts');

      expect(fs.existsSync(servicePath)).toBe(true);
      expect(fs.existsSync(mocksPath)).toBe(true);

      const mocksContent = fs.readFileSync(mocksPath, 'utf8');
      expect(mocksContent).toContain("import { Item } from './item.service';");
      expect(mocksContent).toContain('export const mockItem: Item = {');
      expect(mocksContent).toContain('export const mockItemList: Item[] = [');
    });

    it('scopes service to feature when --feature is passed', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find(
        (f) => f.name === 'react-vite-feature-based'
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'billing', '--feature', 'billing-feature']).finished;
      expect(process.exitCode).toBeUndefined();

      const expectedDir = path.join(tmpDir, fixture.manifest.paths.features, 'billing-feature', 'services');
      const serviceFile = path.join(expectedDir, 'billing.service.ts');
      expect(fs.existsSync(serviceFile)).toBe(true);
    });

    it('fails with LumenError if --feature is passed on a preset that does not support features', async () => {
      const fixtures = await loadValidFixtures();
      const noneFixture = fixtures.find(
        (f) => f.name === 'react-vite-none' || f.manifest.architecture?.type === 'none'
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(noneFixture.manifest, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'billing', '--feature', 'auth']).finished;
      expect(process.exitCode).toBe(1);
      expect(stderrOutput).toContain('feature architecture is not supported');
    });

    it('supports --dry-run without creating any files on disk', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'payment', '--dry-run']).finished;
      expect(process.exitCode).toBeUndefined();

      const servicePath = path.join(tmpDir, fixture.manifest.paths.services, 'payment.service.ts');
      expect(fs.existsSync(servicePath)).toBe(false);
    });

    it('does not clobber existing files unless --force is specified', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find(
        (f) => f.manifest.tooling?.language === 'ts'
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const targetPath = path.join(tmpDir, fixture.manifest.paths.services, 'customer.service.ts');
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, '// CUSTOM ORIGINAL CONTENT', 'utf8');

      // Run without --force
      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'customer']).finished;
      expect(process.exitCode).toBeUndefined();
      expect(fs.readFileSync(targetPath, 'utf8')).toBe('// CUSTOM ORIGINAL CONTENT');

      // Run with --force
      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'customer', '--force']).finished;
      expect(process.exitCode).toBeUndefined();
      expect(fs.readFileSync(targetPath, 'utf8')).toContain('export const customerService = {');
    });

    it('outputs JSON when -j is passed', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, '-j', 'g', 'service', 'session']).finished;
      expect(process.exitCode).toBeUndefined();

      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.kind).toBe('service');
      expect(parsed.name).toBe('session');
      expect(parsed.created).toContain(`${fixture.manifest.paths.services}/session.service.ts`);
    });

    it('smoke test: emitted TypeScript service parses without errors', async () => {
      let ts;
      try {
        ts = (await import('typescript')).default;
      } catch {
        // Typescript not installed, skip parsing assertion as specified
        return;
      }

      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find(
        (f) => f.manifest.tooling?.language === 'ts'
      ) || fixtures[0];

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'smoke', '--paginated', '--with-mocks']).finished;

      const serviceFile = path.join(tmpDir, fixture.manifest.paths.services, 'smoke.service.ts');
      const mocksFile = path.join(tmpDir, fixture.manifest.paths.services, 'smoke.mocks.ts');

      const serviceCode = fs.readFileSync(serviceFile, 'utf8');
      const mocksCode = fs.readFileSync(mocksFile, 'utf8');

      const transpileResult1 = ts.transpileModule(serviceCode, {
        compilerOptions: { module: ts.ModuleKind.ESNext },
      });
      expect(transpileResult1.outputText).toBeDefined();

      const transpileResult2 = ts.transpileModule(mocksCode, {
        compilerOptions: { module: ts.ModuleKind.ESNext },
      });
      expect(transpileResult2.outputText).toBeDefined();
    });

    it('generates server-side service / DAL importing db client from @/lib/db (#55)', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.paths?.services);

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'item', '--server']).finished;
      expect(process.exitCode).toBeUndefined();

      const serviceFile = path.join(tmpDir, fixture.manifest.paths.services, 'item.service.ts');
      expect(fs.existsSync(serviceFile)).toBe(true);

      const content = fs.readFileSync(serviceFile, 'utf8');
      expect(content).toContain("import { db } from '@/lib/db';");
      expect(content).toContain('db.item.findMany()');
      expect(content).toContain('db.item.findUniqueOrThrow({');
      expect(content).toContain('db.item.create({');
      expect(content).toContain('db.item.update({');
      expect(content).toContain('db.item.delete({');
      expect(content).not.toContain('fetch(');
      expect(stdoutOutput).toContain('Generated server service "item":');
    });

    it('generates server-side service with pagination when --server and --paginated are passed', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.paths?.services);

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'user', '--server', '--paginated']).finished;
      expect(process.exitCode).toBeUndefined();

      const serviceFile = path.join(tmpDir, fixture.manifest.paths.services, 'user.service.ts');
      expect(fs.existsSync(serviceFile)).toBe(true);

      const content = fs.readFileSync(serviceFile, 'utf8');
      expect(content).toContain("import { db } from '@/lib/db';");
      expect(content).toContain('db.user.findMany({');
      expect(content).toContain('db.user.count()');
      expect(content).toContain('skip: (page - 1) * pageSize');
    });

    it('automatically generates server DAL when manifest.database.orm is prisma (#61)', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next' && f.manifest.paths?.services) || fixtures[0];

      const manifestWithPrisma = {
        ...fixture.manifest,
        database: {
          orm: 'prisma',
          provider: 'supabase',
        },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifestWithPrisma, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'product']).finished;
      expect(process.exitCode).toBeUndefined();

      const serviceFile = path.join(tmpDir, fixture.manifest.paths.services, 'product.service.ts');
      expect(fs.existsSync(serviceFile)).toBe(true);

      const content = fs.readFileSync(serviceFile, 'utf8');
      expect(content).toContain("import { db } from '@/lib/db';");
      expect(content).toContain('db.product.findMany()');
      expect(content).not.toContain('fetch(');
    });

    it('forces client HTTP service when --client is passed even with prisma in manifest (#61)', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next' && f.manifest.paths?.services) || fixtures[0];

      const manifestWithPrisma = {
        ...fixture.manifest,
        database: {
          orm: 'prisma',
          provider: 'supabase',
        },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifestWithPrisma, null, 2)
      );

      await runCli(['node', 'lumen', '-c', tmpDir, 'g', 'service', 'product', '--client']).finished;
      expect(process.exitCode).toBeUndefined();

      const serviceFile = path.join(tmpDir, fixture.manifest.paths.services, 'product.service.ts');
      expect(fs.existsSync(serviceFile)).toBe(true);

      const content = fs.readFileSync(serviceFile, 'utf8');
      expect(content).not.toContain("import { db } from '@/lib/db';");
      expect(content).toContain('fetch(');
    });
  });
});
