import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { validateName, buildNameVariants } from '../../generators/names.js';
import { planGenerator, applyPlan, syncAgentContext } from '../../generators/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOOK_TEMPLATE_DIR = path.resolve(__dirname, '../../../templates/hook');

/**
 * Normalizes hook input by stripping leading 'use' or 'use-' prefix if provided.
 * e.g. "useCart" -> "Cart", "use-cart" -> "cart", "cart" -> "cart".
 *
 * @param {string} input
 * @returns {string} Clean base name
 */
export function normalizeHookName(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('use-')) {
    return trimmed.slice(4);
  }
  if (/^use[A-Z]/.test(trimmed)) {
    return trimmed.slice(3);
  }
  return trimmed;
}

/**
 * Resolves destination directory for hook generation based on options and manifest.
 *
 * @param {object} params
 * @param {object} params.options Command options
 * @param {object} params.manifest Parsed manifest
 * @param {object} params.paths Resolved manifest paths
 * @returns {string} Relative destination directory (POSIX)
 */
export function resolveHookTargetDir({ options, manifest, paths }) {
  if (options.feature) {
    const validatedFeature = validateName(options.feature);
    const featureVariants = buildNameVariants(validatedFeature);

    if (
      manifest.architecture?.preset === 'none' ||
      !paths.features ||
      typeof paths.features !== 'string'
    ) {
      throw new LumenError(
        `Feature-scoped hooks require a feature architecture with "paths.features" configured (preset: "${manifest.architecture?.preset || 'none'}").`,
        {
          code: EXIT.USER,
          hint: 'Omit --feature to generate in paths.hooks, or switch to a feature-based architecture preset.',
        }
      );
    }

    return path.posix.join(paths.features, featureVariants.nameKebab, 'hooks');
  }

  if (!paths || !paths.hooks) {
    throw new LumenError(
      'Generator target "hooks" is not configured in manifest paths.',
      {
        code: EXIT.CONFIG,
        hint: 'Ensure your lumen.config.json paths object contains a "hooks" entry (e.g. "src/hooks" or "src/shared/hooks").',
      }
    );
  }

  return paths.hooks;
}

/**
 * Executes custom hook scaffolding adopting the React 19 async cancel-guarded promise pattern (#97).
 *
 * @param {string} name Hook name (e.g. "cart", "useCart", "use-user-profile")
 * @param {object} [options={}] Command options
 * @returns {Promise<object>} Generator execution result
 */
export async function executeGenerateHook(name, options = {}) {
  const cleanName = normalizeHookName(name);
  const validatedName = validateName(cleanName);
  const variants = buildNameVariants(validatedName);

  const cwd = options.cwd || process.cwd();
  const { manifest, paths, root } = readConfig({ cwd });

  const isDryRun = Boolean(options.dryRun);
  const isForce = Boolean(options.force);
  const isJson = Boolean(options.json);

  const targetDir = resolveHookTargetDir({ options, manifest, paths });

  const templateVars = {
    ...variants,
    hookName: `use${variants.Name}`,
  };

  const plan = planGenerator({
    templateDir: HOOK_TEMPLATE_DIR,
    vars: templateVars,
    targetDir,
    manifest,
    root,
  });

  const result = applyPlan(plan, {
    dryRun: isDryRun,
    force: isForce,
  });

  if (manifest.agentDocs && !isDryRun) {
    await syncAgentContext(root);
  }

  const hookFileName = `use${variants.Name}.${manifest.tooling?.language === 'js' ? 'js' : 'ts'}`;
  const relHookPath = path.posix.join(targetDir, hookFileName);

  if (isJson) {
    const jsonOutput = {
      success: true,
      kind: 'hooks',
      name: `use${variants.Name}`,
      targetDir,
      created: result.created,
      skipped: result.skipped,
      overwritten: result.overwritten,
      plan: result.plan,
    };
    process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
  } else {
    for (const item of result.plan) {
      if (item.action === 'skip') {
        process.stdout.write(`  - SKIP ${item.relPath} (already exists, use --force to overwrite)\n`);
      } else if (item.action === 'overwrite') {
        process.stdout.write(`  ! OVERWRITE ${item.relPath}\n`);
      } else if (isDryRun) {
        process.stdout.write(`  [DRY RUN] Would create ${item.relPath}\n`);
      } else {
        process.stdout.write(`  + CREATE ${item.relPath}\n`);
      }
    }
    process.stdout.write(`\nHook ready: ${relHookPath} (React 19 deferred promise pattern)\n`);
  }

  return {
    success: true,
    kind: 'hooks',
    name: `use${variants.Name}`,
    targetDir,
    ...result,
  };
}

/**
 * Register `lumen generate hook <name>` command.
 *
 * @param {import('commander').Command} generate
 */
export function registerHook(generate) {
  generate
    .command('hook <name>')
    .alias('h')
    .description('Scaffold a custom React hook with cancel-guarded async promise pattern')
    .option('--feature <featureName>', 'Generate hook within a specific feature directory')
    .option('--dry-run', 'Preview changes without writing to disk')
    .option('--force', 'Overwrite existing files')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate hook user
  $ lumen g hook use-cart
  $ lumen g hook billing --feature subscription
  $ lumen g hook profile --dry-run
  $ lumen g hook auth --force -j`
    )
    .action(async (name, cmdOpts) => {
      const globalOpts = generate.optsWithGlobals ? generate.optsWithGlobals() : generate.opts();
      const options = { ...globalOpts, ...cmdOpts };
      return await executeGenerateHook(name, options);
    });
}
