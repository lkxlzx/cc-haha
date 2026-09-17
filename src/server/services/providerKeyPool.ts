import type {
  ProviderApiKey,
  ProviderLoadBalancingStrategy,
} from '../types/provider.js'

export type ProviderKeyFailureKind =
  | 'success'
  | 'auth'
  | 'rate_limit'
  | 'transient'
  | 'neutral'

export type ProviderKeySelection = {
  key: ProviderApiKey
}

type ProviderKeyHealth = {
  consecutiveFailures: number
  coolingUntil: number
}

type ProviderKeyPoolState = {
  cursor: number
  weightedCurrent: Map<string, number>
  health: Map<string, ProviderKeyHealth>
}

const AUTH_COOLDOWN_MS = 5 * 60_000
const RATE_LIMIT_COOLDOWN_MS = 60_000
const TRANSIENT_COOLDOWN_MS = 30_000

function shouldUseKey(key: ProviderApiKey): boolean {
  return key.enabled
}

export function classifyProviderKeyFailure(status: number): ProviderKeyFailureKind {
  if (status >= 200 && status < 300) return 'success'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (
    status === 408 ||
    status === 425 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status === 529
  ) {
    return 'transient'
  }
  return 'neutral'
}

export function isRetryableProviderKeyFailure(
  kind: ProviderKeyFailureKind,
): boolean {
  return kind === 'auth' || kind === 'rate_limit' || kind === 'transient'
}

export function providerRetryAfterMs(
  headers: Headers,
  now = Date.now(),
): number | undefined {
  const value = headers.get('retry-after')?.trim()
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

export class ProviderKeyPool {
  private states = new Map<string, ProviderKeyPoolState>()

  private getState(providerId: string): ProviderKeyPoolState {
    let state = this.states.get(providerId)
    if (!state) {
      state = {
        cursor: 0,
        weightedCurrent: new Map(),
        health: new Map(),
      }
      this.states.set(providerId, state)
    }
    return state
  }

  private getHealth(
    state: ProviderKeyPoolState,
    keyId: string,
    now: number,
  ): ProviderKeyHealth {
    const current = state.health.get(keyId)
    if (!current) return { consecutiveFailures: 0, coolingUntil: 0 }
    if (current.coolingUntil > 0 && current.coolingUntil <= now) {
      return {
        consecutiveFailures: current.consecutiveFailures,
        coolingUntil: 0,
      }
    }
    return current
  }

  select(
    providerId: string,
    keys: ProviderApiKey[],
    strategy: ProviderLoadBalancingStrategy = 'round_robin',
    excludeIds: ReadonlySet<string> = new Set(),
    now = Date.now(),
  ): ProviderKeySelection | null {
    const enabled = keys.filter(shouldUseKey)
    if (enabled.length === 0) return null

    const state = this.getState(providerId)
    const available = enabled.filter((key) => !excludeIds.has(key.id))
    if (available.length === 0) return null

    const healthy = available.filter(
      (key) => this.getHealth(state, key.id, now).coolingUntil === 0,
    )
    const candidates = healthy.length > 0
      ? healthy
      : [...available].sort((left, right) => {
          const leftUntil = this.getHealth(state, left.id, now).coolingUntil
          const rightUntil = this.getHealth(state, right.id, now).coolingUntil
          return leftUntil - rightUntil
        })

    if (strategy === 'failover') {
      return { key: candidates[0]! }
    }

    if (strategy === 'weighted_round_robin') {
      let selected = candidates[0]!
      let selectedCurrent = Number.NEGATIVE_INFINITY
      let totalWeight = 0
      const activeIds = new Set(candidates.map((key) => key.id))
      for (const key of candidates) {
        const weight = Math.max(1, key.weight)
        totalWeight += weight
        const current = (state.weightedCurrent.get(key.id) ?? 0) + weight
        state.weightedCurrent.set(key.id, current)
        if (current > selectedCurrent) {
          selected = key
          selectedCurrent = current
        }
      }
      state.weightedCurrent.set(
        selected.id,
        (state.weightedCurrent.get(selected.id) ?? 0) - totalWeight,
      )
      for (const keyId of state.weightedCurrent.keys()) {
        if (!activeIds.has(keyId)) state.weightedCurrent.delete(keyId)
      }
      return { key: selected }
    }

    const selected = candidates[state.cursor % candidates.length]!
    state.cursor = (state.cursor + 1) % Math.max(1, candidates.length)
    return { key: selected }
  }

  report(
    providerId: string,
    keyId: string,
    kind: ProviderKeyFailureKind,
    options?: { retryAfterMs?: number; now?: number },
  ): void {
    const state = this.getState(providerId)
    const now = options?.now ?? Date.now()
    const health = this.getHealth(state, keyId, now)

    if (kind === 'success') {
      state.health.set(keyId, {
        consecutiveFailures: 0,
        coolingUntil: 0,
      })
      return
    }
    if (kind === 'neutral') return

    const consecutiveFailures = health.consecutiveFailures + 1
    const cooldownMs =
      kind === 'auth'
        ? AUTH_COOLDOWN_MS
        : kind === 'rate_limit'
          ? Math.max(1_000, options?.retryAfterMs ?? RATE_LIMIT_COOLDOWN_MS)
          : Math.min(TRANSIENT_COOLDOWN_MS * consecutiveFailures, 5 * 60_000)

    state.health.set(keyId, {
      consecutiveFailures,
      coolingUntil: now + cooldownMs,
    })
  }

  invalidate(providerId: string): void {
    this.states.delete(providerId)
  }

  reset(): void {
    this.states.clear()
  }
}

export const providerKeyPool = new ProviderKeyPool()
