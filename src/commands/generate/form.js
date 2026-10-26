import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { validateName, buildNameVariants } from '../../generators/names.js';
import { planGenerator, applyPlan, syncAgentContext } from '../../generators/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FORM_TEMPLATES_DIR = path.resolve(__dirname, '../../../templates/form');

const REQUIRED_PACKAGES = ['react-hook-form', 'zod', '@hookform/resolvers'];

/**
 * Check dependencies in target project's package.json
 * @param {string} root Project root directory
 * @returns {Array<{ name: string, installed: boolean }>}
 */
export function checkFormDependencies(root) {
  const pkgPath = path.join(root, 'package.json');
  let dependencies = {};

  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const parsed = JSON.parse(raw);
      dependencies = {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {}),
      };
    } catch {
      // Ignore parse failure; treat as missing
    }
  }

  return REQUIRED_PACKAGES.map((pkg) => ({
    name: pkg,
    installed: Object.prototype.hasOwnProperty.call(dependencies, pkg),
  }));
}

/**
 * Register `lumen generate form <name>` command.
 * @param {import('commander').Command} generate
 */
export function registerForm(generate) {
  generate
    .command('form <name>')
    .description('Generate a validated React Hook Form with Zod schema')
    .option('--feature <feature>', 'Place form under a feature module (e.g. auth, billing)')
    .option('--service <service>', 'Wire onSubmit to a service module import')
    .option('--dry-run', 'Show files that would be created without writing them')
    .option('-f, --force', 'Overwrite existing files')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen g form user-profile
  $ lumen g form login --feature auth
  $ lumen g form checkout --feature billing --service checkout
  $ lumen g form contact --dry-run
  $ lumen g form signup -j`
    )
    .action(async (name, cmdOpts) => {
      const globalOpts = generate.optsWithGlobals ? generate.optsWithGlobals() : {};
      const options = {
        ...globalOpts,
        ...cmdOpts,
      };

      await executeGenerateForm(name, options);
    });
}

/**
 * Execute form generator logic.
 * @param {string} name Form resource name
 * @param {object} options Command options
 */
export async function executeGenerateForm(name, options = {}) {
  const validatedName = validateName(name);
  const { manifest, paths, root } = readConfig({ cwd: options.cwd });

  let targetDir;

  if (options.feature) {
    const validatedFeature = validateName(options.feature);

    if (
      manifest.architecture?.preset === 'none' ||
      !paths.features ||
      typeof paths.features !== 'string'
    ) {
      throw new LumenError(
        `Feature-scoped forms require a feature architecture with "paths.features" configured (preset: "${manifest.architecture?.preset || 'none'}").`,
        {
          code: EXIT.USER,
          hint: 'Omit --feature to generate in paths.components, or switch to a feature-based architecture preset.',
        }
      );
    }

    targetDir = path.posix.join(paths.features, validatedFeature, 'components');
  } else {
    if (!paths.components || typeof paths.components !== 'string') {
      throw new LumenError(
        'Missing "paths.components" in manifest configuration for form generation.',
        {
          code: EXIT.USER,
          hint: 'Ensure your lumen.config.json has a valid paths.components directory configured.',
        }
      );
    }

    targetDir = paths.components;
  }

  // Determine styling and UI imports
  const isShadcn = manifest.ui?.kit === 'shadcn';
  const isTailwind = manifest.styling?.engine === 'tailwind';
  const isNext = manifest.framework?.name === 'next';

  const clientDirective = isNext ? `'use client';\n\n` : '';

  let uiImports = '';
  let formClassName = '';
  let fieldGroupClassName = '';
  let labelClassName = '';
  let inputClassName = '';
  let errorClassName = '';
  let buttonClassName = '';

  if (isShadcn && paths.ui) {
    // Derive relative import path from targetDir to paths.ui
    let relativeUi = path.posix.relative(targetDir, paths.ui);
    if (!relativeUi.startsWith('.')) {
      relativeUi = `./${relativeUi}`;
    }

    uiImports = `// UI Kit components (${relativeUi})\n// import { Button } from '${relativeUi}/button';\n// import { Input } from '${relativeUi}/input';\n// import { Label } from '${relativeUi}/label';`;
    if (isTailwind) {
      formClassName = 'space-y-4';
      fieldGroupClassName = 'space-y-2';
      labelClassName = 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70';
      inputClassName = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
      errorClassName = 'text-sm font-medium text-destructive';
      buttonClassName = 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2';
    }
  } else if (isTailwind) {
    formClassName = 'space-y-4 max-w-md';
    fieldGroupClassName = 'flex flex-col gap-1';
    labelClassName = 'text-sm font-medium text-gray-700';
    inputClassName = 'border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
    errorClassName = 'text-xs text-red-600 mt-1';
    buttonClassName = 'px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50';
  }

  // Handle optional --service <name>
  let serviceImport = '';
  let serviceCall = '';

  if (options.service) {
    const validatedService = validateName(options.service);
    const serviceNameVariants = buildNameVariants(validatedService);

    // Compute relative import from targetDir to paths.services or default
    let serviceModulePath;
    if (options.feature && paths.features) {
      // In same feature: ../services/<name>
      serviceModulePath = `../services/${serviceNameVariants.name}`;
    } else if (paths.services) {
      let relToServices = path.posix.relative(targetDir, paths.services);
      if (!relToServices.startsWith('.')) {
        relToServices = `./${relToServices}`;
      }
      serviceModulePath = `${relToServices}/${serviceNameVariants.name}`;
    } else {
      serviceModulePath = `@/services/${serviceNameVariants.name}`;
    }

    serviceImport = `import { ${serviceNameVariants.nameCamel}Service } from '${serviceModulePath}';\n`;
    serviceCall = `    if (${serviceNameVariants.nameCamel}Service?.submit) {\n      await ${serviceNameVariants.nameCamel}Service.submit(data);\n    }\n`;
  }

  const templateVars = {
    ...buildNameVariants(validatedName),
    clientDirective,
    serviceImport,
    serviceCall,
    uiImports,
    formClassName,
    fieldGroupClassName,
    labelClassName,
    inputClassName,
    errorClassName,
    buttonClassName,
  };

  // Build execution plan
  const plan = planGenerator({
    templateDir: FORM_TEMPLATES_DIR,
    vars: templateVars,
    targetDir,
    manifest,
    root,
  });

  // Apply plan
  const result = applyPlan(plan, {
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
  });

  // Call agent context sync if enabled
  if (manifest.agentDocs && !options.dryRun) {
    await syncAgentContext(root);
  }

  // Check required package status in project
  const packageChecks = checkFormDependencies(root);

  // CLI output formatting
  if (options.json) {
    const payload = {
      success: true,
      kind: 'form',
      name: validatedName,
      targetDir,
      feature: options.feature || null,
      service: options.service || null,
      dryRun: Boolean(options.dryRun),
      force: Boolean(options.force),
      created: result.created,
      skipped: result.skipped,
      overwritten: result.overwritten,
      plan: result.plan.map((p) => ({
        relPath: p.relPath,
        action: p.action,
      })),
      packages: packageChecks,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    if (options.dryRun) {
      process.stdout.write(`\n[DRY RUN] Generator plan for form "${validatedName}":\n`);
    } else {
      process.stdout.write(`\nGenerated form "${validatedName}":\n`);
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

    if (result.skipped.length > 0 && !options.force && !options.dryRun) {
      process.stdout.write(`\nNote: ${result.skipped.length} existing file(s) skipped. Use --force to overwrite.\n`);
    }

    process.stdout.write(`\nRequired packages:\n`);
    for (const pkg of packageChecks) {
      const icon = pkg.installed ? '✔' : '⚠';
      const status = pkg.installed ? 'installed' : 'missing (install with npm i ' + pkg.name + ')';
      process.stdout.write(`  ${icon} ${pkg.name}: ${status}\n`);
    }
  }

  return {
    kind: 'form',
    name: validatedName,
    targetDir,
    packages: packageChecks,
    ...result,
  };
}
