/**
 * Provider key pools — deterministic key selection with session affinity.
 *
 * Selection happens in the local proxy, after the CLI has attached its
 * per-session id header. Keys never leave the server; the renderer only sees
 * masked previews.
 */

import type {
  ProviderKeyPool,
  ProviderProxyConfig,
  SavedProvider,
} from '../types/provider.js'

export type ProviderKeyPoolMode = ProviderKeyPool['mode']

export type ResolvedProviderKey = {
  id: string
  label?: string
  apiKey: string
  enabled: boolean
  weight: number
  proxy?: ProviderProxyConfig
  headers?: Record<string, string>
  source: 'pool' | 'legacy'
}

export type ResolvedProviderKeyPool = {
  mode: ProviderKeyPoolMode
  keys: ResolvedProviderKey[]
  /** True when more than one key or key-level routing is configured. */
  managed: boolean
}

type CooldownEntry = {
  until: number
  reason: string
}

const cooldowns = new Map<string, Map<string, CooldownEntry>>()
const roundRobinCursors = new Map<string, number>()

const AUTH_FAILURE_MS = 10 * 60_000
const RATE_LIMIT_MS = 60_000
const NETWORK_FAILURE_MS = 30_000
const SERVER_FAILURE_MS = 10_000

export function resolveProviderKeyPool(
  provider: Pick<SavedProvider, 'apiKeyConfig' | 'keyPool'>,
  legacyApiKey: string,
): ResolvedProviderKeyPool {
  const pool = provider.keyPool
  const poolKeys = (pool?.keys ?? []).map((key): ResolvedProviderKey => ({
    id: key.id,
    ...(key.label !== undefined && { label: key.label }),
    apiKey: key.apiKey,
    enabled: key.enabled !== false,
    weight: key.weight ?? 1,
    ...(key.proxy !== undefined && { proxy: key.proxy }),
    ...(key.headers !== undefined && { headers: key.headers }),
    source: 'pool',
  }))

  const hasEnabledPoolKey = poolKeys.some((key) => key.enabled && key.apiKey.trim() !== '')
  const config = provider.apiKeyConfig
  const hasLegacyKey = config?.enabled !== false && legacyApiKey.trim() !== ''

  if (poolKeys.length > 0 && (hasEnabledPoolKey || !hasLegacyKey)) {
    return {
      mode: pool?.mode ?? 'session_sticky',
      keys: poolKeys,
      managed: true,
    }
  }

  if (!hasLegacyKey) {
    return { mode: 'failover', keys: [], managed: config !== undefined || poolKeys.length > 0 }
  }

  return {
    mode: 'failover',
    keys: [{
      id: 'legacy',
      ...(config?.name?.trim() ? { label: config.name.trim() } : {}),
      apiKey: legacyApiKey,
      enabled: true,
      weight: config?.weight ?? 1,
      ...(config?.proxy !== undefined && { proxy: config.proxy }),
      ...(config?.headers !== undefined && { headers: config.headers }),
      source: 'legacy',
    }],
    managed: config?.proxy !== undefined
      || (config?.headers !== undefined && Object.keys(config.headers).length > 0),
  }
}

function fnv1a(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Weighted rendezvous score; larger wins. Deterministic across restarts. */
function stickyScore(sessionId: string, key: ResolvedProviderKey): number {
  const unit = (fnv1a(`${sessionId}:${key.id}`) + 0.5) / 4294967296
  return -Math.log(unit) / Math.max(1, key.weight)
}

function isCooling(providerId: string, keyId: string, now: number): boolean {
  const providerState = cooldowns.get(providerId)
  const entry = providerState?.get(keyId)
  if (!entry) return false
  if (entry.until <= now) {
    providerState!.delete(keyId)
    if (providerState!.size === 0) cooldowns.delete(providerId)
    return false
  }
  return true
}

function pickRoundRobin(providerId: string, keys: ResolvedProviderKey[], now: number): ResolvedProviderKey | null {
  const healthy = keys.filter((key) => key.enabled && !isCooling(providerId, key.id, now))
  const candidates = healthy.length > 0 ? healthy : keys.filter((key) => key.enabled)
  if (candidates.length === 0) return null

  const slots = candidates.flatMap((key) => Array.from({ length: Math.max(1, key.weight) }, () => key))
  const cursor = roundRobinCursors.get(providerId) ?? 0
  const selected = slots[cursor % slots.length]!
  roundRobinCursors.set(providerId, (cursor + 1) % slots.length)
  return selected
}

export function selectProviderKey(
  pool: ResolvedProviderKeyPool,
  options: {
    providerId: string
    sessionId?: string | null
    now?: number
  },
): ResolvedProviderKey | null {
  const now = options.now ?? Date.now()
  const enabled = pool.keys.filter((key) => key.enabled)
  if (enabled.length === 0) return null

  if (pool.mode === 'failover') {
    const ordered = enabled.filter((key) => !isCooling(options.providerId, key.id, now))
    return ordered[0] ?? enabled[0] ?? null
  }

  if (pool.mode === 'session_sticky' && options.sessionId?.trim()) {
    const healthy = enabled.filter((key) => !isCooling(options.providerId, key.id, now))
    const candidates = healthy.length > 0 ? healthy : enabled
    let selected = candidates[0]!
    let best = Number.NEGATIVE_INFINITY
    for (const key of candidates) {
      const score = stickyScore(options.sessionId.trim(), key)
      if (score > best) {
        best = score
        selected = key
      }
    }
    return selected
  }

  return pickRoundRobin(options.providerId, enabled, now)
}

export function markProviderKeyFailure(
  providerId: string,
  keyId: string,
  status: number | 'network',
  now = Date.now(),
): void {
  const ttl = status === 401 || status === 403
    ? AUTH_FAILURE_MS
    : status === 429
      ? RATE_LIMIT_MS
      : status === 'network'
        ? NETWORK_FAILURE_MS
        : SERVER_FAILURE_MS
  const providerState = cooldowns.get(providerId) ?? new Map<string, CooldownEntry>()
  providerState.set(keyId, { until: now + ttl, reason: String(status) })
  cooldowns.set(providerId, providerState)
}

export function markProviderKeySuccess(providerId: string, keyId: string): void {
  const providerState = cooldowns.get(providerId)
  if (!providerState) return
  providerState.delete(keyId)
  if (providerState.size === 0) cooldowns.delete(providerId)
}

/** Test hook; production state is intentionally in-memory. */
export function resetProviderKeyPoolState(): void {
  cooldowns.clear()
  roundRobinCursors.clear()
}

export function shouldCoolDownForStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status >= 500
}
