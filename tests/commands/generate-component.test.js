import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadValidFixtures } from 'create-lumen/schema/fixtures/index.js';
import { createCli } from '../../src/cli.js';
import { LumenError, EXIT } from '../../src/errors.js';
import { resolveComponentTargetDir } from '../../src/commands/generate/component.js';

describe('lumen g component command (#64)', () => {
  let tmpDir;
  let stdoutOutput;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-gen-comp-test-'));
    stdoutOutput = '';

    vi.spyOn(process.stdout, 'write').mockImplementation((str) => {
      stdoutOutput += str;
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('scaffolds a standard component in TypeScript under paths.components', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find(
      (f) => f.manifest.framework?.name === 'react' && f.manifest.tooling?.language === 'ts'
    ) || fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'badge']);

    const targetDir = fixture.manifest.paths?.components || 'src/components';
    const compFile = path.join(tmpDir, targetDir, 'Badge.tsx');

    expect(fs.existsSync(compFile)).toBe(true);
    const content = fs.readFileSync(compFile, 'utf8');
    expect(content).toContain('export interface BadgeProps');
    expect(content).toContain('export function Badge');
    expect(content).toContain('data-testid="badge"');
    expect(content).toContain('export default Badge;');
    expect(stdoutOutput).toContain('Component ready:');
  });

  it('scaffolds a component in JavaScript when tooling.language is js', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];
    const jsManifest = JSON.parse(JSON.stringify(fixture.manifest));
    jsManifest.tooling.language = 'js';

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(jsManifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'c', 'card']);

    const targetDir = jsManifest.paths?.components || 'src/components';
    const compFile = path.join(tmpDir, targetDir, 'Card.jsx');

    expect(fs.existsSync(compFile)).toBe(true);
    const content = fs.readFileSync(compFile, 'utf8');
    expect(content).toContain('export function Card');
    expect(content).not.toContain('interface');
  });

  it('scaffolds a feature-scoped component with --feature', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find(
      (f) => f.manifest.architecture?.preset === 'feature-based' && f.manifest.paths?.features
    ) || fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'user-card', '--feature', 'auth']);

    const expectedFile = path.join(tmpDir, fixture.manifest.paths.features, 'auth', 'components', 'UserCard.tsx');
    expect(fs.existsSync(expectedFile)).toBe(true);
    const content = fs.readFileSync(expectedFile, 'utf8');
    expect(content).toContain('export function UserCard');
    expect(content).toContain('data-testid="user-card"');
  });

  it('rejects --feature flag when architecture preset is "none"', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures.find((f) => f.name === 'react-vite-none');

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await expect(
      program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'login-box', '--feature', 'auth'])
    ).rejects.toThrow(/Feature-scoped components require a feature architecture/);
  });

  it('supports taxonomy target directories with --type', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();

    // 1. --type primitives -> paths.ui
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'button', '--type', 'primitives']);
    const uiDir = fixture.manifest.paths?.ui || 'src/components/ui';
    expect(fs.existsSync(path.join(tmpDir, uiDir, 'Button.tsx'))).toBe(true);

    // 2. --type composites -> paths.components/composites
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'data-table', '--type', 'composites']);
    const compositesDir = path.join(fixture.manifest.paths?.components || 'src/components', 'composites');
    expect(fs.existsSync(path.join(tmpDir, compositesDir, 'DataTable.tsx'))).toBe(true);

    // 3. --type feedback -> paths.components/feedback
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'alert-banner', '--type', 'feedback']);
    const feedbackDir = path.join(fixture.manifest.paths?.components || 'src/components', 'feedback');
    expect(fs.existsSync(path.join(tmpDir, feedbackDir, 'AlertBanner.tsx'))).toBe(true);
  });

  it('adds "use client" directive with --client', async () => {
    const fixtures = await loadValidFixtures();
    const nextFixture = fixtures.find((f) => f.manifest.framework?.name === 'next') || fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(nextFixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'interactive-chart', '--client']);

    const compFile = path.join(tmpDir, nextFixture.manifest.paths.components || 'src/components', 'InteractiveChart.tsx');
    expect(fs.existsSync(compFile)).toBe(true);
    const content = fs.readFileSync(compFile, 'utf8');
    expect(content.startsWith("'use client';")).toBe(true);
  });

  it('scaffolds compound component pattern with --compound', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'modal', '--compound']);

    const compFile = path.join(tmpDir, fixture.manifest.paths.components || 'src/components', 'Modal.tsx');
    expect(fs.existsSync(compFile)).toBe(true);
    const content = fs.readFileSync(compFile, 'utf8');
    expect(content).toContain('createContext');
    expect(content).toContain('useModal()');
    expect(content).toContain('ModalHeader');
    expect(content).toContain('ModalContent');
    expect(content).toContain('ModalFooter');
    expect(content).toContain('Modal.Header = ModalHeader;');
    expect(content).toContain('Modal.Content = ModalContent;');
    expect(content).toContain('Modal.Footer = ModalFooter;');
  });

  it('scaffolds co-located unit test with --test (standard and compound)', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program1 = createCli();
    await program1.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'spinner', '--test']);

    const testFile = path.join(tmpDir, fixture.manifest.paths.components || 'src/components', 'Spinner.test.tsx');
    expect(fs.existsSync(testFile)).toBe(true);
    const testContent = fs.readFileSync(testFile, 'utf8');
    expect(testContent).toContain("describe('Spinner Component'");

    const program2 = createCli();
    await program2.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'accordion', '--compound', '--test']);

    const compoundTestFile = path.join(tmpDir, fixture.manifest.paths.components || 'src/components', 'Accordion.test.tsx');
    expect(fs.existsSync(compoundTestFile)).toBe(true);
    const compoundTestContent = fs.readFileSync(compoundTestFile, 'utf8');
    expect(compoundTestContent).toContain("describe('Accordion Compound Component'");
    expect(compoundTestContent).toContain('<Accordion.Header>');
  });

  it('updates existing barrel index.ts with export * statement', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const targetDir = fixture.manifest.paths.components || 'src/components';
    const absTargetDir = path.join(tmpDir, targetDir);
    fs.mkdirSync(absTargetDir, { recursive: true });
    fs.writeFileSync(path.join(absTargetDir, 'index.ts'), "export * from './Avatar';\n", 'utf8');

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'tooltip']);

    const updatedIndex = fs.readFileSync(path.join(absTargetDir, 'index.ts'), 'utf8');
    expect(updatedIndex).toContain("export * from './Avatar';");
    expect(updatedIndex).toContain("export * from './Tooltip';");
  });

  it('honors --dry-run option and creates no files on disk', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'hero-section', '--dry-run']);

    const compFile = path.join(tmpDir, fixture.manifest.paths.components || 'src/components', 'HeroSection.tsx');
    expect(fs.existsSync(compFile)).toBe(false);
    expect(stdoutOutput).toContain('[DRY RUN]');
  });

  it('skips existing files without --force, overwrites with --force', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const compFile = path.join(tmpDir, fixture.manifest.paths.components || 'src/components', 'Navbar.tsx');
    fs.mkdirSync(path.dirname(compFile), { recursive: true });
    fs.writeFileSync(compFile, '// custom navbar', 'utf8');

    // Run without force -> skips
    const program1 = createCli();
    await program1.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'navbar']);
    expect(fs.readFileSync(compFile, 'utf8')).toBe('// custom navbar');
    expect(stdoutOutput).toContain('- SKIP');

    // Run with force -> overwrites
    const program2 = createCli();
    await program2.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'navbar', '--force']);
    expect(fs.readFileSync(compFile, 'utf8')).toContain('export function Navbar');
    expect(stdoutOutput).toContain('! OVERWRITE');
  });

  it('outputs structured JSON when --json flag is provided', async () => {
    const fixtures = await loadValidFixtures();
    const fixture = fixtures[0];

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(fixture.manifest, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'drawer', '--json']);

    const parsed = JSON.parse(stdoutOutput.trim());
    expect(parsed.success).toBe(true);
    expect(parsed.kind).toBe('component');
    expect(parsed.name).toBe('Drawer');
    expect(parsed.created.length).toBeGreaterThan(0);
  });

  it('syncs AGENTS.md when agentDocs is enabled', async () => {
    const fixtures = await loadValidFixtures();
    const manifestWithAgentDocs = {
      ...fixtures[0].manifest,
      agentDocs: true,
    };

    fs.writeFileSync(
      path.join(tmpDir, 'lumen.config.json'),
      JSON.stringify(manifestWithAgentDocs, null, 2)
    );

    const program = createCli();
    await program.parseAsync(['node', 'lumen', '-c', tmpDir, 'g', 'component', 'footer']);

    const agentsMd = path.join(tmpDir, 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(true);
  });

  it('unit tests resolveComponentTargetDir helper directly', () => {
    const manifest = { architecture: { preset: 'feature-based' } };
    const paths = { features: 'src/features', components: 'src/components', ui: 'src/components/ui' };

    expect(resolveComponentTargetDir({ options: {}, manifest, paths })).toBe('src/components');
    expect(resolveComponentTargetDir({ options: { type: 'primitives' }, manifest, paths })).toBe('src/components/ui');
    expect(resolveComponentTargetDir({ options: { type: 'composites' }, manifest, paths })).toBe('src/components/composites');
    expect(resolveComponentTargetDir({ options: { feature: 'billing' }, manifest, paths })).toBe('src/features/billing/components');
    expect(resolveComponentTargetDir({ options: { feature: 'billing', type: 'cards' }, manifest, paths })).toBe('src/features/billing/components/cards');

    expect(() =>
      resolveComponentTargetDir({ options: { feature: 'billing' }, manifest: { architecture: { preset: 'none' } }, paths: {} })
    ).toThrow(LumenError);

    try {
      resolveComponentTargetDir({ options: { feature: 'billing' }, manifest: { architecture: { preset: 'none' } }, paths: {} });
    } catch (err) {
      expect(err.code).toBe(EXIT.USER);
    }
  });
});
