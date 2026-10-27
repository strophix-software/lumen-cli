import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { LumenError } from '../../src/errors.js';
import { preflightPrismaCheck } from '../../src/commands/db.js';

describe('lumen db command and preflight checks (#61)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-db-test-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('passes preflight check when schema.prisma and DATABASE_URL are present', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = {
      ...fixtures[0].manifest,
      database: {
        orm: 'prisma',
        provider: 'supabase',
      },
    };

    fs.mkdirSync(path.join(tmpDir, 'prisma'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'prisma/schema.prisma'), 'datasource db { provider = "postgresql" }\n');
    fs.writeFileSync(path.join(tmpDir, '.env.local'), 'DATABASE_URL="postgresql://user:pass@localhost:5432/db"\n');

    expect(() => preflightPrismaCheck(tmpDir, manifest, { requireDbUrl: true })).not.toThrow();
  });

  it('throws LumenError when database.orm is not prisma', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = {
      ...fixtures[0].manifest,
      database: {
        orm: 'none',
        provider: 'postgresql',
      },
    };

    expect(() => preflightPrismaCheck(tmpDir, manifest)).toThrow(LumenError);
    expect(() => preflightPrismaCheck(tmpDir, manifest)).toThrow(/Prisma was expected/);
  });

  it('throws LumenError when prisma/schema.prisma does not exist', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = {
      ...fixtures[0].manifest,
      database: {
        orm: 'prisma',
        provider: 'postgresql',
      },
    };

    expect(() => preflightPrismaCheck(tmpDir, manifest)).toThrow(LumenError);
    expect(() => preflightPrismaCheck(tmpDir, manifest)).toThrow(/Prisma schema not found/);
  });

  it('throws LumenError when requireDbUrl is true and DATABASE_URL is missing', async () => {
    const fixtures = await loadValidFixtures();
    const manifest = {
      ...fixtures[0].manifest,
      database: {
        orm: 'prisma',
        provider: 'postgresql',
      },
    };

    fs.mkdirSync(path.join(tmpDir, 'prisma'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'prisma/schema.prisma'), 'datasource db { provider = "postgresql" }\n');

    expect(() => preflightPrismaCheck(tmpDir, manifest, { requireDbUrl: true })).toThrow(LumenError);
    expect(() => preflightPrismaCheck(tmpDir, manifest, { requireDbUrl: true })).toThrow(/DATABASE_URL is not set/);
  });
});
