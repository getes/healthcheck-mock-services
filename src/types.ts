export type HealthState =
  | 'healthy'
  | 'degraded'
  | 'unhealthy'
  | 'slow'
  | 'db-down'
  | 'db-slow'
  | 'error';

export const VALID_STATES: readonly HealthState[] = [
  'healthy',
  'degraded',
  'unhealthy',
  'slow',
  'db-down',
  'db-slow',
  'error',
];

export interface ServiceConfig {
  name: string;
  port: number;
  state: HealthState;
  latencyMs?: number;
}

export interface AppConfig {
  controlPort: number;
  services: ServiceConfig[];
}
