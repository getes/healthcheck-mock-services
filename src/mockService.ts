import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { buildHealthResponse } from './health.js';
import { readJson, sendJson, sleep } from './http-utils.js';
import { VALID_STATES, type ServiceConfig, type HealthState } from './types.js';

interface StateChangeBody {
  state?: HealthState;
  latencyMs?: number;
}

export class MockService {
  private server: Server;
  private current: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.current = { ...config };
    this.server = createServer((req, res) => this.handle(req, res));
  }

  get name(): string {
    return this.current.name;
  }

  get port(): number {
    return this.current.port;
  }

  get state(): ServiceConfig {
    return { ...this.current };
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error): void => {
        this.server.removeListener('error', onError);
        reject(err);
      };
      this.server.once('error', onError);
      this.server.listen(this.current.port, () => {
        this.server.removeListener('error', onError);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  setState(state: HealthState, latencyMs?: number): void {
    this.current.state = state;
    if (latencyMs !== undefined) this.current.latencyMs = latencyMs;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/health') {
      const result = buildHealthResponse(this.current);
      if (result.delayMs > 0) await sleep(result.delayMs);
      sendJson(res, result.status, result.body);
      return;
    }

    if (method === 'POST' && url === '/admin/state') {
      try {
        const body = await readJson<StateChangeBody>(req);
        if (!body.state || !VALID_STATES.includes(body.state)) {
          sendJson(res, 400, { error: 'invalid state', validStates: VALID_STATES });
          return;
        }
        if (body.latencyMs !== undefined && typeof body.latencyMs !== 'number') {
          sendJson(res, 400, { error: 'latencyMs must be a number' });
          return;
        }
        this.setState(body.state, body.latencyMs);
        sendJson(res, 200, { ok: true, state: this.current });
      } catch {
        sendJson(res, 400, { error: 'invalid JSON body' });
      }
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  }
}
