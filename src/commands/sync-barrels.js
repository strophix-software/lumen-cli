import fs from 'node:fs';
import path from 'node:path';
import { readConfig } from '../config/index.js';
import { LumenError, EXIT } from '../errors.js';

const VALID_CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

/**
 * Checks if a file or directory should be ignored from barrel export.
 *
 * @param {string} fullPath
 * @param {string} name
 * @param {boolean} isDirectory
 * @returns {boolean}
 */
export function shouldIgnoreItem(fullPath, name, isDirectory) {
  // Ignore hidden, private (_), or node_modules
  if (name.startsWith('.') || name.startsWith('_') || name === 'node_modules') {
    return true;
  }

  if (isDirectory) {
    if (name === '__tests__' || name === '__mocks__') return true;
    // Only export directories if they contain an index barrel
    const hasIndex =
      fs.existsSync(path.join(fullPath, 'index.ts')) ||
      fs.existsSync(path.join(fullPath, 'index.tsx')) ||
      fs.existsSync(path.join(fullPath, 'index.js')) ||
      fs.existsSync(path.join(fullPath, 'index.jsx'));
    return !hasIndex;
  }

  // Files: barrel self, tests, mocks, d.ts
  if (/^index\.(ts|tsx|js|jsx|mjs)$/.test(name)) return true;
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(name)) return true;
  if (/\.(mocks?)\.(ts|tsx|js|jsx)$/.test(name)) return true;
  if (/\.d\.ts$/.test(name)) return true;

  const ext = path.extname(name);
  if (!VALID_CODE_EXTENSIONS.has(ext)) return true;

  // Pragma ignore check in file header
  try {
    const head = fs.readFileSync(fullPath, 'utf8').slice(0, 500);
    if (head.includes('@barrel-ignore')) return true;
  } catch {
    // ignore read error
  }

  return false;
}

/**
 * Collects exportable module names for a given directory.
 *
 * @param {string} dirPath
 * @returns {string[]} Sorted module names (without file extension)
 */
export function collectExportableModules(dirPath) {
  if (!fs.existsSync(dirPath)) return [];

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const modules = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (shouldIgnoreItem(fullPath, entry.name, entry.isDirectory())) {
      continue;
    }

    if (entry.isDirectory()) {
      modules.push(entry.name);
    } else {
      const ext = path.extname(entry.name);
      const baseName = path.basename(entry.name, ext);
      modules.push(baseName);
    }
  }

  return modules.sort((a, b) => a.localeCompare(b));
}

/**
 * Generates deterministic barrel content from module names.
 *
 * @param {string[]} modules
 * @returns {string}
 */
export function generateBarrelContent(modules) {
  if (!modules || modules.length === 0) return '';
  const lines = modules.map((mod) => `export * from './${mod}';`);
  return lines.join('\n') + '\n';
}

/**
 * Discovers canonical directories that should maintain index barrels.
 *
 * @param {string} root
 * @param {object} paths
 * @returns {string[]} Array of absolute directory paths
 */
export function discoverBarrelDirectories(root, paths = {}) {
  const dirs = new Set();

  const addIfDir = (rel) => {
    if (!rel || typeof rel !== 'string') return;
    const abs = path.resolve(root, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      dirs.add(abs);
    }
  };

  addIfDir(paths.ui);
  addIfDir(paths.components);
  addIfDir(paths.services);
  addIfDir(paths.hooks);
  addIfDir(paths.utils);

  // Discover stores directory if present (e.g. src/shared/stores or src/stores)
  if (paths.services) {
    const storesDir = path.join(path.dirname(path.resolve(root, paths.services)), 'stores');
    if (fs.existsSync(storesDir) && fs.statSync(storesDir).isDirectory()) {
      dirs.add(storesDir);
    }
  }

  // Discover feature barrels
  if (paths.features) {
    const featuresDir = path.resolve(root, paths.features);
    if (fs.existsSync(featuresDir)) {
      try {
        const featureEntries = fs.readdirSync(featuresDir, { withFileTypes: true });
        for (const feat of featureEntries) {
          if (!feat.isDirectory() || feat.name.startsWith('.') || feat.name.startsWith('_')) {
            continue;
          }
          const featDir = path.join(featuresDir, feat.name);
          dirs.add(featDir);

          // Submodules inside feature
          const subNames = ['components', 'hooks', 'services', 'types', 'store', 'stores'];
          for (const sub of subNames) {
            const subDir = path.join(featDir, sub);
            if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
              dirs.add(subDir);
            }
          }
        }
      } catch {
        // ignore read error
      }
    }
  }

  // Sort deeper directories first so child barrels are generated before parent barrels
  return Array.from(dirs).sort((a, b) => {
    const depthA = a.split(path.sep).length;
    const depthB = b.split(path.sep).length;
    if (depthB !== depthA) return depthB - depthA;
    return a.localeCompare(b);
  });
}

/**
 * Syncs barrel files across the project or in a specific directory.
 *
 * @param {object} options
 * @param {string} [options.cwd=process.cwd()]
 * @param {boolean} [options.check=false]
 * @param {boolean} [options.dryRun=false]
 * @param {string} [options.targetDir]
 * @returns {object} Execution summary
 */
export function executeSyncBarrels(options = {}) {
  const cwd = options.cwd || process.cwd();
  const { root, manifest, paths } = readConfig({ cwd });

  const language = manifest?.tooling?.language || 'ts';
  const defaultExt = language === 'ts' ? 'ts' : 'js';

  let targetDirs;
  if (options.targetDir) {
    const absTarget = path.isAbsolute(options.targetDir)
      ? options.targetDir
      : path.resolve(root, options.targetDir);
    targetDirs = [absTarget];
  } else {
    targetDirs = discoverBarrelDirectories(root, paths);
  }

  const results = [];
  let staleCount = 0;

  for (const dir of targetDirs) {
    const modules = collectExportableModules(dir);
    if (modules.length === 0) continue;

    // Detect existing barrel extension or use default
    let barrelFileName = `index.${defaultExt}`;
    const candidates = ['index.ts', 'index.tsx', 'index.js', 'index.jsx'];
    for (const c of candidates) {
      if (fs.existsSync(path.join(dir, c))) {
        barrelFileName = c;
        break;
      }
    }

    const barrelPath = path.join(dir, barrelFileName);
    const relBarrelPath = path.relative(root, barrelPath);
    const existingContent = fs.existsSync(barrelPath)
      ? fs.readFileSync(barrelPath, 'utf8')
      : null;

    const newContent = generateBarrelContent(modules);
    const isStale = existingContent !== newContent;

    if (isStale) {
      staleCount++;
      const action = existingContent === null ? 'create' : 'update';

      results.push({
        file: relBarrelPath,
        absPath: barrelPath,
        action,
        modules,
        stale: true,
      });

      if (!options.check && !options.dryRun) {
        fs.mkdirSync(path.dirname(barrelPath), { recursive: true });
        fs.writeFileSync(barrelPath, newContent, 'utf8');
      }
    } else {
      results.push({
        file: relBarrelPath,
        absPath: barrelPath,
        action: 'in-sync',
        modules,
        stale: false,
      });
    }
  }

  return {
    success: options.check ? staleCount === 0 : true,
    staleCount,
    totalBarrels: results.length,
    barrels: results,
  };
}

/**
 * Registers `lumen sync-barrels` command.
 * @param {import('commander').Command} program
 */
export function registerSyncBarrels(program) {
  program
    .command('sync-barrels [dir]')
    .alias('sb')
    .description('Auto-maintain intermediate index.ts / index.js barrel exports')
    .option('--check', 'verify barrels are in sync and fail with exit code 1 if stale (CI mode)')
    .option('--dry-run', 'preview barrel changes without writing to disk')
    .option('-j, --json', 'output result in JSON format')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen sync-barrels
  $ lumen sb
  $ lumen sync-barrels src/components
  $ lumen sync-barrels --check
  $ lumen sync-barrels --dry-run
  $ lumen sync-barrels -j`
    )
    .action(async (targetDir, cmdOpts) => {
      const globalOpts = program.opts ? program.opts() : {};
      const options = { ...globalOpts, ...cmdOpts, targetDir };
      const cwd = options.cwd || process.cwd();

      const summary = executeSyncBarrels({ ...options, cwd });

      if (options.json) {
        process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
        if (options.check && summary.staleCount > 0) {
          process.exitCode = EXIT.USER;
        }
        return;
      }

      if (options.check) {
        if (summary.staleCount > 0) {
          process.stdout.write(
            `\n✗ Barrel check failed: ${summary.staleCount} barrel(s) are stale or out of sync:\n`
          );
          for (const b of summary.barrels.filter((b) => b.stale)) {
            process.stdout.write(`  • ${b.file} (${b.action})\n`);
          }
          process.stdout.write('\nRun "lumen sync-barrels" to update them automatically.\n\n');
          throw new LumenError(
            `Barrels are out of sync (${summary.staleCount} stale barrel(s)).`,
            { code: EXIT.USER }
          );
        } else {
          process.stdout.write(`\n✓ All ${summary.totalBarrels} barrel(s) are in sync.\n\n`);
        }
        return;
      }

      process.stdout.write('\n📦 Lumen Sync Barrels\n\n');

      for (const b of summary.barrels) {
        if (options.dryRun) {
          if (b.stale) {
            process.stdout.write(`  [DRY RUN] Would ${b.action} ${b.file}\n`);
          } else {
            process.stdout.write(`  = IN-SYNC ${b.file}\n`);
          }
        } else if (b.stale) {
          process.stdout.write(`  + SYNCED ${b.file} (${b.modules.length} exports)\n`);
        } else {
          process.stdout.write(`  = IN-SYNC ${b.file}\n`);
        }
      }

      process.stdout.write(
        `\nBarrels summary: ${summary.staleCount} synchronized, ${summary.totalBarrels - summary.staleCount} already in sync.\n\n`
      );
    });
}
