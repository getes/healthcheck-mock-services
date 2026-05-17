import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ServiceManager } from './serviceManager.js';
import { startControlServer } from './controlServer.js';
import type { AppConfig } from './types.js';

const configPath = resolve(process.argv[2] ?? 'services.config.json');
const config: AppConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

const manager = new ServiceManager(configPath, config.controlPort);

console.log(`Loading config from ${configPath}\n`);

await manager.startAll(config.services);
await startControlServer(config.controlPort, manager);

console.log(`\n${config.services.length} mock services running. Control plane on :${config.controlPort}`);
console.log(`  GET  /admin/services                  list services`);
console.log(`  POST /admin/services/:name/state      change one service state`);
console.log(`  POST /admin/reconfigure               replace topology + persist to disk`);
console.log(`  GET  /health                          on each mock service port`);
console.log(`  POST /admin/state                     on each mock service port`);

const shutdown = async (): Promise<void> => {
  console.log('\nShutting down...');
  await manager.stopAll();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
