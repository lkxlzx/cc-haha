import { describe, expect, it } from 'vitest'

import {
  createEmptyProviderKeyPool,
  createProviderApiKeyEntry,
  formatKeyHeaders,
  normalizeKeyPoolDraft,
  parseKeyHeaders,
  toStoredKeyPool,
} from './providerKeyPool'

describe('key pool helpers', () => {
  it('creates an empty sticky pool', () => {
    expect(createEmptyProviderKeyPool()).toEqual({ mode: 'session_sticky', keys: [] })
  })

  it('normalizes missing weights and enabled flags', () => {
    const pool = normalizeKeyPoolDraft({
      mode: 'round_robin',
      keys: [{ id: 'k1', apiKey: 'sk-a', enabled: undefined as unknown as boolean, weight: 999 }],
    })
    expect(pool.mode).toBe('round_robin')
    expect(pool.keys[0]).toMatchObject({ id: 'k1', apiKey: 'sk-a', enabled: true, weight: 100 })
  })

  it('falls back to sticky for an unknown saved mode', () => {
    expect(normalizeKeyPoolDraft({ mode: 'wat' as never, keys: [] }).mode).toBe('session_sticky')
  })

  it('parses simple headers and ignores comments and blanks', () => {
    const parsed = parseKeyHeaders('# comment\n\nX-Trace: abc\nX-Team: red\n')
    expect(parsed.errors).toEqual([])
    expect(parsed.headers).toEqual({ 'X-Trace': 'abc', 'X-Team': 'red' })
  })

  it('rejects reserved, duplicate, and malformed header names', () => {
    const parsed = parseKeyHeaders('Authorization: secret\nx-api-key: secret\nX-A: 1\nx-a: 2\nnocolon\nbad name: v')
    expect(parsed.errors).toEqual([
      'reserved: Authorization',
      'reserved: x-api-key',
      'duplicate: x-a',
      'invalid: nocolon',
      'invalid: bad name',
    ])
    expect(parsed.headers).toEqual({ 'X-A': '1' })
  })

  it('formats headers back into the editor syntax', () => {
    expect(formatKeyHeaders({ 'X-A': '1', 'X-B': 'two words' })).toBe('X-A: 1\nX-B: two words')
    expect(formatKeyHeaders(undefined)).toBe('')
  })

  it('drops empty keys and trims saved values', () => {
    const stored = toStoredKeyPool({
      mode: 'session_sticky',
      keys: [
        { ...createProviderApiKeyEntry(), id: 'full', label: ' Primary ', apiKey: ' sk-a ', weight: 0 },
        { ...createProviderApiKeyEntry(), id: 'empty', apiKey: '   ' },
      ],
    })
    expect(stored).toEqual({
      mode: 'session_sticky',
      keys: [{
        id: 'full',
        label: 'Primary',
        apiKey: 'sk-a',
        enabled: true,
        weight: 1,
      }],
    })
  })

  it('omits the pool when no key carries a secret', () => {
    expect(toStoredKeyPool({ mode: 'failover', keys: [createProviderApiKeyEntry()] })).toBeUndefined()
  })
})