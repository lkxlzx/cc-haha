// src/server/services/customRequestHeaders.ts
//
// Per-API-key custom HTTP request headers. Users attach name/value pairs to a
// provider key; they are merged into every outbound upstream request made with
// that key (proxy chat, title generation, provider tests).

export type CustomRequestHeader = { name: string; value: string }

export const MAX_CUSTOM_HEADERS = 32

// RFC 9110 field-name tokens. Rejects spaces, CR/LF and other control bytes,
// which also blocks header-injection through persisted config.
export const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

// Names the transport/auth layer owns. User headers must never override them.
const PROTECTED_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'host',
  'content-type',
  'content-length',
])

export function normalizeCustomHeaders(entries: unknown): CustomRequestHeader[] {
  if (!Array.isArray(entries)) return []
  const byName = new Map<string, CustomRequestHeader>()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name || !HEADER_NAME_PATTERN.test(name)) continue
    const value = typeof record.value === 'string' ? record.value.trim() : ''
    // Case-insensitive de-dup; the last occurrence wins.
    byName.set(name.toLowerCase(), { name, value })
    if (byName.size >= MAX_CUSTOM_HEADERS) break
  }
  return [...byName.values()]
}

export function applyCustomRequestHeaders(
  base: Record<string, string>,
  custom: readonly CustomRequestHeader[] | undefined,
): Record<string, string> {
  if (!custom || custom.length === 0) return base
  const headers = { ...base }
  for (const header of custom) {
    const lower = header.name.toLowerCase()
    if (PROTECTED_HEADER_NAMES.has(lower)) continue
    headers[header.name] = header.value
  }
  return headers
}
