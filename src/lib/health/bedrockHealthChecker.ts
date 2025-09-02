/**
 * Bedrock Service Health Checker with Circuit Breaker Pattern
 * Implements TP-029 Task 2.3: Circuit breaker pattern for repeated service failures
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeoutMs: number;
  recoveryTimeMs: number;
  name: string;
}

export class BedrockCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptRecovery()) {
        this.state = CircuitState.HALF_OPEN;
        console.log(`[CircuitBreaker:${this.config.name}] Attempting recovery - state: HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker is OPEN. Service unavailable for ${this.config.name}`);
      }
    }

    try {
      const result = await Promise.race([
        operation(),
        this.createTimeoutPromise()
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptRecovery(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeMs;
  }

  private createTimeoutPromise<T>(): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timeout after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);
    });
  }

  private onSuccess(): void {
    console.log(`[CircuitBreaker:${this.config.name}] Operation successful - resetting failure count`);
    this.failures = 0;
    this.lastSuccessTime = Date.now();
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    console.log(`[CircuitBreaker:${this.config.name}] Failure ${this.failures}/${this.config.failureThreshold}`);

    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.log(`[CircuitBreaker:${this.config.name}] Circuit breaker OPEN - service calls blocked`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      isHealthy: this.state === CircuitState.CLOSED
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.lastFailureTime = 0;
    console.log(`[CircuitBreaker:${this.config.name}] Circuit breaker reset to CLOSED state`);
  }
}

/**
 * Pre-configured circuit breaker for Bedrock service health checks
 */
export const bedrockCircuitBreaker = new BedrockCircuitBreaker({
  failureThreshold: 3,
  timeoutMs: 10000, // 10 seconds
  recoveryTimeMs: 30000, // 30 seconds
  name: 'BedrockService'
});