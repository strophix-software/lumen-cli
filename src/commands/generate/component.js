import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { validateName, buildNameVariants } from '../../generators/names.js';
import { syncAgentContext } from '../../generators/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPONENT_TEMPLATE_DIR = path.resolve(__dirname, '../../../templates/component');

/**
 * Resolve target directory based on flags and manifest.
 *
 * @param {object} params
 * @param {object} params.options
 * @param {object} params.manifest
 * @param {object} params.paths
 * @returns {string} Relative target directory path (POSIX)
 */
export function resolveComponentTargetDir({ options, manifest, paths }) {
  if (options.feature) {
    const validatedFeature = validateName(options.feature);
    const featureVariants = buildNameVariants(validatedFeature);

    if (
      manifest.architecture?.preset === 'none' ||
      !paths.features ||
      typeof paths.features !== 'string'
    ) {
      throw new LumenError(
        `Feature-scoped components require a feature architecture with "paths.features" configured (preset: "${manifest.architecture?.preset || 'none'}").`,
        {
          code: EXIT.USER,
          hint: 'Omit --feature to generate in paths.components, or switch to a feature-based architecture preset.',
        }
      );
    }

    if (options.type) {
      const taxonomy = options.type.toLowerCase().trim();
      return path.posix.join(paths.features, featureVariants.nameKebab, 'components', taxonomy);
    }

    return path.posix.join(paths.features, featureVariants.nameKebab, 'components');
  }

  // Non-feature components with taxonomy
  if (options.type) {
    const taxonomy = options.type.toLowerCase().trim();
    if (taxonomy === 'primitives' || taxonomy === 'ui' || taxonomy === 'primitive') {
      return paths.ui || 'src/components/ui';
    }
    const baseComponents = paths.components || 'src/components';
    return path.posix.join(baseComponents, taxonomy);
  }

  // Default target
  return paths.components || 'src/components';
}

/**
 * Render template with variable replacements.
 *
 * @param {string} templatePath
 * @param {object} vars
 * @returns {string}
 */
function renderTemplate(templatePath, vars) {
  let content = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, String(value));
  }
  return content;
}

/**
 * Scaffolds a React / Next.js component.
 *
 * @param {string} name
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function executeGenerateComponent(name, options = {}) {
  const validatedName = validateName(name);
  const variants = buildNameVariants(validatedName);
  const { manifest, paths, root } = readConfig({ cwd: options.cwd });

  const language = options.language || manifest?.tooling?.language || 'ts';
  const ext = language === 'ts' ? 'tsx' : 'jsx';

  const targetDir = resolveComponentTargetDir({ options, manifest, paths });
  const absTargetDir = path.resolve(root, targetDir);

  const clientDirective = options.client ? `'use client';\n\n` : '';
  const templateVars = {
    ...variants,
    clientDirective,
  };

  const isCompound = Boolean(options.compound);
  const componentTemplateFile = isCompound
    ? path.join(COMPONENT_TEMPLATE_DIR, `compound.${ext}.tpl`)
    : path.join(COMPONENT_TEMPLATE_DIR, `component.${ext}.tpl`);

  const componentContent = renderTemplate(componentTemplateFile, templateVars);

  const componentRelFile = path.posix.join(targetDir, `${variants.Name}.${ext}`);
  const componentAbsFile = path.resolve(root, componentRelFile);

  const filesToCreate = [
    {
      absPath: componentAbsFile,
      relPath: componentRelFile,
      content: componentContent,
      kind: 'component',
    },
  ];

  if (options.test) {
    const testTemplateFile = isCompound
      ? path.join(COMPONENT_TEMPLATE_DIR, `test-compound.${ext}.tpl`)
      : path.join(COMPONENT_TEMPLATE_DIR, `test.${ext}.tpl`);
    const testContent = renderTemplate(testTemplateFile, templateVars);
    const testRelFile = path.posix.join(targetDir, `${variants.Name}.test.${ext}`);
    const testAbsFile = path.resolve(root, testRelFile);

    filesToCreate.push({
      absPath: testAbsFile,
      relPath: testRelFile,
      content: testContent,
      kind: 'test',
    });
  }

  // Check barrel index update
  const indexCandidates = [`index.${language === 'ts' ? 'ts' : 'js'}`, `index.${ext}`];
  let barrelRelFile = null;
  let barrelAbsFile = null;
  let barrelContent = null;

  for (const idxName of indexCandidates) {
    const candidateAbs = path.resolve(absTargetDir, idxName);
    if (fs.existsSync(candidateAbs)) {
      barrelAbsFile = candidateAbs;
      barrelRelFile = path.posix.join(targetDir, idxName);
      break;
    }
  }

  if (barrelAbsFile && fs.existsSync(barrelAbsFile)) {
    const existingBarrel = fs.readFileSync(barrelAbsFile, 'utf8');
    const exportStatement = `export * from './${variants.Name}';`;
    if (!existingBarrel.includes(`./${variants.Name}`)) {
      let updatedBarrel = existingBarrel;
      if (updatedBarrel && !updatedBarrel.endsWith('\n')) {
        updatedBarrel += '\n';
      }
      updatedBarrel += `${exportStatement}\n`;
      barrelContent = updatedBarrel;
    }
  }

  // Build actions plan
  const plan = [];
  const created = [];
  const skipped = [];

  for (const item of filesToCreate) {
    const exists = fs.existsSync(item.absPath);
    let action;
    if (exists && !options.force) {
      action = 'skip';
      skipped.push(item.relPath);
    } else if (exists && options.force) {
      action = 'overwrite';
      created.push(item.relPath);
    } else {
      action = 'create';
      created.push(item.relPath);
    }

    plan.push({ action, file: item.relPath, ...item });
  }

  if (barrelContent && barrelAbsFile) {
    plan.push({
      action: 'overwrite',
      file: barrelRelFile,
      absPath: barrelAbsFile,
      relPath: barrelRelFile,
      content: barrelContent,
      kind: 'barrel',
    });
    created.push(barrelRelFile);
  }

  // Apply plan
  if (!options.dryRun) {
    for (const item of plan) {
      if (item.action === 'skip') continue;
      fs.mkdirSync(path.dirname(item.absPath), { recursive: true });
      fs.writeFileSync(item.absPath, item.content, 'utf8');
    }

    if (manifest?.agentDocs) {
      await syncAgentContext(root);
    }
  }

  const result = {
    success: true,
    kind: 'component',
    name: variants.Name,
    created,
    skipped,
    plan: plan.map((p) => ({ action: p.action, file: p.file })),
    compound: isCompound,
    feature: options.feature || null,
    taxonomy: options.type || null,
  };

  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    for (const item of plan) {
      if (options.dryRun) {
        process.stdout.write(`  [DRY RUN] Would create ${item.file}\n`);
      } else if (item.action === 'skip') {
        process.stdout.write(`  - SKIP ${item.file} (already exists, use --force to overwrite)\n`);
      } else if (item.action === 'overwrite') {
        process.stdout.write(`  ! OVERWRITE ${item.file}\n`);
      } else {
        process.stdout.write(`  + CREATE ${item.file}\n`);
      }
    }
    process.stdout.write(`\nComponent ready: ${componentRelFile}\n`);
  }

  return result;
}

/**
 * Register `lumen generate component <name>` command.
 * @param {import('commander').Command} generate
 */
export function registerComponent(generate) {
  generate
    .command('component <name>')
    .alias('c')
    .description('Generate an isolated, compound, or feature-scoped React component')
    .option('-f, --feature <name>', 'place component in feature module (e.g. auth, billing)')
    .option('--client', 'add "use client" directive (Next.js App Router)')
    .option('-t, --type <taxonomy>', 'component taxonomy (primitives, composites, layouts, feedback)')
    .option('--compound', 'scaffold compound component with context and child slots')
    .option('--test', 'generate co-located unit test')
    .option('--dry-run', 'preview file operations without writing to disk')
    .option('--force', 'overwrite existing files')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate component Button
  $ lumen g component UserCard --feature auth
  $ lumen g component Dialog --type primitives
  $ lumen g component Modal --compound --test
  $ lumen g component Header --client
  $ lumen g c Navigation --feature shell --test --dry-run`
    )
    .action(async (name, cmdOpts) => {
      const globalOpts = generate.optsWithGlobals ? generate.optsWithGlobals() : generate.opts();
      const options = { ...globalOpts, ...cmdOpts };
      await executeGenerateComponent(name, options);
    });
}
