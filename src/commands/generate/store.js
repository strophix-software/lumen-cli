import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { validateName, buildNameVariants } from '../../generators/names.js';
import { planGenerator, applyPlan, syncAgentContext } from '../../generators/core.js';
import { detectStateLib } from '../../generators/detect-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_ROOT = path.resolve(__dirname, '../../../templates/store');

/**
 * Register `lumen generate store <name>` (or `lumen g store <name>`).
 *
 * @param {import('commander').Command} generate
 */
export function registerStore(generate) {
  generate
    .command('store <name>')
    .description('Generate global state store matching project state library')
    .option('--feature <name>', 'Generate store within a feature directory')
    .option('--persist', 'Add zustand persist middleware (zustand only)')
    .option('--dry-run', 'Preview changes without writing to disk')
    .option('--force', 'Overwrite existing files')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate store auth
  $ lumen g store cart --persist
  $ lumen g store user-profile --feature auth
  $ lumen g store settings --dry-run
  $ lumen g store settings --force`
    )
    .action(async (name, options) => {
      const validatedName = validateName(name);

      // Program global options (-c/--cwd, -j/--json, etc.)
      const globals = generate.optsWithGlobals ? generate.optsWithGlobals() : {};
      const cwd = globals.cwd || process.cwd();
      const isJson = Boolean(globals.json);
      const isDryRun = Boolean(options.dryRun);
      const isForce = Boolean(options.force);

      // Read configuration
      const { manifest, paths, root } = readConfig({ cwd });

      // Architecture preset check
      const archPreset = manifest?.architecture?.preset || manifest?.architecture?.type || 'none';

      let targetDir;
      if (options.feature) {
        const featureName = validateName(options.feature);
        if (archPreset === 'none' || !paths.features || paths.features === 'src') {
          throw new LumenError(
            `Architecture preset "${archPreset}" does not support feature-scoped stores.`,
            {
              code: EXIT.USER,
              hint: 'In "none" architecture, generate shared stores without the --feature flag.',
            }
          );
        }
        targetDir = path.posix.join(paths.features, featureName, 'store');
      } else {
        if (!paths.services) {
          throw new LumenError(
            'Cannot derive shared store directory because paths.services is not defined in manifest.',
            {
              code: EXIT.CONFIG,
              hint: 'Ensure paths.services is defined in lumen.config.json',
            }
          );
        }
        targetDir = path.posix.join(path.posix.dirname(paths.services), 'stores');
      }

      // Detect state management library
      const stateLib = detectStateLib(root);

      // Validate --persist flag
      if (options.persist && stateLib !== 'zustand') {
        throw new LumenError(
          `--persist flag is only supported with zustand (detected: ${stateLib}).`,
          {
            code: EXIT.USER,
            hint: 'Install zustand to use persist middleware or omit --persist.',
          }
        );
      }

      // Pick template directory
      let templateSubdir;
      if (stateLib === 'zustand') {
        templateSubdir = options.persist ? 'zustand-persist' : 'zustand';
      } else if (stateLib === 'redux') {
        templateSubdir = 'redux';
      } else {
        templateSubdir = 'context';
      }

      const templateDir = path.join(TEMPLATES_ROOT, templateSubdir);
      if (!fs.existsSync(templateDir)) {
        throw new LumenError(`Template directory not found: ${templateDir}`, {
          code: EXIT.INTERNAL,
        });
      }

      const vars = {
        ...buildNameVariants(validatedName),
        persist: Boolean(options.persist),
      };

      // Plan generation
      const plan = planGenerator({
        templateDir,
        vars,
        targetDir,
        manifest,
        root,
      });

      // Apply plan
      const result = applyPlan(plan, {
        dryRun: isDryRun,
        force: isForce,
      });

      // Sync agent context if enabled
      if (manifest.agentDocs && !isDryRun) {
        await syncAgentContext(root);
      }

      // CLI output formatting
      if (isJson) {
        const payload = {
          success: true,
          kind: 'store',
          name: validatedName,
          stateLib,
          targetDir,
          dryRun: isDryRun,
          force: isForce,
          created: result.created,
          skipped: result.skipped,
          overwritten: result.overwritten,
          plan: result.plan.map((p) => ({
            relPath: p.relPath,
            action: p.action,
          })),
        };
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        if (isDryRun) {
          process.stdout.write(`\n[DRY RUN] Generator plan for store "${validatedName}" (${stateLib}):\n`);
        } else {
          process.stdout.write(`\nGenerated store "${validatedName}" (${stateLib}):\n`);
        }

        for (const item of result.plan) {
          const tag =
            item.action === 'create'
              ? '+ CREATE'
              : item.action === 'overwrite'
              ? '! OVERWRITE'
              : '- SKIP';
          process.stdout.write(`  ${tag} ${item.relPath}\n`);
        }

        if (result.skipped.length > 0 && !isForce && !isDryRun) {
          process.stdout.write(
            `\nNote: ${result.skipped.length} existing file(s) skipped. Use --force to overwrite.\n`
          );
        }
      }

      return {
        kind: 'store',
        name: validatedName,
        stateLib,
        targetDir,
        ...result,
      };
    });
}
