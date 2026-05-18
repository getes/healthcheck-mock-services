# TECHNICAL — mock-services

## Stack

- **Runtime**: Node.js 20+
- **Lenguaje**: TypeScript strict + ESM
- **Ejecución**: `tsx` (sin build step para desarrollo)
- **HTTP**: módulo nativo `node:http` — sin Express ni Fastify

Razón: el alcance del proyecto (un endpoint por servicio + un puñado de endpoints admin) no justifica añadir un framework. `node:http` mantiene cero dependencias en runtime.

## Arquitectura

Tres capas:

### 1. `MockService` (`src/mockService.ts`)
Encapsula un único servidor HTTP. Mantiene su `ServiceConfig` actual y expone:
- `GET /health` — respuesta construida por `buildHealthResponse`.
- `POST /admin/state` — actualiza el estado local en memoria.

Cada instancia es independiente y no conoce a las demás.

### 2. `ServiceManager` (`src/serviceManager.ts`)
Registro central de servicios activos (Map por nombre). Operaciones:
- `startAll` / `stopAll`
- `reconfigure` — para todo, arranca la nueva topología y persiste a disco
- `list` / `getService`

Es el único componente que escribe `services.config.json`.

### 3. Control server (`src/controlServer.ts`)
Servidor HTTP separado en `controlPort`. Endpoints administrativos globales (`/admin/services`, `/admin/services/:name/state`, `/admin/reconfigure`) y un panel HTML en `GET /` (`renderDashboard`) para demos. No conoce a los `MockService` directamente — opera a través del `ServiceManager`.

El panel es server-rendered (string HTML, sin deps ni build): fila por servicio + un botón por estado; el click hace `POST /admin/services/:name/state` con `fetch` y recarga. Reutiliza la ruta admin existente, no añade lógica nueva — solo presentación. `sendHtml` en `http-utils.ts`.

`src/index.ts` es la composición: lee config → instancia manager → arranca mocks → arranca control server → engancha SIGINT/SIGTERM para apagado limpio.

## Estados → respuesta

Mapping centralizado en `src/health.ts:buildHealthResponse`. Cada estado define `{status, delayMs, body}`.

Para añadir un estado nuevo:
1. Extender el union `HealthState` y `VALID_STATES` en `src/types.ts`.
2. Añadir su `case` en `buildHealthResponse`.

El compilador exige el `case` (exhaustive switch sin `default`).

## Persistencia

`/admin/reconfigure` es la única ruta que llama a `ServiceManager.persist`. Los cambios via `/admin/state` o `/admin/services/:name/state` son únicamente en memoria — al reiniciar se pierden. Esto es intencional.

## Validación de `reconfigure`

`controlServer.validateServices` rechaza:
- Array vacío o ausente.
- `name` o `port` ausentes / con tipo incorrecto.
- `state` fuera de `VALID_STATES`.
- `latencyMs` no numérico.
- Nombres o puertos duplicados.

**No valida** que los puertos estén libres antes del start. Si están ocupados, `MockService.start` rechaza con `EADDRINUSE` y la promesa burbujea hasta el handler del control server, que devuelve 400 con el detalle. La topología queda en estado intermedio (los servicios anteriores ya fueron parados). Endurecer esto es trabajo a futuro — preflight de puertos antes de `stopAll`.

## Notas TypeScript

- `noUncheckedIndexedAccess: true` está activado: `process.argv[2]`, `regex.exec()[N]`, `string.split()[N]` se tratan como `string | undefined` y se coercen explícitamente con `?? ''`.
- ESM + `tsx`: imports usan extensión `.js` aunque el source sea `.ts`.
- Top-level `await` en `index.ts` requiere `module: ESNext` y Node ≥14.8.

## Apagado

`SIGINT` / `SIGTERM` → `manager.stopAll()` → `process.exit(0)`. El control server queda colgado al exit del proceso (Node lo limpia). Si en el futuro hace falta drenado controlado, exponer `controlServer.close()` desde `startControlServer` y llamarlo en `shutdown`.
