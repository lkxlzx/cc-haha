import * as fs from 'fs'
import * as path from 'path'

import {
  getClaudeCodeModelCapabilities,
  type ModelReasoningProviderKind,
} from '../../shared/modelReasoning.js'
import { MODEL_CONTEXT_WINDOWS_ENV_KEY } from '../../utils/model/modelContextWindows.js'
import { PROVIDER_MAX_OUTPUT_TOKENS_ENV_KEY } from '../../utils/managedEnvConstants.js'
import {
  IMAGE_GENERATION_API_KEY_ENV_KEY,
  IMAGE_GENERATION_BASE_URL_ENV_KEY,
  IMAGE_GENERATION_MODEL_ENV_KEY,
  IMAGE_GENERATION_PROVIDER_ID_ENV_KEY,
  IMAGE_GENERATION_PROVIDER_KIND_ENV_KEY,
} from '../../services/imageGeneration/config.js'
import { PROVIDER_PRESETS } from '../config/providerPresets.js'
import { normalizeCustomHeaders } from './customRequestHeaders.js'
import type {
  ApiFormat,
  ProviderApiKey,
  ProviderAuthStrategy,
  ProviderLoadBalancing,
  ProvidersIndex,
  SavedProvider,
} from '../types/provider.js'
import {
  BUILT_IN_PROVIDER_IDS,
  PROVIDER_TOOL_SEARCH_OPT_IN_SCHEMA_VERSION,
  ProviderLoadBalancingStrategySchema,
} from '../types/provider.js'
import {
  ATTRIBUTION_HEADER_ENV_KEY,
  attributionHeaderEnvForModel,
} from './attributionHeaderPolicy.js'
import {
  OPENAI_CODEX_OAUTH_FILE_ENV_KEY,
  OPENAI_OAUTH_PROVIDER_ENV_KEY,
  buildOpenAIOfficialRuntimeEnv,
  isOpenAIOfficialProviderId,
} from './openaiOfficialProvider.js'
import {
  GROK_OAUTH_FILE_ENV_KEY,
  GROK_OAUTH_PROVIDER_ENV_KEY,
  buildGrokOfficialRuntimeEnv,
  isGrokOfficialProviderId,
} from './grokOfficialProvider.js'

export const MANAGED_PROVIDER_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ENABLE_TOOL_SEARCH',
  'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_DESCRIPTION',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  ATTRIBUTION_HEADER_ENV_KEY,
  MODEL_CONTEXT_WINDOWS_ENV_KEY,
  PROVIDER_MAX_OUTPUT_TOKENS_ENV_KEY,
  OPENAI_OAUTH_PROVIDER_ENV_KEY,
  OPENAI_CODEX_OAUTH_FILE_ENV_KEY,
  GROK_OAUTH_PROVIDER_ENV_KEY,
  GROK_OAUTH_FILE_ENV_KEY,
  IMAGE_GENERATION_PROVIDER_KIND_ENV_KEY,
  IMAGE_GENERATION_PROVIDER_ID_ENV_KEY,
  IMAGE_GENERATION_BASE_URL_ENV_KEY,
  IMAGE_GENERATION_API_KEY_ENV_KEY,
  IMAGE_GENERATION_MODEL_ENV_KEY,
] as const

const AUTH_ENV_KEYS = new Set(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'])
const MODEL_SLOTS = ['main', 'haiku', 'sonnet', 'opus'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isProviderModels(value: unknown): value is SavedProvider['models'] {
  return (
    isRecord(value) &&
    typeof value.main === 'string' &&
    (value.fable === undefined || typeof value.fable === 'string') &&
    typeof value.haiku === 'string' &&
    typeof value.sonnet === 'string' &&
    typeof value.opus === 'string'
  )
}

function isProviderModel1mSupport(value: unknown): value is SavedProvider['model1mSupport'] {
  return (
    isRecord(value) &&
    MODEL_SLOTS.every((slot) => typeof value[slot] === 'boolean')
  )
}

function isImageGenerationConfig(
  value: unknown,
): value is NonNullable<SavedProvider['imageGeneration']> {
  return (
    isRecord(value) &&
    typeof value.model === 'string' &&
    (value.baseUrl === undefined || typeof value.baseUrl === 'string') &&
    (value.apiKey === undefined || typeof value.apiKey === 'string')
  )
}

function isProviderApiKey(value: unknown): value is ProviderApiKey {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    !!value.id.trim() &&
    (value.label === undefined || typeof value.label === 'string') &&
    typeof value.apiKey === 'string' &&
    !!value.apiKey.trim() &&
    (value.proxyUrl === undefined || typeof value.proxyUrl === 'string') &&
    (value.customHeaders === undefined || Array.isArray(value.customHeaders)) &&
    typeof value.enabled === 'boolean' &&
    typeof value.weight === 'number' &&
    Number.isInteger(value.weight) &&
    value.weight >= 1 &&
    value.weight <= 1000
  )
}

function isProviderLoadBalancing(value: unknown): value is ProviderLoadBalancing {
  return (
    isRecord(value) &&
    ProviderLoadBalancingStrategySchema.safeParse(value.strategy).success
  )
}

function isSavedProvider(value: unknown): value is SavedProvider {
  if (!isRecord(value)) return false
  const runtimeKind = value.runtimeKind
  return (
    typeof value.id === 'string' &&
    typeof value.presetId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.apiKey === 'string' &&
    (value.apiKeys === undefined ||
      (Array.isArray(value.apiKeys) && value.apiKeys.every(isProviderApiKey))) &&
    (value.loadBalancing === undefined || isProviderLoadBalancing(value.loadBalancing)) &&
    typeof value.baseUrl === 'string' &&
    (
      runtimeKind === undefined ||
      runtimeKind === 'anthropic_compatible' ||
      runtimeKind === 'openai_oauth' ||
      runtimeKind === 'grok_oauth'
    ) &&
    isProviderModels(value.models) &&
    (value.model1mSupport === undefined || isProviderModel1mSupport(value.model1mSupport)) &&
    (value.imageGeneration === undefined || isImageGenerationConfig(value.imageGeneration))
  )
}

export function normalizeToolSearchEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false
    if (['1', 'true', 'on', 'yes', 'auto'].includes(normalized) || normalized.startsWith('auto:')) {
      return true
    }
  }
  return false
}

export function normalizeDisableExperimentalBetas(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true
  }
  return false
}

export function normalizeModelMapping(models: SavedProvider['models']): SavedProvider['models'] {
  const main = models.main.trim()
  return {
    main,
    ...(models.fable?.trim() ? { fable: models.fable.trim() } : {}),
    haiku: models.haiku.trim() || main,
    sonnet: models.sonnet.trim() || main,
    opus: models.opus.trim() || main,
  }
}

function normalizeModel1mSupport(
  model1mSupport: SavedProvider['model1mSupport'] | undefined,
): SavedProvider['model1mSupport'] | undefined {
  if (!model1mSupport) return undefined
  const normalized = {
    main: model1mSupport.main === true,
    haiku: model1mSupport.haiku === true,
    sonnet: model1mSupport.sonnet === true,
    opus: model1mSupport.opus === true,
  }
  return MODEL_SLOTS.some((slot) => normalized[slot]) ? normalized : undefined
}

export function normalizeImageGeneration(
  value: SavedProvider['imageGeneration'] | undefined,
): SavedProvider['imageGeneration'] | undefined {
  const model = value?.model.trim()
  if (!model) return undefined
  const baseUrl = value?.baseUrl?.trim()
  const apiKey = value?.apiKey?.trim()
  return {
    model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
  }
}

function normalizeProviderApiKeys(value: unknown): ProviderApiKey[] | undefined {
  if (!Array.isArray(value)) return undefined

  const seen = new Set<string>()
  const keys: ProviderApiKey[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const apiKey = typeof entry.apiKey === 'string' ? entry.apiKey.trim() : ''
    if (!apiKey) continue
    const rawId = typeof entry.id === 'string' ? entry.id.trim() : ''
    const id = rawId && !seen.has(rawId) ? rawId : crypto.randomUUID()
    if (seen.has(id)) continue
    seen.add(id)

    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    const weight =
      typeof entry.weight === 'number' &&
      Number.isInteger(entry.weight) &&
      entry.weight >= 1 &&
      entry.weight <= 1000
        ? entry.weight
        : 1

    const customHeaders = normalizeCustomHeaders(entry.customHeaders)

    keys.push({
      id,
      ...(label ? { label } : {}),
      apiKey,
      ...(typeof entry.proxyUrl === 'string' && entry.proxyUrl.trim()
        ? { proxyUrl: entry.proxyUrl.trim() }
        : {}),
      ...(customHeaders.length > 0 ? { customHeaders } : {}),
      enabled: entry.enabled !== false,
      weight,
    })
  }

  return keys
}

function normalizeProviderLoadBalancing(
  value: unknown,
): ProviderLoadBalancing | undefined {
  if (!isRecord(value)) return undefined
  const strategy = ProviderLoadBalancingStrategySchema.safeParse(value.strategy)
  return strategy.success ? { strategy: strategy.data } : undefined
}

export function resolveProviderApiKeys(
  provider: Pick<SavedProvider, 'apiKey' | 'apiKeys'>,
): ProviderApiKey[] {
  const configured = normalizeProviderApiKeys(provider.apiKeys)
  if (configured !== undefined) return configured

  const legacyKey = provider.apiKey.trim()
  return legacyKey
    ? [{
        id: 'primary',
        apiKey: legacyKey,
        enabled: true,
        weight: 1,
      }]
    : []
}

export function getEnabledProviderApiKeys(
  provider: Pick<SavedProvider, 'apiKey' | 'apiKeys'>,
): ProviderApiKey[] {
  return resolveProviderApiKeys(provider).filter((key) => key.enabled)
}

export function providerHasMultipleApiKeys(
  provider: Pick<SavedProvider, 'apiKey' | 'apiKeys'>,
): boolean {
  return getEnabledProviderApiKeys(provider).length > 1
}

function baseCatalogModelId(modelId: string): string {
  return modelId.trim().replace(/\[1m\]$/i, '').replace(/:1m$/i, '').trim()
}

export function isEnabledProviderCatalogModel(
  provider: SavedProvider,
  modelId: string,
): boolean {
  const requestedModelId = baseCatalogModelId(modelId).toLowerCase()
  if (!requestedModelId) return false

  return (provider.modelCatalog ?? []).some(
    (model) =>
      model.enabled !== false &&
      baseCatalogModelId(model.id).toLowerCase() === requestedModelId,
  )
}

function normalizeProviderCatalogModels(
  value: unknown,
): SavedProvider['modelCatalog'] | undefined {
  if (!Array.isArray(value)) return undefined

  const seen = new Set<string>()
  const models: NonNullable<SavedProvider['modelCatalog']> = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const id = entry.id.trim()
    const key = baseCatalogModelId(id)
    if (!id || !key || seen.has(key)) continue
    seen.add(key)

    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    const contextWindow = entry.contextWindow
    const normalizedContextWindow =
      typeof contextWindow === 'number' &&
      Number.isInteger(contextWindow) &&
      contextWindow >= 16000 &&
      contextWindow <= 10000000
        ? contextWindow
        : undefined

    models.push({
      id,
      ...(name ? { name } : {}),
      ...(normalizedContextWindow !== undefined ? { contextWindow: normalizedContextWindow } : {}),
      ...(typeof entry.supports1m === 'boolean' ? { supports1m: entry.supports1m } : {}),
      ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    })
  }

  return models.length > 0 ? models : undefined
}

function applyModel1mSupport(model: string, enabled: boolean | undefined): string {
  const trimmed = model.trim()
  if (!enabled) return trimmed
  return `${trimmed.replace(/\[1m\]$/i, '').replace(/:1m$/i, '').trim()}[1m]`
}

function applyModel1mSupportMapping(
  models: SavedProvider['models'],
  model1mSupport: SavedProvider['model1mSupport'] | undefined,
): SavedProvider['models'] {
  return {
    main: applyModel1mSupport(models.main, model1mSupport?.main),
    ...(models.fable ? { fable: models.fable.trim() } : {}),
    haiku: applyModel1mSupport(models.haiku, model1mSupport?.haiku),
    sonnet: applyModel1mSupport(models.sonnet, model1mSupport?.sonnet),
    opus: applyModel1mSupport(models.opus, model1mSupport?.opus),
  }
}

export function normalizeSavedProvider(provider: SavedProvider): SavedProvider {
  const {
    disableExperimentalBetas: rawDisableExperimentalBetas,
    imageGeneration: rawImageGeneration,
    model1mSupport: rawModel1mSupport,
    modelCatalog: rawModelCatalog,
    supportsNestedToolResultMedia: rawSupportsNestedToolResultMedia,
    ...rest
  } = provider
  const rawProvider = provider as SavedProvider & Record<string, unknown>
  const model1mSupport = normalizeModel1mSupport(rawModel1mSupport)
  const modelCatalog = normalizeProviderCatalogModels(rawModelCatalog)
  const imageGeneration = normalizeImageGeneration(rawImageGeneration)
  const loadBalancing = normalizeProviderLoadBalancing(provider.loadBalancing)
  const explicitApiKeys = normalizeProviderApiKeys(provider.apiKeys)
  const apiKeys = explicitApiKeys ?? (
    provider.apiKey.trim()
      ? [{
          id: 'primary',
          apiKey: provider.apiKey.trim(),
          enabled: true,
          weight: 1,
        }]
      : undefined
  )
  const apiKey = apiKeys?.find((key) => key.enabled)?.apiKey ?? ''
  return {
    ...rest,
    apiKey,
    ...(apiKeys !== undefined && { apiKeys }),
    ...(loadBalancing !== undefined && { loadBalancing }),
    apiFormat: provider.apiFormat ?? 'anthropic',
    runtimeKind: provider.runtimeKind ?? 'anthropic_compatible',
    models: normalizeModelMapping(provider.models),
    toolSearchEnabled: normalizeToolSearchEnabled(rawProvider.toolSearchEnabled),
    ...(typeof rawSupportsNestedToolResultMedia === 'boolean'
      ? { supportsNestedToolResultMedia: rawSupportsNestedToolResultMedia }
      : {}),
    ...(normalizeDisableExperimentalBetas(rawDisableExperimentalBetas) ? { disableExperimentalBetas: true } : {}),
    ...(model1mSupport !== undefined ? { model1mSupport } : {}),
    ...(modelCatalog !== undefined ? { modelCatalog } : {}),
    ...(imageGeneration !== undefined ? { imageGeneration } : {}),
  }
}

function buildImageGenerationManagedEnv(
  provider: SavedProvider,
): Record<string, string> {
  const imageGeneration = normalizeImageGeneration(provider.imageGeneration)
  if (!imageGeneration) return {}

  return {
    [IMAGE_GENERATION_PROVIDER_KIND_ENV_KEY]: 'openai_images',
    [IMAGE_GENERATION_PROVIDER_ID_ENV_KEY]: provider.id,
    [IMAGE_GENERATION_BASE_URL_ENV_KEY]: imageGeneration.baseUrl ?? provider.baseUrl,
    [IMAGE_GENERATION_API_KEY_ENV_KEY]: imageGeneration.apiKey ?? provider.apiKey,
    [IMAGE_GENERATION_MODEL_ENV_KEY]: imageGeneration.model,
  }
}

function defaultProviderOrder(providers: SavedProvider[]): string[] {
  return [
    ...providers.map((provider) => provider.id),
    ...BUILT_IN_PROVIDER_IDS,
  ]
}

function normalizeProviderOrder(value: unknown, providers: SavedProvider[]): string[] {
  const providerIds = providers.map((provider) => provider.id)
  const knownIds = new Set<string>([
    ...providerIds,
    ...BUILT_IN_PROVIDER_IDS,
  ])
  const source = Array.isArray(value)
    ? value
    : defaultProviderOrder(providers)
  const seen = new Set<string>()
  const order: string[] = []

  for (const id of source) {
    if (typeof id !== 'string' || !knownIds.has(id) || seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }

  for (const id of defaultProviderOrder(providers)) {
    if (seen.has(id)) continue
    seen.add(id)
    order.push(id)
  }

  return order
}

export function normalizeProvidersIndex(value: unknown): ProvidersIndex | null {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    return null
  }

  const {
    activeProviderId: legacyActiveProviderId,
    providerOrder: rawProviderOrder,
    ...rest
  } = value
  const schemaVersion = typeof value.schemaVersion === 'number' ? value.schemaVersion : 1
  const providers = value.providers
    .filter(isSavedProvider)
    .map((provider) => normalizeSavedProvider(provider))
    .map((provider) => schemaVersion < PROVIDER_TOOL_SEARCH_OPT_IN_SCHEMA_VERSION
      ? { ...provider, toolSearchEnabled: false }
      : provider)
  const rawActiveId =
    typeof value.activeId === 'string'
      ? value.activeId
      : typeof legacyActiveProviderId === 'string'
        ? legacyActiveProviderId
        : null
  const activeId = rawActiveId && (
    providers.some((provider) => provider.id === rawActiveId) ||
    isOpenAIOfficialProviderId(rawActiveId) ||
    isGrokOfficialProviderId(rawActiveId)
  )
    ? rawActiveId
    : null

  return {
    ...rest,
    schemaVersion,
    activeId,
    providers,
    providerOrder: normalizeProviderOrder(rawProviderOrder, providers),
  }
}

export function getPresetDefaultEnv(presetId: string): Record<string, string> {
  return PROVIDER_PRESETS.find((preset) => preset.id === presetId)?.defaultEnv ?? {}
}

export function getPresetReasoningProviderKind(
  presetId: string,
): ModelReasoningProviderKind | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === presetId)?.reasoningProviderKind
}

function omitAuthEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !AUTH_ENV_KEYS.has(key.toUpperCase())),
  )
}

export function getPresetAuthStrategy(presetId: string): ProviderAuthStrategy {
  return PROVIDER_PRESETS.find((preset) => preset.id === presetId)?.authStrategy ?? 'auth_token'
}

function getPresetModelContextWindows(presetId: string): Record<string, number> {
  return PROVIDER_PRESETS.find((preset) => preset.id === presetId)?.modelContextWindows ?? {}
}

function getCatalogModelContextWindows(provider: SavedProvider): Record<string, number> {
  return Object.fromEntries(
    (provider.modelCatalog ?? [])
      .filter((model) => model.enabled !== false && model.contextWindow !== undefined)
      .map((model) => [model.id.trim(), model.contextWindow!]),
  )
}

function getProviderCapabilityEnv(
  provider: SavedProvider,
  models: SavedProvider['models'],
): Record<string, string> {
  const apiFormat = provider.apiFormat ?? 'anthropic'
  const providerKind = getPresetReasoningProviderKind(provider.presetId)
  return {
    ...(models.fable
      ? {
          ANTHROPIC_DEFAULT_FABLE_MODEL_SUPPORTED_CAPABILITIES:
            getClaudeCodeModelCapabilities(models.fable, apiFormat, undefined, providerKind),
        }
      : {}),
    ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES:
      getClaudeCodeModelCapabilities(models.haiku, apiFormat, undefined, providerKind),
    ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES:
      getClaudeCodeModelCapabilities(models.sonnet, apiFormat, undefined, providerKind),
    ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES:
      getClaudeCodeModelCapabilities(models.opus, apiFormat, undefined, providerKind),
  }
}

export function resolveProviderApiKey(
  provider: SavedProvider,
  presetDefaultEnv: Record<string, string>,
): string {
  return getEnabledProviderApiKeys(provider).find((key) => key.apiKey.trim())?.apiKey
    || provider.apiKey
    || presetDefaultEnv.ANTHROPIC_AUTH_TOKEN
    || presetDefaultEnv.ANTHROPIC_API_KEY
    || ''
}

export function buildProviderAuthEnv(
  provider: SavedProvider,
  presetDefaultEnv: Record<string, string>,
  needsProxy: boolean,
): Record<string, string> {
  if (needsProxy) {
    return { ANTHROPIC_API_KEY: 'proxy-managed' }
  }

  const strategy = provider.authStrategy ?? getPresetAuthStrategy(provider.presetId)
  const key = resolveProviderApiKey(provider, presetDefaultEnv)

  switch (strategy) {
    case 'api_key':
      return key ? { ANTHROPIC_API_KEY: key } : {}
    case 'auth_token':
    case 'auth_token_empty_api_key':
      return {
        ANTHROPIC_API_KEY: '',
        ...(key ? { ANTHROPIC_AUTH_TOKEN: key } : {}),
      }
    case 'dual_same_token':
      return key ? { ANTHROPIC_API_KEY: key, ANTHROPIC_AUTH_TOKEN: key } : {}
    case 'dual_dummy':
      return { ANTHROPIC_API_KEY: 'dummy', ANTHROPIC_AUTH_TOKEN: 'dummy' }
  }
}

export function getManagedEnvKeys(): string[] {
  const keys = new Set<string>(MANAGED_PROVIDER_ENV_KEYS)
  for (const preset of PROVIDER_PRESETS) {
    for (const key of Object.keys(preset.defaultEnv ?? {})) {
      keys.add(key)
    }
  }
  return [...keys]
}

export function providerNeedsProxy(
  apiFormat: ApiFormat,
  supportsNestedToolResultMedia?: boolean,
  hasMultipleApiKeys = false,
): boolean {
  return (
    apiFormat !== 'anthropic' ||
    supportsNestedToolResultMedia === false ||
    hasMultipleApiKeys
  )
}

export function buildProviderManagedEnv(
  provider: SavedProvider,
  options?: { proxyPath?: string; serverPort?: number },
): Record<string, string> {
  if (provider.runtimeKind === 'openai_oauth') {
    return buildOpenAIOfficialRuntimeEnv()
  }
  if (provider.runtimeKind === 'grok_oauth') {
    return buildGrokOfficialRuntimeEnv()
  }

  const apiFormat: ApiFormat = provider.apiFormat ?? 'anthropic'
  // Anthropic-format providers normally connect directly to the upstream. When
  // the provider opts out of nested tool-result media, route through the proxy
  // so images/documents are lifted out of tool_result before forwarding.
  const needsProxy = providerNeedsProxy(
    apiFormat,
    provider.supportsNestedToolResultMedia,
    providerHasMultipleApiKeys(provider),
  )
  const proxyPath = options?.proxyPath ?? '/proxy'
  const serverPort = options?.serverPort ?? 3456
  const baseUrl = needsProxy
    ? `http://127.0.0.1:${serverPort}${proxyPath}`
    : provider.baseUrl

  const models = normalizeModelMapping(provider.models)
  const runtimeModels = applyModel1mSupportMapping(models, provider.model1mSupport)
  const modelContextWindows = {
    ...getPresetModelContextWindows(provider.presetId),
    ...getCatalogModelContextWindows(provider),
    ...(provider.modelContextWindows ?? {}),
  }

  const presetDefaultEnv = getPresetDefaultEnv(provider.presetId)
  const providerCapabilityEnv = getProviderCapabilityEnv(provider, models)
  const maxOutputTokens = provider.requestCompatibility?.maxOutputTokens

  return {
    ...providerCapabilityEnv,
    ...omitAuthEnv(presetDefaultEnv),
    ...(typeof maxOutputTokens === 'number' && Number.isSafeInteger(maxOutputTokens) && maxOutputTokens > 0 && {
      [PROVIDER_MAX_OUTPUT_TOKENS_ENV_KEY]: String(maxOutputTokens),
    }),
    ...(provider.autoCompactWindow !== undefined && {
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(provider.autoCompactWindow),
    }),
    ...(Object.keys(modelContextWindows).length > 0 && {
      [MODEL_CONTEXT_WINDOWS_ENV_KEY]: JSON.stringify(modelContextWindows),
    }),
    ...(apiFormat === 'anthropic' && {
      ENABLE_TOOL_SEARCH: provider.toolSearchEnabled === true ? 'true' : 'false',
    }),
    ...(provider.disableExperimentalBetas === true && {
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
    }),
    ANTHROPIC_BASE_URL: baseUrl,
    ...buildProviderAuthEnv(provider, presetDefaultEnv, needsProxy),
    ANTHROPIC_MODEL: runtimeModels.main,
    ...(runtimeModels.fable && {
      ANTHROPIC_DEFAULT_FABLE_MODEL: runtimeModels.fable,
    }),
    ANTHROPIC_DEFAULT_HAIKU_MODEL: runtimeModels.haiku,
    ANTHROPIC_DEFAULT_SONNET_MODEL: runtimeModels.sonnet,
    ANTHROPIC_DEFAULT_OPUS_MODEL: runtimeModels.opus,
    ...attributionHeaderEnvForModel(runtimeModels.main),
    ...buildImageGenerationManagedEnv(provider),
  }
}

export function readActiveProviderManagedEnv(
  configDir: string,
  options?: { serverPort?: number },
): Record<string, string> | null {
  try {
    const raw = fs.readFileSync(path.join(configDir, 'cc-haha', 'providers.json'), 'utf-8')
    const index = normalizeProvidersIndex(JSON.parse(raw))
    if (!index?.activeId) return null

    if (isOpenAIOfficialProviderId(index.activeId)) {
      return buildOpenAIOfficialRuntimeEnv()
    }
    if (isGrokOfficialProviderId(index.activeId)) {
      return buildGrokOfficialRuntimeEnv()
    }

    const provider = index.providers.find((entry) => entry.id === index.activeId)
    if (!provider) return null

    return buildProviderManagedEnv(provider, {
      serverPort: options?.serverPort,
    })
  } catch {
    return null
  }
}

export function activeProviderNeedsProxy(configDir: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(configDir, 'cc-haha', 'providers.json'), 'utf-8')
    const index = normalizeProvidersIndex(JSON.parse(raw))
    if (
      !index?.activeId ||
      isOpenAIOfficialProviderId(index.activeId) ||
      isGrokOfficialProviderId(index.activeId)
    ) {
      return false
    }

    const provider = index.providers.find((entry) => entry.id === index.activeId)
    if (!provider) return false

    // Keep in sync with buildProviderManagedEnv: anthropic-format providers
    // that opt out of nested tool-result media also route through the proxy.
    return providerNeedsProxy(
      provider.apiFormat ?? 'anthropic',
      provider.supportsNestedToolResultMedia,
      providerHasMultipleApiKeys(provider),
    )
  } catch {
    return false
  }
}

export function mergeActiveProviderManagedEnv(
  settingsEnv: Record<string, string>,
  configDir: string,
  options?: { serverPort?: number },
): Record<string, string> {
  const activeProviderEnv = readActiveProviderManagedEnv(configDir, options)
  if (!activeProviderEnv) {
    return settingsEnv
  }

  const cleanedEnv = { ...settingsEnv }
  for (const key of getManagedEnvKeys()) {
    delete cleanedEnv[key]
  }
  return {
    ...cleanedEnv,
    ...activeProviderEnv,
  }
}
