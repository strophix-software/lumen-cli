import fs from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { readConfig } from '../config/index.js';
import { LumenError, EXIT } from '../errors.js';
import { parseEnvFile } from './doctor.js';

/**
 * Pre-flight checks before executing Prisma commands.
 *
 * @param {string} root
 * @param {object} manifest
 * @param {object} [options={}]
 */
export function preflightPrismaCheck(root, manifest, { requireDbUrl = false } = {}) {
  if (manifest?.database?.orm && manifest.database.orm !== 'prisma') {
    throw new LumenError(
      `Project database ORM is configured as "${manifest.database.orm}", but Prisma was expected.`,
      {
        code: EXIT.CONFIG,
        hint: 'Update database.orm to "prisma" in lumen.config.json.',
      }
    );
  }

  const schemaPath = path.join(root, 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    throw new LumenError(
      'Prisma schema not found at "prisma/schema.prisma".',
      {
        code: EXIT.CONFIG,
        hint: 'Run "npx prisma init" or scaffold your database with create-lumen.',
      }
    );
  }

  if (requireDbUrl) {
    const envLocal = parseEnvFile(path.join(root, '.env.local'));
    const envMain = parseEnvFile(path.join(root, '.env'));
    const merged = { ...process.env, ...envMain, ...envLocal };

    if (!merged.DATABASE_URL) {
      throw new LumenError(
        'DATABASE_URL is not set in .env.local, .env, or process environment.',
        {
          code: EXIT.CONFIG,
          hint: 'Define DATABASE_URL in your .env.local or .env file before running database operations.',
        }
      );
    }
  }
}

/**
 * Runs a prisma CLI command via npx.
 *
 * @param {string[]} args
 * @param {object} options
 * @returns {Promise<number>}
 */
export function runPrismaCommand(args, { cwd, spawn = nodeSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['prisma', ...args], {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(
          new LumenError(`Prisma command exited with code ${code}.`, {
            code: code ?? EXIT.INTERNAL,
          })
        );
      }
    });

    proc.on('error', (err) => {
      reject(
        new LumenError(`Failed to spawn Prisma: ${err.message}`, {
          code: EXIT.INTERNAL,
          cause: err,
        })
      );
    });
  });
}

/**
 * Registers `lumen db` commands.
 *
 * @param {import('commander').Command} program
 */
export function registerDb(program) {
  const db = program
    .command('db')
    .description('Database management and Prisma helper commands')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen db push
  $ lumen db generate
  $ lumen db seed
  $ lumen db studio`
    );

  db.command('push')
    .description('Push schema state to database (with environment pre-flight audit)')
    .action(async () => {
      const globalOpts = program.opts ? program.opts() : {};
      const cwd = globalOpts.cwd || process.cwd();
      const { root, manifest } = readConfig({ cwd });

      preflightPrismaCheck(root, manifest, { requireDbUrl: true });
      process.stdout.write('  ✓ Pre-flight checks passed. Pushing schema to database...\n');
      await runPrismaCommand(['db', 'push'], { cwd: root });
    });

  db.command('generate')
    .description('Generate Prisma client artifacts')
    .action(async () => {
      const globalOpts = program.opts ? program.opts() : {};
      const cwd = globalOpts.cwd || process.cwd();
      const { root, manifest } = readConfig({ cwd });

      preflightPrismaCheck(root, manifest, { requireDbUrl: false });
      process.stdout.write('  ✓ Pre-flight checks passed. Generating Prisma Client...\n');
      await runPrismaCommand(['generate'], { cwd: root });
    });

  db.command('seed')
    .description('Seed database using project seed script')
    .action(async () => {
      const globalOpts = program.opts ? program.opts() : {};
      const cwd = globalOpts.cwd || process.cwd();
      const { root, manifest } = readConfig({ cwd });

      preflightPrismaCheck(root, manifest, { requireDbUrl: true });
      process.stdout.write('  ✓ Pre-flight checks passed. Seeding database...\n');
      await runPrismaCommand(['db', 'seed'], { cwd: root });
    });

  db.command('studio')
    .description('Open Prisma Studio in browser')
    .action(async () => {
      const globalOpts = program.opts ? program.opts() : {};
      const cwd = globalOpts.cwd || process.cwd();
      const { root, manifest } = readConfig({ cwd });

      preflightPrismaCheck(root, manifest, { requireDbUrl: true });
      process.stdout.write('  ✓ Pre-flight checks passed. Starting Prisma Studio...\n');
      await runPrismaCommand(['studio'], { cwd: root });
    });
}
