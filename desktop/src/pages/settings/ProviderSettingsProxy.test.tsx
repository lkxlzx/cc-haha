import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { providersApi } from '../../api/providers'
import { useProviderStore } from '../../stores/providerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { BUNDLED_PROVIDER_PRESETS } from '../../config/providerPresets'
import type { SavedProvider } from '../../types/provider'
import { ProviderSettings } from './ProviderSettings'

vi.mock('../../components/settings/ClaudeOfficialLogin', () => ({ ClaudeOfficialLogin: () => null }))
vi.mock('../../components/settings/ChatGPTOfficialLogin', () => ({ ChatGPTOfficialLogin: () => null }))
vi.mock('../../components/settings/GrokOfficialLogin', () => ({ GrokOfficialLogin: () => null }))
vi.mock('../../components/settings/DeepSeekAccountLogin', () => ({
  DeepSeekAccountLogin: () => <div data-testid="deepseek-account-login-stub" />,
}))
vi.mock('../../components/settings/OfficialProviderModelSettings', () => ({
  OfficialProviderModelSettings: () => null,
}))

const savedProvider: SavedProvider = {
  id: 'saved-proxy-target',
  presetId: 'custom',
  name: 'Proxy Fixture',
  baseUrl: 'https://api.example.test',
  apiKey: 'fake-saved-key',
  apiFormat: 'anthropic',
  models: { main: 'model-main', haiku: 'model-haiku', sonnet: 'model-sonnet', opus: 'model-opus' },
}

describe('provider-level network proxy removal', () => {
  let originalPresets = useProviderStore.getState().presets
  beforeEach(() => {
    originalPresets = useProviderStore.getState().presets
    useProviderStore.setState({ presets: BUNDLED_PROVIDER_PRESETS })
    useSettingsStore.setState({ locale: 'en' })
    vi.spyOn(useSettingsStore.getState(), 'fetchAll').mockResolvedValue()
    vi.spyOn(providersApi, 'list').mockResolvedValue({ providers: [], activeId: null })
    vi.spyOn(providersApi, 'getSettings').mockResolvedValue({})
    vi.spyOn(providersApi, 'updateSettings').mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useProviderStore.setState({ presets: originalPresets })
  })

  const openEditDialog = async (provider: SavedProvider) => {
    vi.mocked(providersApi.list).mockResolvedValue({ providers: [provider], activeId: null })
    render(<ProviderSettings />)
    fireEvent.click(within(await screen.findByTestId('provider-saved-proxy-target')).getByRole('button', { name: 'Edit' }))
    return within(screen.getByRole('dialog'))
  }

  it.each(['create', 'edit'] as const)('does not render the provider-level network proxy controls in the %s dialog', async (mode) => {
    let dialog: ReturnType<typeof within>
    if (mode === 'create') {
      render(<ProviderSettings />)
      fireEvent.click(await screen.findByRole('button', { name: /Add Model/ }))
      dialog = within(screen.getByRole('dialog'))
    } else {
      dialog = await openEditDialog(savedProvider)
    }

    expect(dialog.queryByText('Network proxy')).not.toBeInTheDocument()
    expect(dialog.queryByRole('radiogroup', { name: 'Network proxy' })).not.toBeInTheDocument()
  })

  it('preserves a saved provider proxy when editing other fields', async () => {
    const provider = { ...savedProvider, proxy: { mode: 'manual' as const, url: 'http://saved.example:1080' } }
    const dialog = await openEditDialog(provider)
    const update = vi.spyOn(providersApi, 'update').mockResolvedValue({ provider })

    fireEvent.change(dialog.getByDisplayValue(provider.name), { target: { value: 'Renamed provider' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith(provider.id, expect.objectContaining({ name: 'Renamed provider' })))
    expect(update.mock.calls[0]![1]).not.toHaveProperty('proxy')
  })
})
