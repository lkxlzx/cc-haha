import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import { useSettingsStore } from '@/stores/settingsStore'
import type { ProviderCatalogModel } from '../../types/provider'
import { ProviderModelCatalogEditor } from './ProviderModelCatalogEditor'

function Harness({
  initialValue = [],
  fetchedModels = null,
}: {
  initialValue?: ProviderCatalogModel[]
  fetchedModels?: Array<{ id: string; ownedBy?: string }> | null
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <ProviderModelCatalogEditor
      value={value}
      onChange={setValue}
      slotModels={{
        main: 'main-model',
        haiku: 'fast-model',
        sonnet: 'balanced-model',
        opus: 'large-model',
      }}
      modelPickerGroups={[]}
      fetchedModels={fetchedModels}
      canFetchModels
      isFetchingModels={false}
    />
  )
}

afterEach(() => {
  cleanup()
  useSettingsStore.setState(useSettingsStore.getInitialState(), true)
})

describe('ProviderModelCatalogEditor', () => {
  it('keeps the model picker visible beyond the catalog container', () => {
    useSettingsStore.setState({ locale: 'en' })
    const { container } = render(<Harness />)

    expect(container.firstElementChild).toHaveClass('overflow-visible')
    expect(container.firstElementChild).not.toHaveClass('overflow-hidden')
  })

  it('adds a custom model id and rejects a duplicate without closing the add row', () => {
    useSettingsStore.setState({ locale: 'en' })
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    fireEvent.change(screen.getByLabelText('Model ID'), {
      target: { value: 'catalog-model' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('catalog-model')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    fireEvent.change(screen.getByLabelText('Model ID'), {
      target: { value: 'catalog-model' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This model is already in the available models list.',
    )
    expect(screen.getByLabelText('Model ID')).toHaveValue('catalog-model')
  })

  it('adds every fetched model to the enabled catalog', () => {
    useSettingsStore.setState({ locale: 'en' })
    render(<Harness fetchedModels={[{ id: 'fetched-a' }, { id: 'fetched-b' }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add all 2' }))

    expect(screen.getByText('fetched-a')).toBeInTheDocument()
    expect(screen.getByText('fetched-b')).toBeInTheDocument()
  })
})
