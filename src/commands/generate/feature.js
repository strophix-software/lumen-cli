import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGenerator } from '../../generators/core.js';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FEATURE_TEMPLATE_DIR = path.resolve(__dirname, '../../../templates/features');
const FEATURE_TESTS_TEMPLATE_DIR = path.resolve(__dirname, '../../../templates/features-tests');

/**
 * Checks if the target project at `root` has vitest in package.json dependencies or devDependencies.
 *
 * @param {string} root
 * @returns {boolean}
 */
export function hasVitestDependency(root) {
  try {
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
    return Boolean(allDeps.vitest);
  } catch {
    return false;
  }
}

/**
 * Register `lumen generate feature <name>` command.
 *
 * @param {import('commander').Command} generate
 */
export function registerFeature(generate) {
  generate
    .command('feature <name>')
    .description('Generate a domain feature module with components, hooks, services, and types')
    .option('--dry-run', 'Preview file operations without writing to disk')
    .option('--force', 'Overwrite existing files')
    .option('--with-tests', 'Generate starter component test file if project uses vitest')
    .option('--with-store', 'Hint to generate associated store')
    .option('--with-service', 'Hint to generate associated service')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate feature billing
  $ lumen g feature auth --dry-run
  $ lumen g feature checkout --with-tests
  $ lumen g feature payments --force`
    )
    .action(async (name, options, command) => {
      const globalOpts = command.optsWithGlobals ? command.optsWithGlobals() : {};
      const cwd = globalOpts.cwd || process.cwd();
      const isJson = Boolean(globalOpts.json);
      const isDryRun = Boolean(options.dryRun);
      const isForce = Boolean(options.force);

      // Read configuration to check architecture preset & paths
      const { manifest, paths, root } = readConfig({ cwd });

      const preset = manifest?.architecture?.preset;
      if (preset === 'none') {
        throw new LumenError(
          'Cannot generate feature: the project architecture preset is "none". Features require a structured architecture (feature-based or type-based fallback).',
          {
            code: EXIT.USER,
            hint: 'Change architecture.preset in lumen.config.json or configure paths.features manually.',
          }
        );
      }

      if (!paths || !paths.features) {
        throw new LumenError(
          'Cannot generate feature: paths.features is not configured in manifest paths.',
          {
            code: EXIT.USER,
            hint: 'Ensure paths.features is defined in lumen.config.json.',
          }
        );
      }

      // Hints for store and service
      if (options.withStore && !isJson) {
        process.stdout.write(`Hint: Use "lumen g store ${name}" to generate a state store for this feature.\n`);
      }
      if (options.withService && !isJson) {
        process.stdout.write(`Hint: Use "lumen g service ${name}" to generate an API service for this feature.\n`);
      }

      // Run base feature generator
      const result = await runGenerator({
        kind: 'features',
        name,
        templateDir: FEATURE_TEMPLATE_DIR,
        options: {
          cwd,
          json: isJson,
          dryRun: isDryRun,
          force: isForce,
        },
      });

      // Handle optional --with-tests flag
      if (options.withTests) {
        const hasVitest = hasVitestDependency(root);
        if (hasVitest) {
          await runGenerator({
            kind: 'features',
            name,
            templateDir: FEATURE_TESTS_TEMPLATE_DIR,
            options: {
              cwd,
              json: isJson,
              dryRun: isDryRun,
              force: isForce,
            },
          });
        } else if (!isJson) {
          process.stdout.write(`\nNote: Skipped test generation: vitest was not found in project dependencies.\n`);
        }
      }

      return result;
    });
}
