import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStore } from '../../stores/settingsStore'
import {
  ProviderKeyPoolFields,
  type ProviderKeyDraft,
} from './ProviderKeyPoolFields'

function Harness({
  initialKeys,
  onTestKey,
  testResults,
}: {
  initialKeys: ProviderKeyDraft[]
  onTestKey?: (key: ProviderKeyDraft) => void
  testResults?: Record<string, 'success' | 'failed'>
}) {
  const [keys, setKeys] = useState(initialKeys)
  const [strategy, setStrategy] = useState<'round_robin' | 'weighted_round_robin' | 'failover'>('round_robin')

  return (
    <ProviderKeyPoolFields
      value={keys}
      onChange={setKeys}
      strategy={strategy}
      onStrategyChange={setStrategy}
      existingKeyIds={new Set(initialKeys.map((key) => key.id))}
      onTestKey={onTestKey}
      testResults={testResults}
    />
  )
}

describe('ProviderKeyPoolFields', () => {
  beforeEach(() => {
    useSettingsStore.setState({ locale: 'en' })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('adds, removes and toggles keys in one compact list', () => {
    render(<Harness initialKeys={[
      { id: 'key-1', apiKey: 'secret-1', enabled: true, weight: 1 },
      { id: 'key-2', apiKey: 'secret-2', enabled: true, weight: 2 },
    ]} />)

    expect(screen.getAllByLabelText('API Key')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))
    expect(screen.getAllByLabelText('API Key')).toHaveLength(3)

    fireEvent.click(screen.getByRole('switch', { name: 'Enable key 1' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Enable key 2' }))
    // With zero enabled keys the load-balancing selector stays visible but
    // disabled, so users can discover it before adding a second key.
    expect(screen.getByRole('combobox', { name: 'Load balancing' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove key 3' }))
    expect(screen.getAllByLabelText('API Key')).toHaveLength(2)
  })

  it('keeps load balancing visible but disabled with a single enabled key', () => {
    render(<Harness initialKeys={[
      { id: 'key-1', apiKey: 'secret-1', enabled: true, weight: 1 },
    ]} />)

    expect(screen.getByRole('combobox', { name: 'Load balancing' })).toBeDisabled()
  })

  it('reveals load balancing once two keys are enabled', () => {
    render(<Harness initialKeys={[
      { id: 'key-1', apiKey: 'secret-1', enabled: true, weight: 1 },
      { id: 'key-2', apiKey: 'secret-2', enabled: true, weight: 3 },
    ]} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Load balancing' }), {
      target: { value: 'weighted_round_robin' },
    })

    expect(screen.getByRole('combobox', { name: 'Load balancing' })).toHaveValue('weighted_round_robin')
  })

  it('edits the per-key proxy URL', () => {
    render(<Harness initialKeys={[
      { id: 'key-1', apiKey: 'secret-1', proxyUrl: 'socks5://127.0.0.1:1080', enabled: true, weight: 1 },
    ]} />)

    const proxy = screen.getByLabelText('Proxy URL')
    expect(proxy).toHaveValue('socks5://127.0.0.1:1080')
    fireEvent.change(proxy, { target: { value: 'http://proxy.example:8080' } })
    expect(proxy).toHaveValue('http://proxy.example:8080')
  })

  it('fires the per-key test callback with the tested draft', () => {
    const onTestKey = vi.fn()
    render(
      <Harness
        initialKeys={[{ id: 'key-1', apiKey: 'secret-1', enabled: true, weight: 1 }]}
        onTestKey={onTestKey}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Test key 1' }))
    expect(onTestKey).toHaveBeenCalledWith(expect.objectContaining({ id: 'key-1', apiKey: 'secret-1' }))
  })

  it('persists per-test outcomes on the test button without changing its accessible name', () => {
    const onTestKey = vi.fn()
    const { rerender } = render(
      <Harness
        initialKeys={[{ id: 'key-1', apiKey: 'secret-1', enabled: true, weight: 1 }]}
        onTestKey={onTestKey}
      />,
    )
    expect(screen.getByRole('button', { name: 'Test key 1' }).querySelector('svg')).toBeInTheDocument()

    rerender(
      <Harness
        initialKeys={[{ id: 'key-1', apiKey: 'secret-1', enabled: true, weight: 1 }]}
        onTestKey={onTestKey}
        testResults={{ 'key-1': 'success' }}
      />,
    )
    const successButton = screen.getByRole('button', { name: 'Test key 1' })
    expect(successButton.querySelector('svg')).toHaveClass('text-[var(--color-success)]')

    rerender(
      <Harness
        initialKeys={[{ id: 'key-1', apiKey: 'secret-1', enabled: true, weight: 1 }]}
        onTestKey={onTestKey}
        testResults={{ 'key-1': 'failed' }}
      />,
    )
    const failedButton = screen.getByRole('button', { name: 'Test key 1' })
    expect(failedButton.querySelector('svg')).toHaveClass('text-[var(--color-error)]')
  })

  it('expands a per-key header editor and edits, adds and removes header rows', () => {
    render(<Harness initialKeys={[
      {
        id: 'key-1',
        apiKey: 'secret-1',
        enabled: true,
        weight: 1,
        customHeaders: [{ name: 'X-Tenant', value: 'acme' }],
      },
    ]} />)

    expect(screen.queryByLabelText('Header name (key 1)')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show/hide custom headers for key 1' }))
    const name = screen.getByLabelText('Header name (key 1)')
    const value = screen.getByLabelText('Header value (key 1)')
    expect(name).toHaveValue('X-Tenant')
    expect(value).toHaveValue('acme')

    fireEvent.change(name, { target: { value: 'X-Trace' } })
    expect(screen.getByLabelText('Header name (key 1)')).toHaveValue('X-Trace')

    fireEvent.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.getAllByLabelText('Header name (key 1)')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Remove header 2 from key 1' }))
    expect(screen.getAllByLabelText('Header name (key 1)')).toHaveLength(1)
    expect(screen.getByLabelText('Header name (key 1)')).toHaveValue('X-Trace')

    fireEvent.click(screen.getByRole('button', { name: 'Show/hide custom headers for key 1' }))
    expect(screen.queryByLabelText('Header name (key 1)')).not.toBeInTheDocument()
  })
})
