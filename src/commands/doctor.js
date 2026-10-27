import fs from 'node:fs';
import path from 'node:path';
import { readConfig } from '../config/index.js';

/**
 * Safely parses simple KEY=VALUE pairs from an env file without leaking secrets.
 *
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
    return env;
  } catch {
    return {};
  }
}

/**
 * Audits a database connection string against expected topology without leaking credentials.
 *
 * @param {string} urlStr
 * @param {object} [options={}]
 * @param {number} [options.expectedPort=6543]
 * @param {boolean} [options.requirePgbouncer=true]
 * @returns {object}
 */
export function auditDatabaseUrl(urlStr, { expectedPort = 6543, requirePgbouncer = true } = {}) {
  if (!urlStr) {
    return { ok: false, error: 'URL is not defined', warnings: ['Database URL is missing or empty.'] };
  }

  try {
    const parsed = new URL(urlStr);
    const port = parsed.port
      ? parseInt(parsed.port, 10)
      : (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:' ? 5432 : null);
    const hasPgbouncer = parsed.searchParams.get('pgbouncer') === 'true';

    const warnings = [];
    if (expectedPort === 6543 && port === 5432) {
      warnings.push(
        'DATABASE_URL connects to port 5432 (direct) instead of transaction pooler port 6543 (?pgbouncer=true). In serverless/edge environments, this may cause connection pool exhaustion.'
      );
    } else if (expectedPort && port !== expectedPort) {
      warnings.push(`URL uses port ${port} instead of expected port ${expectedPort}.`);
    }

    if (requirePgbouncer && !hasPgbouncer && port === 6543) {
      warnings.push('Transaction pooler URL is missing "?pgbouncer=true" parameter.');
    }

    return {
      ok: warnings.length === 0,
      protocol: parsed.protocol,
      host: parsed.hostname,
      port,
      hasPgbouncer,
      warnings,
    };
  } catch {
    return {
      ok: false,
      error: 'Malformed database URL.',
      warnings: ['Could not parse database connection string as a valid URL.'],
    };
  }
}

/**
 * Executes doctor audit on the project.
 *
 * @param {object} [options={}]
 * @param {string} [options.cwd=process.cwd()]
 * @returns {object} Audit report
 */
export function runDoctor(options = {}) {
  const cwd = options.cwd || process.cwd();
  const checks = [];
  const warnings = [];
  const errors = [];

  let config;
  try {
    config = readConfig({ cwd });
    checks.push({
      category: 'manifest',
      name: 'Manifest Config',
      status: 'pass',
      message: `Valid v2 manifest (${config.manifest.framework?.name || 'unknown'}, preset: ${config.manifest.architecture?.preset || 'none'})`,
    });
  } catch (err) {
    errors.push(`Manifest error: ${err.message}`);
    return {
      healthy: false,
      checks: [
        {
          category: 'manifest',
          name: 'Manifest Config',
          status: 'fail',
          message: err.message,
        },
      ],
      warnings: [],
      errors: [err.message],
    };
  }

  const { manifest, root } = config;

  // 1. Tooling & Formatter / Linter check
  const linter = manifest.tooling?.linter || 'none';
  const formatter = manifest.tooling?.formatter || 'none';

  if (linter === 'biome' || fs.existsSync(path.join(root, 'biome.json')) || fs.existsSync(path.join(root, 'biome.jsonc'))) {
    const hasBiomeConfig =
      fs.existsSync(path.join(root, 'biome.json')) || fs.existsSync(path.join(root, 'biome.jsonc'));
    if (hasBiomeConfig) {
      let biomeMessage = 'Biome configuration found (handles formatting & linting unified)';
      try {
        const biomeConfigPath = fs.existsSync(path.join(root, 'biome.json'))
          ? path.join(root, 'biome.json')
          : path.join(root, 'biome.jsonc');
        const content = fs.readFileSync(biomeConfigPath, 'utf8');
        const parsed = JSON.parse(content);
        if (parsed?.css?.parser?.tailwindDirectives) {
          biomeMessage = 'Biome v2 configuration verified with Tailwind CSS directives support';
        }
      } catch {
        // ignore parse error for message enhancement
      }
      checks.push({
        category: 'tooling',
        name: 'Biome v2',
        status: 'pass',
        message: biomeMessage,
      });
    } else {
      warnings.push('Biome linter specified in manifest but biome.json / biome.jsonc was not found.');
      checks.push({
        category: 'tooling',
        name: 'Biome v2',
        status: 'warn',
        message: 'Missing biome.json configuration file',
      });
    }
  } else if (linter === 'eslint') {
    const hasEslint =
      fs.existsSync(path.join(root, 'eslint.config.js')) ||
      fs.existsSync(path.join(root, 'eslint.config.mjs')) ||
      fs.existsSync(path.join(root, '.eslintrc.json')) ||
      fs.existsSync(path.join(root, '.eslintrc.js'));
    checks.push({
      category: 'tooling',
      name: 'ESLint',
      status: hasEslint ? 'pass' : 'warn',
      message: hasEslint ? 'ESLint configuration found' : 'ESLint config file not found',
    });
    if (!hasEslint) warnings.push('ESLint configured in manifest but config file not found.');
  }

  if (formatter === 'prettier') {
    const hasPrettier =
      fs.existsSync(path.join(root, '.prettierrc')) ||
      fs.existsSync(path.join(root, '.prettierrc.json')) ||
      fs.existsSync(path.join(root, '.prettierrc.js')) ||
      fs.existsSync(path.join(root, 'prettier.config.js')) ||
      fs.existsSync(path.join(root, 'prettier.config.mjs'));
    checks.push({
      category: 'tooling',
      name: 'Prettier',
      status: hasPrettier ? 'pass' : 'warn',
      message: hasPrettier ? 'Prettier configuration found' : 'Prettier config file not found',
    });
    if (!hasPrettier) warnings.push('Prettier configured in manifest but config file not found.');
  } else if (formatter === 'none') {
    checks.push({
      category: 'tooling',
      name: 'Formatter',
      status: 'pass',
      message: linter === 'biome' ? 'Formatter disabled (delegated to Biome v2 unified)' : 'Formatter disabled (--formatter none)',
    });
  }

  // 2. Database & Supabase check
  if (manifest.database && manifest.database.orm === 'prisma') {
    const schemaPath = path.join(root, 'prisma', 'schema.prisma');
    const hasSchema = fs.existsSync(schemaPath);

    if (hasSchema) {
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      const hasDirectUrl = schemaContent.includes('directUrl');

      checks.push({
        category: 'database',
        name: 'Prisma Schema',
        status: 'pass',
        message: hasDirectUrl
          ? 'schema.prisma found with directUrl configuration'
          : 'schema.prisma found (directUrl not configured)',
      });

      if (!hasDirectUrl && manifest.database.provider === 'supabase') {
        warnings.push('prisma/schema.prisma does not define directUrl = env("DIRECT_URL") for Supabase migrations.');
      }
    } else {
      errors.push('prisma/schema.prisma was not found in project.');
      checks.push({
        category: 'database',
        name: 'Prisma Schema',
        status: 'fail',
        message: 'Missing prisma/schema.prisma',
      });
    }

    // Singleton client check
    const dbClientPathTs = path.join(root, 'src', 'lib', 'db.ts');
    const dbClientPathJs = path.join(root, 'src', 'lib', 'db.js');
    const hasDbClient = fs.existsSync(dbClientPathTs) || fs.existsSync(dbClientPathJs);
    checks.push({
      category: 'database',
      name: 'Prisma Client Singleton',
      status: hasDbClient ? 'pass' : 'warn',
      message: hasDbClient ? 'Singleton db client found at src/lib/db' : 'Missing singleton db client at src/lib/db',
    });

    // Environment file & connection audit
    const envLocal = parseEnvFile(path.join(root, '.env.local'));
    const envMain = parseEnvFile(path.join(root, '.env'));
    const mergedEnv = { ...envMain, ...envLocal };

    const hasDbUrl = Boolean(mergedEnv.DATABASE_URL);
    const hasDirectDbUrl = Boolean(mergedEnv.DIRECT_URL);

    if (!hasDbUrl) {
      warnings.push('DATABASE_URL is not set in .env.local or .env.');
    }
    if (!hasDirectDbUrl && manifest.database.provider === 'supabase') {
      warnings.push('DIRECT_URL is not set in .env.local or .env (required for direct Supabase migrations).');
    }

    checks.push({
      category: 'database',
      name: 'Database Environment Variables',
      status: hasDbUrl ? (hasDirectDbUrl ? 'pass' : 'warn') : 'fail',
      message: `DATABASE_URL: ${hasDbUrl ? 'defined' : 'missing'}, DIRECT_URL: ${hasDirectDbUrl ? 'defined' : 'missing'}`,
    });

    if (manifest.database.provider === 'supabase' && hasDbUrl) {
      const audit = auditDatabaseUrl(mergedEnv.DATABASE_URL, {
        expectedPort: 6543,
        requirePgbouncer: true,
      });

      if (audit.warnings && audit.warnings.length > 0) {
        for (const w of audit.warnings) {
          warnings.push(w);
        }
        checks.push({
          category: 'database',
          name: 'Supabase DATABASE_URL Pooler',
          status: 'warn',
          message: audit.warnings[0],
        });
      } else {
        checks.push({
          category: 'database',
          name: 'Supabase DATABASE_URL Pooler',
          status: 'pass',
          message: `Transaction pooler port 6543 verified (?pgbouncer=true, host: ${audit.host})`,
        });
      }
    }

    if (manifest.database.provider === 'supabase' && hasDirectDbUrl) {
      const directAudit = auditDatabaseUrl(mergedEnv.DIRECT_URL, {
        expectedPort: 5432,
        requirePgbouncer: false,
      });

      if (directAudit.warnings && directAudit.warnings.length > 0) {
        for (const w of directAudit.warnings) {
          warnings.push(w);
        }
        checks.push({
          category: 'database',
          name: 'Supabase DIRECT_URL Direct Port',
          status: 'warn',
          message: directAudit.warnings[0],
        });
      } else {
        checks.push({
          category: 'database',
          name: 'Supabase DIRECT_URL Direct Port',
          status: 'pass',
          message: `Direct database port 5432 verified (host: ${directAudit.host})`,
        });
      }
    }
  }

  // 3. Agent Docs check
  if (manifest.agentDocs) {
    const agentsMdPath = path.join(root, 'AGENTS.md');
    const hasAgentsMd = fs.existsSync(agentsMdPath);
    checks.push({
      category: 'agentDocs',
      name: 'Agent Context SSOT',
      status: hasAgentsMd ? 'pass' : 'warn',
      message: hasAgentsMd ? 'Root AGENTS.md single source of truth found' : 'Root AGENTS.md not found',
    });
  }

  // Legacy .lumen folder check
  if (fs.existsSync(path.join(root, '.lumen'))) {
    warnings.push('Legacy .lumen/ directory detected. Lumen v2 uses root AGENTS.md and lumen.config.json as SSOT.');
  }

  const healthy = errors.length === 0 && warnings.length === 0;

  return {
    healthy,
    status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warn' : 'ok',
    checks,
    warnings,
    errors,
  };
}

/**
 * Registers `lumen doctor` command.
 * @param {import('commander').Command} program
 */
export function registerDoctor(program) {
  program
    .command('doctor')
    .description('Audit project health, database configurations, and tooling')
    .option('-j, --json', 'output audit report in JSON format')
    .action(async (cmdOpts) => {
      const globalOpts = program.opts ? program.opts() : {};
      const options = { ...globalOpts, ...cmdOpts };
      const cwd = options.cwd || process.cwd();

      const report = runDoctor({ cwd });

      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        return;
      }

      process.stdout.write('\n🩺 Lumen Doctor — Project Health Audit\n\n');

      for (const check of report.checks) {
        const symbol = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
        process.stdout.write(`  ${symbol} [${check.category}] ${check.name}: ${check.message}\n`);
      }

      if (report.warnings.length > 0) {
        process.stdout.write('\nWarnings:\n');
        for (const w of report.warnings) {
          process.stdout.write(`  • ${w}\n`);
        }
      }

      if (report.errors.length > 0) {
        process.stdout.write('\nErrors:\n');
        for (const e of report.errors) {
          process.stdout.write(`  • ${e}\n`);
        }
      }

      process.stdout.write(
        `\nDoctor summary: ${report.checks.filter((c) => c.status === 'pass').length} passed, ${report.warnings.length} warning(s), ${report.errors.length} error(s).\n\n`
      );
    });
}
