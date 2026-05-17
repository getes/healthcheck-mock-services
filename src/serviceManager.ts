import { writeFile } from 'node:fs/promises';
import { MockService } from './mockService.js';
import type { ServiceConfig, AppConfig } from './types.js';

export class ServiceManager {
  private services = new Map<string, MockService>();

  constructor(
    private readonly configPath: string,
    private readonly controlPort: number,
  ) {}

  async startAll(configs: ServiceConfig[]): Promise<void> {
    for (const config of configs) {
      const svc = new MockService(config);
      await svc.start();
      this.services.set(config.name, svc);
      console.log(`[${config.name}] up on :${config.port} (state: ${config.state})`);
    }
  }

  async stopAll(): Promise<void> {
    const stops = [...this.services.values()].map((s) => s.stop());
    await Promise.all(stops);
    this.services.clear();
  }

  list(): ServiceConfig[] {
    return [...this.services.values()].map((s) => s.state);
  }

  getService(name: string): MockService | undefined {
    return this.services.get(name);
  }

  async reconfigure(configs: ServiceConfig[]): Promise<void> {
    await this.stopAll();
    await this.startAll(configs);
    await this.persist(configs);
  }

  private async persist(configs: ServiceConfig[]): Promise<void> {
    const payload: AppConfig = { controlPort: this.controlPort, services: configs };
    await writeFile(this.configPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  }
}
