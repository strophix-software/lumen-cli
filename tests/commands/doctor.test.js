import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { createCli } from '../../src/cli.js';
import { auditDatabaseUrl, parseEnvFile, runDoctor } from '../../src/commands/doctor.js';

describe('lumen doctor command (#61, #67)', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-doctor-test-'));
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

  describe('auditDatabaseUrl helper', () => {
    it('verifies correct Supavisor transaction pooler URL (port 6543, pgbouncer=true)', () => {
      const url = 'postgresql://postgres.myproject:secretpassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
      const result = auditDatabaseUrl(url, { expectedPort: 6543, requirePgbouncer: true });

      expect(result.ok).toBe(true);
      expect(result.port).toBe(6543);
      expect(result.hasPgbouncer).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it('warns when port 5432 is used for DATABASE_URL with Supabase pooler', () => {
      const url = 'postgresql://postgres.myproject:secretpassword@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
      const result = auditDatabaseUrl(url, { expectedPort: 6543, requirePgbouncer: true });

      expect(result.ok).toBe(false);
      expect(result.warnings.some((w) => w.includes('port 5432 (direct) instead of transaction pooler port 6543'))).toBe(true);
    });

    it('warns when pooler port 6543 lacks ?pgbouncer=true', () => {
      const url = 'postgresql://postgres.myproject:secretpassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
      const result = auditDatabaseUrl(url, { expectedPort: 6543, requirePgbouncer: true });

      expect(result.ok).toBe(false);
      expect(result.warnings.some((w) => w.includes('missing "?pgbouncer=true"'))).toBe(true);
    });

    it('verifies direct session database connection on port 5432 for DIRECT_URL', () => {
      const url = 'postgresql://postgres.myproject:secretpassword@db.myproject.supabase.co:5432/postgres';
      const result = auditDatabaseUrl(url, { expectedPort: 5432, requirePgbouncer: false });

      expect(result.ok).toBe(true);
      expect(result.port).toBe(5432);
      expect(result.warnings.length).toBe(0);
    });

    it('handles malformed database URLs gracefully', () => {
      const result = auditDatabaseUrl('not a valid url');
      expect(result.ok).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('parseEnvFile helper', () => {
    it('parses environment key-value pairs and strips quotes', () => {
      const envPath = path.join(tmpDir, '.env.test');
      fs.writeFileSync(
        envPath,
        `
# This is a comment
DATABASE_URL="postgresql://user:pass@host:6543/db?pgbouncer=true"
DIRECT_URL='postgresql://user:pass@host:5432/db'
PORT=3000
EMPTY=
        `.trim(),
        'utf8'
      );

      const parsed = parseEnvFile(envPath);
      expect(parsed.DATABASE_URL).toBe('postgresql://user:pass@host:6543/db?pgbouncer=true');
      expect(parsed.DIRECT_URL).toBe('postgresql://user:pass@host:5432/db');
      expect(parsed.PORT).toBe('3000');
      expect(parsed.EMPTY).toBe('');
    });
  });

  describe('runDoctor health audit', () => {
    it('passes checks on a healthy project without database', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures[0];
      const manifest = {
        ...fixture.manifest,
        tooling: {
          ...fixture.manifest.tooling,
          linter: 'none',
          formatter: 'none',
        },
        agentDocs: false,
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      const report = runDoctor({ cwd: tmpDir });
      expect(report.healthy).toBe(true);
      expect(report.errors.length).toBe(0);
      expect(report.checks.some((c) => c.name === 'Manifest Config' && c.status === 'pass')).toBe(true);
    });

    it('audits Prisma + Supabase health with healthy configuration', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next') || fixtures[0];

      const manifestWithSupabase = {
        ...fixture.manifest,
        tooling: {
          ...fixture.manifest.tooling,
          linter: 'none',
          formatter: 'none',
        },
        agentDocs: false,
        database: {
          orm: 'prisma',
          provider: 'supabase',
        },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifestWithSupabase, null, 2)
      );

      // Create prisma/schema.prisma with directUrl
      const prismaDir = path.join(tmpDir, 'prisma');
      fs.mkdirSync(prismaDir, { recursive: true });
      fs.writeFileSync(
        path.join(prismaDir, 'schema.prisma'),
        `
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
        `.trim(),
        'utf8'
      );

      // Create src/lib/db.ts
      const libDir = path.join(tmpDir, 'src', 'lib');
      fs.mkdirSync(libDir, { recursive: true });
      fs.writeFileSync(path.join(libDir, 'db.ts'), 'export const db = {};\n', 'utf8');

      // Create .env.local with valid Supabase pooler and direct URLs
      fs.writeFileSync(
        path.join(tmpDir, '.env.local'),
        `
DATABASE_URL="postgresql://postgres.demo:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.demo:pass@db.demo.supabase.co:5432/postgres"
        `.trim(),
        'utf8'
      );

      const report = runDoctor({ cwd: tmpDir });
      expect(report.healthy).toBe(true);
      expect(report.warnings.length).toBe(0);
      expect(report.errors.length).toBe(0);
      expect(report.checks.some((c) => c.name === 'Prisma Schema' && c.status === 'pass')).toBe(true);
      expect(report.checks.some((c) => c.name === 'Supabase DATABASE_URL Pooler' && c.status === 'pass')).toBe(true);
      expect(report.checks.some((c) => c.name === 'Supabase DIRECT_URL Direct Port' && c.status === 'pass')).toBe(true);
    });

    it('detects Supabase misconfigurations (port 5432 pooler and missing directUrl)', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.manifest.framework?.name === 'next') || fixtures[0];

      const manifestWithSupabase = {
        ...fixture.manifest,
        database: {
          orm: 'prisma',
          provider: 'supabase',
        },
      };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifestWithSupabase, null, 2)
      );

      // Create schema without directUrl
      const prismaDir = path.join(tmpDir, 'prisma');
      fs.mkdirSync(prismaDir, { recursive: true });
      fs.writeFileSync(
        path.join(prismaDir, 'schema.prisma'),
        `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
        `.trim(),
        'utf8'
      );

      // Misconfigured DATABASE_URL connecting to 5432
      fs.writeFileSync(
        path.join(tmpDir, '.env.local'),
        'DATABASE_URL="postgresql://postgres.demo:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres"\n',
        'utf8'
      );

      const report = runDoctor({ cwd: tmpDir });
      expect(report.healthy).toBe(false);
      expect(report.warnings.some((w) => w.includes('port 5432 (direct) instead of transaction pooler port 6543'))).toBe(true);
      expect(report.warnings.some((w) => w.includes('prisma/schema.prisma does not define directUrl'))).toBe(true);
      expect(report.warnings.some((w) => w.includes('DIRECT_URL is not set'))).toBe(true);
    });

    it('detects Biome v2 unified configuration and Tailwind CSS directives', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures[0];
      const manifestWithBiome = {
        ...fixture.manifest,
        tooling: {
          ...fixture.manifest.tooling,
          linter: 'biome',
          formatter: 'none',
        },
      };

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(manifestWithBiome, null, 2));
      fs.writeFileSync(
        path.join(tmpDir, 'biome.json'),
        JSON.stringify({
          $schema: 'https://biomejs.dev/schemas/1.9.4/schema.json',
          css: {
            parser: {
              tailwindDirectives: true,
            },
          },
        }),
        'utf8'
      );

      const report = runDoctor({ cwd: tmpDir });
      expect(
        report.checks.some(
          (c) =>
            c.name === 'Biome v2' &&
            c.status === 'pass' &&
            c.message.includes('Tailwind CSS directives support')
        )
      ).toBe(true);
      expect(
        report.checks.some(
          (c) =>
            c.name === 'Formatter' &&
            c.status === 'pass' &&
            c.message.includes('delegated to Biome v2 unified')
        )
      ).toBe(true);
    });

    it('warns when legacy .lumen directory is detected', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures[0];

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(fixture.manifest, null, 2));
      fs.mkdirSync(path.join(tmpDir, '.lumen'), { recursive: true });

      const report = runDoctor({ cwd: tmpDir });
      expect(report.warnings.some((w) => w.includes('Legacy .lumen/ directory detected'))).toBe(true);
    });
  });

  describe('lumen doctor CLI integration', () => {
    it('executes lumen doctor and outputs formatted text', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures[0];

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(fixture.manifest, null, 2));

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'doctor']);

      expect(stdoutOutput).toContain('Lumen Doctor — Project Health Audit');
      expect(stdoutOutput).toContain('Doctor summary:');
    });

    it('outputs structured JSON when -j / --json is passed', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures[0];

      fs.writeFileSync(path.join(tmpDir, 'lumen.config.json'), JSON.stringify(fixture.manifest, null, 2));

      const program = createCli();
      await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'doctor', '-j']);

      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed).toHaveProperty('healthy');
      expect(parsed).toHaveProperty('checks');
      expect(Array.isArray(parsed.checks)).toBe(true);
    });
  });
});
