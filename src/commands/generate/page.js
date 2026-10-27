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
  'routes.tsx',
  'router.tsx',
  'index.tsx',
  'App.tsx',
  'routes.jsx',
  'router.jsx',
  'index.jsx',
  'App.jsx',
  'routes.ts',
  'router.ts',
  'index.ts',
  'App.ts',
  'routes.js',
  'router.js',
  'index.js',
  'App.js',
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
 * Normalizes and validates a route group name (e.g. "auth" or "(auth)").
 *
 * @param {string} group
 * @returns {string} Clean route group name without enclosing parentheses
 */
export function normalizeRouteGroup(group) {
  if (!group || typeof group !== 'string') {
    throw new LumenError('Route group name cannot be empty.', {
      code: EXIT.USER,
      hint: 'Provide a valid route group identifier, e.g. "auth", "public", or "dashboard".',
    });
  }

  const cleanGroup = group.trim().replace(/^\(|\)$/g, '');
  if (!cleanGroup || !/^[a-zA-Z0-9_-]+$/.test(cleanGroup)) {
    throw new LumenError(`Invalid route group "${group}". Route groups must be alphanumeric identifiers.`, {
      code: EXIT.USER,
      hint: 'Route groups should only contain alphanumeric characters, hyphens, or underscores (e.g. "auth", "public", "dashboard").',
    });
  }

  return cleanGroup;
}

/**
 * Discovers top-level Next.js route groups in the pages directory (e.g. (public), (auth)).
 *
 * @param {string} pagesDir
 * @returns {string[]} Discovered group names without parentheses
 */
export function discoverRouteGroups(pagesDir) {
  if (!pagesDir || !fs.existsSync(pagesDir)) return [];
  try {
    const entries = fs.readdirSync(pagesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^\([a-zA-Z0-9_-]+\)$/.test(entry.name))
      .map((entry) => entry.name.slice(1, -1))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Searches for a router file under the pages directory, its parent directories, or project src.
 * @param {string} pagesDir Absolute path to pages directory
 * @param {string} [root] Absolute path to project root
 * @returns {string | null} Absolute path to router file or null
 */
export function findRouterFile(pagesDir, root = null) {
  const candidateDirs = [];
  if (pagesDir && fs.existsSync(pagesDir)) {
    candidateDirs.push(pagesDir);
  }
  if (pagesDir) {
    const parent = path.dirname(pagesDir);
    if (fs.existsSync(parent) && !candidateDirs.includes(parent)) {
      candidateDirs.push(parent);
    }
  }
  if (root) {
    const srcApp = path.join(root, 'src', 'app');
    if (fs.existsSync(srcApp) && !candidateDirs.includes(srcApp)) {
      candidateDirs.push(srcApp);
    }
    const srcDir = path.join(root, 'src');
    if (fs.existsSync(srcDir) && !candidateDirs.includes(srcDir)) {
      candidateDirs.push(srcDir);
    }
  }

  for (const dir of candidateDirs) {
    for (const filename of ROUTER_FILENAMES) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
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

  const withFetch = Boolean(options.withFetch || options.data);
  const clientDirective = options.client || withFetch ? `'use client';\n\n` : '';

  let pageBody = '';
  let pageContent = '      <p className="text-muted-foreground">Generated by lumen-cli.</p>\n';
  let importStatement = '';

  if (withFetch) {
    importStatement = `import { useState, useEffect } from 'react';\n\n`;
    if (language === 'ts') {
      pageBody = `  const [data, setData] = useState<unknown | null>(null);\n  const [loading, setLoading] = useState<boolean>(true);\n  const [error, setError] = useState<Error | null>(null);\n\n  useEffect(() => {\n    let active = true;\n\n    fetch('/api/${routeInfo.nameKebab}')\n      .then((res) => {\n        if (!res.ok) throw new Error(\`Failed to fetch ${routeInfo.nameKebab}: \${res.statusText}\`);\n        return res.json();\n      })\n      .then((result) => {\n        if (active) {\n          setData(result);\n        }\n      })\n      .catch((err: unknown) => {\n        if (active) {\n          setError(err instanceof Error ? err : new Error(String(err)));\n        }\n      })\n      .finally(() => {\n        if (active) {\n          setLoading(false);\n        }\n      });\n\n    return () => {\n      active = false;\n    };\n  }, []);\n\n`;
    } else {
      pageBody = `  const [data, setData] = useState(null);\n  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState(null);\n\n  useEffect(() => {\n    let active = true;\n\n    fetch('/api/${routeInfo.nameKebab}')\n      .then((res) => {\n        if (!res.ok) throw new Error(\`Failed to fetch ${routeInfo.nameKebab}: \${res.statusText}\`);\n        return res.json();\n      })\n      .then((result) => {\n        if (active) {\n          setData(result);\n        }\n      })\n      .catch((err) => {\n        if (active) {\n          setError(err instanceof Error ? err : new Error(String(err)));\n        }\n      })\n      .finally(() => {\n        if (active) {\n          setLoading(false);\n        }\n      });\n\n    return () => {\n      active = false;\n    };\n  }, []);\n\n`;
    }
    pageContent = `      {loading && <p className="text-muted-foreground">Loading...</p>}\n      {error && <p className="text-destructive">{error.message}</p>}\n      {data && <p className="text-muted-foreground">Data loaded successfully.</p>}\n`;
  }

  const content = `${clientDirective}${importStatement}export function ${routeInfo.componentName}() {
${pageBody}  return (
    <div className="container mx-auto px-4 py-8" data-testid="${routeInfo.nameKebab}-page">
      <h1 className="text-3xl font-bold tracking-tight mb-4">${routeInfo.componentName}</h1>
${pageContent}    </div>
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
    if (isAppRouter) {
      const discovered = discoverRouteGroups(path.resolve(root, paths.pages));
      if (discovered.length > 0) {
        jsonOutput.routeGroups = discovered;
      }
    }
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

    if (isAppRouter && !options.group && !name.startsWith('(')) {
      const discovered = discoverRouteGroups(path.resolve(root, paths.pages));
      if (manifest?.routeGroups || discovered.length > 0) {
        process.stdout.write(`  ℹ Route groups detected in project: ${discovered.map((g) => `(${g})`).join(', ')}. Use --group <name> to place this inside a group.\n`);
      }
    }
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
    .option('-g, --group <name>', 'target route group for Next.js App Router (e.g. "auth", "public")')
    .option('--dry-run', 'preview file operations without writing to disk')
    .option('--force', 'overwrite existing files')
    .option('--client', 'mark page component with "use client" directive (Next.js App Router)')
    .option('--with-fetch', 'include example asynchronous data-fetching with React 19 cancel-guarded promise pattern')
    .option('--register', 'insert route snippet into router file if // lumen:routes marker is found')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate page settings
  $ lumen g page catalog --group public
  $ lumen g page login --group auth
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

      const isAppRouter = manifest?.framework?.name === 'next' && manifest?.framework?.variant !== 'pages-router';

      let routeName = name;
      if (options.group) {
        if (!isAppRouter) {
          throw new LumenError('Route groups are only supported in Next.js App Router projects.', {
            code: EXIT.USER,
            hint: 'Route groups "(group)" are an App Router feature and cannot be used with React Vite or Next.js Pages Router.',
          });
        }

        const cleanGroup = normalizeRouteGroup(options.group);
        const existingMatch = routeName.match(/^\(([^)]+)\)/);
        if (existingMatch) {
          if (existingMatch[1] !== cleanGroup) {
            throw new LumenError(
              `Conflicting route groups: path contains "(${existingMatch[1]})" but --group specifies "${cleanGroup}".`,
              {
                code: EXIT.USER,
                hint: 'Use either --group or include the group in the path, but do not specify conflicting groups.',
              }
            );
          }
        } else {
          const trimmed = routeName.trim().replace(/^\/+/, '');
          if (!trimmed || trimmed === '.' || trimmed === 'root' || trimmed === 'index') {
            routeName = `(${cleanGroup})`;
          } else {
            routeName = `(${cleanGroup})/${trimmed}`;
          }
        }
      }

      // Next.js App Router / Pages Router generation
      if (manifest?.framework?.name === 'next') {
        return await generateNextPage({ name: routeName, options, manifest, paths, root });
      }

      const variants = buildNameVariants(name);
      const snippet = buildRouteSnippet(variants);

      const withFetch = Boolean(options.withFetch || options.data);
      const language = options.language || manifest?.tooling?.language || 'ts';
      const isTs = language === 'ts';

      let importBlock = '';
      let pageBody = '';
      let pageContent = '      <p className="text-muted-foreground">Generated by lumen-cli.</p>\n';
      const clientDirective = options.client || withFetch ? "'use client';\n\n" : '';

      if (withFetch) {
        importBlock = `import { useState, useEffect } from 'react';\n\n`;
        if (isTs) {
          pageBody = `  const [data, setData] = useState<unknown | null>(null);\n  const [loading, setLoading] = useState<boolean>(true);\n  const [error, setError] = useState<Error | null>(null);\n\n  useEffect(() => {\n    let active = true;\n\n    fetch('/api/${variants.nameKebab}')\n      .then((res) => {\n        if (!res.ok) throw new Error(\`Failed to fetch ${variants.name}: \${res.statusText}\`);\n        return res.json();\n      })\n      .then((result) => {\n        if (active) {\n          setData(result);\n        }\n      })\n      .catch((err: unknown) => {\n        if (active) {\n          setError(err instanceof Error ? err : new Error(String(err)));\n        }\n      })\n      .finally(() => {\n        if (active) {\n          setLoading(false);\n        }\n      });\n\n    return () => {\n      active = false;\n    };\n  }, []);\n\n`;
        } else {
          pageBody = `  const [data, setData] = useState(null);\n  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState(null);\n\n  useEffect(() => {\n    let active = true;\n\n    fetch('/api/${variants.nameKebab}')\n      .then((res) => {\n        if (!res.ok) throw new Error(\`Failed to fetch ${variants.name}: \${res.statusText}\`);\n        return res.json();\n      })\n      .then((result) => {\n        if (active) {\n          setData(result);\n        }\n      })\n      .catch((err) => {\n        if (active) {\n          setError(err instanceof Error ? err : new Error(String(err)));\n        }\n      })\n      .finally(() => {\n        if (active) {\n          setLoading(false);\n        }\n      });\n\n    return () => {\n      active = false;\n    };\n  }, []);\n\n`;
        }
        pageContent = `      {loading && <p className="text-muted-foreground">Loading...</p>}\n      {error && <p className="text-destructive">{error.message}</p>}\n      {data && <p className="text-muted-foreground">Data loaded successfully.</p>}\n`;
      }

      // Execute generator for React + Vite
      const genResult = await runGenerator({
        kind: 'pages',
        name,
        templateDir: PAGE_TEMPLATE_DIR,
        options: {
          ...options,
          cwd,
          vars: {
            ...variants,
            clientDirective,
            importBlock,
            pageBody,
            pageContent,
          },
        },
      });

      // Search for router file in paths.pages (and parent/src)
      const pagesDir = path.resolve(root, paths.pages);
      const routerFilePath = findRouterFile(pagesDir, root);
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
