import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCli } from '../../src/cli.js';
import * as scaffolderModule from '../../src/scaffolder.js';

describe('create and init commands', () => {
  let runScaffolderSpy;
  let originalExitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    runScaffolderSpy = vi.spyOn(scaffolderModule, 'runScaffolder').mockResolvedValue(0);
  });

  afterEach(() => {
    runScaffolderSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  describe('lumen create', () => {
    it('registers create command on program', () => {
      const program = createCli();
      const createCmd = program.commands.find((cmd) => cmd.name() === 'create');
      expect(createCmd).toBeDefined();
      expect(createCmd.description()).toBe('Create a new Lumen project');
    });

    it('forwards project name and flags to scaffolder', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync([
        'node',
        'lumen',
        'create',
        'my-cool-app',
        '-y',
        '-t',
        'react-ts',
        '-m',
        './lumen.config.json',
        '-f',
        'react',
        '-a',
        'feature-based',
      ]);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      expect(runScaffolderSpy).toHaveBeenCalledWith(
        [
          'my-cool-app',
          '--yes',
          '--manifest',
          './lumen.config.json',
          '--template',
          'react-ts',
          '--framework',
          'react',
          '--arch',
          'feature-based',
        ],
        { cwd: process.cwd() }
      );
    });

    it('handles --architecture as alias for --arch', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync([
        'node',
        'lumen',
        'create',
        'my-app',
        '--architecture',
        'type-based',
      ]);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      expect(runScaffolderSpy).toHaveBeenCalledWith(
        ['my-app', '--arch', 'type-based'],
        { cwd: process.cwd() }
      );
    });

    it('respects global --cwd option', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync([
        'node',
        'lumen',
        '-c',
        '/custom/workspace',
        'create',
        'app',
        '-y',
      ]);

      expect(runScaffolderSpy).toHaveBeenCalledWith(
        ['app', '--yes'],
        { cwd: '/custom/workspace' }
      );
    });

    it('sets process.exitCode from scaffolder exit code', async () => {
      runScaffolderSpy.mockResolvedValueOnce(42);
      const program = createCli().exitOverride();
      await program.parseAsync(['node', 'lumen', 'create', 'app']);

      expect(process.exitCode).toBe(42);
    });
  });

  describe('lumen init', () => {
    it('registers init command on program', () => {
      const program = createCli();
      const initCmd = program.commands.find((cmd) => cmd.name() === 'init');
      expect(initCmd).toBeDefined();
      expect(initCmd.description()).toBe('Initialize a Lumen project in current directory');
    });

    it('invokes scaffolder without positional name when init is run', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync(['node', 'lumen', 'init', '-y', '-t', 'react-ts']);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      expect(runScaffolderSpy).toHaveBeenCalledWith(
        ['--yes', '--template', 'react-ts'],
        { cwd: process.cwd() }
      );
    });

    it('forwards --arch / --architecture in init', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync(['node', 'lumen', 'init', '--architecture', 'none']);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      expect(runScaffolderSpy).toHaveBeenCalledWith(
        ['--arch', 'none'],
        { cwd: process.cwd() }
      );
    });

    it('forwards tooling flags as an inline --manifest in create', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync([
        'node',
        'lumen',
        'create',
        'tooling-app',
        '-y',
        '--linter',
        'oxlint',
        '--formatter',
        'oxfmt',
      ]);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      const callArgs = runScaffolderSpy.mock.calls[0][0];
      expect(callArgs[0]).toBe('tooling-app');
      expect(callArgs).toContain('--yes');
      const manifestIndex = callArgs.indexOf('--manifest');
      expect(manifestIndex).toBeGreaterThan(-1);

      const manifestJson = callArgs[manifestIndex + 1];
      const parsed = JSON.parse(manifestJson);
      expect(parsed.manifestVersion).toBe(2);
      expect(parsed.tooling.linter).toBe('oxlint');
      expect(parsed.tooling.formatter).toBe('oxfmt');
    });

    it('forwards tooling flags as inline manifest in init', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync([
        'node',
        'lumen',
        'init',
        '-y',
        '--language',
        'js',
        '--styling',
        'none',
      ]);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      const callArgs = runScaffolderSpy.mock.calls[0][0];
      expect(callArgs).toContain('--yes');
      const manifestIndex = callArgs.indexOf('--manifest');
      expect(manifestIndex).toBeGreaterThan(-1);

      const manifestJson = callArgs[manifestIndex + 1];
      const parsed = JSON.parse(manifestJson);
      expect(parsed.tooling.language).toBe('js');
      expect(parsed.styling.engine).toBe('none');
    });

    it('fails before spawning if a tooling flag value is invalid', async () => {
      const program = createCli().exitOverride();
      await expect(
        program.parseAsync([
          'node',
          'lumen',
          'create',
          'invalid-app',
          '--linter',
          'invalid-linter',
        ])
      ).rejects.toThrow('Invalid linter "invalid-linter"');

      expect(runScaffolderSpy).not.toHaveBeenCalled();
    });

    it('forwards create-lumen beta.5 flags (--state, --db, --docker, --route-groups, --agent-docs, --testing)', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync([
        'node',
        'lumen',
        'create',
        'state-app',
        '-y',
        '-s',
        'zustand',
        '--testing',
        'vitest',
      ]);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      const callArgs = runScaffolderSpy.mock.calls[0][0];
      expect(callArgs).toContain('state-app');
      expect(callArgs).toContain('--yes');
      expect(callArgs).toContain('--state');
      expect(callArgs[callArgs.indexOf('--state') + 1]).toBe('zustand');
      expect(callArgs).toContain('--testing');
      expect(callArgs[callArgs.indexOf('--testing') + 1]).toBe('vitest');
    });

    it('forwards database, docker, and route-groups flags on next template in create', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync([
        'node',
        'lumen',
        'create',
        'fullstack-app',
        '-y',
        '-t',
        'next-ts',
        '--db',
        'prisma',
        '--db-provider',
        'supabase',
        '--docker',
        '--route-groups',
        '--agent-docs',
      ]);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      const callArgs = runScaffolderSpy.mock.calls[0][0];
      expect(callArgs).toContain('fullstack-app');
      expect(callArgs).toContain('--yes');
      expect(callArgs).toContain('--template');
      expect(callArgs).toContain('next-ts');
      // When db/docker/route-groups are passed, an inline manifest is generated
      const manifestIndex = callArgs.indexOf('--manifest');
      expect(manifestIndex).toBeGreaterThan(-1);
      const parsed = JSON.parse(callArgs[manifestIndex + 1]);
      expect(parsed.database.orm).toBe('prisma');
      expect(parsed.database.provider).toBe('supabase');
      expect(parsed.docker).toBe(true);
      expect(parsed.routeGroups).toBe(true);
      expect(parsed.agentDocs).toBe(true);
    });

    it('forwards --state in lumen init', async () => {
      const program = createCli().exitOverride();
      await program.parseAsync([
        'node',
        'lumen',
        'init',
        '-y',
        '--state',
        'redux',
      ]);

      expect(runScaffolderSpy).toHaveBeenCalledTimes(1);
      const callArgs = runScaffolderSpy.mock.calls[0][0];
      expect(callArgs).toContain('--yes');
      expect(callArgs).toContain('--state');
      expect(callArgs[callArgs.indexOf('--state') + 1]).toBe('redux');
    });
  });
});
