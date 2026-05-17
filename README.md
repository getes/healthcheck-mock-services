# mock-services

Servicios HTTP mock multipuerto con healthchecks configurables. Útil para simular una infraestructura corporativa (varios servicios cada uno con su `/health`) donde puedes provocar fallos individuales — caídas, lentitud, BD caída, errores 500 — para demos, pruebas E2E o entrenar dashboards de observabilidad.

## Arrancar

```bash
npm install
npm start
```

Carga `services.config.json` y levanta:
- Un servidor HTTP por cada servicio mock en su puerto.
- Un **control plane** en `controlPort` (4000 por defecto) con endpoints administrativos.

Para arrancar con otro fichero de config:

```bash
npm start -- ruta/a/otro.json
```

## Configuración (`services.config.json`)

```json
{
  "controlPort": 4000,
  "services": [
    { "name": "users", "port": 4001, "state": "healthy" },
    { "name": "orders", "port": 4002, "state": "db-slow", "latencyMs": 1500 }
  ]
}
```

## Estados disponibles

| Estado      | HTTP | Descripción                                    |
|-------------|------|------------------------------------------------|
| `healthy`   | 200  | Todo OK                                        |
| `degraded`  | 200  | Funciona, pero algún check en warning (cache)  |
| `unhealthy` | 503  | Servicio caído                                 |
| `slow`      | 200  | OK con latencia (`latencyMs`, default 3000ms)  |
| `db-down`   | 503  | Dependencia BD caída                           |
| `db-slow`   | 200  | Degraded + latencia (default 1500ms)           |
| `error`     | 500  | Error genérico interno                         |

## Endpoints

### En cada servicio mock (puerto del config)

**`GET /health`** — healthcheck según el estado actual.

**`POST /admin/state`** — cambia el estado de *este servicio* en runtime.

```bash
curl -X POST http://localhost:4001/admin/state \
  -H "Content-Type: application/json" \
  -d '{"state":"db-down"}'
```

```bash
curl -X POST http://localhost:4002/admin/state \
  -H "Content-Type: application/json" \
  -d '{"state":"slow","latencyMs":5000}'
```

### En el control plane (`controlPort`, 4000 por defecto)

**`GET /admin/services`** — lista todos los servicios y sus estados.

**`POST /admin/services/:name/state`** — cambia el estado de un servicio por nombre (alternativa a apuntar a su puerto).

```bash
curl -X POST http://localhost:4000/admin/services/users/state \
  -H "Content-Type: application/json" \
  -d '{"state":"unhealthy"}'
```

**`POST /admin/reconfigure`** — recibe un JSON con la topología completa, **para todos los servicios actuales, sobreescribe `services.config.json` y arranca con la nueva configuración**.

```bash
curl -X POST http://localhost:4000/admin/reconfigure \
  -H "Content-Type: application/json" \
  -d '{
    "services": [
      { "name": "auth",    "port": 5001, "state": "healthy" },
      { "name": "billing", "port": 5002, "state": "error" },
      { "name": "search",  "port": 5003, "state": "db-slow", "latencyMs": 2000 }
    ]
  }'
```

## Persistencia

- Los cambios via `/admin/state` y `/admin/services/:name/state` son **efímeros** (en memoria).
- Solo `/admin/reconfigure` escribe a disco (sobreescribe `services.config.json`).

Esto es deliberado: cambios runtime para tests/demos, reconfigure para topología persistente.

## Apagado

`Ctrl+C` (SIGINT) cierra todos los servicios limpiamente.
