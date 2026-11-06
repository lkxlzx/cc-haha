// desktop/src/lib/providerKeyPool.ts

import type {
  ProviderApiKeyEntry,
  ProviderKeyPool,
  ProviderKeyPoolMode,
} from '../types/provider'

/**
 * Header names a per-key header must never override. Authentication is chosen by
 * the key itself and the transport headers are owned by the proxy; letting a
 * saved header win there would silently break the request.
 */
const RESERVED_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'host',
  'content-length',
  'content-type',
  'connection',
  'transfer-encoding',
  'upgrade',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
])

const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

export function isValidHeaderName(name: string): boolean {
  return HEADER_NAME_RE.test(name)
}

export function isReservedHeaderName(name: string): boolean {
  const lowerName = name.toLowerCase()
  return RESERVED_HEADER_NAMES.has(lowerName) || lowerName.startsWith('proxy-') || lowerName.startsWith('sec-')
}

export const PROVIDER_KEY_POOL_MODES: readonly ProviderKeyPoolMode[] = [
  'session_sticky',
  'round_robin',
  'failover',
]

export function createEmptyProviderKeyPool(): ProviderKeyPool {
  return { mode: 'session_sticky', keys: [] }
}

/** Coerces a saved pool into the shape the editor can render. */
export function normalizeKeyPoolDraft(value: ProviderKeyPool | null | undefined): ProviderKeyPool {
  const keys = Array.isArray(value?.keys) ? value.keys : []
  return {
    mode: PROVIDER_KEY_POOL_MODES.includes(value?.mode as ProviderKeyPoolMode)
      ? value!.mode
      : 'session_sticky',
    keys: keys.map((key) => ({
      id: key.id || crypto.randomUUID(),
      label: key.label ?? '',
      apiKey: key.apiKey ?? '',
      enabled: key.enabled !== false,
      weight: normalizeWeight(key.weight),
      ...(key.proxy ? { proxy: { ...key.proxy } } : {}),
      ...(key.headers && Object.keys(key.headers).length > 0 ? { headers: { ...key.headers } } : {}),
    })),
  }
}

export function createProviderApiKeyEntry(): ProviderApiKeyEntry {
  return {
    id: crypto.randomUUID(),
    label: '',
    apiKey: '',
    enabled: true,
    weight: 1,
  }
}

function normalizeWeight(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(100, Math.max(1, Math.round(value)))
}

export type ParsedKeyHeaders = {
  headers: Record<string, string>
  errors: string[]
}

/**
 * Header editor syntax: one `Name: value` per line. Blank lines and `#`
 * comments are ignored so pasted blocks keep their shape.
 */
export function parseKeyHeaders(text: string): ParsedKeyHeaders {
  const headers: Record<string, string> = {}
  const errors: string[] = []
  const seen = new Set<string>()

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separator = line.indexOf(':')
    if (separator <= 0) {
      errors.push(`invalid: ${line}`)
      continue
    }

    const name = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (!isValidHeaderName(name)) {
      errors.push(`invalid: ${name}`)
      continue
    }

    const lowerName = name.toLowerCase()
    if (isReservedHeaderName(name)) {
      errors.push(`reserved: ${name}`)
      continue
    }

    if (seen.has(lowerName)) {
      errors.push(`duplicate: ${name}`)
      continue
    }

    seen.add(lowerName)
    headers[name] = value
  }

  return { headers, errors }
}

export function formatKeyHeaders(headers: Record<string, string> | undefined): string {
  if (!headers) return ''
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n')
}

/** Serializable pool for the provider payload; empty/incomplete keys are dropped. */
export function toStoredKeyPool(pool: ProviderKeyPool): ProviderKeyPool | undefined {
  const keys = pool.keys
    .filter((key) => key.apiKey.trim())
    .map((key) => ({
      id: key.id,
      ...(key.label?.trim() ? { label: key.label.trim() } : {}),
      apiKey: key.apiKey.trim(),
      enabled: key.enabled !== false,
      weight: normalizeWeight(key.weight),
      ...(key.proxy?.mode === 'manual' && key.proxy.url?.trim()
        ? { proxy: { mode: 'manual' as const, url: key.proxy.url.trim() } }
        : key.proxy && key.proxy.mode !== 'manual'
          ? { proxy: { mode: key.proxy.mode } }
          : {}),
      ...(key.headers && Object.keys(key.headers).length > 0 ? { headers: { ...key.headers } } : {}),
    }))

  return keys.length > 0 ? { mode: pool.mode, keys } : undefined
}