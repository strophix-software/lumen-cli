import fs from 'node:fs';
import path from 'node:path';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';

const ALLOWED_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

/**
 * Parses and validates HTTP methods list.
 * @param {string} methodsStr Comma-separated methods e.g. "GET,POST"
 * @returns {string[]} Valid uppercase HTTP method names
 */
export function parseHttpMethods(methodsStr) {
  if (!methodsStr || typeof methodsStr !== 'string') {
    return ['GET', 'POST'];
  }

  const rawList = methodsStr.split(',').map((m) => m.trim().toUpperCase()).filter(Boolean);
  if (rawList.length === 0) {
    return ['GET', 'POST'];
  }

  for (const method of rawList) {
    if (!ALLOWED_HTTP_METHODS.includes(method)) {
      throw new LumenError(
        `Invalid HTTP method "${method}". Allowed methods: ${ALLOWED_HTTP_METHODS.join(', ')}`,
        {
          code: EXIT.USER,
          hint: `Specify a comma-separated list of valid HTTP verbs, e.g. --methods "GET,POST,DELETE"`,
        }
      );
    }
  }

  // Deduplicate while preserving order
  return [...new Set(rawList)];
}

/**
 * Normalizes route endpoint path and extracts dynamic parameters.
 * E.g. "auctions/[id]" -> { relDir: "api/auctions/[id]", params: ["id"], urlPath: "/api/auctions/[id]" }
 * @param {string} endpoint
 * @returns {{ segments: string[], params: string[], urlPath: string, relDir: string }}
 */
export function parseRouteEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string' || !endpoint.trim()) {
    throw new LumenError('Endpoint is required and cannot be empty.', {
      code: EXIT.USER,
      hint: 'Provide a valid route endpoint, e.g. "auctions", "auctions/[id]", or "auth/login".',
    });
  }

  const trimmed = endpoint.trim();
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    throw new LumenError(`Invalid endpoint path "${trimmed}": path traversal characters are not allowed.`, {
      code: EXIT.USER,
    });
  }

  const stripped = trimmed.replace(/^\/+|\/+$/g, '');
  if (!stripped) {
    throw new LumenError(`Invalid endpoint path "${trimmed}": endpoint path cannot be root slash only.`, {
      code: EXIT.USER,
    });
  }

  const segments = stripped.split('/');
  for (const seg of segments) {
    const isDynamic = /^\[{1,2}\.{0,3}[a-zA-Z0-9_-]+\]{1,2}$/.test(seg);
    const isIdentifier = /^[a-zA-Z0-9_-]+$/.test(seg);
    if (!isDynamic && !isIdentifier) {
      throw new LumenError(`Invalid segment "${seg}" in endpoint "${trimmed}".`, {
        code: EXIT.USER,
        hint: 'Segments must be alphanumeric identifiers or dynamic params like "[id]".',
      });
    }
  }

  // If endpoint doesn't start with "api", prefix it with "api"
  const apiSegments = segments[0] === 'api' ? segments : ['api', ...segments];

  // Extract dynamic parameters (e.g. "[id]" -> "id")
  const params = [];
  for (const seg of segments) {
    if (seg.startsWith('[') && seg.endsWith(']')) {
      const cleanParam = seg.replace(/[[\].]/g, '');
      if (cleanParam) params.push(cleanParam);
    }
  }

  const urlPath = `/${apiSegments.join('/')}`;
  const relDir = apiSegments.join('/');

  return {
    segments: apiSegments,
    params,
    urlPath,
    relDir,
  };
}

/**
 * Builds the code for a Next.js App Router route.ts / route.js file.
 * @param {object} params
 * @param {string[]} params.methods
 * @param {string[]} params.routeParams
 * @param {boolean} params.auth
 * @param {boolean} params.isTypeScript
 * @returns {string} File contents
 */
export function buildRouteHandlerContent({ methods, routeParams, auth, isTypeScript }) {
  const hasParams = routeParams.length > 0;
  let code = '';

  if (isTypeScript) {
    code += `import { NextResponse } from 'next/server';\nimport type { NextRequest } from 'next/server';\n\n`;
    if (hasParams) {
      code += `type RouteContext = {\n  params: Promise<{\n`;
      for (const p of routeParams) {
        code += `    ${p}: string;\n`;
      }
      code += `  }>;\n};\n\n`;
    }
  } else {
    code += `import { NextResponse } from 'next/server';\n\n`;
  }

  for (const method of methods) {
    const contextParam = isTypeScript
      ? (hasParams ? `, context: RouteContext` : `,\n  _context: unknown`)
      : (hasParams ? `, context` : '');

    const reqType = isTypeScript ? `: NextRequest` : '';
    code += `export async function ${method}(request${reqType}${contextParam}) {\n`;
    code += `  try {\n`;

    if (auth) {
      code += `    const authToken = request.cookies.get('token')?.value || request.headers.get('authorization');\n`;
      code += `    if (!authToken) {\n`;
      code += `      return NextResponse.json(\n`;
      code += `        { success: false, error: 'Unauthorized: authentication token required' },\n`;
      code += `        { status: 401 }\n`;
      code += `      );\n`;
      code += `    }\n\n`;
    }

    if (hasParams) {
      const paramList = routeParams.join(', ');
      code += `    const { ${paramList} } = await context.params;\n`;
    }

    if (method === 'GET') {
      code += `    return NextResponse.json({\n`;
      code += `      success: true,\n`;
      code += `      data: ${hasParams ? `{ ${routeParams.join(', ')} }` : '[]'},\n`;
      code += `    });\n`;
    } else if (method === 'POST') {
      code += `    const body = await request.json();\n`;
      code += `    return NextResponse.json(\n`;
      code += `      { success: true, data: body },\n`;
      code += `      { status: 201 }\n`;
      code += `    );\n`;
    } else if (method === 'PUT' || method === 'PATCH') {
      code += `    const body = await request.json();\n`;
      code += `    return NextResponse.json({\n`;
      code += `      success: true,\n`;
      code += `      data: ${hasParams ? `{ ${routeParams.join(', ')}, ...body }` : 'body'},\n`;
      code += `    });\n`;
    } else if (method === 'DELETE') {
      code += `    return NextResponse.json({\n`;
      code += `      success: true,\n`;
      code += `      message: 'Resource deleted successfully',\n`;
      code += `    });\n`;
    } else {
      code += `    return new NextResponse(null, { status: 204 });\n`;
    }

    code += `  } catch (error) {\n`;
    code += `    const message = error instanceof Error ? error.message : 'Internal Server Error';\n`;
    code += `    return NextResponse.json(\n`;
    code += `      { success: false, error: message },\n`;
    code += `      { status: 500 }\n`;
    code += `    );\n`;
    code += `  }\n`;
    code += `}\n\n`;
  }

  return code.trim() + '\n';
}

/**
 * Subcommand `lumen generate route <endpoint>` (alias `g route <endpoint>`, `g api <endpoint>`).
 * @param {import('commander').Command} generate
 */
export function registerRoute(generate) {
  generate
    .command('route <endpoint>')
    .alias('r')
    .alias('api')
    .description('Scaffold a Next.js App Router API Route Handler')
    .option('-m, --methods <methods>', 'comma-separated list of HTTP verbs (GET, POST, PUT, DELETE, PATCH; default: GET,POST)')
    .option('--auth', 'inject authorization/session check pattern')
    .option('--dry-run', 'preview file operations without writing to disk')
    .option('--force', 'overwrite existing files')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate route users
  $ lumen g api users/[id]
  $ lumen g route products --methods "GET,POST,PUT,DELETE"
  $ lumen g route orders/checkout --methods POST --auth
  $ lumen g route auth/login --methods POST --dry-run`
    )
    .action(async (endpoint, cmdOpts) => {
      const globalOpts = generate.optsWithGlobals ? generate.optsWithGlobals() : generate.opts();
      const options = { ...globalOpts, ...cmdOpts };
      const cwd = options.cwd || process.cwd();

      const { manifest, paths, root } = readConfig({ cwd });

      if (manifest?.framework?.name !== 'next') {
        throw new LumenError(
          'API Route Handlers are a Next.js App Router feature.',
          {
            code: EXIT.USER,
            hint: 'In React + Vite projects, use "lumen g service <name>" to create an API client service.',
          }
        );
      }

      if (!paths || !paths.pages) {
        throw new LumenError(
          'Generator target "pages" is not configured in manifest paths.',
          {
            code: EXIT.CONFIG,
            hint: 'Ensure your lumen.config.json paths object contains a "pages" entry.',
          }
        );
      }

      const methods = parseHttpMethods(options.methods);
      const routeInfo = parseRouteEndpoint(endpoint);
      const language = options.language || manifest?.tooling?.language || 'ts';
      const isTypeScript = language === 'ts';
      const ext = isTypeScript ? 'ts' : 'js';

      const relFilePath = path.posix.join(paths.pages, routeInfo.relDir, `route.${ext}`);
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

      const content = buildRouteHandlerContent({
        methods,
        routeParams: routeInfo.params,
        auth: Boolean(options.auth),
        isTypeScript,
      });

      if (!options.dryRun && action !== 'skip') {
        fs.mkdirSync(path.dirname(absFilePath), { recursive: true });
        fs.writeFileSync(absFilePath, content, 'utf8');
      }

      if (options.json) {
        const jsonOutput = {
          success: true,
          kind: 'route',
          endpoint,
          methods,
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

        process.stdout.write(`\nRoute Handler ready: ${routeInfo.urlPath} [${methods.join(', ')}]\n`);
      }

      return {
        success: true,
        kind: 'route',
        endpoint,
        methods,
        created: action === 'create' || action === 'overwrite' ? [relFilePath] : [],
        skipped: action === 'skip' ? [relFilePath] : [],
        plan: [{ action, file: relFilePath }],
      };
    });
}
