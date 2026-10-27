import { applyThemePreset, listThemePresets } from './theme.js';
import { LumenError, EXIT } from '../../errors.js';

/**
 * Register `lumen generate ui` command (and aliases).
 *
 * @param {import('commander').Command} generate
 */
export function registerUi(generate) {
  const ui = generate
    .command('ui [target] [themeName]')
    .alias('theme')
    .description('Generate UI components from registry or apply preset theme tokens')
    .option('-l, --list', 'List available theme presets')
    .option('--dry-run', 'Preview changes without writing to disk')
    .option('--force', 'Overwrite existing theme tokens')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate ui theme-autumn-maple
  $ lumen g ui theme-calm-lake
  $ lumen g ui theme autumn-maple
  $ lumen g ui theme --list
  $ lumen g ui theme -l
  $ lumen g ui theme-neon-noir --dry-run
  $ lumen g ui theme-ocean-breeze --force`
    )
    .action(async (target, themeName, cmdOpts) => {
      const globals = generate.optsWithGlobals ? generate.optsWithGlobals() : generate.opts ? generate.opts() : {};
      const options = { ...globals, ...cmdOpts };
      const cwd = options.cwd || process.cwd();
      const isJson = Boolean(options.json);

      // Handle --list / -l
      if (options.list || target === '--list' || target === '-l') {
        return listThemePresets({ options: { ...options, json: isJson } });
      }

      // Resolve theme ID from target / themeName
      let themeId = null;

      if (target && target.startsWith('theme-')) {
        themeId = target.slice('theme-'.length);
      } else if (target === 'theme') {
        if (themeName) {
          themeId = themeName.startsWith('theme-') ? themeName.slice('theme-'.length) : themeName;
        } else {
          throw new LumenError(
            'Theme preset name is required, e.g. "lumen g ui theme-<name>" or "lumen g ui theme <name>".',
            {
              code: EXIT.USER,
              hint: 'Run "lumen g ui theme --list" to view available presets.',
            }
          );
        }
      } else if (target) {
        // Check if target is a known theme preset id directly (e.g. "autumn-maple")
        const { loadThemesMetadata } = await import('./theme.js');
        const themes = loadThemesMetadata();
        const isPreset = themes.some((t) => t.id === target);
        if (isPreset) {
          themeId = target;
        } else {
          throw new LumenError(
            `Component "${target}" resolution requires the Lumen UI registry. To generate a preset theme, use "lumen g ui theme-<name>".`,
            {
              code: EXIT.USER,
              hint: 'Run "lumen g ui theme --list" to view available theme presets.',
            }
          );
        }
      } else {
        throw new LumenError('UI component or theme preset name is required.', {
          code: EXIT.USER,
          hint: 'Specify a theme preset (e.g. "lumen g ui theme-autumn-maple") or run "lumen g ui theme --list".',
        });
      }

      return await applyThemePreset({
        cwd,
        themeId,
        options: {
          ...options,
          json: isJson,
        },
      });
    });

  return ui;
}
