import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { ProviderService } from '../services/providerService.js'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'

let tmpDir: string
let originalConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-key-pool-'))
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

describe('provider key pool persistence', () => {
  test('stores and clears apiKeyConfig, keyPool, and modelBindings', async () => {
    const svc = new ProviderService()
    const provider = await svc.addProvider({
      presetId: 'custom',
      name: 'Pooled',
      baseUrl: 'https://pooled.example.com',
      apiKey: 'sk-legacy',
      models: { main: 'main', haiku: '', sonnet: '', opus: '' },
      apiKeyConfig: {
        name: 'Main key',
        weight: 2,
        headers: { 'X-Legacy': '1' },
      },
      keyPool: {
        mode: 'round_robin',
        keys: [{
          id: 'key-a',
          label: 'A',
          apiKey: 'sk-a',
          enabled: true,
          weight: 3,
          proxy: { mode: 'manual', url: 'http://proxy.example:7890' },
          headers: { 'X-Key': 'a' },
        }],
      },
      modelBindings: [{ id: 'binding-1', modelId: 'backup-model', support1m: true }],
    })

    const listed = await svc.listProviders()
    expect(listed.providers.find((entry) => entry.id === provider.id)).toMatchObject({
      apiKeyConfig: { name: 'Main key', weight: 2, headers: { 'X-Legacy': '1' } },
      keyPool: {
        mode: 'round_robin',
        keys: [{
          id: 'key-a',
          label: 'A',
          apiKey: 'sk-a',
          enabled: true,
          weight: 3,
          proxy: { mode: 'manual', url: 'http://proxy.example:7890' },
          headers: { 'X-Key': 'a' },
        }],
      },
      modelBindings: [{ id: 'binding-1', modelId: 'backup-model', support1m: true }],
    })

    await svc.updateProvider(provider.id, {
      apiKeyConfig: null,
      keyPool: null,
      modelBindings: null,
    })
    const cleared = await svc.getProvider(provider.id)
    expect(cleared.apiKeyConfig).toBeUndefined()
    expect(cleared.keyPool).toBeUndefined()
    expect(cleared.modelBindings).toBeUndefined()
  })
})