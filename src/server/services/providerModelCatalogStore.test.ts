import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearProviderModelCatalog,
  getProviderModelCatalog,
  providerModelCatalogKey,
  saveProviderModelCatalog,
} from './providerModelCatalogStore.js'

let tempDir: string
let previousConfigDir: string | undefined

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-haha-model-catalog-'))
  previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = tempDir
})

afterEach(async () => {
  if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('providerModelCatalogStore', () => {
  it('normalizes trailing slashes for lookup keys', () => {
    expect(providerModelCatalogKey(' https://api.example.com/v1/// ')).toBe('https://api.example.com/v1')
  })

  it('persists a catalog by base URL and clears it', async () => {
    await saveProviderModelCatalog('https://api.example.com/v1/', {
      models: [{ id: 'model-a', ownedBy: 'vendor' }],
      fetchedAt: '2026-01-01T00:00:00.000Z',
      endpoint: 'https://api.example.com/v1/models',
    })

    await expect(getProviderModelCatalog('https://api.example.com/v1')).resolves.toEqual({
      models: [{ id: 'model-a', ownedBy: 'vendor' }],
      fetchedAt: '2026-01-01T00:00:00.000Z',
      endpoint: 'https://api.example.com/v1/models',
    })

    await clearProviderModelCatalog('https://api.example.com/v1')
    await expect(getProviderModelCatalog('https://api.example.com/v1')).resolves.toBeUndefined()
  })

  it('ignores malformed catalog files', async () => {
    const storeDir = path.join(tempDir, 'cc-haha')
    await fs.mkdir(storeDir, { recursive: true })
    await fs.writeFile(path.join(storeDir, 'provider-model-catalogs.json'), '{"byBaseUrl":{"x":{"models":"bad"}}}')
    await expect(getProviderModelCatalog('x')).resolves.toBeUndefined()
  })
})