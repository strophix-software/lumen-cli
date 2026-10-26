import { runScaffolder } from '../scaffolder.js';
import { resolveScaffolderOptions } from '../scaffolder-flags.js';

function buildForwardArgs(name, options) {
  const args = [];

  if (name) {
    args.push(name);
  }

  if (options.yes) {
    args.push('--yes');
  }

  if (options.manifest) {
    args.push('--manifest', options.manifest);
  }

  if (options.template) {
    args.push('--template', options.template);
  }

  if (options.framework) {
    args.push('--framework', options.framework);
  }

  const arch = options.arch || options.architecture;
  if (arch) {
    args.push('--arch', arch);
  }

  return args;
}

export function registerCreate(program) {
  program
    .command('create [name]')
    .description('Create a new Lumen project')
    .option('-y, --yes', 'quick setup with recommended defaults')
    .option('-m, --manifest <file-or-json>', 'manifest path or inline JSON')
    .option('-t, --template <preset>', 'template preset name')
    .option('-f, --framework <name>', 'target framework')
    .option('-a, --arch <arch>', 'architecture preset')
    .option('--architecture <arch>', 'architecture preset (alias for --arch)')
    .option('--linter <linter>', 'linting tool (eslint, oxlint, biome, none)')
    .option('--formatter <formatter>', 'code formatter (prettier, oxfmt, none)')
    .option('--language <language>', 'project language (ts, js)')
    .option('--styling <engine>', 'styling engine (tailwind, none)')
    .option('--ui <kit>', 'ui component kit (shadcn, none)')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen create my-app
  $ lumen create my-app -y
  $ lumen create my-app --template react-ts
  $ lumen create my-app --template next-ts
  $ lumen create my-app --arch feature-based
  $ lumen create my-app --manifest ./lumen.config.json
  $ lumen create my-app -y --linter oxlint --formatter oxfmt`
    )
    .action(async (name, options) => {
      const globalOpts = program.opts ? program.opts() : {};
      const cwd = globalOpts.cwd || process.cwd();
      const resolvedOptions = resolveScaffolderOptions(options, { cwd });
      const forwardArgs = buildForwardArgs(name, resolvedOptions);
      const exitCode = await runScaffolder(forwardArgs, { cwd });
      process.exitCode = exitCode;
    });

  program
    .command('init')
    .description('Initialize a Lumen project in current directory')
    .option('-y, --yes', 'quick setup with recommended defaults')
    .option('-m, --manifest <file-or-json>', 'manifest path or inline JSON')
    .option('-t, --template <preset>', 'template preset name')
    .option('-f, --framework <name>', 'target framework')
    .option('-a, --arch <arch>', 'architecture preset')
    .option('--architecture <arch>', 'architecture preset (alias for --arch)')
    .option('--linter <linter>', 'linting tool (eslint, oxlint, biome, none)')
    .option('--formatter <formatter>', 'code formatter (prettier, oxfmt, none)')
    .option('--language <language>', 'project language (ts, js)')
    .option('--styling <engine>', 'styling engine (tailwind, none)')
    .option('--ui <kit>', 'ui component kit (shadcn, none)')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen init
  $ lumen init -y
  $ lumen init --template react-ts
  $ lumen init --template next-ts
  $ lumen init --arch feature-based
  $ lumen init --manifest ./lumen.config.json
  $ lumen init -y --linter oxlint --formatter oxfmt`
    )
    .action(async (options) => {
      const globalOpts = program.opts ? program.opts() : {};
      const cwd = globalOpts.cwd || process.cwd();
      const resolvedOptions = resolveScaffolderOptions(options, { cwd });
      const forwardArgs = buildForwardArgs(null, resolvedOptions);
      const exitCode = await runScaffolder(forwardArgs, { cwd });
      process.exitCode = exitCode;
    });

  return program;
}
