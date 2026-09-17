import { useMemo, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { useTranslation } from '@/i18n'
import type { ProviderModelGroup } from '@/lib/providerModels'

import { ModelIdCombobox } from './ModelIdCombobox'
import type {
  ModelMapping,
  ProviderCatalogModel,
  ProviderModelInfo,
} from '../../types/provider'

type Props = {
  value: ProviderCatalogModel[]
  onChange: (value: ProviderCatalogModel[]) => void
  slotModels: ModelMapping
  modelPickerGroups: ProviderModelGroup[]
  fetchedModels: ProviderModelInfo[] | null
  onFetchModels?: () => void
  canFetchModels: boolean
  isFetchingModels: boolean
  fetchFeedback?: ReactNode
}

const MODEL_SLOTS = ['main', 'haiku', 'sonnet', 'opus'] as const

function baseModelId(modelId: string): string {
  return modelId.trim().replace(/\[1m\]$/i, '').replace(/:1m$/i, '').trim()
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
  return String(tokens)
}

export function ProviderModelCatalogEditor({
  value,
  onChange,
  slotModels,
  modelPickerGroups,
  fetchedModels,
  onFetchModels,
  canFetchModels,
  isFetchingModels,
  fetchFeedback,
}: Props) {
  const t = useTranslation()
  const [adding, setAdding] = useState(false)
  const [draftModelId, setDraftModelId] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null)

  const roleLabels = useMemo(() => ({
    main: t('settings.providers.mainModel'),
    haiku: t('settings.providers.haikuModel'),
    sonnet: t('settings.providers.sonnetModel'),
    opus: t('settings.providers.opusModel'),
  }), [t])

  const updateModel = (index: number, patch: Partial<ProviderCatalogModel>) => {
    onChange(value.map((model, modelIndex) => (
      modelIndex === index ? { ...model, ...patch } : model
    )))
  }

  const addModel = () => {
    const id = draftModelId.trim()
    if (!id) return
    const normalizedId = baseModelId(id)
    if (!normalizedId) return
    const key = normalizedId
    if (value.some((model) => baseModelId(model.id) === key)) {
      setAddError(t('settings.providers.modelCatalogDuplicate'))
      return
    }

    onChange([...value, {
      id: normalizedId,
      ...(normalizedId !== id ? { supports1m: true } : {}),
      enabled: true,
    }])
    setDraftModelId('')
    setAddError(null)
    setAdding(false)
  }

  const addFetchedModels = () => {
    if (!fetchedModels?.length) return
    const known = new Set(value.map((model) => baseModelId(model.id)))
    const additions = fetchedModels.flatMap((model) => {
      const id = model.id.trim()
      const normalizedId = baseModelId(id)
      const key = normalizedId
      if (!id || !normalizedId || known.has(key)) return []
      known.add(key)
      return [{
        id: normalizedId,
        ...(normalizedId !== id ? { supports1m: true } : {}),
        enabled: true,
      }]
    })
    if (additions.length > 0) onChange([...value, ...additions])
  }

  const getRoleTags = (modelId: string): string[] => {
    const key = baseModelId(modelId)
    return MODEL_SLOTS.flatMap((slot) => (
      baseModelId(slotModels[slot]) === key ? [roleLabels[slot]] : []
    ))
  }

  const enabledCount = value.filter((model) => model.enabled !== false).length

  return (
    <div className="overflow-visible rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-container-low)]">
      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start">
        <span className="material-symbols-outlined mt-0.5 text-[18px] text-[var(--color-brand)]">
          view_list
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--color-text-primary)]">
            {t('settings.providers.modelCatalogTitle')}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[var(--color-text-tertiary)]">
            {t('settings.providers.modelCatalogDesc', {
              enabled: String(enabledCount),
              total: String(value.length),
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onFetchModels && (
            <Button
              variant="secondary"
              size="base"
              onClick={onFetchModels}
              disabled={!canFetchModels}
              loading={isFetchingModels}
              icon={<span className="material-symbols-outlined text-[15px]" aria-hidden="true">cloud_download</span>}
            >
              {t('settings.providers.fetchModels')}
            </Button>
          )}
          <Button
            variant="secondary"
            size="base"
            onClick={() => {
              setAdding(true)
              setAddError(null)
            }}
            icon={<span className="material-symbols-outlined text-[15px]" aria-hidden="true">add</span>}
          >
            {t('settings.providers.modelCatalogAdd')}
          </Button>
          {fetchedModels && fetchedModels.length > 0 && (
            <Button variant="secondary" size="base" onClick={addFetchedModels}>
              {t('settings.providers.modelCatalogAddFetched', {
                count: String(fetchedModels.length),
              })}
            </Button>
          )}
        </div>
      </div>

      {fetchFeedback && (
        <div className="border-t border-[var(--color-border-separator)] px-3 py-2">
          {fetchFeedback}
        </div>
      )}

      {adding && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] px-3 py-3">
          <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <ModelIdCombobox
              label={t('settings.providers.modelId')}
              value={draftModelId}
              onChange={(nextValue) => {
                setDraftModelId(nextValue)
                setAddError(null)
              }}
              placeholder={t('settings.providers.modelIdPlaceholder')}
              groups={modelPickerGroups}
              pickerLabel={t('settings.providers.modelCatalogPick')}
              noMatchesLabel={t('model.noMatches')}
              moreResultsLabel={t('settings.providers.fetchModelsMoreResults')}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="base"
                onClick={addModel}
                disabled={!baseModelId(draftModelId)}
              >
                {t('common.add')}
              </Button>
              <Button
                variant="secondary"
                size="base"
                onClick={() => {
                  setAdding(false)
                  setDraftModelId('')
                  setAddError(null)
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
          {addError && (
            <p role="alert" className="mt-1 text-[11px] text-[var(--color-error)]">
              {addError}
            </p>
          )}
        </div>
      )}

      {value.length === 0 ? (
        <div className="border-t border-[var(--color-border)] px-3 py-5 text-center text-xs text-[var(--color-text-tertiary)]">
          {t('settings.providers.modelCatalogEmpty')}
        </div>
      ) : (
        <div className="border-t border-[var(--color-border)]">
          {value.map((model, index) => {
            const roleTags = getRoleTags(model.id)
            const expanded = expandedModelId === model.id
            return (
              <div
                key={`${model.id}:${index}`}
                className="border-b border-[var(--color-border-separator)] last:border-b-0"
              >
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 transition-colors hover:bg-[var(--color-surface-hover)]">
                  <Checkbox
                    label={model.id}
                    labelHidden
                    size="sm"
                    checked={model.enabled !== false}
                    onChange={(event) => updateModel(index, { enabled: event.target.checked })}
                    containerClassName="items-center"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[13px] font-medium text-[var(--color-text-primary)]">
                      {model.id}
                    </div>
                    {(roleTags.length > 0 || model.contextWindow || model.supports1m || model.name) && (
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                        {roleTags.map((role) => (
                          <span
                            key={role}
                            className="rounded-[var(--radius-sm)] bg-[var(--color-surface-container)] px-1.5 py-0.5 font-medium text-[var(--color-text-secondary)]"
                          >
                            {role}
                          </span>
                        ))}
                        {model.supports1m && <span>1M</span>}
                        {model.contextWindow && (
                          <span>{formatContextWindow(model.contextWindow)}</span>
                        )}
                        {model.name && <span className="truncate">{model.name}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton
                      icon={(
                        <span className="material-symbols-outlined text-[16px]">
                          {expanded ? 'expand_less' : 'expand_more'}
                        </span>
                      )}
                      label={t(expanded
                        ? 'settings.providers.modelCatalogCollapse'
                        : 'settings.providers.modelCatalogExpand')}
                      size="sm"
                      tone="muted"
                      onClick={() => setExpandedModelId(expanded ? null : model.id)}
                    />
                    <IconButton
                      icon={<span className="material-symbols-outlined text-[16px]">delete</span>}
                      label={t('settings.providers.modelCatalogRemove')}
                      size="sm"
                      tone="muted"
                      hoverTone="danger"
                      onClick={() => onChange(value.filter((_, modelIndex) => modelIndex !== index))}
                    />
                  </div>
                </div>

                {expanded && (
                  <div className="grid gap-3 border-t border-[var(--color-border-separator)] bg-[var(--color-surface-container-lowest)] px-3 py-3 sm:grid-cols-2">
                    <Input
                      label={t('settings.providers.modelCatalogContextWindow')}
                      value={model.contextWindow ?? ''}
                      inputMode="numeric"
                      min={16000}
                      max={10000000}
                      placeholder={t('settings.providers.contextWindowPlaceholder')}
                      onChange={(event) => {
                        const raw = event.target.value.trim()
                        if (!raw) {
                          updateModel(index, { contextWindow: undefined })
                          return
                        }
                        const value = Number(raw)
                        if (Number.isSafeInteger(value) && value >= 16000 && value <= 10000000) {
                          updateModel(index, { contextWindow: value })
                        }
                      }}
                      hint={t('settings.providers.modelCatalogContextWindowHint')}
                    />
                    <Checkbox
                      label={t('settings.providers.modelCatalog1m')}
                      description={t('settings.providers.modelCatalog1mDesc')}
                      checked={model.supports1m === true}
                      onChange={(event) => updateModel(index, {
                        supports1m: event.target.checked,
                      })}
                      containerClassName="pt-6"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
