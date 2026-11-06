/**
 * Upstream model catalogs, cached outside providers.json.
 *
 * A catalog is derived data: losing it only costs one re-fetch, and keeping it
 * in a sidecar means provider updates never rewrite a potentially large model
 * list. The cache is keyed by normalized Base URL because the create/edit form
 * probes models before a provider id exists.
 */

import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

export type CachedProviderModelInfo = {
  id: string
  ownedBy?: string
}

export type CachedProviderModelCatalog = {
  models: CachedProviderModelInfo[]
  fetchedAt: string
  endpoint?: string
}

type CatalogStore = {
  version: 1
  byBaseUrl: Record<string, CachedProviderModelCatalog>
}

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
}

function getStorePath(): string {
  return path.join(getConfigDir(), 'cc-haha', 'provider-model-catalogs.json')
}

export function providerModelCatalogKey(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function isCatalog(value: unknown): value is CachedProviderModelCatalog {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.models)
    && candidate.models.every((model) => (
      !!model
      && typeof model === 'object'
      && typeof (model as Record<string, unknown>).id === 'string'
    ))
}

async function readStore(): Promise<CatalogStore> {
  try {
    const raw = await fs.readFile(getStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const byBaseUrl: Record<string, CachedProviderModelCatalog> = {}
    if (parsed.byBaseUrl && typeof parsed.byBaseUrl === 'object' && !Array.isArray(parsed.byBaseUrl)) {
      for (const [key, value] of Object.entries(parsed.byBaseUrl as Record<string, unknown>)) {
        if (isCatalog(value)) byBaseUrl[key] = value
      }
    }
    return { version: 1, byBaseUrl }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, byBaseUrl: {} }
    }
    // A corrupt cache is disposable by design; re-fetching is cheaper than
    // blocking provider management on a parse error.
    return { version: 1, byBaseUrl: {} }
  }
}

async function writeStore(store: CatalogStore): Promise<void> {
  const storePath = getStorePath()
  await fs.mkdir(path.dirname(storePath), { recursive: true })
  const tmpPath = `${storePath}.tmp.${Date.now()}-${Math.random().toString(16).slice(2)}`
  try {
    await fs.writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf-8')
    await fs.rename(tmpPath, storePath)
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {})
    throw error
  }
}

export async function readProviderModelCatalogs(): Promise<Record<string, CachedProviderModelCatalog>> {
  return (await readStore()).byBaseUrl
}

export async function getProviderModelCatalog(baseUrl: string): Promise<CachedProviderModelCatalog | undefined> {
  const key = providerModelCatalogKey(baseUrl)
  if (!key) return undefined
  return (await readStore()).byBaseUrl[key]
}

export async function saveProviderModelCatalog(
  baseUrl: string,
  catalog: CachedProviderModelCatalog,
): Promise<void> {
  const key = providerModelCatalogKey(baseUrl)
  if (!key) return
  const store = await readStore()
  store.byBaseUrl[key] = catalog
  await writeStore(store)
}

export async function clearProviderModelCatalog(baseUrl: string): Promise<void> {
  const key = providerModelCatalogKey(baseUrl)
  const store = await readStore()
  if (!store.byBaseUrl[key]) return
  delete store.byBaseUrl[key]
  await writeStore(store)
}