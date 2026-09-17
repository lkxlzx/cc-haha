import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { SelectField } from '@/components/ui/SelectField'
import { Switch } from '@/components/ui/Switch'
import { useTranslation } from '../../i18n'
import type {
  ProviderApiKeyInput,
  ProviderLoadBalancingStrategy,
} from '../../types/provider'

export type ProviderKeyDraft = ProviderApiKeyInput & { id: string }

type ProviderKeyPoolFieldsProps = {
  value: ProviderKeyDraft[]
  onChange: (keys: ProviderKeyDraft[]) => void
  strategy: ProviderLoadBalancingStrategy
  onStrategyChange: (strategy: ProviderLoadBalancingStrategy) => void
  requiresApiKey?: boolean
  existingKeyIds?: ReadonlySet<string>
  /** Tests a saved key through the per-key endpoint; drafts are tested via the unsaved endpoint. */
  onTestKey?: (key: ProviderKeyDraft) => void
  testingKeyId?: string | null
  /** Per-key test outcomes; the test button shows a persistent green check / red cross. */
  testResults?: Record<string, 'success' | 'failed'>
}

const ROW_GRID = 'sm:grid-cols-[24px_64px_minmax(0,0.45fr)_minmax(0,1.75fr)_56px_minmax(0,0.75fr)_104px]'
const HEADER_GRID = `grid grid-cols-1 gap-2 ${ROW_GRID}`

export function createProviderKeyDraft(): ProviderKeyDraft {
  return {
    id: crypto.randomUUID(),
    apiKey: '',
    proxyUrl: '',
    customHeaders: [],
    enabled: true,
    weight: 1,
  }
}

export function ProviderKeyPoolFields({
  value,
  onChange,
  strategy,
  onStrategyChange,
  requiresApiKey = false,
  existingKeyIds = new Set(),
  onTestKey,
  testingKeyId = null,
  testResults = {},
}: ProviderKeyPoolFieldsProps) {
  const t = useTranslation()
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(() => new Set())
  const [expandedKeyIds, setExpandedKeyIds] = useState<Set<string>>(() => new Set())
  const enabledCount = value.filter((key) => key.enabled).length
  const requiresKey = requiresApiKey && enabledCount === 0

  const updateKey = (id: string, patch: Partial<ProviderKeyDraft>) => {
    onChange(value.map((key) => key.id === id ? { ...key, ...patch } : key))
  }

  const removeKey = (id: string) => {
    onChange(value.filter((key) => key.id !== id))
  }

  const toggleVisibility = (id: string) => {
    setVisibleKeyIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExpanded = (id: string) => {
    setExpandedKeyIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-sm font-medium text-[var(--color-text-primary)]">
          <span>{t('settings.providers.apiKeys')}</span>
          {requiresKey && <span className="text-[var(--color-error)]">*</span>}
        </div>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {t('settings.providers.keyCount', { count: value.length })}
        </span>
      </div>

      {value.length === 0 && (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-3 text-xs text-[var(--color-text-tertiary)]">
          {t('settings.providers.apiKeysEmpty')}
        </p>
      )}

      {value.length > 0 && (
        <div className={`${HEADER_GRID} hidden px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)] sm:grid`}>
          <span className="text-center">#</span>
          <span>{t('settings.providers.apiKeyHeaderStatus')}</span>
          <span>{t('settings.providers.apiKeyLabel')}</span>
          <span>{t('settings.providers.apiKeyHeaderKey')}</span>
          <span>{t('settings.providers.apiKeyHeaderWeight')}</span>
          <span>{t('settings.providers.apiKeyHeaderProxy')}</span>
          <span className="text-right">{t('settings.providers.apiKeyHeaderActions')}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {value.map((key, index) => {
          const visible = visibleKeyIds.has(key.id)
          const keepExistingSecret = !key.apiKey.trim() && existingKeyIds.has(key.id)
          const expanded = expandedKeyIds.has(key.id)
          const testResult = testResults[key.id]
          const updateHeader = (headerIndex: number, patch: Partial<{ name: string; value: string }>) => {
            updateKey(key.id, {
              customHeaders: (key.customHeaders ?? []).map(
                (header, i) => i === headerIndex ? { ...header, ...patch } : header,
              ),
            })
          }
          return (
            <div
              key={key.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-2"
            >
              <div className={`grid grid-cols-1 items-end gap-2 ${ROW_GRID}`}>
                <span className="hidden items-center justify-center text-xs text-[var(--color-text-tertiary)] sm:flex">
                  {index + 1}
                </span>
                <Switch
                  size="sm"
                  checked={key.enabled}
                  onChange={(enabled) => updateKey(key.id, { enabled })}
                  label={t('settings.providers.apiKeyEnabled', { index: index + 1 })}
                  labelHidden
                />
                <Input
                  size="sm"
                  aria-label={t('settings.providers.apiKeyLabel')}
                  value={key.label ?? ''}
                  maxLength={80}
                  placeholder={t('settings.providers.apiKeyLabelPlaceholder')}
                  onChange={(event) => updateKey(key.id, { label: event.target.value })}
                />
                <div className="relative">
                  <Input
                    size="sm"
                    aria-label={t('settings.providers.apiKey')}
                    type={visible ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={key.apiKey}
                    placeholder={keepExistingSecret
                      ? t('settings.providers.apiKeyKeep')
                      : 'sk-...'}
                    className="pr-9"
                    onChange={(event) => updateKey(key.id, { apiKey: event.target.value })}
                  />
                  <IconButton
                    icon={visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    label={t(visible
                      ? 'settings.providers.hideApiKey'
                      : 'settings.providers.showApiKey')}
                    showTooltip={false}
                    size="2xs"
                    tone="muted"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    onClick={() => toggleVisibility(key.id)}
                  />
                </div>
                <Input
                  size="sm"
                  aria-label={t('settings.providers.apiKeyWeight')}
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={String(key.weight ?? 1)}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    updateKey(key.id, {
                      weight: Number.isFinite(parsed)
                        ? Math.min(1000, Math.max(1, parsed))
                        : 1,
                    })
                  }}
                />
                <Input
                  size="sm"
                  aria-label={t('settings.providers.apiKeyProxy')}
                  value={key.proxyUrl ?? ''}
                  placeholder={t('settings.providers.apiKeyProxyPlaceholder')}
                  spellCheck={false}
                  onChange={(event) => updateKey(key.id, { proxyUrl: event.target.value })}
                />
                <div className="flex items-center justify-end gap-1">
                  <IconButton
                    icon={expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                    label={t('settings.providers.apiKeyHeadersToggle', { index: index + 1 })}
                    showTooltip={false}
                    size="2xs"
                    tone="muted"
                    pressed={expanded}
                    onClick={() => toggleExpanded(key.id)}
                  />
                  {onTestKey && (
                    <IconButton
                      icon={testResult === 'success'
                        ? <CircleCheck aria-hidden="true" className="text-[var(--color-success)]" />
                        : testResult === 'failed'
                          ? <CircleX aria-hidden="true" className="text-[var(--color-error)]" />
                          : <Zap aria-hidden="true" />}
                      label={t('settings.providers.apiKeyTest', { index: index + 1 })}
                      showTooltip={false}
                      size="2xs"
                      tone="muted"
                      loading={testingKeyId === key.id}
                      onClick={() => onTestKey(key)}
                    />
                  )}
                  <IconButton
                    icon={<Trash2 aria-hidden="true" />}
                    label={t('settings.providers.removeApiKey', { index: index + 1 })}
                    showTooltip={false}
                    size="2xs"
                    tone="muted"
                    hoverTone="danger"
                    onClick={() => removeKey(key.id)}
                  />
                </div>
              </div>

              {expanded && (
                <div className="mt-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-2">
                  <div className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                    {t('settings.providers.apiKeyHeadersTitle')}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {(key.customHeaders ?? []).map((header, headerIndex) => (
                      <div key={headerIndex} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_28px] items-center gap-1.5">
                        <Input
                          size="sm"
                          aria-label={t('settings.providers.apiKeyHeaderNameField', { index: index + 1 })}
                          value={header.name}
                          placeholder={t('settings.providers.apiKeyHeaderNamePlaceholder')}
                          spellCheck={false}
                          onChange={(event) => updateHeader(headerIndex, { name: event.target.value })}
                        />
                        <Input
                          size="sm"
                          aria-label={t('settings.providers.apiKeyHeaderValueField', { index: index + 1 })}
                          value={header.value}
                          placeholder={t('settings.providers.apiKeyHeaderValuePlaceholder')}
                          spellCheck={false}
                          onChange={(event) => updateHeader(headerIndex, { value: event.target.value })}
                        />
                        <IconButton
                          icon={<Trash2 aria-hidden="true" />}
                          label={t('settings.providers.removeApiKeyHeader', { index: index + 1, headerIndex: headerIndex + 1 })}
                          showTooltip={false}
                          size="2xs"
                          tone="muted"
                          hoverTone="danger"
                          onClick={() => updateKey(key.id, {
                            customHeaders: (key.customHeaders ?? []).filter((_, i) => i !== headerIndex),
                          })}
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus className="h-3 w-3" aria-hidden="true" />}
                    className="mt-1.5 w-fit"
                    onClick={() => updateKey(key.id, {
                      customHeaders: [...(key.customHeaders ?? []), { name: '', value: '' }],
                    })}
                  >
                    {t('settings.providers.addApiKeyHeader')}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Button
        variant="secondary"
        size="base"
        icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={() => onChange([...value, createProviderKeyDraft()])}
      >
        {t('settings.providers.addApiKey')}
      </Button>

      <SelectField
        label={t('settings.providers.loadBalancing')}
        value={strategy}
        options={[
          { value: 'round_robin', label: t('settings.providers.loadBalancingRoundRobin') },
          { value: 'weighted_round_robin', label: t('settings.providers.loadBalancingWeighted') },
          { value: 'failover', label: t('settings.providers.loadBalancingFailover') },
        ]}
        hint={enabledCount > 1
          ? t('settings.providers.loadBalancingHint')
          : t('settings.providers.loadBalancingDisabledHint')}
        disabled={enabledCount <= 1}
        onChange={onStrategyChange}
      />
    </div>
  )
}
