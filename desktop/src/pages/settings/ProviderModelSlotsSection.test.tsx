import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsStore } from '../../stores/settingsStore'
import { groupProviderModels } from '../../lib/providerModels'
import type { Model1mSupport, ModelMapping, ProviderModelInfo } from '../../types/provider'
import { ProviderModelSlotsSection } from './ProviderModelSlotsSection'

const labels = {
  main: 'Main Model',
  fable: 'Fable Model',
  haiku: 'Haiku Model',
  sonnet: 'Sonnet Model',
  opus: 'Opus Model',
}

const models: ModelMapping = {
  main: 'model-a',
  fable: 'model-a',
  haiku: 'model-a',
  sonnet: 'model-a',
  opus: 'model-a',
}

const model1mSupport: Model1mSupport = {
  main: false,
  fable: false,
  haiku: false,
  sonnet: false,
  opus: false,
}

const fetchedModels: ProviderModelInfo[] = [
  { id: 'model-a', ownedBy: 'vendor' },
  { id: 'model-b', ownedBy: 'vendor' },
]

const groups = groupProviderModels(fetchedModels, 'Other')

function renderSection(overrides: Partial<React.ComponentProps<typeof ProviderModelSlotsSection>> = {}) {
  return render(
    <ProviderModelSlotsSection
      models={models}
      model1mSupport={model1mSupport}
      labels={labels}
      bindings={[]}
      onModelChange={vi.fn()}
      onModel1mSupportChange={vi.fn()}
      onBindingsChange={vi.fn()}
      fetchedModels={fetchedModels}
      modelPickerGroups={groups}
      canFetchModels
      hasModelsBaseUrl
      hasModelsApiKey
      isFetchingModels={false}
      modelsErrorCode={null}
      modelsErrorText={null}
      modelsErrorUpstream={null}
      onFetchModels={vi.fn()}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  useSettingsStore.setState({ locale: 'en' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ProviderModelSlotsSection', () => {
  it('shows only the effective model until role overrides are opened', () => {
    renderSection()

    expect(screen.getByTestId('role-overrides-panel')).not.toHaveClass('overflow-hidden')
    expect(screen.getByLabelText(/^Main Model/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Haiku Model/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Role overrides/ }))
    expect(screen.getByLabelText(/^Haiku Model/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Sonnet Model/)).toBeInTheDocument()
  })

  it('opens the role section automatically when a saved provider has overrides', () => {
    renderSection({ models: { ...models, haiku: 'model-b' } })

    expect(screen.getByText('1 overridden')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Haiku Model/)).toBeInTheDocument()
  })

  it('reports the effective model change', () => {
    const onModelChange = vi.fn()
    renderSection({ onModelChange })

    fireEvent.change(screen.getByLabelText(/^Main Model/), { target: { value: 'model-b' } })
    expect(onModelChange).toHaveBeenCalledWith('main', 'model-b')
  })

  it('adds a custom model binding and keeps the add button below the grid', () => {
    const onBindingsChange = vi.fn()
    renderSection({ onBindingsChange })

    fireEvent.click(screen.getByRole('button', { name: /Role overrides/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add model binding' }))

    expect(onBindingsChange).toHaveBeenCalledWith([
      expect.objectContaining({ modelId: '', support1m: false }),
    ])
  })

  it('renders custom bindings in the same model-selector style as the fixed roles', () => {
    renderSection({
      bindings: [{ id: 'binding-1', modelId: '', support1m: false }],
    })

    expect(screen.getByLabelText(/^Custom 1/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Binding name 1')).not.toBeInTheDocument()
  })

  it('disables fetch until both base URL and key exist', () => {
    const onFetchModels = vi.fn()
    const { rerender } = renderSection({ canFetchModels: false, onFetchModels })

    expect(screen.getByRole('button', { name: 'Fetch models' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }))
    expect(onFetchModels).not.toHaveBeenCalled()

    rerender(
      <ProviderModelSlotsSection
        models={models}
        model1mSupport={model1mSupport}
        labels={labels}
        bindings={[]}
        onModelChange={vi.fn()}
        onModel1mSupportChange={vi.fn()}
        onBindingsChange={vi.fn()}
        fetchedModels={fetchedModels}
        modelPickerGroups={groups}
        canFetchModels
        hasModelsBaseUrl
        hasModelsApiKey
        isFetchingModels={false}
        modelsErrorCode={null}
        modelsErrorText={null}
        modelsErrorUpstream={null}
        onFetchModels={onFetchModels}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fetch models' }))
    expect(onFetchModels).toHaveBeenCalledTimes(1)
  })
})