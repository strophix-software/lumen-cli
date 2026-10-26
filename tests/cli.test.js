import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCli, runCli, getPackageJson } from '../src/cli.js';
import * as commandsModule from '../src/commands/index.js';
import { LumenError, EXIT } from '../src/errors.js';

describe('lumen-cli bootstrap', () => {
  let pkg;

  beforeEach(() => {
    pkg = getPackageJson();
  });

  it('should load valid package.json with version and ESM type', () => {
    expect(pkg.name).toBe('@lumen-sh/cli');
    expect(pkg.type).toBe('module');
    expect(pkg.version).toBeDefined();
    expect(pkg.bin).toEqual({
      lumen: 'bin/lumen.js',
      lm: 'bin/lumen.js',
    });
  });

  it('createCli creates commander program with lumen name and package version', () => {
    const program = createCli();
    expect(program.name()).toBe('lumen');
    expect(program.version()).toBe(pkg.version);
  });

  it('runCli creates and parses program', () => {
    const program = runCli(['node', 'lumen']);
    expect(program.name()).toBe('lumen');
  });

  describe('Global options', () => {
    it('registers and parses global flags correctly', () => {
      const program = createCli().exitOverride();
      program.parse(['node', 'lumen', '-c', 'custom/dir', '-v', '-j', '--no-color']);
      const opts = program.opts();

      expect(opts.cwd).toBe('custom/dir');
      expect(opts.verbose).toBe(true);
      expect(opts.json).toBe(true);
      expect(opts.color).toBe(false);
    });

    it('distinguishes -V (version) and -v (verbose)', () => {
      const progVerbose = createCli().exitOverride();
      progVerbose.parse(['node', 'lumen', '-v']);
      expect(progVerbose.opts().verbose).toBe(true);

      const progVersion = createCli().exitOverride();
      let versionOutput = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        versionOutput += str;
        return true;
      });
      try {
        progVersion.parse(['node', 'lumen', '-V']);
      } catch {
        // expected Commander exit override
      }
      expect(versionOutput.trim()).toBe(pkg.version);
      vi.restoreAllMocks();
    });
  });

  describe('CLI help and version output', () => {
    let output = '';
    let exitCode = null;

    beforeEach(() => {
      output = '';
      exitCode = null;

      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        output += str;
        return true;
      });

      vi.spyOn(process.stderr, 'write').mockImplementation((str) => {
        output += str;
        return true;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('outputs help text when called with --help', () => {
      const program = createCli();
      program.exitOverride();

      try {
        program.parse(['node', 'lumen', '--help']);
      } catch (e) {
        exitCode = e.exitCode;
      }

      expect(exitCode).toBe(0);
      expect(output).toContain('Usage: lumen [options]');
      expect(output).toContain('-h, --help');
      expect(output).toContain('-V, --version');
      expect(output).toContain('-c, --cwd <dir>');
      expect(output).toContain('-v, --verbose');
      expect(output).toContain('-j, --json');
      expect(output).toContain('--no-color');
      expect(output).toContain('Examples:');
    });

    it('outputs help text when called with -h', () => {
      const program = createCli();
      program.exitOverride();

      try {
        program.parse(['node', 'lumen', '-h']);
      } catch (e) {
        exitCode = e.exitCode;
      }

      expect(exitCode).toBe(0);
      expect(output).toContain('Usage: lumen [options]');
    });

    it('outputs version when called with --version', () => {
      const program = createCli();
      program.exitOverride();

      try {
        program.parse(['node', 'lumen', '--version']);
      } catch (e) {
        exitCode = e.exitCode;
      }

      expect(exitCode).toBe(0);
      expect(output.trim()).toBe(pkg.version);
    });

    it('outputs version when called with -V', () => {
      const program = createCli();
      program.exitOverride();

      try {
        program.parse(['node', 'lumen', '-V']);
      } catch (e) {
        exitCode = e.exitCode;
      }

      expect(exitCode).toBe(0);
      expect(output.trim()).toBe(pkg.version);
    });

    it('short alias -h equals --help output', () => {
      const prog1 = createCli().exitOverride();
      let outHelp = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        outHelp += str;
        return true;
      });
      try {
        prog1.parse(['node', 'lumen', '--help']);
      } catch {
        // expected Commander exit override
      }

      const prog2 = createCli().exitOverride();
      let outShortH = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        outShortH += str;
        return true;
      });
      try {
        prog2.parse(['node', 'lumen', '-h']);
      } catch {
        // expected Commander exit override
      }

      expect(outShortH).toBe(outHelp);
    });

    it('short alias -V equals --version output', () => {
      const prog1 = createCli().exitOverride();
      let outVersion = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        outVersion += str;
        return true;
      });
      try {
        prog1.parse(['node', 'lumen', '--version']);
      } catch {
        // expected Commander exit override
      }

      const prog2 = createCli().exitOverride();
      let outShortV = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        outShortV += str;
        return true;
      });
      try {
        prog2.parse(['node', 'lumen', '-V']);
      } catch {
        // expected Commander exit override
      }

      expect(outShortV).toBe(outVersion);
    });

    it('lm alias resolves identically to lumen', () => {
      const program = createCli();
      program.exitOverride();

      try {
        program.parse(['node', 'lm', '--help']);
      } catch (e) {
        exitCode = e.exitCode;
      }

      expect(exitCode).toBe(0);
      expect(output).toContain('Usage: lumen [options]');
    });
  });

  describe('Commands and error handling', () => {
    let stderrOutput = '';

    beforeEach(() => {
      stderrOutput = '';
      process.exitCode = undefined;

      vi.spyOn(process.stderr, 'write').mockImplementation((str) => {
        stderrOutput += str;
        return true;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      process.exitCode = undefined;
    });

    it('generate command and alias g display identical help and include examples', () => {
      const progGen = createCli().exitOverride();
      let genHelp = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        genHelp += str;
        return true;
      });
      try {
        progGen.parse(['node', 'lumen', 'generate', '--help']);
      } catch {
        // expected Commander exit override
      }

      const progG = createCli().exitOverride();
      let gHelp = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        gHelp += str;
        return true;
      });
      try {
        progG.parse(['node', 'lumen', 'g', '-h']);
      } catch {
        // expected Commander exit override
      }

      expect(gHelp).toBe(genHelp);
      expect(genHelp).toContain('Usage: lumen generate|g [options]');
      expect(genHelp).toContain('Examples:');
      expect(genHelp).toContain('$ lumen generate --help');
      expect(genHelp).toContain('$ lumen g --help');
    });

    it('g -h equals generate --help output', () => {
      const progGen = createCli().exitOverride();
      let genHelp = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        genHelp += str;
        return true;
      });
      try {
        progGen.parse(['node', 'lumen', 'generate', '--help']);
      } catch {
        // expected Commander exit override
      }

      const progG = createCli().exitOverride();
      let gHelp = '';
      vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
        gHelp += str;
        return true;
      });
      try {
        progG.parse(['node', 'lumen', 'g', '--help']);
      } catch {
        // expected Commander exit override
      }

      expect(gHelp).toBe(genHelp);
    });

    it('unknown command suggests matching command and exits with code 1', () => {
      const program = createCli().exitOverride();
      let exitCode = null;

      try {
        program.parse(['node', 'lumen', 'generat']);
      } catch (e) {
        exitCode = e.exitCode;
      }

      expect(exitCode).toBe(1);
      expect(stderrOutput).toContain("error: unknown command 'generat'");
      expect(stderrOutput).toContain('(Did you mean generate?)');
    });

    it('runCli catches LumenError, formats plain output, and sets process.exitCode', async () => {
      vi.spyOn(commandsModule, 'registerCommands').mockImplementation((prog) => {
        prog.command('fail-test').action(() => {
          throw new LumenError('Bad user parameter', {
            code: EXIT.USER,
            hint: 'Specify --target',
          });
        });
        return prog;
      });

      await runCli(['node', 'lumen', 'fail-test']).finished;

      expect(process.exitCode).toBe(1);
      expect(stderrOutput).toContain('Error: Bad user parameter');
      expect(stderrOutput).toContain('Hint: Specify --target');
    });

    it('runCli handles LumenError with --json format', async () => {
      vi.spyOn(commandsModule, 'registerCommands').mockImplementation((prog) => {
        prog.command('fail-json').action(() => {
          throw new LumenError('Config parsing failed', {
            code: EXIT.CONFIG,
            hint: 'Invalid JSON',
          });
        });
        return prog;
      });

      await runCli(['node', 'lumen', '-j', 'fail-json']).finished;

      expect(process.exitCode).toBe(2);
      const parsed = JSON.parse(stderrOutput.trim());
      expect(parsed).toEqual({
        error: 'Config parsing failed',
        code: 2,
        hint: 'Invalid JSON',
      });
    });
  });
});
