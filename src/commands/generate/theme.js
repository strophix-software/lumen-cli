import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { assertPathContained, syncAgentContext } from '../../generators/core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_DIR = path.resolve(__dirname, '../../../templates/themes');

/**
 * Loads the metadata for all available preset themes.
 *
 * @returns {Array<{ id: string, name: string, description: string, fonts: string[] }>}
 */
export function loadThemesMetadata() {
  const metadataPath = path.join(THEMES_DIR, 'themes.json');
  if (!fs.existsSync(metadataPath)) {
    throw new LumenError(`Themes metadata file not found at ${metadataPath}`, {
      code: EXIT.INTERNAL,
    });
  }
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (err) {
    throw new LumenError(`Failed to parse themes.json: ${err.message}`, {
      code: EXIT.INTERNAL,
    });
  }
}

/**
 * Finds and returns a theme preset by ID.
 *
 * @param {string} themeId
 * @returns {{ id: string, name: string, description: string, fonts: string[] }}
 */
export function getThemePreset(themeId) {
  if (!themeId || typeof themeId !== 'string' || !themeId.trim()) {
    throw new LumenError('Theme preset name is required.', {
      code: EXIT.USER,
      hint: 'Run "lumen g ui theme --list" to view available presets.',
    });
  }

  const normalized = themeId.trim().toLowerCase();
  const themes = loadThemesMetadata();
  const theme = themes.find((t) => t.id === normalized);

  if (!theme) {
    const available = themes.map((t) => t.id).join(', ');
    throw new LumenError(
      `Unknown theme preset "${themeId}". Theme "${themeId}" not found. Available presets: ${available}`,
      {
        code: EXIT.USER,
        hint: 'Run "lumen g ui theme --list" to view all available presets.',
      }
    );
  }

  return theme;
}

/**
 * Loads the template CSS content for a theme preset.
 *
 * @param {string} themeId
 * @returns {string}
 */
export function loadThemeCss(themeId) {
  const cssPath = path.join(THEMES_DIR, `${themeId}.css`);
  if (!fs.existsSync(cssPath)) {
    throw new LumenError(`Theme template CSS file not found at ${cssPath}`, {
      code: EXIT.INTERNAL,
    });
  }
  return fs.readFileSync(cssPath, 'utf8');
}

/**
 * Resolves the location of themes.css in the project.
 * Checks existing paths first in priority order, then falls back to project architecture target.
 *
 * @param {string} root Absolute path to project root
 * @param {object} [manifest={}] Parsed manifest
 * @returns {string} Absolute path to themes.css
 */
export function findThemesCssPath(root, manifest = {}) {
  const candidates = [];

  if (manifest?.paths?.styles) {
    candidates.push(path.join(manifest.paths.styles, 'themes.css'));
  }

  candidates.push(
    path.join('src', 'shared', 'styles', 'themes.css'),
    path.join('src', 'styles', 'themes.css'),
    path.join('src', 'themes.css'),
    path.join('styles', 'themes.css'),
    path.join('app', 'themes.css')
  );

  for (const rel of candidates) {
    const full = path.resolve(root, rel);
    if (fs.existsSync(full)) {
      return full;
    }
  }

  // Fallback destination if themes.css does not exist yet
  if (manifest?.paths?.styles) {
    return path.resolve(root, manifest.paths.styles, 'themes.css');
  }

  const arch = manifest?.architecture?.preset || manifest?.architecture?.type;
  if (arch === 'feature-based' || fs.existsSync(path.resolve(root, 'src/shared'))) {
    return path.resolve(root, 'src', 'shared', 'styles', 'themes.css');
  }

  if (manifest?.framework?.name === 'next' && fs.existsSync(path.resolve(root, 'app'))) {
    return path.resolve(root, 'app', 'themes.css');
  }

  return path.resolve(root, 'src', 'styles', 'themes.css');
}

/**
 * Extracts @import statements from CSS string.
 *
 * @param {string} css
 * @returns {string[]}
 */
export function extractImports(css) {
  const matches = css.match(/@import\s+[^;]+;/g) || [];
  return matches.map((m) => m.trim());
}

/**
 * Parses CSS variable declarations (--name: value;) from a CSS block body into a Map.
 *
 * @param {string} body
 * @returns {Map<string, string>}
 */
export function parseCssDeclarations(body) {
  const map = new Map();
  if (!body) return map;

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    const m = trimmed.match(/^(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/);
    if (m) {
      map.set(m[1], m[2].trim());
    }
  }
  return map;
}

export const parseDeclarations = parseCssDeclarations;

/**
 * Formats a declarations Map into CSS declarations lines.
 *
 * @param {Map<string, string>} map
 * @param {string} [indent='  ']
 * @returns {string}
 */
export function formatDeclarations(map, indent = '  ') {
  const lines = [];
  for (const [k, v] of map.entries()) {
    lines.push(`${indent}${k}: ${v};`);
  }
  return lines.join('\n');
}

/**
 * Extracts the inner body of a block matching regex.
 *
 * @param {string} css
 * @param {RegExp} regex Must contain one capturing group for body
 * @returns {string|null}
 */
export function extractBlockBody(css, regex) {
  const m = css.match(regex);
  return m ? m[1] : null;
}

/**
 * Checks whether a theme preset is already applied in themes.css.
 *
 * @param {string} css
 * @param {string} themeId
 * @returns {boolean}
 */
export function isThemeApplied(css, themeId) {
  if (!css || !themeId) return false;
  const pattern = new RegExp(`\\[data-theme=["']?${themeId}["']?\\]`);
  return pattern.test(css);
}

/**
 * Checks whether font packages imported by preset CSS are missing in project's package.json.
 *
 * @param {string} root Project root
 * @param {string} presetCss
 * @returns {{ fontPackages: string[], missingPackages: string[] }}
 */
export function checkMissingFontPackages(root, presetCss) {
  const fontPackages = [];
  const imports = extractImports(presetCss);

  for (const imp of imports) {
    const match = imp.match(/@import\s+['"]([^'"]+)['"]/);
    if (match && match[1]) {
      fontPackages.push(match[1]);
    }
  }

  let installedDeps = {};
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      installedDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
    } catch {
      installedDeps = {};
    }
  }

  const missingPackages = fontPackages.filter((pkg) => !Object.prototype.hasOwnProperty.call(installedDeps, pkg));

  return { fontPackages, missingPackages };
}

/**
 * Generates a brand new themes.css file for the given preset.
 *
 * @param {object} params
 * @param {string} params.themeId
 * @param {string} params.themeName
 * @param {string} params.presetCss
 * @returns {{ generatedCss: string, diff: object }}
 */
export function generateNewThemesCss({ themeId, themeName, presetCss }) {
  const imports = extractImports(presetCss);
  const themeInlineBody = extractBlockBody(presetCss, /@theme\s+inline\s*\{([\s\S]*?)\}/) || '';
  const lightBody =
    extractBlockBody(presetCss, new RegExp(`\\[data-theme=["']?${themeId}["']?\\]\\s*\\{([\\s\\S]*?)\\}`)) || '';
  const darkBody =
    extractBlockBody(
      presetCss,
      new RegExp(`\\[data-theme=["']?${themeId}["']?\\]\\.dark\\s*\\{([\\s\\S]*?)\\}`)
    ) || '';

  const generatedCss = `/* themes.css — Tailwind v4 theme tokens
 * Preset: ${themeName} (${themeId})
 * Synced with ThemeProvider / AppProvider via
 * document.documentElement.dataset.theme and .dark class.
 */
${imports.join('\n')}

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, .dark, .dark *));

@theme inline {
${themeInlineBody.trim()}
}

/* ── Light ─────────────────────────────────────────── */
:root, [data-theme="${themeId}"] {
${lightBody.trim()}
}

/* ── Dark ──────────────────────────────────────────── */
[data-theme="dark"], .dark, [data-theme="${themeId}"].dark {
${darkBody.trim()}
}
`;

  const diff = {
    importsAdded: imports,
    themeInlineUpdated: true,
    tokensUpdated: parseCssDeclarations(lightBody).size,
    summary: [
      ...imports.map((imp) => `+ ${imp}`),
      `+ @custom-variant dark`,
      `+ @theme inline (${parseCssDeclarations(themeInlineBody).size} tokens)`,
      `+ :root, [data-theme="${themeId}"] (${parseCssDeclarations(lightBody).size} light tokens)`,
      `+ [data-theme="dark"], .dark, [data-theme="${themeId}"].dark (${parseCssDeclarations(darkBody).size} dark tokens)`,
    ],
  };

  return { generatedCss, diff };
}

/**
 * Merges a preset theme into existing themes.css non-destructively.
 * - Adds missing font @imports to the top
 * - Preserves existing @custom-variant dark or adds if missing
 * - Merges @theme inline declarations (updates fonts, radius, colors without dropping custom keys)
 * - Updates active :root light tokens and dark mode tokens
 * - Preserves any previously active themes as standalone [data-theme="..."] blocks
 * - Preserves custom CSS rules and comments
 *
 * @param {object} params
 * @param {string} params.existingCss
 * @param {string} params.themeId
 * @param {string} params.themeName
 * @param {string} params.presetCss
 * @returns {{ mergedCss: string, diff: object }}
 */
export function mergeThemeIntoCss({ existingCss, themeId, themeName: _themeName, presetCss }) {
  let css = existingCss;
  const summary = [];

  // 1. Font imports
  const presetImports = extractImports(presetCss);
  const existingImports = extractImports(css);
  const newImports = presetImports.filter((imp) => !existingImports.includes(imp) && !css.includes(imp));

  if (newImports.length > 0) {
    const importBlock = newImports.join('\n') + '\n\n';
    const topCommentMatch = css.match(/^(\/\*[\s\S]*?\*\/\s*)/);
    if (topCommentMatch) {
      css = css.slice(0, topCommentMatch[0].length) + importBlock + css.slice(topCommentMatch[0].length);
    } else {
      css = importBlock + css;
    }
    for (const imp of newImports) {
      summary.push(`+ ${imp}`);
    }
  }

  // 2. Ensure @custom-variant dark
  if (!css.includes('@custom-variant dark')) {
    const customVariantStr = `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, .dark, .dark *));\n\n`;
    const themeIdx = css.indexOf('@theme');
    if (themeIdx !== -1) {
      css = css.slice(0, themeIdx) + customVariantStr + css.slice(themeIdx);
    } else {
      css += '\n' + customVariantStr;
    }
    summary.push(`+ @custom-variant dark`);
  }

  // 3. Merge @theme inline
  const presetThemeBody = extractBlockBody(presetCss, /@theme\s+inline\s*\{([\s\S]*?)\}/) || '';
  const presetThemeDecls = parseDeclarations(presetThemeBody);

  const existingThemeMatch = css.match(/@theme\s+inline\s*\{([\s\S]*?)\}/);
  if (existingThemeMatch) {
    const existingThemeDecls = parseDeclarations(existingThemeMatch[1]);
    const mergedDecls = new Map(existingThemeDecls);
    for (const [k, v] of presetThemeDecls) {
      mergedDecls.set(k, v);
    }
    const formattedTheme = `@theme inline {\n${formatDeclarations(mergedDecls, '  ')}\n}`;
    css = css.replace(existingThemeMatch[0], formattedTheme);
    summary.push(`~ Updated @theme inline fonts and tokens (${mergedDecls.size} tokens)`);
  } else {
    const formattedTheme = `\n@theme inline {\n${formatDeclarations(presetThemeDecls, '  ')}\n}\n`;
    css += formattedTheme;
    summary.push(`+ Added @theme inline (${presetThemeDecls.size} tokens)`);
  }

  // 4. Update :root / light mode tokens
  const presetLightBody =
    extractBlockBody(presetCss, new RegExp(`\\[data-theme=["']?${themeId}["']?\\]\\s*\\{([\\s\\S]*?)\\}`)) || '';
  const presetLightDecls = parseDeclarations(presetLightBody);

  const rootMatch = css.match(/((?:^|\n)\s*:root(?:[^{]*)\{)([\s\S]*?)(\})/);
  if (rootMatch) {
    const oldHeader = rootMatch[1];
    const oldBody = rootMatch[2];
    const existingRootDecls = parseDeclarations(oldBody);

    // If an old theme ID was in the :root selector, preserve it as a standalone theme block if needed
    const oldThemeIds = [...oldHeader.matchAll(/\[data-theme=["']([^"']+)["']\]/g)].map((m) => m[1]);
    let preservedThemesCss = '';
    for (const oldId of oldThemeIds) {
      const standaloneRegex = new RegExp(`(?:^|\\n)\\s*\\[data-theme=["']?${oldId}["']?\\]\\s*\\{`);
      if (oldId !== themeId && !standaloneRegex.test(css)) {
        preservedThemesCss += `\n/* Preserved theme: ${oldId} */\n[data-theme="${oldId}"] {\n${oldBody.trim()}\n}\n`;
        summary.push(`~ Preserved previous theme tokens for [data-theme="${oldId}"]`);
      }
    }

    const mergedLight = new Map(existingRootDecls);
    for (const [k, v] of presetLightDecls) {
      mergedLight.set(k, v);
    }
    const selector = `:root, [data-theme="${themeId}"]`;
    const formattedRoot = `\n${selector} {\n${formatDeclarations(mergedLight, '  ')}\n}${preservedThemesCss}`;
    css = css.replace(rootMatch[0], formattedRoot);
    summary.push(`~ Updated :root and [data-theme="${themeId}"] (${presetLightDecls.size} light tokens)`);
  } else {
    const selector = `:root, [data-theme="${themeId}"]`;
    const formattedRoot = `\n${selector} {\n${formatDeclarations(presetLightDecls, '  ')}\n}\n`;
    css += formattedRoot;
    summary.push(`+ Added :root, [data-theme="${themeId}"] (${presetLightDecls.size} light tokens)`);
  }

  // 5. Update dark mode tokens
  const presetDarkBody =
    extractBlockBody(
      presetCss,
      new RegExp(`\\[data-theme=["']?${themeId}["']?\\]\\.dark\\s*\\{([\\s\\S]*?)\\}`)
    ) || '';
  const presetDarkDecls = parseDeclarations(presetDarkBody);

  const darkMatch = css.match(/((?:^|\n)\s*(?:\[data-theme=["']dark["']\]|\.dark)[^{]*\{)([\s\S]*?)(\})/);
  if (darkMatch) {
    const oldDarkHeader = darkMatch[1];
    const oldDarkBody = darkMatch[2];
    const existingDarkDecls = parseDeclarations(oldDarkBody);

    // If an old theme ID was in the dark selector, preserve it as a standalone theme block if needed
    const oldThemeIds = [...oldDarkHeader.matchAll(/\[data-theme=["']([^"']+)["']\]/g)].map((m) => m[1]);
    let preservedDarkCss = '';
    for (const oldId of oldThemeIds) {
      const standaloneDarkRegex = new RegExp(`(?:^|\\n)\\s*\\[data-theme=["']?${oldId}["']?\\]\\.dark\\s*\\{`);
      if (oldId !== themeId && !standaloneDarkRegex.test(css)) {
        preservedDarkCss += `\n/* Preserved theme (dark): ${oldId} */\n[data-theme="${oldId}"].dark {\n${oldDarkBody.trim()}\n}\n`;
        summary.push(`~ Preserved previous dark theme tokens for [data-theme="${oldId}"].dark`);
      }
    }

    const mergedDark = new Map(existingDarkDecls);
    for (const [k, v] of presetDarkDecls) {
      mergedDark.set(k, v);
    }
    const darkSelector = `[data-theme="dark"], .dark, [data-theme="${themeId}"].dark`;
    const formattedDark = `\n${darkSelector} {\n${formatDeclarations(mergedDark, '  ')}\n}${preservedDarkCss}`;
    css = css.replace(darkMatch[0], formattedDark);
    summary.push(`~ Updated dark mode tokens and [data-theme="${themeId}"].dark (${presetDarkDecls.size} tokens)`);
  } else {
    const darkSelector = `[data-theme="dark"], .dark, [data-theme="${themeId}"].dark`;
    const formattedDark = `\n${darkSelector} {\n${formatDeclarations(presetDarkDecls, '  ')}\n}\n`;
    css += formattedDark;
    summary.push(`+ Added dark mode tokens for [data-theme="${themeId}"].dark (${presetDarkDecls.size} tokens)`);
  }

  // 6. If standalone [data-theme="${themeId}"] block already existed, update its body as well
  const standaloneRegex = new RegExp(
    `((?:^|\\n)\\s*\\[data-theme=["']?${themeId}["']?\\]\\s*\\{)([\\s\\S]*?)(\\})(?!\\.dark)`
  );
  const standaloneMatch = css.match(standaloneRegex);
  if (standaloneMatch && !standaloneMatch[1].includes(':root')) {
    const updated = `\n[data-theme="${themeId}"] {\n${formatDeclarations(presetLightDecls, '  ')}\n}`;
    css = css.replace(standaloneMatch[0], updated);
  }

  const standaloneDarkRegex = new RegExp(
    `((?:^|\\n)\\s*\\[data-theme=["']?${themeId}["']?\\]\\.dark\\s*\\{)([\\s\\S]*?)(\\})(?!\\.dark)`
  );
  const standaloneDarkMatch = css.match(standaloneDarkRegex);
  if (standaloneDarkMatch && !standaloneDarkMatch[1].includes('.dark,')) {
    const updated = `\n[data-theme="${themeId}"].dark {\n${formatDeclarations(presetDarkDecls, '  ')}\n}`;
    css = css.replace(standaloneDarkMatch[0], updated);
  }

  const diff = {
    importsAdded: newImports,
    themeInlineUpdated: true,
    tokensUpdated: presetLightDecls.size,
    summary,
  };

  return { mergedCss: css, diff };
}

/**
 * Lists all available theme presets.
 *
 * @param {object} [param0={}]
 * @param {object} [param0.options={}]
 * @returns {{ success: boolean, list: boolean, themes: Array<object> }}
 */
export function listThemePresets({ options = {} } = {}) {
  const themes = loadThemesMetadata();

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ success: true, themes }, null, 2)}\n`);
    return { success: true, list: true, themes };
  }

  process.stdout.write(`\nAvailable theme presets (${themes.length}):\n\n`);

  const idWidth = Math.max(14, ...themes.map((t) => t.id.length));
  const nameWidth = Math.max(16, ...themes.map((t) => t.name.length));
  const descWidth = Math.max(42, ...themes.map((t) => t.description.length));

  const header = `  ${'ID'.padEnd(idWidth)}  ${'Name'.padEnd(nameWidth)}  ${'Description'.padEnd(descWidth)}  Fonts`;
  const separator = `  ${'─'.repeat(idWidth)}  ${'─'.repeat(nameWidth)}  ${'─'.repeat(descWidth)}  ${'─'.repeat(26)}`;

  process.stdout.write(`${header}\n`);
  process.stdout.write(`${separator}\n`);

  for (const t of themes) {
    const fontsStr = (t.fonts || []).join(', ');
    process.stdout.write(
      `  ${t.id.padEnd(idWidth)}  ${t.name.padEnd(nameWidth)}  ${t.description.padEnd(descWidth)}  ${fontsStr}\n`
    );
  }

  process.stdout.write(`\nUsage:\n`);
  process.stdout.write(`  $ lumen g ui theme-<name>\n`);
  process.stdout.write(`  $ lumen g ui theme <name>\n\n`);

  return { success: true, list: true, themes };
}

/**
 * Applies a theme preset to project's themes.css.
 *
 * @param {object} params
 * @param {string} [params.cwd=process.cwd()]
 * @param {string} params.themeId
 * @param {object} [params.options={}]
 * @returns {Promise<object>}
 */
export async function applyThemePreset({ cwd = process.cwd(), themeId, options = {} } = {}) {
  const { manifest, root } = readConfig({ cwd });

  // Tailwind v4 engine check
  if (manifest?.styling?.engine !== 'tailwind') {
    throw new LumenError(
      `Preset theme tokens require Tailwind v4 (styling.engine = "tailwind"). Current styling engine: "${manifest?.styling?.engine || 'none'}".`,
      {
        code: EXIT.USER,
        hint: 'Configure styling.engine to "tailwind" in lumen.config.json.',
      }
    );
  }

  // Validate theme preset
  const theme = getThemePreset(themeId);
  const presetCss = loadThemeCss(theme.id);

  // Locate target themes.css path
  const targetPath = findThemesCssPath(root, manifest);
  assertPathContained(root, targetPath);
  const relPath = path.relative(root, targetPath);

  const fileExists = fs.existsSync(targetPath);
  let finalCss = '';
  let diff = null;
  let action = '';

  if (fileExists) {
    const existingCss = fs.readFileSync(targetPath, 'utf8');
    const alreadyApplied = isThemeApplied(existingCss, theme.id);

    if (alreadyApplied && !options.force) {
      action = 'skip';
      if (options.json) {
        const payload = {
          success: true,
          kind: 'ui-theme',
          theme: {
            id: theme.id,
            name: theme.name,
            description: theme.description,
            fonts: theme.fonts,
          },
          file: relPath,
          action: 'skip',
          dryRun: Boolean(options.dryRun),
          force: false,
          message: `Theme "${theme.id}" is already applied in ${relPath}. Use --force to overwrite.`,
        };
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        process.stdout.write(`\nTheme "${theme.id}" is already applied in ${relPath}. Use --force to overwrite.\n`);
      }

      return {
        success: true,
        kind: 'ui-theme',
        theme,
        file: relPath,
        action: 'skip',
        dryRun: Boolean(options.dryRun),
        force: false,
      };
    }

    const mergeResult = mergeThemeIntoCss({
      existingCss,
      themeId: theme.id,
      themeName: theme.name,
      presetCss,
    });
    finalCss = mergeResult.mergedCss;
    diff = mergeResult.diff;
    action = options.force && alreadyApplied ? 'overwritten' : 'merged';
  } else {
    const genResult = generateNewThemesCss({
      themeId: theme.id,
      themeName: theme.name,
      presetCss,
    });
    finalCss = genResult.generatedCss;
    diff = genResult.diff;
    action = 'created';
  }

  // Check missing font packages in package.json
  const { fontPackages, missingPackages } = checkMissingFontPackages(root, presetCss);

  // Write changes if not dry-run
  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, finalCss, 'utf8');

    if (manifest?.agentDocs) {
      await syncAgentContext(root);
    }
  }

  // CLI output formatting
  if (options.json) {
    const payload = {
      success: true,
      kind: 'ui-theme',
      theme: {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        fonts: theme.fonts,
      },
      file: relPath,
      action,
      dryRun: Boolean(options.dryRun),
      force: Boolean(options.force),
      diff,
      fontPackages,
      missingFontPackages: missingPackages,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    if (options.dryRun) {
      process.stdout.write(`\n[DRY RUN] Theme preset "${theme.id}" plan for ${relPath}:\n`);
    } else {
      const tag = action === 'created' ? '+ CREATED' : action === 'overwritten' ? '! OVERWRITTEN' : '~ MERGED';
      process.stdout.write(`\n${tag} theme preset "${theme.id}" (${theme.name}) into ${relPath}:\n`);
    }

    if (diff?.summary) {
      for (const item of diff.summary) {
        process.stdout.write(`  ${item}\n`);
      }
    }

    if (missingPackages.length > 0) {
      process.stdout.write(
        `\nNote: Remember to install required font packages if not already installed:\n  npm install ${missingPackages.join(' ')}\n`
      );
    }
  }

  return {
    success: true,
    kind: 'ui-theme',
    theme,
    file: relPath,
    action,
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    diff,
    fontPackages,
    missingFontPackages: missingPackages,
  };
}
