import { OFFICIAL_DEFAULT_MODEL_ID } from '../constants/modelCatalog'
import {
  OPENAI_OFFICIAL_DEFAULT_MODEL_ID,
  OPENAI_OFFICIAL_PROVIDER_ID,
} from '../constants/openaiOfficialProvider'
import type { SavedProvider } from '../types/provider'
import type { RuntimeSelection } from '../types/runtime'
import {
  GROK_OFFICIAL_DEFAULT_MODEL_ID,
  GROK_OFFICIAL_MODELS,
  GROK_OFFICIAL_PROVIDER_ID,
} from '../constants/grokOfficialProvider'
import {
  isModelReasoningEffort,
  normalizeModelReasoningEffort,
  resolveModelReasoningProfile,
  type ModelReasoningApiFormat,
  type ModelReasoningProviderKind,
} from '../../../src/shared/modelReasoning'
import type { ProviderCatalogModel } from '../types/provider'

const PROVIDER_MODEL_SLOTS = ['main', 'haiku', 'sonnet', 'opus', 'fable'] as const

export function baseProviderModelId(modelId: string): string {
  return modelId.trim().replace(/\[1m\]$/i, '').replace(/:1m$/i, '').trim()
}

export function getEnabledProviderCatalogModels(
  provider: SavedProvider,
): ProviderCatalogModel[] {
  const seen = new Set<string>()
  const models: ProviderCatalogModel[] = []
  for (const model of provider.modelCatalog ?? []) {
    const id = model.id.trim()
    if (!id || model.enabled === false) continue
    const key = baseProviderModelId(id)
    if (!key || seen.has(key)) continue
    seen.add(key)
    models.push({
      ...model,
      id,
      ...(model.name?.trim() ? { name: model.name.trim() } : {}),
    })
  }
  return models
}

export function resolveProviderCatalogModelRuntimeId(
  model: ProviderCatalogModel,
  requestedModelId = model.id,
): string {
  const baseId = baseProviderModelId(model.id)
  const requested = requestedModelId.trim()
  if (!baseId || baseProviderModelId(requested) !== baseId) return requested
  if (model.supports1m === true) return `${baseId}[1m]`
  if (model.supports1m === false) return baseId
  return requested
}

export function resolveProviderSlotModelId(
  provider: SavedProvider,
  slot: keyof SavedProvider['models'],
): string {
  const modelId = provider.models[slot]?.trim() ?? ''
  const enabled = slot === 'fable' ? undefined : provider.model1mSupport?.[slot]
  // Missing flags are legacy configuration: preserve explicit model suffixes.
  if (!modelId || enabled === undefined) return modelId
  const baseModelId = baseProviderModelId(modelId)
  return enabled ? `${baseModelId}[1m]` : baseModelId
}

export function resolveProviderRuntimeModelId(provider: SavedProvider, modelId: string): string {
  const requested = modelId.trim()
  if (!requested) return ''

  const catalogModel = getEnabledProviderCatalogModels(provider).find(
    (model) => baseProviderModelId(model.id) === baseProviderModelId(requested),
  )
  if (catalogModel?.supports1m !== undefined) {
    return resolveProviderCatalogModelRuntimeId(catalogModel, requested)
  }

  const candidates = PROVIDER_MODEL_SLOTS
    .filter((slot) => provider.models[slot]?.trim() &&
      baseProviderModelId(provider.models[slot]!) === baseProviderModelId(modelId))
    .map((slot) => resolveProviderSlotModelId(provider, slot))
  // A provider can map one ID to slots with different capabilities. Preserve
  // an exact runtime choice; otherwise reconcile old IDs in main-first order.
  const slotMatch = candidates.find((candidate) => candidate === requested) ?? candidates[0]
  if (slotMatch) return slotMatch
  if (catalogModel) return resolveProviderCatalogModelRuntimeId(catalogModel, requested)
  return requested
}

export function getProviderRuntimeModelIds(provider: SavedProvider): Set<string> {
  const modelIds = new Set(
    PROVIDER_MODEL_SLOTS
      .filter((slot) => provider.models[slot]?.trim())
      .map((slot) => resolveProviderSlotModelId(provider, slot)),
  )
  for (const model of getEnabledProviderCatalogModels(provider)) {
    modelIds.add(resolveProviderCatalogModelRuntimeId(model))
  }
  return modelIds
}

export function resolveActiveProviderRuntimeSelection(
  activeId: string | null,
  activeProviderName: string | null,
  providers: SavedProvider[],
  currentModelId: string | undefined,
): RuntimeSelection | null {
  const activeProvider = activeId
    ? providers.find((provider) => provider.id === activeId)
    : activeProviderName
      ? providers.find((provider) => provider.name === activeProviderName)
      : undefined
  const inferredProviderId = activeId ?? activeProvider?.id ?? null
  if (!inferredProviderId) return null

  const providerMainModelId = activeProvider ? resolveProviderSlotModelId(activeProvider, 'main') : undefined

  return {
    providerId: inferredProviderId,
    modelId: providerMainModelId || currentModelId || (
      inferredProviderId === OPENAI_OFFICIAL_PROVIDER_ID
        ? OPENAI_OFFICIAL_DEFAULT_MODEL_ID
        : inferredProviderId === GROK_OFFICIAL_PROVIDER_ID
          ? GROK_OFFICIAL_DEFAULT_MODEL_ID
          : OFFICIAL_DEFAULT_MODEL_ID
    ),
  }
}

export function resolveDefaultRuntimeSelection(
  activeId: string | null,
  activeProviderName: string | null,
  providers: SavedProvider[],
  currentModelId: string | undefined,
): RuntimeSelection {
  return resolveActiveProviderRuntimeSelection(
    activeId,
    activeProviderName,
    providers,
    currentModelId,
  ) ?? {
    providerId: null,
    modelId: currentModelId || OFFICIAL_DEFAULT_MODEL_ID,
  }
}

export function normalizeRuntimeSelection(
  selection: RuntimeSelection,
  apiFormat?: ModelReasoningApiFormat,
  providerKind?: ModelReasoningProviderKind,
): RuntimeSelection {
  if (
    selection.effortLevel === undefined ||
    selection.providerId === null ||
    selection.providerId === OPENAI_OFFICIAL_PROVIDER_ID
  ) {
    return selection
  }

  if (selection.providerId === GROK_OFFICIAL_PROVIDER_ID) {
    const model = GROK_OFFICIAL_MODELS.find((entry) => entry.id === selection.modelId)
    // Models only known from the live catalog (e.g. grok-4.6) are absent from
    // the bundled desktop list. Keep their effort untouched and let the server
    // validate it against the live catalog instead of silently dropping it.
    if (!model) return selection
    const effortLevel = model.supportedReasoningEfforts?.includes(selection.effortLevel)
      ? selection.effortLevel
      : model.defaultReasoningEffort ?? model.supportedReasoningEfforts?.[0]
    const { effortLevel: _unsupportedEffort, ...runtime } = selection
    return effortLevel ? { ...runtime, effortLevel } : runtime
  }

  const requestedEffort = isModelReasoningEffort(selection.effortLevel)
    ? selection.effortLevel
    : undefined
  const reasoningProfile = resolveModelReasoningProfile(
    selection.modelId,
    apiFormat,
    undefined,
    providerKind,
  )
  if (!reasoningProfile && apiFormat === undefined) return selection
  const effortLevel = normalizeModelReasoningEffort(
    selection.modelId,
    requestedEffort,
    apiFormat,
    undefined,
    providerKind,
  )
  if (effortLevel === selection.effortLevel) return selection

  const { effortLevel: _unsupportedEffort, ...runtime } = selection
  const defaultEffort = reasoningProfile?.defaultReasoningEffort
  return effortLevel
    ? { ...runtime, effortLevel }
    : defaultEffort
      ? { ...runtime, effortLevel: defaultEffort }
      : runtime
}
