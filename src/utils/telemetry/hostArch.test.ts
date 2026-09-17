import { describe, expect, test } from 'bun:test'
import { normalizeHostArch } from './hostArch.js'

describe('normalizeHostArch', () => {
  test('maps Node architecture names to OpenTelemetry host.arch values', () => {
    expect(normalizeHostArch('x64')).toBe('amd64')
    expect(normalizeHostArch('arm')).toBe('arm32')
    expect(normalizeHostArch('ppc')).toBe('ppc32')
  })

  test('preserves architectures that already match the specification', () => {
    expect(normalizeHostArch('arm64')).toBe('arm64')
    expect(normalizeHostArch('ia32')).toBe('ia32')
  })
})
