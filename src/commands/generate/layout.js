import fs from 'node:fs';
import path from 'node:path';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { syncAgentContext } from '../../generators/core.js';
import { parseRouteInput, normalizeRouteGroup, discoverRouteGroups } from './page.js';

/**
 * Derives layout details from parsed route info.
 * @param {string} name
 * @returns {{ segments: string[], componentName: string, nameKebab: string, isRoot: boolean }}
 */
export function parseLayoutInput(name) {
  const trimmed = (name || '').trim();
  if (trimmed === 'root' || trimmed === '.' || trimmed === '/') {
    return {
      segments: [],
      componentName: 'RootLayout',
      nameKebab: 'root',
      isRoot: true,
    };
  }

  const routeInfo = parseRouteInput(name);
  const componentName = routeInfo.componentName.replace(/Page$/, 'Layout');
  const nameKebab = routeInfo.nameKebab.replace(/-page$/, '');

  return {
    segments: routeInfo.segments,
    componentName,
    nameKebab,
    isRoot: false,
  };
}

/**
 * Subcommand `lumen generate layout <name>` (alias `g layout <name>`, `g l <name>`).
 * @param {import('commander').Command} generate
 */
export function registerLayout(generate) {
  generate
    .command('layout [name]')
    .alias('l')
    .description('Scaffold a layout component for Next.js App Router or React')
    .option('-g, --group <name>', 'target route group for Next.js App Router (e.g. "auth", "public")')
    .option('--dry-run', 'preview file operations without writing to disk')
    .option('--force', 'overwrite existing files')
    .option('--client', 'mark layout component with "use client" directive')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate layout --group public
  $ lumen g layout --group auth
  $ lumen g layout dashboard --group auth
  $ lumen g layout "(public)"
  $ lumen g layout admin
  $ lumen g layout root
  $ lumen g layout dashboard --client
  $ lumen g layout settings --dry-run`
    )
    .action(async (name, cmdOpts) => {
      const globalOpts = generate.optsWithGlobals ? generate.optsWithGlobals() : generate.opts();
      const options = { ...globalOpts, ...cmdOpts };
      const cwd = options.cwd || process.cwd();

      const { manifest, paths, root } = readConfig({ cwd });

      const isNext = manifest?.framework?.name === 'next';
      const isAppRouter = isNext && manifest?.framework?.variant !== 'pages-router';
      const language = options.language || manifest?.tooling?.language || 'ts';
      const ext = language === 'ts' ? 'tsx' : 'jsx';

      let targetName = (name || '').trim();

      if (options.group) {
        if (!isAppRouter) {
          throw new LumenError('Route groups are only supported in Next.js App Router projects.', {
            code: EXIT.USER,
            hint: 'Route groups "(group)" are an App Router feature and cannot be used with React Vite or Next.js Pages Router.',
          });
        }

        const cleanGroup = normalizeRouteGroup(options.group);
        const existingMatch = targetName.match(/^\(([^)]+)\)/);
        if (existingMatch) {
          if (existingMatch[1] !== cleanGroup) {
            throw new LumenError(
              `Conflicting route groups: layout name contains "(${existingMatch[1]})" but --group specifies "${cleanGroup}".`,
              {
                code: EXIT.USER,
                hint: 'Use either --group or include the group in the name, but do not specify conflicting groups.',
              }
            );
          }
        } else if (!targetName || targetName === '.' || targetName === '/' || targetName === 'root') {
          targetName = `(${cleanGroup})`;
        } else {
          targetName = `(${cleanGroup})/${targetName.replace(/^\/+/, '')}`;
        }
      } else if (!targetName) {
        targetName = 'root';
      }

      const layoutInfo = parseLayoutInput(targetName);

      let relFilePath;
      if (isNext) {
        if (!paths?.pages) {
          throw new LumenError('Generator target "pages" is not configured in manifest paths.', {
            code: EXIT.CONFIG,
            hint: 'Ensure your lumen.config.json paths object contains a "pages" entry.',
          });
        }
        if (layoutInfo.isRoot) {
          relFilePath = path.posix.join(paths.pages, `layout.${ext}`);
        } else {
          relFilePath = path.posix.join(paths.pages, ...layoutInfo.segments, `layout.${ext}`);
        }
      } else {
        const targetDir = paths?.components
          ? path.posix.join(paths.components, 'layouts')
          : (paths?.pages || 'src/pages');
        relFilePath = path.posix.join(targetDir, `${layoutInfo.componentName}.${ext}`);
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
      let content;
      if (language === 'ts') {
        content = `${clientDirective}import React from 'react';

export function ${layoutInfo.componentName}({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="${layoutInfo.nameKebab}-layout" data-testid="${layoutInfo.nameKebab}-layout">
      {children}
    </div>
  );
}

export default ${layoutInfo.componentName};
`;
      } else {
        content = `${clientDirective}import React from 'react';

export function ${layoutInfo.componentName}({ children }) {
  return (
    <div className="${layoutInfo.nameKebab}-layout" data-testid="${layoutInfo.nameKebab}-layout">
      {children}
    </div>
  );
}

export default ${layoutInfo.componentName};
`;
      }

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
          kind: 'layout',
          name: targetName,
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

        if (isNext) {
          process.stdout.write(`\nLayout ready: ${relFilePath} (Next.js layout)\n`);
        } else {
          process.stdout.write(`\nLayout ready: ${relFilePath}\n`);
        }

        if (isAppRouter && !options.group && !targetName.startsWith('(')) {
          const discovered = discoverRouteGroups(path.resolve(root, paths.pages));
          if (manifest?.routeGroups || discovered.length > 0) {
            process.stdout.write(`  ℹ Route groups detected in project: ${discovered.map((g) => `(${g})`).join(', ')}. Use --group <name> to place this layout in a route group.\n`);
          }
        }
      }

      return {
        success: true,
        kind: 'layout',
        name: targetName,
        created: action === 'create' || action === 'overwrite' ? [relFilePath] : [],
        skipped: action === 'skip' ? [relFilePath] : [],
        plan: [{ action, file: relFilePath }],
      };
    });
}
