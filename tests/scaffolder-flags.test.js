import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateScaffolderFlags,
  hasToolingFlags,
  resolveScaffolderOptions,
} from '../src/scaffolder-flags.js';
import { LumenError, EXIT } from '../src/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(
  __dirname,
  '../node_modules/create-lumen/schema/fixtures/v2'
);

describe('scaffolder-flags module', () => {
  describe('validateScaffolderFlags', () => {
    it('accepts valid flags without throwing', () => {
      expect(() => {
        validateScaffolderFlags({
          linter: 'oxlint',
          formatter: 'oxfmt',
          language: 'ts',
          styling: 'tailwind',
          ui: 'shadcn',
          arch: 'feature-based',
        });
      }).not.toThrow();
    });

    it('rejects invalid linter with LumenError exit 1', () => {
      expect(() => {
        validateScaffolderFlags({ linter: 'jshint' });
      }).toThrowError(LumenError);

      try {
        validateScaffolderFlags({ linter: 'jshint' });
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('Invalid linter "jshint"');
        expect(err.message).toContain('eslint, oxlint, biome, none');
      }
    });

    it('rejects invalid formatter with LumenError exit 1', () => {
      try {
        validateScaffolderFlags({ formatter: 'standard' });
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('Invalid formatter "standard"');
        expect(err.message).toContain('prettier, oxfmt, none');
      }
    });

    it('rejects invalid language with LumenError exit 1', () => {
      try {
        validateScaffolderFlags({ language: 'python' });
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('Invalid language "python"');
        expect(err.message).toContain('ts, js');
      }
    });

    it('rejects invalid styling with LumenError exit 1', () => {
      try {
        validateScaffolderFlags({ styling: 'bootstrap' });
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('Invalid styling "bootstrap"');
        expect(err.message).toContain('tailwind, none');
      }
    });

    it('rejects invalid ui with LumenError exit 1', () => {
      try {
        validateScaffolderFlags({ ui: 'radix' });
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('Invalid ui "radix"');
        expect(err.message).toContain('shadcn, none');
      }
    });

    it('rejects invalid arch preset with LumenError exit 1', () => {
      try {
        validateScaffolderFlags({ arch: 'monolith' });
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('Invalid architecture preset "monolith"');
        expect(err.message).toContain('feature-based, type-based, none');
      }
    });

    it('rejects shadcn without tailwind', () => {
      expect(() => {
        validateScaffolderFlags({ ui: 'shadcn', styling: 'none' });
      }).toThrow(LumenError);

      try {
        validateScaffolderFlags({ ui: 'shadcn', styling: 'none' });
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('UI kit "shadcn" requires styling "tailwind" (got "none")');
      }
    });
  });

  describe('hasToolingFlags', () => {
    it('returns false when no tooling flags are present', () => {
      expect(hasToolingFlags({})).toBe(false);
      expect(hasToolingFlags({ yes: true, arch: 'feature-based' })).toBe(false);
    });

    it('returns true when any tooling/styling/ui flag is present', () => {
      expect(hasToolingFlags({ linter: 'oxlint' })).toBe(true);
      expect(hasToolingFlags({ formatter: 'oxfmt' })).toBe(true);
      expect(hasToolingFlags({ language: 'js' })).toBe(true);
      expect(hasToolingFlags({ styling: 'tailwind' })).toBe(true);
      expect(hasToolingFlags({ ui: 'shadcn' })).toBe(true);
    });
  });

  describe('resolveScaffolderOptions', () => {
    it('returns original options unchanged when no tooling flags are provided', () => {
      const opts = { yes: true, template: 'react-ts', arch: 'feature-based' };
      const resolved = resolveScaffolderOptions(opts);
      expect(resolved).toEqual(opts);
    });

    it('builds valid inline manifest when tooling flags are passed', () => {
      const resolved = resolveScaffolderOptions({
        yes: true,
        linter: 'oxlint',
        formatter: 'oxfmt',
      });

      expect(resolved.yes).toBe(true);
      expect(resolved.manifest).toBeDefined();

      const parsed = JSON.parse(resolved.manifest);
      expect(parsed.manifestVersion).toBe(2);
      expect(parsed.tooling.linter).toBe('oxlint');
      expect(parsed.tooling.formatter).toBe('oxfmt');
      expect(parsed.tooling.language).toBe('ts');
      expect(parsed.styling.engine).toBe('tailwind');
      expect(parsed.architecture.preset).toBe('feature-based');
      expect(parsed.harness.commands.find((c) => c.name === 'lint').command).toBe('oxlint .');
      expect(parsed.harness.commands.find((c) => c.name === 'format').command).toBe('oxfmt --check .');
    });

    it('merges tooling flags over -m file path', () => {
      const baseFixture = path.join(FIXTURES_DIR, 'valid/react-vite-feature-based.json');
      const resolved = resolveScaffolderOptions({
        manifest: baseFixture,
        linter: 'biome',
        styling: 'none',
      });

      const parsed = JSON.parse(resolved.manifest);
      expect(parsed.tooling.linter).toBe('biome');
      expect(parsed.styling.engine).toBe('none');
      expect(parsed.tooling.language).toBe('ts');
    });

    it('merges tooling flags over inline -m JSON string', () => {
      const baseJson = JSON.stringify({
        manifestVersion: 2,
        framework: { name: 'react', variant: 'vite' },
        styling: { engine: 'tailwind' },
        architecture: { type: 'feature-based' },
        ui: { kit: 'none' },
        docs: { language: 'en' },
        paths: {
          features: 'src/features',
          components: 'src/shared/components',
          services: 'src/shared/services',
          hooks: 'src/shared/hooks',
          pages: 'src/app/router',
          ui: 'src/shared/components/ui',
        },
        tooling: { language: 'ts', linter: 'eslint', formatter: 'prettier' },
      });

      const resolved = resolveScaffolderOptions({
        manifest: baseJson,
        formatter: 'oxfmt',
      });

      const parsed = JSON.parse(resolved.manifest);
      expect(parsed.tooling.formatter).toBe('oxfmt');
      expect(parsed.tooling.linter).toBe('eslint');
    });

    it('merges tooling flags over template preset defaults', () => {
      const resolved = resolveScaffolderOptions({
        template: 'react-type-js',
        linter: 'oxlint',
      });

      const parsed = JSON.parse(resolved.manifest);
      expect(parsed.architecture.preset).toBe('type-based');
      expect(parsed.tooling.language).toBe('js');
      expect(parsed.tooling.linter).toBe('oxlint');
    });

    it('throws LumenError when merging results in an invalid manifest', () => {
      const baseJson = JSON.stringify({
        manifestVersion: 2,
        framework: { name: 'react', variant: 'vite' },
        styling: { engine: 'none' },
        architecture: { type: 'feature-based' },
        ui: { kit: 'none' },
        docs: { language: 'en' },
        paths: {
          features: 'src/features',
          components: 'src/shared/components',
          services: 'src/shared/services',
          hooks: 'src/shared/hooks',
          pages: 'src/app/router',
          ui: 'src/shared/components/ui',
        },
        tooling: { language: 'ts', linter: 'eslint', formatter: 'prettier' },
      });

      expect(() => {
        resolveScaffolderOptions({
          manifest: baseJson,
          ui: 'shadcn',
        });
      }).toThrow(LumenError);
    });
  });
});

describe('architecture/framework combos (#51)', () => {
  it('rejects legacy hybrid architecture across all frameworks (#62, #70)', () => {
    expect(() => validateScaffolderFlags({ arch: 'hybrid' })).toThrow(/Invalid architecture preset "hybrid"/);
    expect(() => validateScaffolderFlags({ arch: 'hybrid', framework: 'react' })).toThrow(/Invalid architecture preset "hybrid"/);
    expect(() => validateScaffolderFlags({ arch: 'hybrid', framework: 'next' })).toThrow(/Invalid architecture preset "hybrid"/);
  });
  it('rejects type-based with next', () => {
    expect(() => validateScaffolderFlags({ arch: 'type-based', framework: 'next' })).toThrow(/not valid for framework "next"/);
  });
  it('accepts feature-based with next', () => {
    expect(() => validateScaffolderFlags({ arch: 'feature-based', framework: 'next' })).not.toThrow();
  });

  describe('Biome v2 and --formatter none integration (#67)', () => {
    it('accepts --formatter none in validateScaffolderFlags', () => {
      expect(() => validateScaffolderFlags({ formatter: 'none' })).not.toThrow();
      expect(() => validateScaffolderFlags({ linter: 'biome', formatter: 'none' })).not.toThrow();
    });

    it('defaults formatter to "none" when linter is "biome"', () => {
      const result = resolveScaffolderOptions({
        linter: 'biome',
        template: 'react-ts',
      });

      expect(result.manifest).toBeDefined();
      const manifest = JSON.parse(result.manifest);
      expect(manifest.tooling.linter).toBe('biome');
      expect(manifest.tooling.formatter).toBe('none');
    });

    it('preserves explicit --formatter none with any linter', () => {
      const result = resolveScaffolderOptions({
        linter: 'eslint',
        formatter: 'none',
        template: 'next-ts',
      });

      expect(result.manifest).toBeDefined();
      const manifest = JSON.parse(result.manifest);
      expect(manifest.tooling.linter).toBe('eslint');
      expect(manifest.tooling.formatter).toBe('none');
    });
  });
});
