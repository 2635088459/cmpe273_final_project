import { Injectable } from '@nestjs/common';
import { RedisCircuitStore } from './redis-circuit-store.service';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitSnapshot {
  service_name: string;
  state: CircuitState;
  failure_count: number;
  open_until?: number;
}

@Injectable()
export class CircuitBreakerService {
  private readonly services = ['cache_cleanup'];

  constructor(private store: RedisCircuitStore) {}

  async getCircuitStates(): Promise<CircuitSnapshot[]> {
    return Promise.all(
      this.services.map(async (serviceName) => {
        const storedState = ((await this.store.get(`circuit:${serviceName}:state`)) || 'CLOSED') as CircuitState;
        const openUntil = Number((await this.store.get(`circuit:${serviceName}:open_until`)) || 0);
        const state = storedState === 'OPEN' && (openUntil === 0 || Date.now() >= openUntil)
          ? 'HALF_OPEN'
          : storedState;

        return {
          service_name: serviceName,
          state,
          failure_count: Number((await this.store.get(`circuit:${serviceName}:failure_count`)) || 0),
          ...(openUntil ? { open_until: openUntil } : {})
        };
      })
    );
  }
}
