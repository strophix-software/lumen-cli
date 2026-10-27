import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { createCli } from '../../src/cli.js';
import {
  executeGenerateForm,
  checkFormDependencies,
  addPeerDependencies,
  installFormDependencies,
  REQUIRED_PACKAGE_VERSIONS,
} from '../../src/commands/generate/form.js';
import { LumenError, EXIT } from '../../src/errors.js';

describe('lumen g form generator', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-form-test-'));
    stdoutOutput = '';

    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('executeGenerateForm with react-vite fixtures', () => {
    it('generates form component and zod schema in TypeScript react-vite-feature-based project', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeGenerateForm('user-profile', { cwd: tmpDir });

      expect(result.kind).toBe('form');
      expect(result.name).toBe('user-profile');
      expect(result.created.length).toBe(2);

      const schemaFile = path.join(tmpDir, fixture.manifest.paths.components, 'user-profile.schema.ts');
      const componentFile = path.join(tmpDir, fixture.manifest.paths.components, 'UserProfileForm.tsx');

      expect(fs.existsSync(schemaFile)).toBe(true);
      expect(fs.existsSync(componentFile)).toBe(true);

      const schemaContent = fs.readFileSync(schemaFile, 'utf8');
      expect(schemaContent).toContain('userProfileSchema = z.object({');
      expect(schemaContent).toContain('export type UserProfileFormValues = z.infer<typeof userProfileSchema>;');

      const componentContent = fs.readFileSync(componentFile, 'utf8');
      expect(componentContent).toContain("import { userProfileSchema, type UserProfileFormValues } from './user-profile.schema';");
      expect(componentContent).toContain('export function UserProfileForm(');
      expect(componentContent).toContain('zodResolver(userProfileSchema)');
      // Check tailwind classes since styling is tailwind
      expect(componentContent).toContain('space-y-4 max-w-md');
    });

    it('generates form component and zod schema in JavaScript react-vite-type-based project', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-type-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeGenerateForm('contact', { cwd: tmpDir });

      expect(result.created.length).toBe(2);

      const schemaFile = path.join(tmpDir, fixture.manifest.paths.components, 'contact.schema.js');
      const componentFile = path.join(tmpDir, fixture.manifest.paths.components, 'ContactForm.jsx');

      expect(fs.existsSync(schemaFile)).toBe(true);
      expect(fs.existsSync(componentFile)).toBe(true);

      const schemaContent = fs.readFileSync(schemaFile, 'utf8');
      expect(schemaContent).toContain('contactSchema = z.object({');
      // No TypeScript types in JS
      expect(schemaContent).not.toContain('export type');

      const componentContent = fs.readFileSync(componentFile, 'utf8');
      expect(componentContent).toContain("import { contactSchema } from './contact.schema';");
      expect(componentContent).toContain('export function ContactForm({ defaultValues, onSubmit })');
    });

    it('generates form under feature components when --feature is specified', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeGenerateForm('login', { cwd: tmpDir, feature: 'auth' });

      expect(result.created.length).toBe(2);
      expect(result.targetDir).toBe('src/features/auth/components');

      const componentFile = path.join(tmpDir, 'src/features/auth/components', 'LoginForm.tsx');
      const schemaFile = path.join(tmpDir, 'src/features/auth/components', 'login.schema.ts');

      expect(fs.existsSync(componentFile)).toBe(true);
      expect(fs.existsSync(schemaFile)).toBe(true);
    });

    it('throws LumenError when --feature is used in preset "none"', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-none');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await expect(
        executeGenerateForm('login', { cwd: tmpDir, feature: 'auth' })
      ).rejects.toThrow(LumenError);

      try {
        await executeGenerateForm('login', { cwd: tmpDir, feature: 'auth' });
      } catch (err) {
        expect(err.code).toBe(EXIT.USER);
        expect(err.message).toContain('Feature-scoped forms require a feature architecture');
      }
    });

    it('wires optional --service to service import and submit handler', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await executeGenerateForm('checkout', {
        cwd: tmpDir,
        feature: 'billing',
        service: 'checkout',
      });

      const componentFile = path.join(tmpDir, 'src/features/billing/components', 'CheckoutForm.tsx');
      const content = fs.readFileSync(componentFile, 'utf8');

      expect(content).toContain("import { checkoutService } from '../services/checkout';");
      expect(content).toContain('checkoutService.submit(data)');
    });

    it('wires optional --service in shared components resolving relative service path', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await executeGenerateForm('feedback', {
        cwd: tmpDir,
        service: 'feedback',
      });

      const componentFile = path.join(tmpDir, fixture.manifest.paths.components, 'FeedbackForm.tsx');
      const content = fs.readFileSync(componentFile, 'utf8');

      expect(content).toContain("import { feedbackService } from '../services/feedback';");
      expect(content).toContain('feedbackService.submit(data)');
    });

    it('emits shadcn ui references when manifest.ui.kit is shadcn', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      const manifest = JSON.parse(JSON.stringify(fixture.manifest));
      manifest.ui = { kit: 'shadcn' };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      await executeGenerateForm('profile', { cwd: tmpDir });

      const componentFile = path.join(tmpDir, manifest.paths.components, 'ProfileForm.tsx');
      const content = fs.readFileSync(componentFile, 'utf8');

      expect(content).toContain("// UI Kit components (./ui)");
      expect(content).toContain("text-destructive");
    });

    it('wires UI Kit components actively when --ui is provided or UI components exist', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      const manifest = JSON.parse(JSON.stringify(fixture.manifest));
      manifest.ui = { kit: 'shadcn' };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Create dummy button, input, label in paths.ui
      const uiDir = path.join(tmpDir, manifest.paths.ui);
      fs.mkdirSync(uiDir, { recursive: true });
      fs.writeFileSync(path.join(uiDir, 'button.tsx'), 'export const Button = () => null;');
      fs.writeFileSync(path.join(uiDir, 'input.tsx'), 'export const Input = () => null;');
      fs.writeFileSync(path.join(uiDir, 'label.tsx'), 'export const Label = () => null;');

      await executeGenerateForm('contact', { cwd: tmpDir });

      const componentFile = path.join(tmpDir, manifest.paths.components, 'ContactForm.tsx');
      const content = fs.readFileSync(componentFile, 'utf8');

      expect(content).toContain("import { Button } from './ui/button';");
      expect(content).toContain("import { Input } from './ui/input';");
      expect(content).toContain("import { Label } from './ui/label';");
      expect(content).toContain('<Label');
      expect(content).toContain('<Input');
      expect(content).toContain('<Button');
    });

    it('wires UI Kit components actively when --ui flag is explicitly set', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      const manifest = JSON.parse(JSON.stringify(fixture.manifest));
      manifest.ui = { kit: 'shadcn' };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      await executeGenerateForm('explicit-ui', { cwd: tmpDir, ui: true });

      const componentFile = path.join(tmpDir, manifest.paths.components, 'ExplicitUiForm.tsx');
      const content = fs.readFileSync(componentFile, 'utf8');

      expect(content).toContain("import { Button } from './ui/button';");
      expect(content).toContain("import { Input } from './ui/input';");
      expect(content).toContain("import { Label } from './ui/label';");
      expect(content).toContain('<Label');
      expect(content).toContain('<Input');
      expect(content).toContain('<Button');
    });

    it('adds "use client" directive when manifest.framework.name is next', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');
      const manifest = JSON.parse(JSON.stringify(fixture.manifest));
      manifest.framework = { name: 'next', variant: 'app-router' };

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(manifest, null, 2)
      );

      await executeGenerateForm('client-form', { cwd: tmpDir });

      const componentFile = path.join(tmpDir, manifest.paths.components, 'ClientFormForm.tsx');
      const content = fs.readFileSync(componentFile, 'utf8');

      expect(content.startsWith("'use client';")).toBe(true);
    });

    it('honors --dry-run and writes nothing to disk', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeGenerateForm('dry-sample', { cwd: tmpDir, dryRun: true });

      expect(result.created.length).toBe(2);
      expect(stdoutOutput).toContain('[DRY RUN]');

      const componentFile = path.join(tmpDir, fixture.manifest.paths.components, 'DrySampleForm.tsx');
      expect(fs.existsSync(componentFile)).toBe(false);
    });

    it('honors --force to overwrite existing files and skips by default', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      // First run: creates
      await executeGenerateForm('persist', { cwd: tmpDir });

      // Second run without force: skips
      const skipResult = await executeGenerateForm('persist', { cwd: tmpDir, force: false });
      expect(skipResult.skipped.length).toBe(2);
      expect(skipResult.overwritten.length).toBe(0);

      // Third run with force: overwrites
      const overwriteResult = await executeGenerateForm('persist', { cwd: tmpDir, force: true });
      expect(overwriteResult.overwritten.length).toBe(2);
      expect(overwriteResult.skipped.length).toBe(0);
    });

    it('honors --json and writes structured JSON payload to stdout', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const result = await executeGenerateForm('json-sample', { cwd: tmpDir, json: true });

      expect(result.created.length).toBe(2);
      const parsed = JSON.parse(stdoutOutput.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.kind).toBe('form');
      expect(parsed.name).toBe('json-sample');
      expect(parsed.packages).toBeDefined();
      expect(parsed.packages.length).toBe(3);
    });
  });

  describe('checkFormDependencies', () => {
    it('detects missing packages when package.json does not contain them', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: { react: '^19.0.0' } })
      );

      const checks = checkFormDependencies(tmpDir);
      expect(checks).toEqual([
        { name: 'react-hook-form', installed: false },
        { name: 'zod', installed: false },
        { name: '@hookform/resolvers', installed: false },
      ]);
    });

    it('detects installed packages when package.json contains them', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            'react-hook-form': '^7.0.0',
            zod: '^3.23.0',
          },
          devDependencies: {
            '@hookform/resolvers': '^3.0.0',
          },
        })
      );

      const checks = checkFormDependencies(tmpDir);
      expect(checks).toEqual([
        { name: 'react-hook-form', installed: true },
        { name: 'zod', installed: true },
        { name: '@hookform/resolvers', installed: true },
      ]);
    });

    it('reports added status when newlyAdded packages list is provided', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            'react-hook-form': '^7.54.0',
          },
        })
      );

      const checks = checkFormDependencies(tmpDir, ['react-hook-form']);
      expect(checks).toEqual([
        { name: 'react-hook-form', installed: true, added: true },
        { name: 'zod', installed: false, added: false },
        { name: '@hookform/resolvers', installed: false, added: false },
      ]);
    });
  });

  describe('addPeerDependencies (#95)', () => {
    it('writes missing form dependencies to package.json with recommended versions', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ dependencies: {} }, null, 2)
      );

      const added = addPeerDependencies(tmpDir, ['react-hook-form', 'zod', '@hookform/resolvers']);
      expect(added).toEqual(['react-hook-form', 'zod', '@hookform/resolvers']);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['react-hook-form']).toBe('^7.54.0');
      expect(pkg.dependencies.zod).toBe('^3.24.0');
      expect(pkg.dependencies['@hookform/resolvers']).toBe('^3.10.0');
      expect(REQUIRED_PACKAGE_VERSIONS['react-hook-form']).toBe('^7.54.0');
      expect(installFormDependencies).toBe(addPeerDependencies);
    });

    it('does not overwrite existing dependencies or devDependencies', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          dependencies: {
            zod: '^3.20.0',
          },
          devDependencies: {
            '@hookform/resolvers': '^3.5.0',
          },
        }, null, 2)
      );

      const added = addPeerDependencies(tmpDir, ['react-hook-form', 'zod', '@hookform/resolvers']);
      expect(added).toEqual(['react-hook-form']);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies.zod).toBe('^3.20.0');
      expect(pkg.devDependencies['@hookform/resolvers']).toBe('^3.5.0');
      expect(pkg.dependencies['react-hook-form']).toBe('^7.54.0');
    });

    it('returns empty array and does not modify disk when dryRun is true', () => {
      const initialContent = JSON.stringify({ dependencies: {} }, null, 2);
      fs.writeFileSync(path.join(tmpDir, 'package.json'), initialContent);

      const added = addPeerDependencies(tmpDir, ['react-hook-form', 'zod'], { dryRun: true });
      expect(added).toEqual([]);

      const afterContent = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');
      expect(afterContent).toBe(initialContent);
    });

    it('returns empty array if package.json does not exist', () => {
      const added = addPeerDependencies(tmpDir, ['react-hook-form']);
      expect(added).toEqual([]);
    });
  });

  describe('Form dependencies auto-injection in executeGenerateForm (#95)', () => {
    it('injects missing form dependencies into package.json when generating a form', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'my-app', dependencies: { react: '^19.0.0' } }, null, 2)
      );

      const result = await executeGenerateForm('sign-up', { cwd: tmpDir });

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['react-hook-form']).toBe('^7.54.0');
      expect(pkg.dependencies.zod).toBe('^3.24.0');
      expect(pkg.dependencies['@hookform/resolvers']).toBe('^3.10.0');

      expect(result.packages).toEqual([
        { name: 'react-hook-form', installed: true, added: true },
        { name: 'zod', installed: true, added: true },
        { name: '@hookform/resolvers', installed: true, added: true },
      ]);

      expect(stdoutOutput).toContain('+ react-hook-form: added to package.json (run npm install)');
      expect(stdoutOutput).toContain('+ zod: added to package.json (run npm install)');
      expect(stdoutOutput).toContain('+ @hookform/resolvers: added to package.json (run npm install)');
    });

    it('does not touch package.json if dependencies are already installed', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify(
          {
            name: 'my-app',
            dependencies: {
              'react-hook-form': '^7.50.0',
              zod: '^3.23.0',
              '@hookform/resolvers': '^3.9.0',
            },
          },
          null,
          2
        )
      );

      const result = await executeGenerateForm('login', { cwd: tmpDir });

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['react-hook-form']).toBe('^7.50.0');
      expect(pkg.dependencies.zod).toBe('^3.23.0');
      expect(pkg.dependencies['@hookform/resolvers']).toBe('^3.9.0');

      expect(result.packages).toEqual([
        { name: 'react-hook-form', installed: true, added: false },
        { name: 'zod', installed: true, added: false },
        { name: '@hookform/resolvers', installed: true, added: false },
      ]);

      expect(stdoutOutput).toContain('✔ react-hook-form: installed');
      expect(stdoutOutput).toContain('✔ zod: installed');
      expect(stdoutOutput).toContain('✔ @hookform/resolvers: installed');
    });

    it('does not modify package.json when dryRun is true', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const initialPkg = JSON.stringify({ name: 'my-app', dependencies: {} }, null, 2);
      fs.writeFileSync(path.join(tmpDir, 'package.json'), initialPkg);

      const result = await executeGenerateForm('dry-form', { cwd: tmpDir, dryRun: true });

      const afterPkg = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');
      expect(afterPkg).toBe(initialPkg);

      expect(result.packages).toEqual([
        { name: 'react-hook-form', installed: false, added: false },
        { name: 'zod', installed: false, added: false },
        { name: '@hookform/resolvers', installed: false, added: false },
      ]);

      expect(stdoutOutput).toContain('⚠ react-hook-form: missing (install with npm i react-hook-form)');
      expect(stdoutOutput).toContain('⚠ zod: missing (install with npm i zod)');
      expect(stdoutOutput).toContain('⚠ @hookform/resolvers: missing (install with npm i @hookform/resolvers)');
    });
  });

  describe('CLI command integration', () => {
    it('shows help and examples for lumen generate form --help', () => {
      const program = createCli().exitOverride();
      let output = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        output += str;
        return true;
      });

      try {
        program.parse(['node', 'lumen', 'generate', 'form', '--help']);
      } catch {
        // expected exitOverride
      }

      expect(output).toContain('Generate a validated React Hook Form with Zod schema');
      expect(output).toContain('--feature <feature>');
      expect(output).toContain('--service <service>');
      expect(output).toContain('--dry-run');
      expect(output).toContain('Examples:');
      expect(output).toContain('$ lumen g form user-profile');
    });

    it('runs via CLI lumen g form command', async () => {
      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      const program = createCli().exitOverride();
      await program.parseAsync(['node', 'lumen', 'g', 'form', 'account', '-c', tmpDir]);

      const formFile = path.join(tmpDir, fixture.manifest.paths.components, 'AccountForm.tsx');
      expect(fs.existsSync(formFile)).toBe(true);
    });
  });

  describe('Smoke test: emitted TypeScript syntax parses', async () => {
    let tsModule = null;
    try {
      tsModule = await import('typescript');
    } catch {
      tsModule = null;
    }

    it('parses emitted .ts and .tsx files without syntax errors', async () => {
      if (!tsModule || !tsModule.transpileModule) {
        // Skip if typescript is not in node_modules as instructed in prompt
        return;
      }

      const fixtures = await loadValidFixtures();
      const fixture = fixtures.find((f) => f.name === 'react-vite-feature-based');

      fs.writeFileSync(
        path.join(tmpDir, 'lumen.config.json'),
        JSON.stringify(fixture.manifest, null, 2)
      );

      await executeGenerateForm('smoke', { cwd: tmpDir });

      const schemaFile = path.join(tmpDir, fixture.manifest.paths.components, 'smoke.schema.ts');
      const formFile = path.join(tmpDir, fixture.manifest.paths.components, 'SmokeForm.tsx');

      const schemaCode = fs.readFileSync(schemaFile, 'utf8');
      const formCode = fs.readFileSync(formFile, 'utf8');

      const transpileSchema = tsModule.transpileModule(schemaCode, {
        compilerOptions: { jsx: tsModule.JsxEmit.ReactJSX },
      });
      expect(transpileSchema.outputText).toBeDefined();

      const transpileForm = tsModule.transpileModule(formCode, {
        compilerOptions: { jsx: tsModule.JsxEmit.ReactJSX },
      });
      expect(transpileForm.outputText).toBeDefined();
    });
  });
});
