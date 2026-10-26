import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { runGenerator, syncAgentContext } from '../../generators/core.js';
import { buildNameVariants } from '../../generators/names.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PAGE_TEMPLATE_DIR = path.resolve(__dirname, '../../../templates/page');

const ROUTER_FILENAMES = [
  'index.tsx',
  'routes.tsx',
  'router.tsx',
  'index.jsx',
  'routes.jsx',
  'router.jsx',
  'index.ts',
  'routes.ts',
  'router.ts',
  'index.js',
  'routes.js',
  'router.js',
];

/**
 * Parse and validate route name or path.
 * Supports Next.js route groups `(group)` and dynamic segments `[id]`, `[...slug]`.
 *
 * @param {string} input
 * @returns {{ raw: string, normalized: string, segments: string[], componentName: string, nameKebab: string, title: string, routeUrl: string }}
 */
export function parseRouteInput(input) {
  if (!input || typeof input !== 'string' || !input.trim()) {
    throw new LumenError('Name is required and cannot be empty.', {
      code: EXIT.USER,
      hint: 'Provide a valid route name or path, e.g. "settings", "(public)/catalog", or "auctions/[id]".',
    });
  }

  const trimmed = input.trim();
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    throw new LumenError(`Invalid route path "${trimmed}": path traversal characters are not allowed.`, {
      code: EXIT.USER,
    });
  }

  const normalized = trimmed.replace(/^\/+|\/+$/g, '');
  if (!normalized) {
    throw new LumenError(`Invalid route path "${trimmed}": route path cannot be empty or root slash only.`, {
      code: EXIT.USER,
    });
  }

  const segments = normalized.split('/');
  for (const segment of segments) {
    const isRouteGroup = /^\([a-zA-Z0-9_-]+\)$/.test(segment);
    const isDynamic = /^\[{1,2}\.{0,3}[a-zA-Z0-9_-]+\]{1,2}$/.test(segment);
    const isIdentifier = /^[a-zA-Z0-9_-]+$/.test(segment);

    if (!isRouteGroup && !isDynamic && !isIdentifier) {
      throw new LumenError(`Invalid route segment "${segment}" in path "${trimmed}".`, {
        code: EXIT.USER,
        hint: 'Segments must be valid identifiers, route groups like "(auth)", or dynamic parameters like "[id]".',
      });
    }
  }

  const meaningfulSegments = segments.filter((s) => !s.startsWith('('));
  const effectiveSegments = meaningfulSegments.length > 0 ? meaningfulSegments : segments;

  const tokens = [];
  for (const seg of effectiveSegments) {
    const clean = seg.replace(/[()[\]]/g, '').replace(/^\.+/, '');
    if (clean) tokens.push(clean);
  }

  const toPascal = (str) =>
    str
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
      .replace(/^[a-z]/, (c) => c.toUpperCase());

  const toKebab = (str) =>
    str
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .toLowerCase();

  const componentBase = tokens.map(toPascal).join('');
  const componentName = `${componentBase || 'Route'}Page`;
  const nameKebab = tokens.map(toKebab).join('-');
  const title = tokens.map(toPascal).join(' ');
  const routeUrl = '/' + meaningfulSegments.join('/');

  return {
    raw: trimmed,
    normalized,
    segments,
    componentName,
    nameKebab,
    title: `${title} Page`,
    routeUrl,
  };
}

/**
 * Searches for a router file under the pages directory.
 * @param {string} pagesDir Absolute path to pages directory
 * @returns {string | null} Absolute path to router file or null
 */
function findRouterFile(pagesDir) {
  if (!fs.existsSync(pagesDir)) {
    return null;
  }
  for (const filename of ROUTER_FILENAMES) {
    const candidate = path.join(pagesDir, filename);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

/**
 * Builds the route definition and import snippet for a page component.
 * @param {object} variants
 * @returns {{ importStatement: string, routeStatement: string, fullSnippet: string }}
 */
function buildRouteSnippet(variants) {
  const componentName = `${variants.Name}Page`;
  const routePath = `/${variants.nameKebab}`;
  const importStatement = `import { ${componentName} } from './${componentName}';`;
  const routeStatement = `{ path: '${routePath}', element: <${componentName} /> },`;
  const fullSnippet = `${importStatement}\n${routeStatement}`;
  return {
    componentName,
    routePath,
    importStatement,
    routeStatement,
    fullSnippet,
  };
}

/**
 * Attempts to register a route in the router file using the `// lumen:routes` marker.
 *
 * @param {object} params
 * @param {string} params.routerFilePath Absolute path to router file
 * @param {object} params.snippet Route snippet details
 * @param {boolean} params.dryRun
 * @returns {{ registered: boolean, markerFound: boolean }}
 */
function registerRouteInFile({ routerFilePath, snippet, dryRun }) {
  const content = fs.readFileSync(routerFilePath, 'utf8');
  const markerIndex = content.indexOf('// lumen:routes');

  if (markerIndex === -1) {
    return { registered: false, markerFound: false };
  }

  // Extract indentation before marker
  const lineStart = content.lastIndexOf('\n', markerIndex) + 1;
  const lineIndent = content.slice(lineStart, markerIndex);

  // Split into lines or insert relative to marker
  const insertion = `\n${lineIndent}${snippet.routeStatement}`;
  const updatedContent =
    content.slice(0, markerIndex + '// lumen:routes'.length) +
    insertion +
    content.slice(markerIndex + '// lumen:routes'.length);

  // Also check if import already exists; if not, prepend import at the top
  let finalContent = updatedContent;
  if (!updatedContent.includes(snippet.importStatement)) {
    finalContent = `${snippet.importStatement}\n${updatedContent}`;
  }

  if (!dryRun) {
    fs.writeFileSync(routerFilePath, finalContent, 'utf8');
  }

  return { registered: true, markerFound: true };
}

/**
 * Scaffolds a route page for Next.js (App Router or Pages Router).
 *
 * @param {object} params
 * @param {string} params.name Route name or path
 * @param {object} params.options Command options
 * @param {object} params.manifest Parsed manifest
 * @param {object} params.paths Resolved manifest paths
 * @param {string} params.root Project root
 * @returns {object} Generator execution summary
 */
async function generateNextPage({ name, options, manifest, paths, root }) {
  const isAppRouter = manifest.framework?.variant !== 'pages-router';
  const language = options.language || manifest.tooling?.language || 'ts';
  const ext = language === 'ts' ? 'tsx' : 'jsx';

  const routeInfo = parseRouteInput(name);

  let relFilePath;
  if (isAppRouter) {
    relFilePath = path.posix.join(paths.pages, ...routeInfo.segments, `page.${ext}`);
  } else {
    const parentSegments = routeInfo.segments.slice(0, -1);
    const fileSegment = routeInfo.segments[routeInfo.segments.length - 1];
    relFilePath = path.posix.join(paths.pages, ...parentSegments, `${fileSegment}.${ext}`);
  }

  const absFilePath = path.resolve(root, relFilePath);
  const fileExists = fs.existsSync(absFilePath);

  let action;
  if (fileExists && !options.force) {
    action = 'skip';
  } else if (fileExists && options.force) {
    action = 'overwrite';
  } else {
    action = 'create';
  }

  const clientDirective = options.client ? `'use client';\n\n` : '';
  const content = `${clientDirective}export function ${routeInfo.componentName}() {
  return (
    <div className="container mx-auto px-4 py-8" data-testid="${routeInfo.nameKebab}-page">
      <h1 className="text-3xl font-bold tracking-tight mb-4">${routeInfo.componentName}</h1>
      <p className="text-muted-foreground">Generated by lumen-cli.</p>
    </div>
  );
}

export default ${routeInfo.componentName};
`;

  if (!options.dryRun && action !== 'skip') {
    fs.mkdirSync(path.dirname(absFilePath), { recursive: true });
    fs.writeFileSync(absFilePath, content, 'utf8');
  }

  if (manifest?.agentDocs && !options.dryRun) {
    await syncAgentContext(root);
  }

  if (options.json) {
    const jsonOutput = {
      success: true,
      kind: 'pages',
      name,
      created: action === 'create' || action === 'overwrite' ? [relFilePath] : [],
      skipped: action === 'skip' ? [relFilePath] : [],
      plan: [{ action, file: relFilePath }],
    };
    process.stdout.write(JSON.stringify(jsonOutput, null, 2) + '\n');
  } else {
    if (options.dryRun) {
      process.stdout.write(`  [DRY RUN] Would create ${relFilePath}\n`);
    } else if (action === 'skip') {
      process.stdout.write(`  - SKIP ${relFilePath} (already exists, use --force to overwrite)\n`);
    } else if (action === 'overwrite') {
      process.stdout.write(`  ! OVERWRITE ${relFilePath}\n`);
    } else {
      process.stdout.write(`  + CREATE ${relFilePath}\n`);
    }

    const routerType = isAppRouter ? 'App Router' : 'Pages Router';
    process.stdout.write(`\nRoute ready: ${routeInfo.routeUrl} (Next.js ${routerType} file-system routing)\n`);
  }

  return {
    success: true,
    kind: 'pages',
    name,
    created: action === 'create' || action === 'overwrite' ? [relFilePath] : [],
    skipped: action === 'skip' ? [relFilePath] : [],
    plan: [{ action, file: relFilePath }],
    routerFile: null,
    routeSnippet: null,
    registration: null,
  };
}

/**
 * Subcommand `lumen generate page <name>` (alias `g page <name>`).
 * @param {import('commander').Command} generate
 */
export function registerPage(generate) {
  generate
    .command('page <name>')
    .alias('p')
    .description('Scaffold a route page for React + Vite or Next.js')
    .option('--dry-run', 'preview file operations without writing to disk')
    .option('--force', 'overwrite existing files')
    .option('--client', 'mark page component with "use client" directive (Next.js App Router)')
    .option('--register', 'insert route snippet into router file if // lumen:routes marker is found')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate page settings
  $ lumen g page "(public)/catalog"
  $ lumen g page "items/[id]"
  $ lumen g page dashboard --client
  $ lumen g page billing --register
  $ lumen g page dashboard --dry-run
  $ lumen g page profile --force`
    )
    .action(async (name, cmdOpts) => {
      const globalOpts = generate.optsWithGlobals ? generate.optsWithGlobals() : generate.opts();
      const options = { ...globalOpts, ...cmdOpts };
      const cwd = options.cwd || process.cwd();

      const { manifest, paths, root } = readConfig({ cwd });

      // Validate paths.pages
      if (!paths || !paths.pages) {
        throw new LumenError(
          'Generator target "pages" is not configured in manifest paths.',
          {
            code: EXIT.CONFIG,
            hint: 'Ensure your lumen.config.json paths object contains a "pages" entry.',
          }
        );
      }

      // Next.js App Router / Pages Router generation
      if (manifest?.framework?.name === 'next') {
        return await generateNextPage({ name, options, manifest, paths, root });
      }

      const variants = buildNameVariants(name);
      const snippet = buildRouteSnippet(variants);

      // Execute generator for React + Vite
      const genResult = await runGenerator({
        kind: 'pages',
        name,
        templateDir: PAGE_TEMPLATE_DIR,
        options: {
          ...options,
          cwd,
        },
      });

      // Search for router file in paths.pages
      const pagesDir = path.resolve(root, paths.pages);
      const routerFilePath = findRouterFile(pagesDir);
      let registrationResult = null;

      if (routerFilePath) {
        const routerRelPath = path.relative(root, routerFilePath);

        if (options.register) {
          registrationResult = registerRouteInFile({
            routerFilePath,
            snippet,
            dryRun: Boolean(options.dryRun),
          });
        }

        if (!options.json) {
          process.stdout.write(`\nRouter file found: ${routerRelPath}\n`);

          if (options.register) {
            if (registrationResult?.registered) {
              if (options.dryRun) {
                process.stdout.write(`  [DRY RUN] Would register route in ${routerRelPath}\n`);
              } else {
                process.stdout.write(`  + REGISTERED route in ${routerRelPath}\n`);
              }
            } else {
              process.stdout.write(
                `  ! Could not auto-register: "// lumen:routes" marker comment not found in ${routerRelPath}\n`
              );
              process.stdout.write(`\nAdd this route snippet manually:\n\n${snippet.fullSnippet}\n\n`);
            }
          } else {
            process.stdout.write(`\nRoute snippet to add:\n\n${snippet.fullSnippet}\n\n`);
            process.stdout.write(
              `Tip: Run with --register to automatically insert into router files containing "// lumen:routes".\n`
            );
          }
        }
      }

      return {
        ...genResult,
        routerFile: routerFilePath ? path.relative(root, routerFilePath) : null,
        routeSnippet: snippet.fullSnippet,
        registration: registrationResult,
      };
    });
}
