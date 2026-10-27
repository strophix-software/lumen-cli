import { registerGenerate } from './generate.js';
import { registerConfig } from './config.js';
import { registerCreate } from './create.js';
import { registerDoctor } from './doctor.js';
import { registerDb } from './db.js';

export function registerCommands(program) {
  registerGenerate(program);
  registerConfig(program);
  registerCreate(program);
  registerDoctor(program);
  registerDb(program);
  return program;
}
