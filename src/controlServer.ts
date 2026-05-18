import { createServer, type Server } from 'node:http';
import type { ServiceManager } from './serviceManager.js';
import { readJson, sendJson, sendHtml } from './http-utils.js';
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
      if (method === 'GET' && (url === '/' || url === '/dashboard')) {
        sendHtml(res, 200, renderDashboard(manager.list()));
        return;
      }

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

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** Panel de control para demos: una fila por servicio + un botón por estado. */
function renderDashboard(services: ServiceConfig[]): string {
  const rows = services
    .map((s) => {
      const buttons = VALID_STATES.map((st) => {
        const active = st === s.state ? ' active' : '';
        return `<button class="b${active}" data-svc="${esc(s.name)}" data-state="${st}">${st}</button>`;
      }).join('');
      return `<tr><td class="svc">${esc(s.name)}<span class="port">:${s.port}</span></td>
        <td class="cur">${s.state}</td><td class="btns">${buttons}</td></tr>`;
    })
    .join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Mock services — control</title><style>
body{font:14px system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px}
h1{font-size:16px;font-weight:600;margin:0 0 16px}
table{border-collapse:collapse;width:100%;max-width:900px}
td{padding:10px 12px;border-bottom:1px solid #1e293b;vertical-align:middle}
.svc{font-weight:600}.port{color:#64748b;font-weight:400;font-family:ui-monospace,monospace}
.cur{color:#94a3b8;width:90px}
.btns{text-align:right;white-space:nowrap}
.b{font:12px system-ui;margin:2px;padding:5px 9px;border:1px solid #334155;border-radius:6px;
background:#1e293b;color:#cbd5e1;cursor:pointer}
.b:hover{border-color:#64748b}
.b.active{background:#2563eb;border-color:#2563eb;color:#fff}
</style></head><body>
<h1>Mock services — panel de control</h1>
<table>${rows}</table>
<script>
document.addEventListener('click',function(e){
  var b=e.target.closest('button[data-svc]');if(!b)return;
  b.disabled=true;
  fetch('/admin/services/'+encodeURIComponent(b.dataset.svc)+'/state',
    {method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({state:b.dataset.state})})
    .then(function(){location.reload()})
    .catch(function(){b.disabled=false});
});
</script></body></html>`;
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
