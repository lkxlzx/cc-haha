// desktop/src/pages/settings/ProviderModelSlotsSection.tsx

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, CloudDownload, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { ModelIdCombobox } from '@/components/settings/ModelIdCombobox'
import { cx } from '@/lib/cx'
import { useTranslation } from '../../i18n'
import type {
  Model1mSupport,
  ModelMapping,
  ProviderModelBinding,
  ProviderModelInfo,
  ProviderModelsErrorCode,
} from '../../types/provider'
import {
  filterProviderModelGroups,
  modelBaseId,
  type ProviderModelGroup,
} from '../../lib/providerModels'
import { MODEL_SLOTS, type ModelSlot } from '../../lib/providerModelContext'

const FORM_SECTION_LABEL = 'block text-[13px] font-semibold text-[var(--color-text-secondary)]'
const FORM_HINT = 'text-[11px] leading-[1.5] text-[var(--color-text-tertiary)]'

type ProviderModelSlotsSectionProps = {
  models: ModelMapping
  model1mSupport: Model1mSupport
  labels: Record<ModelSlot, string>
  bindings: ProviderModelBinding[]
  onModelChange: (slot: ModelSlot, value: string) => void
  onModel1mSupportChange: (slot: ModelSlot, enabled: boolean) => void
  onBindingsChange: (bindings: ProviderModelBinding[]) => void
  fetchedModels: ProviderModelInfo[] | null
  modelPickerGroups: ProviderModelGroup[]
  canFetchModels: boolean
  hasModelsBaseUrl: boolean
  hasModelsApiKey: boolean
  isFetchingModels: boolean
  modelsErrorCode: ProviderModelsErrorCode | null
  modelsErrorText: string | null
  modelsErrorUpstream: string | null
  onFetchModels: () => void
  browserMode?: boolean
}

export function ProviderModelSlotsSection({
  models,
  model1mSupport,
  labels,
  bindings,
  onModelChange,
  onModel1mSupportChange,
  onBindingsChange,
  fetchedModels,
  modelPickerGroups,
  canFetchModels,
  hasModelsBaseUrl,
  hasModelsApiKey,
  isFetchingModels,
  modelsErrorCode,
  modelsErrorText,
  modelsErrorUpstream,
  onFetchModels,
  browserMode = false,
}: ProviderModelSlotsSectionProps) {
  const t = useTranslation()
  const fixedOverrideSlots = MODEL_SLOTS.filter(
    (slot) => slot !== 'main' && (models[slot] ?? '').trim() !== models.main.trim(),
  )
  const overrideCount = fixedOverrideSlots.length + bindings.length
  const [showRoleOverrides, setShowRoleOverrides] = useState(overrideCount > 0)

  const boundModelIds = useMemo(
    () => [
      models.main,
      ...MODEL_SLOTS.filter((slot) => slot !== 'main').map((slot) => models[slot] ?? ''),
      ...bindings.map((binding) => binding.modelId),
    ].filter((value) => value.trim()),
    [models, bindings],
  )

  const groupsFor = (currentModelId: string) => {
    const currentBase = modelBaseId(currentModelId)
    const excluded = boundModelIds.filter((id) => modelBaseId(id) !== currentBase)
    return filterProviderModelGroups(modelPickerGroups, excluded)
  }

  const renderModelField = (
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options?: {
      required?: boolean
      placeholder?: string
      show1m?: boolean
      slot?: ModelSlot
      support1m?: boolean
      onToggle1m?: (enabled: boolean) => void
    },
  ) => {
    const pickLabel = t('settings.providers.fetchModelsPick', { label })
    return (
      <div key={key} className="min-w-0">
        <ModelIdCombobox
          label={label}
          required={options?.required}
          value={value}
          onChange={onChange}
          placeholder={options?.placeholder ?? t('settings.providers.sameAsMain')}
          groups={groupsFor(value)}
          pickerLabel={pickLabel}
          noMatchesLabel={t('model.noMatches')}
          moreResultsLabel={t('settings.providers.fetchModelsMoreResults')}
        />
        {options?.show1m && (options.slot || options.onToggle1m) && (
          <Tooltip content={t('settings.providers.model1mSupportTooltip')} placement="bottom-start">
            <label className="mt-1 inline-flex h-6 w-fit cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]">
              <input
                type="checkbox"
                checked={options.slot ? model1mSupport[options.slot] : options.support1m === true}
                onChange={(event) => options.slot
                  ? onModel1mSupportChange(options.slot, event.target.checked)
                  : options.onToggle1m?.(event.target.checked)}
                aria-label={t('settings.providers.model1mSupportAria', { slot: options.slot ?? label })}
                className="h-3.5 w-3.5 shrink-0 rounded-[var(--radius-xs)] border-[var(--color-border-strong)] accent-[var(--color-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
              />
              <span>{t('settings.providers.model1mSupportShort')}</span>
            </label>
          </Tooltip>
        )}
      </div>
    )
  }

  const addBinding = () => {
    onBindingsChange([
      ...bindings,
      {
        id: crypto.randomUUID(),
        modelId: '',
        support1m: false,
      },
    ])
    setShowRoleOverrides(true)
  }

  const updateBinding = (id: string, patch: Partial<ProviderModelBinding>) => {
    onBindingsChange(bindings.map((binding) => binding.id === id ? { ...binding, ...patch } : binding))
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={FORM_SECTION_LABEL}>{t('settings.providers.effectiveModel')}</span>
        {!browserMode && (
          <Button
            variant="secondary"
            size="base"
            onClick={onFetchModels}
            disabled={!canFetchModels}
            loading={isFetchingModels}
            icon={<CloudDownload size={14} strokeWidth={1.75} aria-hidden="true" />}
          >
            {t('settings.providers.fetchModels')}
          </Button>
        )}
      </div>
      <p className={cx(FORM_HINT, 'mb-2')}>{t('settings.providers.effectiveModelDesc')}</p>

      {browserMode ? null : !hasModelsApiKey ? (
        <p className={cx(FORM_HINT, 'mb-2')}>{t('settings.providers.fetchModelsApiKeyHint')}</p>
      ) : !hasModelsBaseUrl ? (
        <p className={cx(FORM_HINT, 'mb-2')}>{t('settings.providers.fetchModelsHint')}</p>
      ) : modelsErrorCode ? (
        <div role="alert" className="mb-2 flex flex-col gap-0.5">
          <p className="text-[11px] text-[var(--color-error)]">{modelsErrorText}</p>
          {modelsErrorUpstream && (
            <p className="break-words text-[11px] text-[var(--color-text-tertiary)]">
              {t('settings.providers.fetchModelsErrorUpstream')} {modelsErrorUpstream}
            </p>
          )}
        </div>
      ) : fetchedModels && fetchedModels.length === 0 ? (
        <p className={cx(FORM_HINT, 'mb-2')}>{t('settings.providers.fetchModelsEmpty')}</p>
      ) : fetchedModels ? (
        <p className="mb-2 text-[11px] text-[var(--color-text-secondary)]">
          {t('settings.providers.fetchModelsLoaded', { count: fetchedModels.length })}
        </p>
      ) : (
        <p className={cx(FORM_HINT, 'mb-2')}>{t('settings.providers.fetchModelsSupportHint')}</p>
      )}

      <div className="grid grid-cols-1 gap-2">
        {renderModelField('main', labels.main, models.main, (value) => onModelChange('main', value), {
          required: true,
          placeholder: t('settings.providers.modelIdPlaceholder'),
          show1m: true,
          slot: 'main',
        })}
      </div>

      <div data-testid="role-overrides-panel" className="relative mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setShowRoleOverrides((visible) => !visible)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-colors hover:bg-[var(--color-surface-hover)] focus-visible:shadow-[var(--shadow-focus-ring)]"
          aria-expanded={showRoleOverrides}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[var(--color-text-primary)]">
              {t('settings.providers.roleOverrides')}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--color-text-tertiary)]">
              {overrideCount > 0
                ? t('settings.providers.roleOverridesCount', { count: overrideCount })
                : t('settings.providers.roleOverridesDesc')}
            </span>
          </span>
          {showRoleOverrides
            ? <ChevronUp size={14} strokeWidth={1.75} aria-hidden="true" />
            : <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />}
        </button>

        {showRoleOverrides && (
          <div className="border-t border-[var(--color-border)] px-3 py-3">
            <div className={browserMode ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'grid grid-cols-2 gap-2'}>
              {MODEL_SLOTS.filter((slot) => slot !== 'main').map((slot) => {
                const value = (models[slot] ?? '').trim() === models.main.trim() ? '' : models[slot] ?? ''
                return renderModelField(
                  `slot:${slot}`,
                  labels[slot],
                  value,
                  (next) => onModelChange(slot, next.trim() ? next : models.main),
                  { placeholder: t('settings.providers.sameAsMain'), show1m: true, slot },
                )
              })}

              {bindings.map((binding, index) => {
                const displayName = t('settings.providers.roleBindingDefaultName', { index: index + 1 })
                return (
                  <div key={binding.id} className="relative min-w-0">
                    <IconButton
                      icon={<Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />}
                      label={t('settings.providers.roleBindingRemove', { name: displayName })}
                      showTooltip={false}
                      size="2xs"
                      tone="muted"
                      hoverTone="danger"
                      onClick={() => onBindingsChange(bindings.filter((entry) => entry.id !== binding.id))}
                      className="absolute right-0 top-0 z-10"
                    />
                    {renderModelField(
                      `binding:${binding.id}`,
                      displayName,
                      binding.modelId,
                      (next) => updateBinding(binding.id, { modelId: next }),
                      {
                        placeholder: t('settings.providers.modelIdPlaceholder'),
                        show1m: true,
                        support1m: binding.support1m,
                        onToggle1m: (enabled) => updateBinding(binding.id, { support1m: enabled }),
                      },
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={addBinding}
                icon={<Plus size={13} strokeWidth={1.75} aria-hidden="true" />}
              >
                {t('settings.providers.roleBindingAdd')}
              </Button>
            </div>
            <p className={cx(FORM_HINT, 'mt-2')}>{t('settings.providers.roleOverrideHint')}</p>
          </div>
        )}
      </div>

      <p className={cx(FORM_HINT, 'mt-2')}>{t('settings.providers.model1mSupportHint')}</p>
    </div>
  )
}