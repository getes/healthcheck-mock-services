import type { ServiceConfig } from './types.js';

export interface HealthResponse {
  status: number;
  delayMs: number;
  body: Record<string, unknown>;
}

export function buildHealthResponse(service: ServiceConfig): HealthResponse {
  const { name, state, latencyMs } = service;

  switch (state) {
    case 'healthy':
      return {
        status: 200,
        delayMs: 0,
        body: {
          service: name,
          status: 'healthy',
          checks: { database: 'up', cache: 'up' },
        },
      };

    case 'degraded':
      return {
        status: 200,
        delayMs: 0,
        body: {
          service: name,
          status: 'degraded',
          checks: { database: 'up', cache: 'down' },
        },
      };

    case 'unhealthy':
      return {
        status: 503,
        delayMs: 0,
        body: {
          service: name,
          status: 'unhealthy',
          reason: 'service unavailable',
        },
      };

    case 'slow':
      return {
        status: 200,
        delayMs: latencyMs ?? 3000,
        body: {
          service: name,
          status: 'healthy',
          checks: { database: 'up' },
        },
      };

    case 'db-down':
      return {
        status: 503,
        delayMs: 0,
        body: {
          service: name,
          status: 'unhealthy',
          checks: { database: 'down', cache: 'up' },
        },
      };

    case 'db-slow':
      return {
        status: 200,
        delayMs: latencyMs ?? 1500,
        body: {
          service: name,
          status: 'degraded',
          checks: { database: 'slow', cache: 'up' },
        },
      };

    case 'error':
      return {
        status: 500,
        delayMs: 0,
        body: {
          service: name,
          status: 'error',
          reason: 'internal server error',
        },
      };
  }
}
