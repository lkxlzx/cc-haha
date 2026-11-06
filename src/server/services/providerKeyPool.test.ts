import { beforeEach, describe, expect, it } from 'vitest'

import {
  markProviderKeyFailure,
  resetProviderKeyPoolState,
  resolveProviderKeyPool,
  selectProviderKey,
} from './providerKeyPool.js'

const provider = {
  apiKeyConfig: undefined,
  keyPool: {
    mode: 'session_sticky' as const,
    keys: [
      { id: 'a', apiKey: 'sk-a', enabled: true, weight: 1, label: 'A' },
      { id: 'b', apiKey: 'sk-b', enabled: true, weight: 1, label: 'B' },
    ],
  },
}

beforeEach(() => {
  resetProviderKeyPoolState()
})

describe('resolveProviderKeyPool', () => {
  it('prefers configured pool keys over the legacy key', () => {
    const pool = resolveProviderKeyPool(provider, 'sk-legacy')
    expect(pool.managed).toBe(true)
    expect(pool.mode).toBe('session_sticky')
    expect(pool.keys.map((key) => key.apiKey)).toEqual(['sk-a', 'sk-b'])
  })

  it('maps the legacy key plus its proxy/headers into one key', () => {
    const pool = resolveProviderKeyPool({
      apiKeyConfig: {
        name: 'Main',
        weight: 3,
        proxy: { mode: 'manual', url: 'http://proxy.example:7890' },
        headers: { 'X-Trace': '1' },
      },
    }, 'sk-legacy')
    expect(pool.keys).toHaveLength(1)
    expect(pool.keys[0]).toMatchObject({
      id: 'legacy',
      apiKey: 'sk-legacy',
      weight: 3,
      proxy: { mode: 'manual', url: 'http://proxy.example:7890' },
      headers: { 'X-Trace': '1' },
    })
    expect(pool.managed).toBe(true)
  })

  it('returns no keys when the legacy key is disabled', () => {
    const pool = resolveProviderKeyPool({ apiKeyConfig: { enabled: false } }, 'sk-legacy')
    expect(pool.keys).toEqual([])
  })
})

describe('selectProviderKey', () => {
  it('keeps a session on the same key', () => {
    const pool = resolveProviderKeyPool(provider, '')
    const first = selectProviderKey(pool, { providerId: 'p', sessionId: 'session-1' })
    for (let i = 0; i < 20; i++) {
      expect(selectProviderKey(pool, { providerId: 'p', sessionId: 'session-1' })?.id).toBe(first?.id)
    }
  })

  it('uses the same deterministic mapping after state reset', () => {
    const pool = resolveProviderKeyPool(provider, '')
    const first = selectProviderKey(pool, { providerId: 'p', sessionId: 'stable-session' })?.id
    resetProviderKeyPoolState()
    expect(selectProviderKey(pool, { providerId: 'p', sessionId: 'stable-session' })?.id).toBe(first)
  })

  it('rotates in round-robin mode', () => {
    const pool = { ...resolveProviderKeyPool(provider, ''), mode: 'round_robin' as const }
    const ids = Array.from({ length: 6 }, () => selectProviderKey(pool, { providerId: 'p' })?.id)
    expect(ids).toEqual(['a', 'b', 'a', 'b', 'a', 'b'])
  })

  it('uses failover order and skips a cooling key', () => {
    const pool = { ...resolveProviderKeyPool(provider, ''), mode: 'failover' as const }
    expect(selectProviderKey(pool, { providerId: 'p' })?.id).toBe('a')
    markProviderKeyFailure('p', 'a', 401)
    expect(selectProviderKey(pool, { providerId: 'p' })?.id).toBe('b')
  })

  it('falls back to a cooling key when every key is cooling', () => {
    const pool = { ...resolveProviderKeyPool(provider, ''), mode: 'failover' as const }
    markProviderKeyFailure('p', 'a', 401)
    markProviderKeyFailure('p', 'b', 401)
    expect(selectProviderKey(pool, { providerId: 'p' })?.id).toBe('a')
  })
})