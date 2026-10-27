import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TOOLING_LINTERS,
  TOOLING_FORMATTERS,
  TOOLING_LANGUAGES,
  STYLING_ENGINES,
  UI_KITS,
  ARCHITECTURE_PRESETS,
  DATABASE_ORMS,
  DATABASE_PROVIDERS,
  parseManifest,
} from 'create-lumen/src/manifest/schema.js';
import { buildManifest } from 'create-lumen/src/manifest/emit.js';
import { PRESETS } from 'create-lumen/src/cli-args.js';
import { LumenError, EXIT } from './errors.js';

const REACT_ARCHITECTURES = ['feature-based', 'type-based', 'none'];
const NEXT_ARCHITECTURES = ['feature-based', 'none'];
export const STATE_MANAGEMENT_LIBS = ['zustand', 'redux', 'none'];
export const TESTING_FRAMEWORKS = ['vitest', 'jest', 'none'];

export {
  TOOLING_LINTERS,
  TOOLING_FORMATTERS,
  TOOLING_LANGUAGES,
  STYLING_ENGINES,
  UI_KITS,
  ARCHITECTURE_PRESETS,
  DATABASE_ORMS,
  DATABASE_PROVIDERS,
};

/**
 * Validates individual CLI flags against create-lumen schema enums.
 * Throws LumenError with exit code 1 if invalid.
 *
 * @param {object} options
 */
export function validateScaffolderFlags(options = {}) {
  const {
    linter,
    formatter,
    language,
    styling,
    ui,
    arch,
    architecture,
    state,
    db,
    database,
    dbProvider,
    testing,
    docker,
    routeGroups,
  } = options;
  const chosenArch = arch || architecture;
  const chosenDb = db || database;
  const chosenDbProvider = dbProvider || options['db-provider'];
  const chosenRouteGroups = routeGroups || options['route-groups'];

  if (linter !== undefined && !TOOLING_LINTERS.includes(linter)) {
    throw new LumenError(
      `Invalid linter "${linter}". Allowed values: ${TOOLING_LINTERS.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  if (formatter !== undefined && !TOOLING_FORMATTERS.includes(formatter)) {
    throw new LumenError(
      `Invalid formatter "${formatter}". Allowed values: ${TOOLING_FORMATTERS.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  if (language !== undefined && !TOOLING_LANGUAGES.includes(language)) {
    throw new LumenError(
      `Invalid language "${language}". Allowed values: ${TOOLING_LANGUAGES.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  if (styling !== undefined && !STYLING_ENGINES.includes(styling)) {
    throw new LumenError(
      `Invalid styling "${styling}". Allowed values: ${STYLING_ENGINES.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  if (ui !== undefined && !UI_KITS.includes(ui)) {
    throw new LumenError(
      `Invalid ui "${ui}". Allowed values: ${UI_KITS.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  if (state !== undefined) {
    let normalizedState = typeof state === 'string' ? state.trim().toLowerCase() : '';
    if (normalizedState === 'rtk' || normalizedState === 'reduxtoolkit') {
      normalizedState = 'redux';
    }
    if (!STATE_MANAGEMENT_LIBS.includes(normalizedState)) {
      throw new LumenError(
        `Invalid state management "${state}". Allowed values: ${STATE_MANAGEMENT_LIBS.join(', ')}`,
        { code: EXIT.USER }
      );
    }
  }

  if (chosenDb !== undefined && !DATABASE_ORMS.includes(chosenDb)) {
    throw new LumenError(
      `Invalid database ORM "${chosenDb}". Allowed values: ${DATABASE_ORMS.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  if (chosenDbProvider !== undefined && !DATABASE_PROVIDERS.includes(chosenDbProvider)) {
    throw new LumenError(
      `Invalid database provider "${chosenDbProvider}". Allowed values: ${DATABASE_PROVIDERS.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  if (chosenDbProvider !== undefined && (!chosenDb || chosenDb === 'none')) {
    throw new LumenError(
      `Database provider "${chosenDbProvider}" requires a database ORM (e.g. --db prisma)`,
      { code: EXIT.USER }
    );
  }

  if (testing !== undefined && !TESTING_FRAMEWORKS.includes(testing)) {
    throw new LumenError(
      `Invalid testing framework "${testing}". Allowed values: ${TESTING_FRAMEWORKS.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  if (chosenArch !== undefined && !ARCHITECTURE_PRESETS.includes(chosenArch)) {
    throw new LumenError(
      `Invalid architecture preset "${chosenArch}". Allowed values: ${ARCHITECTURE_PRESETS.join(', ')}`,
      { code: EXIT.USER }
    );
  }

  let frameworkName = options.framework;
  if (frameworkName && frameworkName.includes(':')) {
    frameworkName = frameworkName.split(':')[0];
  }
  if (!frameworkName && options.template && PRESETS[options.template]) {
    frameworkName = PRESETS[options.template].frameworkName;
  }
  if (chosenArch !== undefined && frameworkName) {
    const allowed = frameworkName === 'react' ? REACT_ARCHITECTURES : NEXT_ARCHITECTURES;
    if (!allowed.includes(chosenArch)) {
      throw new LumenError(
        `Architecture "${chosenArch}" is not valid for framework "${frameworkName}" (allowed: ${allowed.join(', ')})`,
        { code: EXIT.USER }
      );
    }
  }

  if (frameworkName === 'react') {
    if (chosenDb !== undefined && chosenDb !== 'none') {
      throw new LumenError('Database configuration is only supported with framework "next"', {
        code: EXIT.USER,
      });
    }
    if (docker) {
      throw new LumenError('Docker standalone preset is only supported with framework "next"', {
        code: EXIT.USER,
      });
    }
    if (chosenRouteGroups) {
      throw new LumenError('Route groups are only supported with framework "next"', {
        code: EXIT.USER,
      });
    }
  }

  if (ui === 'shadcn' && styling !== undefined && styling !== 'tailwind') {
    throw new LumenError(
      `UI kit "shadcn" requires styling "tailwind" (got "${styling}")`,
      { code: EXIT.USER }
    );
  }
}

/**
 * Checks if any tooling, styling, or UI flags were supplied.
 *
 * @param {object} options
 * @returns {boolean}
 */
export function hasToolingFlags(options = {}) {
  return (
    options.linter !== undefined ||
    options.formatter !== undefined ||
    options.language !== undefined ||
    options.styling !== undefined ||
    options.ui !== undefined ||
    options.db !== undefined ||
    options.database !== undefined ||
    options.dbProvider !== undefined ||
    options['db-provider'] !== undefined ||
    options.docker !== undefined ||
    options.routeGroups !== undefined ||
    options['route-groups'] !== undefined ||
    options.agentDocs !== undefined ||
    options['agent-docs'] !== undefined
  );
}

/**
 * Loads a manifest from an inline JSON string or file path.
 *
 * @param {string} source
 * @param {string} cwd
 * @returns {object}
 */
function loadBaseManifest(source, cwd) {
  const trimmed = source.trim();
  let parsed;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new LumenError(`Failed to parse inline manifest JSON: ${err.message}`, {
        code: EXIT.USER,
        cause: err,
      });
    }
  } else {
    const filePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
    try {
      const content = readFileSync(filePath, 'utf8');
      parsed = JSON.parse(content);
    } catch (err) {
      throw new LumenError(`Failed to read manifest file "${filePath}": ${err.message}`, {
        code: EXIT.USER,
        cause: err,
      });
    }
  }

  return parseManifest(parsed);
}

/**
 * Resolves options with an inline manifest if tooling flags are provided.
 * If no tooling flags are provided, returns options as-is.
 *
 * @param {object} options
 * @param {object} [context={}]
 * @param {string} [context.cwd=process.cwd()]
 * @returns {object} resolved options for scaffolder forwarding
 */
export function resolveScaffolderOptions(options = {}, { cwd = process.cwd() } = {}) {
  validateScaffolderFlags(options);

  if (!hasToolingFlags(options)) {
    return options;
  }

  const {
    linter,
    formatter,
    language,
    styling,
    ui,
    manifest: manifestSource,
    template,
    arch,
    architecture,
    framework,
    ...rest
  } = options;

  const chosenArch = arch || architecture;

  let finalManifest;

  if (manifestSource) {
    // Merge flags over base manifest (flags win)
    const baseManifest = loadBaseManifest(manifestSource, cwd);
    const merged = {
      ...baseManifest,
      tooling: {
        ...baseManifest.tooling,
        ...(language !== undefined && { language }),
        ...(linter !== undefined && { linter }),
        ...(formatter !== undefined && { formatter }),
      },
      styling: {
        ...baseManifest.styling,
        ...(styling !== undefined && { engine: styling }),
      },
      ui: {
        ...baseManifest.ui,
        ...(ui !== undefined && { kit: ui }),
      },
    };

    const chosenDb = options.db || options.database;
    const chosenDbProvider = options.dbProvider || options['db-provider'];
    const chosenRouteGroups = options.routeGroups || options['route-groups'];
    const chosenAgentDocs = options.agentDocs || options['agent-docs'];

    if (chosenArch !== undefined) {
      merged.architecture = {
        ...baseManifest.architecture,
        preset: chosenArch,
        type: chosenArch,
      };
    }

    if (framework !== undefined) {
      merged.framework = {
        ...baseManifest.framework,
        name: framework,
      };
    }

    if (chosenDb && chosenDb !== 'none') {
      merged.database = {
        orm: chosenDb,
        provider: chosenDbProvider || 'postgresql',
      };
    }

    if (options.docker !== undefined) {
      merged.docker = Boolean(options.docker);
    }

    if (chosenRouteGroups !== undefined) {
      merged.routeGroups = Boolean(chosenRouteGroups);
    }

    if (chosenAgentDocs !== undefined) {
      merged.agentDocs = Boolean(chosenAgentDocs);
    }

    try {
      finalManifest = parseManifest(merged);
    } catch (err) {
      throw new LumenError(err.message, { code: EXIT.USER, cause: err });
    }
  } else {
    // Build manifest using create-lumen's buildManifest
    const preset = template && PRESETS[template] ? PRESETS[template] : {};

    const chosenDb = options.db || options.database;
    const chosenDbProvider = options.dbProvider || options['db-provider'];
    const chosenRouteGroups = options.routeGroups || options['route-groups'];
    const chosenAgentDocs = options.agentDocs || options['agent-docs'];

    const responses = {
      architecture: chosenArch || preset.architecture || 'feature-based',
      architecturePreset: chosenArch || preset.architecture || 'feature-based',
      cssFramework: styling !== undefined ? styling : (preset.cssFramework || 'tailwind'),
      uiKit: ui !== undefined ? ui : 'none',
      language: language !== undefined ? language : (preset.language || 'ts'),
      linter: linter !== undefined ? linter : (preset.linter || 'eslint'),
      formatter:
        formatter !== undefined
          ? formatter
          : (linter === 'biome' || preset.linter === 'biome'
              ? 'none'
              : (preset.formatter || 'prettier')),
      docsLanguage: preset.docsLanguage || 'en',
      ...(chosenDb && chosenDb !== 'none' && {
        database: chosenDb,
        databaseProvider: chosenDbProvider || 'postgresql',
      }),
      ...(options.docker !== undefined && { docker: Boolean(options.docker) }),
      ...(chosenRouteGroups !== undefined && { routeGroups: Boolean(chosenRouteGroups) }),
      ...(chosenAgentDocs !== undefined && { agentDocs: Boolean(chosenAgentDocs) }),
    };

    let frameworkName = preset.frameworkName || 'react';
    let frameworkVariant = preset.frameworkVariant || (frameworkName === 'next' ? 'app-router' : 'vite');
    if (framework) {
      if (framework.includes(':')) {
        const [fn, fv] = framework.split(':');
        frameworkName = fn;
        frameworkVariant = fv;
      } else {
        frameworkName = framework;
        frameworkVariant = frameworkName === 'next' ? 'app-router' : 'vite';
      }
    }

    try {
      const built = buildManifest(responses, { frameworkName, frameworkVariant });
      finalManifest = parseManifest(built);
    } catch (err) {
      throw new LumenError(err.message, { code: EXIT.USER, cause: err });
    }
  }

  return {
    ...rest,
    manifest: JSON.stringify(finalManifest),
    template,
    framework,
    ...(chosenArch !== undefined && { arch: chosenArch }),
  };
}
