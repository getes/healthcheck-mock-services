import { createServer, type Server } from 'node:http';
import type { ServiceManager } from './serviceManager.js';
import { readJson, sendJson } from './http-utils.js';
import { VALID_STATES, type ServiceConfig, type HealthState } from './types.js';

interface ReconfigureBody {
  services?: ServiceConfig[];
}

interface StateChangeBody {
  state?: HealthState;
  latencyMs?: number;
}

const SERVICE_STATE_PATH = /^\/admin\/services\/([^/]+)\/state$/;

export function startControlServer(port: number, manager: ServiceManager): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && url === '/admin/services') {
        sendJson(res, 200, { services: manager.list() });
        return;
      }

      if (method === 'POST' && url === '/admin/reconfigure') {
        const body = await readJson<ReconfigureBody>(req);
        const validation = validateServices(body.services);
        if (!validation.ok) {
          sendJson(res, 400, { error: validation.error });
          return;
        }
        await manager.reconfigure(validation.services);
        sendJson(res, 200, { ok: true, services: manager.list() });
        return;
      }

      const stateMatch = method === 'POST' ? SERVICE_STATE_PATH.exec(url) : null;
      if (stateMatch) {
        const name = decodeURIComponent(stateMatch[1] ?? '');
        const svc = manager.getService(name);
        if (!svc) {
          sendJson(res, 404, { error: `service "${name}" not found` });
          return;
        }
        const body = await readJson<StateChangeBody>(req);
        if (!body.state || !VALID_STATES.includes(body.state)) {
          sendJson(res, 400, { error: 'invalid state', validStates: VALID_STATES });
          return;
        }
        if (body.latencyMs !== undefined && typeof body.latencyMs !== 'number') {
          sendJson(res, 400, { error: 'latencyMs must be a number' });
          return;
        }
        svc.setState(body.state, body.latencyMs);
        sendJson(res, 200, { ok: true, state: svc.state });
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (err) {
      sendJson(res, 400, { error: 'invalid request', detail: (err as Error).message });
    }
  });

  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.removeListener('error', onError);
      reject(err);
    };
    server.once('error', onError);
    server.listen(port, () => {
      server.removeListener('error', onError);
      console.log(`[control] up on :${port}`);
      resolve(server);
    });
  });
}

type Validation =
  | { ok: true; services: ServiceConfig[] }
  | { ok: false; error: string };

function validateServices(services: ServiceConfig[] | undefined): Validation {
  if (!Array.isArray(services) || services.length === 0) {
    return { ok: false, error: 'services must be a non-empty array' };
  }
  const names = new Set<string>();
  const ports = new Set<number>();
  for (const s of services) {
    if (!s.name || typeof s.name !== 'string') {
      return { ok: false, error: 'service.name required' };
    }
    if (typeof s.port !== 'number') {
      return { ok: false, error: `service.port required (${s.name})` };
    }
    if (!VALID_STATES.includes(s.state)) {
      return { ok: false, error: `invalid state for ${s.name}: ${s.state}` };
    }
    if (s.latencyMs !== undefined && typeof s.latencyMs !== 'number') {
      return { ok: false, error: `latencyMs must be a number (${s.name})` };
    }
    if (names.has(s.name)) return { ok: false, error: `duplicate name: ${s.name}` };
    if (ports.has(s.port)) return { ok: false, error: `duplicate port: ${s.port}` };
    names.add(s.name);
    ports.add(s.port);
  }
  return { ok: true, services };
}
