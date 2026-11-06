import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { handleProvidersApi } from '../api/providers.js'
import { handleModelsApi } from '../api/models.js'
import { ProviderService } from '../services/providerService.js'
import { saveProviderModelCatalog } from '../services/providerModelCatalogStore.js'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-catalog-api-'))
  originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tmpDir
  resetSettingsCache()
})

afterEach(async () => {
  if (originalConfigDir !== undefined) process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  else delete process.env.CLAUDE_CONFIG_DIR
  resetSettingsCache()
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
})

describe('provider model catalog API', () => {
  test('attaches a cached upstream catalog to the provider list response', async () => {
    const provider = await new ProviderService().addProvider({
      presetId: 'custom',
      name: 'Catalog provider',
      baseUrl: 'https://catalog.example.com/v1',
      apiKey: 'sk-test',
      models: { main: 'model-a', haiku: '', sonnet: '', opus: '' },
    })
    await saveProviderModelCatalog('https://catalog.example.com/v1/', {
      models: [{ id: 'model-b', ownedBy: 'vendor' }],
      fetchedAt: '2026-01-01T00:00:00.000Z',
      endpoint: 'https://catalog.example.com/v1/models',
    })

    const url = new URL('http://localhost/api/providers')
    const response = await handleProvidersApi(
      new Request(url, { method: 'GET' }),
      url,
      ['api', 'providers'],
    )
    expect(response.status).toBe(200)
    const body = await response.json() as {
      providers: Array<{ id: string; modelCatalog?: { models: Array<{ id: string }> } }>
    }
    const saved = body.providers.find((entry) => entry.id === provider.id)
    expect(saved?.modelCatalog?.models.map((model) => model.id)).toEqual(['model-b'])
  })

  test('does not expose unbound cached catalog models through /api/models', async () => {
    const service = new ProviderService()
    const provider = await service.addProvider({
      presetId: 'custom',
      name: 'Bound only',
      baseUrl: 'https://bound.example.com/v1',
      apiKey: 'sk-test',
      models: { main: 'main-model', haiku: '', sonnet: '', opus: '' },
      modelBindings: [{ id: 'binding-1', modelId: 'bound-model', support1m: false }],
    })
    await service.activateProvider(provider.id)
    await saveProviderModelCatalog('https://bound.example.com/v1', {
      models: [{ id: 'unbound-model', ownedBy: 'vendor' }],
      fetchedAt: '2026-01-01T00:00:00.000Z',
    })

    const url = new URL('http://localhost/api/models')
    const response = await handleModelsApi(new Request(url), url, ['api', 'models'])
    expect(response.status).toBe(200)
    const body = await response.json() as { models: Array<{ id: string }> }
    const ids = body.models.map((model) => model.id)
    expect(ids).toContain('main-model')
    expect(ids).toContain('bound-model')
    expect(ids).not.toContain('unbound-model')
  })
})