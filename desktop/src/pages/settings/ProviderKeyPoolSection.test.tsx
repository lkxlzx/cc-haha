import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStore } from '../../stores/settingsStore'
import type { ProviderKeyPool, ProviderTestResult } from '../../types/provider'
import { ProviderKeyPoolSection } from './ProviderKeyPoolSection'

function Harness({
  initial,
  onChange,
  canTest = false,
  onTestKey,
}: {
  initial: ProviderKeyPool
  onChange?: (next: ProviderKeyPool) => void
  canTest?: boolean
  onTestKey?: (key: ProviderKeyPool['keys'][number]) => Promise<ProviderTestResult | null>
}) {
  const [value, setValue] = useState(initial)
  return (
    <ProviderKeyPoolSection
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
      canTest={canTest}
      onTestKey={onTestKey}
    />
  )
}

const oneKeyPool = (): ProviderKeyPool => ({
  mode: 'session_sticky',
  keys: [{ id: 'key-1', label: 'Primary', apiKey: 'sk-a', enabled: true, weight: 1 }],
})

beforeEach(() => {
  useSettingsStore.setState({ locale: 'en' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ProviderKeyPoolSection', () => {
  it('adds an empty key from the empty state', () => {
    const onChange = vi.fn()
    render(<Harness initial={{ mode: 'session_sticky', keys: [] }} onChange={onChange} />)

    expect(screen.getByText('No pool keys yet. Requests use the single API Key above until you add keys.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'session_sticky',
      keys: [expect.objectContaining({ apiKey: '', enabled: true, weight: 1 })],
    }))
  })

  it('changes the balancing mode', () => {
    const onChange = vi.fn()
    render(<Harness initial={oneKeyPool()} onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Round robin' }))

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'round_robin' }))
  })

  it('lays each key out as secret, proxy, expand, enable, test, remove', () => {
    render(<Harness initial={oneKeyPool()} />)

    expect(screen.getByLabelText('API key for Primary')).toBeInTheDocument()
    expect(screen.getByLabelText('Key proxy for Primary')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show headers for Primary' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Enable Primary' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Test' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Primary' })).toBeInTheDocument()
  })

  it('edits the key secret', () => {
    const onChange = vi.fn()
    render(<Harness initial={oneKeyPool()} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('API key for Primary'), { target: { value: 'sk-b' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keys: [expect.objectContaining({ apiKey: 'sk-b' })],
    }))
  })

  it('stores a per-key proxy from the inline input and documents its priority', () => {
    const onChange = vi.fn()
    render(<Harness initial={oneKeyPool()} onChange={onChange} />)

    expect(screen.getByText('A proxy entered here takes priority over Settings → General.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Key proxy for Primary'), { target: { value: 'http://proxy.example:7890' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keys: [expect.objectContaining({ proxy: { mode: 'manual', url: 'http://proxy.example:7890' } })],
    }))
  })

  it('shows the key name and weight in the main row', () => {
    const onChange = vi.fn()
    render(<Harness initial={oneKeyPool()} onChange={onChange} />)

    expect(screen.getByLabelText('Key name')).toBeInTheDocument()
    expect(screen.getByLabelText('Weight')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Backup' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keys: [expect.objectContaining({ label: 'Backup' })],
    }))

    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '7' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keys: [expect.objectContaining({ weight: 7 })],
    }))
  })

  it('adds request headers as name/value rows', () => {
    const onChange = vi.fn()
    render(<Harness initial={oneKeyPool()} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show headers for Primary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    fireEvent.change(screen.getByLabelText('Header name 1'), { target: { value: 'X-Trace' } })
    fireEvent.change(screen.getByLabelText('Header value 1'), { target: { value: 'abc' } })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      keys: [expect.objectContaining({ headers: { 'X-Trace': 'abc' } })],
    }))
  })

  it('rejects reserved header names', () => {
    const onChange = vi.fn()
    render(<Harness initial={oneKeyPool()} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show headers for Primary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    fireEvent.change(screen.getByLabelText('Header name 1'), { target: { value: 'Authorization' } })

    expect(screen.getByRole('alert')).toHaveTextContent('Fix reserved, duplicate, or malformed headers before saving.')
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({
      keys: [expect.objectContaining({ headers: { Authorization: expect.anything() } })],
    }))
  })

  it('runs the per-key test and renders the result', async () => {
    const onTestKey = vi.fn().mockResolvedValue({
      connectivity: { success: true, latencyMs: 12 },
    } satisfies ProviderTestResult)
    render(<Harness initial={oneKeyPool()} canTest onTestKey={onTestKey} />)

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(onTestKey).toHaveBeenCalledTimes(1))
    expect(onTestKey).toHaveBeenCalledWith(expect.objectContaining({ id: 'key-1', apiKey: 'sk-a' }))
    expect(await screen.findByRole('status')).toHaveTextContent('OK (12ms)')
  })

  it('disables the test button without a base URL/model', () => {
    render(<Harness initial={oneKeyPool()} canTest={false} onTestKey={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled()
  })

  it('removes a key', () => {
    const onChange = vi.fn()
    render(<Harness initial={oneKeyPool()} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Primary' }))
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'session_sticky', keys: [] })
  })
})