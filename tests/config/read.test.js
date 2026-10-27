import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findConfigFile, readConfig, normalizeManifest } from '../../src/config/read.js';
import { ConfigError } from '../../src/config/errors.js';

describe('ConfigError', () => {
  it('instantiates with expected properties', () => {
    const err = new ConfigError('Invalid configuration');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ConfigError');
    expect(err.code).toBe(2);
    expect(err.exitCode).toBe(2);
    expect(err.message).toBe('Invalid configuration');
  });
});

describe('findConfigFile', () => {
  it('finds lumen.config.json in start directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-test-'));
    const configPath = path.join(tmpDir, 'lumen.config.json');
    fs.writeFileSync(configPath, '{}');

    try {
      const found = findConfigFile(tmpDir);
      expect(found).toBe(configPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('walks upward to find lumen.config.json in ancestor directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-test-'));
    const subDir = path.join(tmpDir, 'deeply', 'nested', 'pkg');
    fs.mkdirSync(subDir, { recursive: true });
    const configPath = path.join(tmpDir, 'lumen.config.json');
    fs.writeFileSync(configPath, '{}');

    try {
      const found = findConfigFile(subDir);
      expect(found).toBe(configPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when no lumen.config.json exists in directory tree', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-test-'));
    try {
      const found = findConfigFile(tmpDir);
      expect(found).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('readConfig - errors', () => {
  it('throws ConfigError when lumen.config.json is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-test-'));
    try {
      expect(() => readConfig({ cwd: tmpDir })).toThrow(ConfigError);
      expect(() => readConfig({ cwd: tmpDir })).toThrow(/Could not find lumen\.config\.json/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws ConfigError when lumen.config.json contains invalid JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-test-'));
    const configPath = path.join(tmpDir, 'lumen.config.json');
    fs.writeFileSync(configPath, '{ broken: json');
    try {
      expect(() => readConfig({ cwd: tmpDir })).toThrow(ConfigError);
      expect(() => readConfig({ cwd: tmpDir })).toThrow(/Failed to parse lumen\.config\.json as JSON/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws ConfigError with migration guide pointer for v1 manifest', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-test-'));
    const configPath = path.join(tmpDir, 'lumen.config.json');
    const v1Config = {
      framework: 'react',
      css: 'tailwind',
      architecture: 'feature-based',
    };
    fs.writeFileSync(configPath, JSON.stringify(v1Config));
    try {
      expect(() => readConfig({ cwd: tmpDir })).toThrow(ConfigError);
      expect(() => readConfig({ cwd: tmpDir })).toThrow(/docs\/migration\/v1-to-v2\.md/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws ConfigError with migration guide pointer when manifestVersion is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-test-'));
    const configPath = path.join(tmpDir, 'lumen.config.json');
    const missingVersionConfig = {
      framework: { name: 'react', variant: 'vite' },
      styling: { engine: 'tailwind' },
      architecture: { preset: 'feature-based' },
    };
    fs.writeFileSync(configPath, JSON.stringify(missingVersionConfig));
    try {
      expect(() => readConfig({ cwd: tmpDir })).toThrow(ConfigError);
      expect(() => readConfig({ cwd: tmpDir })).toThrow(/docs\/migration\/v1-to-v2\.md/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('normalizeManifest v2.1', () => {
  it('normalises preset from type when preset is omitted', () => {
    const input = {
      manifestVersion: 2,
      architecture: { type: 'feature-based' },
    };
    const norm = normalizeManifest(input);
    expect(norm.architecture.preset).toBe('feature-based');
    expect(norm.architecture.type).toBe('feature-based');
    expect(norm.architecture.validation).toBe('strict');
    expect(norm.harness.commands).toEqual([]);
    expect(norm.agentDocs).toBe(false);
  });

  it('preserves existing validation, harness commands, and agentDocs boolean', () => {
    const input = {
      manifestVersion: 2,
      architecture: { preset: 'feature-based', type: 'feature-based', validation: 'relaxed' },
      harness: { commands: [{ name: 'lint', command: 'oxlint .' }] },
      agentDocs: true,
    };
    const norm = normalizeManifest(input);
    expect(norm.architecture.validation).toBe('relaxed');
    expect(norm.harness.commands).toEqual([{ name: 'lint', command: 'oxlint .' }]);
    expect(norm.agentDocs).toBe(true);
  });
});
