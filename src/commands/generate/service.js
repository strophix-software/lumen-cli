import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { validateName, buildNameVariants } from '../../generators/names.js';
import { render, loadTemplateDir } from '../../generators/template.js';
import { assertPathContained, interpolatePath, applyPlan, syncAgentContext } from '../../generators/core.js';
import { detectHttpClient } from '../../generators/detect-stack.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVICE_TEMPLATE_DIR = path.resolve(__dirname, '../../../templates/service');

/**
 * Builds helper variable blocks for the service template based on options and detected HTTP client.
 */
function buildServiceVars({ nameVariants, clientInfo, isPaginated, language, isServer = false }) {
  const isTs = language === 'ts';
  const { name, Name } = nameVariants;

  // 1. Import block
  const importBlock = isServer
    ? "import { db } from '@/lib/db';\n"
    : clientInfo.importStatement;

  const basePathBlock = isServer
    ? '// Server Data Access Layer (DAL) interacting with database client\n'
    : `const BASE_PATH = '/${nameVariants.nameKebab}s';\n`;

  // 2. Types block (TS only)
  let typesBlock = '';
  if (isTs) {
    if (isPaginated) {
      typesBlock = `export interface ${Name} {
  id: string;
  // TODO: Add ${Name} properties
}

export type Create${Name}Input = Omit<${Name}, 'id'>;
export type Update${Name}Input = Partial<Create${Name}Input>;

export interface ${Name}ListParams {
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}`;
    } else {
      typesBlock = `export interface ${Name} {
  id: string;
  // TODO: Add ${Name} properties
}

export type Create${Name}Input = Omit<${Name}, 'id'>;
export type Update${Name}Input = Partial<Create${Name}Input>;`;
    }
  }

  // 3. Method parameter definitions & return types
  const getParamDef = isPaginated
    ? (isTs ? `params?: ${Name}ListParams` : 'params')
    : '';
  const getReturnType = isTs
    ? (isPaginated ? `: Promise<PageResult<${Name}>>` : `: Promise<${Name}[]>`)
    : '';

  // 4. Method bodies depending on client (server db vs axios vs custom fetch vs raw fetch)
  let getMethodBody = '';
  let getByIdMethodBody = '';
  let createMethodBody = '';
  let updateMethodBody = '';
  let deleteMethodBody = '';

  if (isServer) {
    if (isPaginated) {
      getMethodBody = `    const page = params?.page || 1;\n    const pageSize = params?.pageSize || 10;\n    const [items, total] = await Promise.all([\n      db.${nameVariants.nameCamel}.findMany({\n        skip: (page - 1) * pageSize,\n        take: pageSize,\n      }),\n      db.${nameVariants.nameCamel}.count(),\n    ]);\n    return { items, total, page, pageSize };`;
    } else {
      getMethodBody = `    return await db.${nameVariants.nameCamel}.findMany();`;
    }
    getByIdMethodBody = `    return await db.${nameVariants.nameCamel}.findUniqueOrThrow({\n      where: { id },\n    });`;
    createMethodBody = `    return await db.${nameVariants.nameCamel}.create({\n      data,\n    });`;
    updateMethodBody = `    return await db.${nameVariants.nameCamel}.update({\n      where: { id },\n      data,\n    });`;
    deleteMethodBody = `    await db.${nameVariants.nameCamel}.delete({\n      where: { id },\n    });`;
  } else if (clientInfo.client === 'axios') {
    if (isPaginated) {
      getMethodBody = `    const response = await api.get(BASE_PATH, { params });\n    return response.data;`;
    } else {
      getMethodBody = `    const response = await api.get(BASE_PATH);\n    return response.data;`;
    }
    getByIdMethodBody = `    const response = await api.get(\`\${BASE_PATH}/\${id}\`);\n    return response.data;`;
    createMethodBody = `    const response = await api.post(BASE_PATH, data);\n    return response.data;`;
    updateMethodBody = `    const response = await api.put(\`\${BASE_PATH}/\${id}\`, data);\n    return response.data;`;
    deleteMethodBody = `    await api.delete(\`\${BASE_PATH}/\${id}\`);`;
  } else if (clientInfo.hasCustomClient) {
    if (isPaginated) {
      getMethodBody = `    return apiClient.get(BASE_PATH, { params });`;
    } else {
      getMethodBody = `    return apiClient.get(BASE_PATH);`;
    }
    getByIdMethodBody = `    return apiClient.get(\`\${BASE_PATH}/\${id}\`);`;
    createMethodBody = `    return apiClient.post(BASE_PATH, data);`;
    updateMethodBody = `    return apiClient.put(\`\${BASE_PATH}/\${id}\`, data);`;
    deleteMethodBody = `    await apiClient.delete(\`\${BASE_PATH}/\${id}\`);`;
  } else {
    // Standard Fetch fallback
    if (isPaginated) {
      getMethodBody = `    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
    const query = searchParams.toString();
    const url = query ? \`\${BASE_URL}\${BASE_PATH}?\${query}\` : \`\${BASE_URL}\${BASE_PATH}\`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(\`Failed to fetch ${name} list: \${response.statusText}\`);
    }
    return response.json();`;
    } else {
      getMethodBody = `    const response = await fetch(\`\${BASE_URL}\${BASE_PATH}\`);
    if (!response.ok) {
      throw new Error(\`Failed to fetch ${name} list: \${response.statusText}\`);
    }
    return response.json();`;
    }

    getByIdMethodBody = `    const response = await fetch(\`\${BASE_URL}\${BASE_PATH}/\${id}\`);
    if (!response.ok) {
      throw new Error(\`Failed to fetch ${name} \${id}: \${response.statusText}\`);
    }
    return response.json();`;

    createMethodBody = `    const response = await fetch(\`\${BASE_URL}\${BASE_PATH}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(\`Failed to create ${name}: \${response.statusText}\`);
    }
    return response.json();`;

    updateMethodBody = `    const response = await fetch(\`\${BASE_URL}\${BASE_PATH}/\${id}\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(\`Failed to update ${name} \${id}: \${response.statusText}\`);
    }
    return response.json();`;

    deleteMethodBody = `    const response = await fetch(\`\${BASE_URL}\${BASE_PATH}/\${id}\`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(\`Failed to delete ${name} \${id}: \${response.statusText}\`);
    }`;
  }

  return {
    importBlock,
    typesBlock,
    basePathBlock,
    getParamDef,
    getReturnType,
    getMethodBody,
    getByIdMethodBody,
    createMethodBody,
    updateMethodBody,
    deleteMethodBody,
  };
}

/**
 * Registers `lumen generate service <name>` subcommand on commander generate program.
 *
 * @param {import('commander').Command} generate
 */
export function registerService(generate) {
  generate
    .command('service <name>')
    .description('Generate a typed CRUD service client')
    .option('--feature <featureName>', 'Generate service within a specific feature directory')
    .option('--paginated', 'Include pagination parameters and PageResult types')
    .option('--with-mocks', 'Generate mock data fixture file alongside service')
    .option('--server', 'Generate server-side domain service / DAL using database client (@/lib/db)')
    .option('--dry-run', 'Preview changes without writing to disk')
    .option('--force', 'Overwrite existing files')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate service user
  $ lumen g service user --paginated
  $ lumen g service user --server
  $ lumen g service billing --feature subscription
  $ lumen g service product --with-mocks --dry-run
  $ lumen g service order --force -j`
    )
    .action(async (name, cmdOpts) => {
      const globals = generate.optsWithGlobals ? generate.optsWithGlobals() : {};
      const cwd = globals.cwd || process.cwd();
      const isJson = Boolean(globals.json);
      const isDryRun = Boolean(cmdOpts.dryRun || globals.dryRun);
      const isForce = Boolean(cmdOpts.force || globals.force);
      const isPaginated = Boolean(cmdOpts.paginated);
      const withMocks = Boolean(cmdOpts.withMocks);
      const isServer = Boolean(cmdOpts.server);

      try {
        const validatedName = validateName(name);

        const { manifest, paths, root } = readConfig({ cwd });

      // Resolve destination directory
      let targetDir;
      if (cmdOpts.feature) {
        const featureName = validateName(cmdOpts.feature);
        const preset = manifest.architecture?.preset || manifest.architecture?.type;
        if (preset === 'none' || !paths.features || paths.features === 'src') {
          throw new LumenError(
            `Cannot use --feature "${featureName}": feature architecture is not supported in preset "${preset}".`,
            {
              code: EXIT.USER,
              hint: `Architecture preset "${preset}" does not use features. Omit --feature to generate a service at "${paths.services}".`,
            }
          );
        }
        targetDir = path.posix.join(paths.features, featureName, 'services');
      } else {
        if (!paths.services) {
          throw new LumenError(
            'Cannot generate service: "services" path is not defined in manifest paths.',
            {
              code: EXIT.USER,
              hint: `Configure "paths.services" in lumen.config.json or use an architecture preset that supports services.`,
            }
          );
        }
        targetDir = paths.services;
      }

      // Check HTTP or Server stack
      const clientInfo = isServer
        ? { client: 'server-db', importStatement: "import { db } from '@/lib/db';\n", hasCustomClient: false }
        : detectHttpClient(root, targetDir);

      const language = manifest?.tooling?.language || 'ts';
      const nameVariants = buildNameVariants(validatedName);
      const serviceVars = buildServiceVars({
        nameVariants,
        clientInfo,
        isPaginated,
        language,
        isServer,
      });

      const vars = {
        ...nameVariants,
        ...serviceVars,
      };

      // Load templates and filter mocks if not requested
      let templates = loadTemplateDir(SERVICE_TEMPLATE_DIR, { language });
      if (!withMocks) {
        templates = templates.filter((tpl) => !tpl.relPath.includes('.mocks.'));
      }

      // Build plan
      const plan = [];
      for (const item of templates) {
        const interpolatedRel = interpolatePath(item.relPath, vars);
        const destRelPath = path.posix.join(targetDir, interpolatedRel);
        const destFullPath = path.resolve(root, destRelPath);

        assertPathContained(root, destFullPath);

        const renderedContent = render(item.contents, vars);
        const exists = fs.existsSync(destFullPath);
        const action = exists ? 'skip' : 'create';

        plan.push({
          path: destFullPath,
          relPath: destRelPath,
          contents: renderedContent,
          action,
        });
      }

      // Apply plan
      const result = applyPlan(plan, {
        dryRun: isDryRun,
        force: isForce,
      });

      if (manifest.agentDocs && !isDryRun) {
        await syncAgentContext(root);
      }

      // Output formatting
      if (isJson) {
        const payload = {
          success: true,
          kind: 'service',
          name: validatedName,
          targetDir,
          dryRun: isDryRun,
          force: isForce,
          paginated: isPaginated,
          server: isServer,
          withMocks,
          client: clientInfo.client,
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
          process.stdout.write(`\n[DRY RUN] Generator plan for ${isServer ? 'server ' : ''}service "${validatedName}":\n`);
        } else {
          process.stdout.write(`\nGenerated ${isServer ? 'server ' : ''}service "${validatedName}":\n`);
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
          kind: 'service',
          name: validatedName,
          targetDir,
          ...result,
        };
      } catch (err) {
        if (err instanceof LumenError) {
          if (isJson) {
            const payload = {
              error: err.message,
              code: err.code,
            };
            if (err.hint) {
              payload.hint = err.hint;
            }
            process.stderr.write(`${JSON.stringify(payload)}\n`);
          } else {
            process.stderr.write(`Error: ${err.message}\n`);
            if (err.hint) {
              process.stderr.write(`Hint: ${err.hint}\n`);
            }
          }
          process.exitCode = err.code ?? EXIT.USER;
          return;
        }
        throw err;
      }
    });
}
