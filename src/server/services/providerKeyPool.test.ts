import { describe, expect, test } from 'bun:test'
import { ProviderKeyPool } from './providerKeyPool.js'
import type { ProviderApiKey } from '../types/provider.js'

function keys(...weights: number[]): ProviderApiKey[] {
  return weights.map((weight, index) => ({
    id: `key-${index + 1}`,
    apiKey: `secret-${index + 1}`,
    enabled: true,
    weight,
  }))
}

describe('ProviderKeyPool', () => {
  test('round-robins across enabled keys', () => {
    const pool = new ProviderKeyPool()
    const candidates = keys(1, 1, 1)

    const selected = Array.from({ length: 6 }, () =>
      pool.select('provider-a', candidates, 'round_robin', new Set(), 0)?.key.id,
    )

    expect(selected).toEqual([
      'key-1',
      'key-2',
      'key-3',
      'key-1',
      'key-2',
      'key-3',
    ])
  })

  test('uses smooth weighted round-robin distribution', () => {
    const pool = new ProviderKeyPool()
    const candidates = keys(1, 3)

    const counts = new Map<string, number>()
    for (let index = 0; index < 8; index += 1) {
      const id = pool.select(
        'provider-a',
        candidates,
        'weighted_round_robin',
        new Set(),
        0,
      )?.key.id
      counts.set(id!, (counts.get(id!) ?? 0) + 1)
    }

    expect(counts.get('key-1')).toBe(2)
    expect(counts.get('key-2')).toBe(6)
  })

  test('fails over and cools down a failed key', () => {
    const pool = new ProviderKeyPool()
    const candidates = keys(1, 1)

    expect(pool.select('provider-a', candidates, 'failover', new Set(), 0)?.key.id)
      .toBe('key-1')
    pool.report('provider-a', 'key-1', 'auth', { now: 0 })
    expect(pool.select('provider-a', candidates, 'failover', new Set(), 1)?.key.id)
      .toBe('key-2')
    expect(pool.select('provider-a', candidates, 'failover', new Set(), 5 * 60_000 + 1)?.key.id)
      .toBe('key-1')
  })

  test('never selects an excluded key within one logical request', () => {
    const pool = new ProviderKeyPool()
    const candidates = keys(1, 1)

    expect(
      pool.select(
        'provider-a',
        candidates,
        'round_robin',
        new Set(['key-1']),
        0,
      )?.key.id,
    ).toBe('key-2')
    expect(
      pool.select(
        'provider-a',
        candidates,
        'round_robin',
        new Set(['key-1', 'key-2']),
        0,
      ),
    ).toBeNull()
  })
})
