// desktop/src/pages/settings/ProviderApiKeyLine.tsx

import { useId, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { FIELD_BASE_CLASSES, FIELD_SIZE_CLASSES, Input, fieldStateClasses } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { Tooltip } from '@/components/ui/Tooltip'
import { cx } from '@/lib/cx'
import { useTranslation } from '../../i18n'
import type {
  ProviderApiKeyEntry,
  ProviderTestResult,
} from '../../types/provider'
import { isReservedHeaderName, isValidHeaderName } from '../../lib/providerKeyPool'

const FORM_FIELD_LABEL = 'text-sm font-medium text-[var(--color-text-primary)]'
const FORM_HINT = 'text-[11px] leading-[1.5] text-[var(--color-text-tertiary)]'

export type ProviderApiKeyLineValue = Pick<ProviderApiKeyEntry, 'apiKey' | 'proxy' | 'headers' | 'enabled' | 'label' | 'weight'>

type ProviderApiKeyLineProps = {
  value: ProviderApiKeyLineValue
  onChange: (patch: Partial<ProviderApiKeyLineValue>) => void
  /** Accessible name, e.g. "Primary" or "API Key". */
  displayName: string
  /** Overrides the generated input name for the legacy single-key field. */
  ariaLabel?: string
  /** Overrides the generated proxy input name. */
  proxyAriaLabel?: string
  disabled?: boolean
  inputId?: string
  showEnabled?: boolean
  showMeta?: boolean
  onRemove?: () => void
  removeLabel?: string
  /** Text action replacing the trash button, used by the single legacy key. */
  onClear?: () => void
  clearLabel?: string
  canTest?: boolean
  onTest?: () => Promise<ProviderTestResult | null>
  /** Controlled by the caller when the settings JSON mirror shares the same toggle. */
  showSecret?: boolean
  onShowSecretChange?: (visible: boolean) => void
}

export function ProviderApiKeyLine({
  value,
  onChange,
  displayName,
  ariaLabel,
  proxyAriaLabel,
  disabled = false,
  inputId,
  showEnabled = false,
  showMeta = false,
  onRemove,
  removeLabel,
  onClear,
  clearLabel,
  canTest = false,
  onTest,
  showSecret,
  onShowSecretChange,
}: ProviderApiKeyLineProps) {
  const t = useTranslation()
  const generatedKeyId = useId()
  const keyInputId = inputId ?? generatedKeyId
  const proxyInputId = useId()
  const labelInputId = useId()
  const weightInputId = useId()
  const [localShowSecret, setLocalShowSecret] = useState(false)
  const [showHeaders, setShowHeaders] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const secretVisible = showSecret ?? localShowSecret
  const setSecretVisible = onShowSecretChange ?? setLocalShowSecret
  const proxyUrl = value.proxy?.mode === 'manual' ? value.proxy.url ?? '' : ''

  const runTest = async () => {
    if (!onTest || !canTest || !value.apiKey.trim() || testing) return
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      const result = await onTest()
      if (result) setTestResult(result)
    } catch (error) {
      setTestError(error instanceof Error ? error.message : String(error))
    } finally {
      setTesting(false)
    }
  }

  const testSucceeded = testResult
    ? testResult.connectivity.success && testResult.proxy?.success !== false
    : false
  const testLatency = testResult?.proxy?.latencyMs ?? testResult?.connectivity.latencyMs
  const testFailure = testResult
    ? testResult.proxy?.success === false
      ? testResult.proxy.error
      : testResult.connectivity.error
    : null

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-container)] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {showMeta && (
          <>
            <div className="min-w-[8rem] flex-1">
              <label htmlFor={labelInputId} className="sr-only">{t('settings.providers.keyPoolLabel')}</label>
              <input
                id={labelInputId}
                value={value.label ?? ''}
                disabled={disabled}
                onChange={(event) => onChange({ label: event.target.value })}
                placeholder={t('settings.providers.keyPoolLabelPlaceholder')}
                className={cx(FIELD_BASE_CLASSES, FIELD_SIZE_CLASSES.lg, fieldStateClasses(false), 'text-[13px]')}
              />
            </div>
            <div className="w-[4.5rem] shrink-0">
              <label htmlFor={weightInputId} className="sr-only">{t('settings.providers.keyPoolWeight')}</label>
              <input
                id={weightInputId}
                type="number"
                min={1}
                max={100}
                step={1}
                value={value.weight ?? 1}
                disabled={disabled}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10)
                  onChange({ weight: Number.isFinite(parsed) ? parsed : 1 })
                }}
                aria-label={t('settings.providers.keyPoolWeight')}
                className={cx(FIELD_BASE_CLASSES, FIELD_SIZE_CLASSES.lg, fieldStateClasses(false), 'text-center font-mono text-[13px]')}
              />
            </div>
          </>
        )}

        <div className="relative min-w-[13rem] flex-[2]">
          <label htmlFor={keyInputId} className="sr-only">
            {ariaLabel ?? t('settings.providers.keyPoolKeyInput', { label: displayName })}
          </label>
          <input
            id={keyInputId}
            autoComplete="off"
            spellCheck={false}
            type={secretVisible ? 'text' : 'password'}
            value={value.apiKey}
            disabled={disabled}
            onChange={(event) => onChange({ apiKey: event.target.value })}
            placeholder={t('settings.providers.keyPoolKeyPlaceholder')}
            className={cx(FIELD_BASE_CLASSES, FIELD_SIZE_CLASSES.lg, fieldStateClasses(false), 'pr-10 font-mono text-[13px]')}
          />
          <IconButton
            icon={secretVisible
              ? <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" />
              : <Eye size={14} strokeWidth={1.75} aria-hidden="true" />}
            label={t(secretVisible ? 'settings.providers.hideApiKey' : 'settings.providers.showApiKey')}
            showTooltip={false}
            size="sm"
            tone="muted"
            onClick={() => setSecretVisible(!secretVisible)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          />
        </div>

        <div className="min-w-[10rem] flex-1">
          <label htmlFor={proxyInputId} className="sr-only">
            {proxyAriaLabel ?? t('settings.providers.keyPoolProxyInput', { label: displayName })}
          </label>
          <input
            id={proxyInputId}
            autoComplete="off"
            spellCheck={false}
            value={proxyUrl}
            disabled={disabled}
            onChange={(event) => {
              const url = event.target.value
              onChange({ proxy: url.trim() ? { mode: 'manual', url } : undefined })
            }}
            placeholder={t('settings.providers.keyPoolProxyPlaceholder')}
            className={cx(FIELD_BASE_CLASSES, FIELD_SIZE_CLASSES.lg, fieldStateClasses(false), 'font-mono text-[13px]')}
          />
        </div>

        <Tooltip
          content={t(showHeaders ? 'settings.providers.keyPoolHeadersHide' : 'settings.providers.keyPoolHeadersShow', { label: displayName })}
          placement="top-start"
        >
          <span className="inline-flex">
            <IconButton
              icon={showHeaders
                ? <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
                : <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />}
              label={t(showHeaders ? 'settings.providers.keyPoolHeadersHide' : 'settings.providers.keyPoolHeadersShow', { label: displayName })}
              showTooltip={false}
              size="md"
              tone="secondary"
              soft
              onClick={() => setShowHeaders((visible) => !visible)}
              aria-expanded={showHeaders}
            />
          </span>
        </Tooltip>

        <Button
          variant="secondary"
          size="sm"
          loading={testing}
          disabled={disabled || !canTest || !value.apiKey.trim() || !onTest}
          onClick={() => void runTest()}
        >
          {t('settings.providers.keyPoolTest')}
        </Button>

        {showEnabled && (
          <Tooltip content={t(value.enabled !== false ? 'settings.providers.keyPoolDisable' : 'settings.providers.keyPoolEnable')} placement="top-start">
            <span className="inline-flex">
              <Switch
                checked={value.enabled !== false}
                onChange={(checked) => onChange({ enabled: checked })}
                label={t('settings.providers.keyPoolEnableAria', { label: displayName })}
                labelHidden
                size="sm"
                disabled={disabled}
              />
            </span>
          </Tooltip>
        )}

        {onClear && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={disabled || (!value.apiKey && !value.proxy && !value.headers)}
          >
            {clearLabel ?? t('settings.providers.keyPoolClear')}
          </Button>
        )}

        {!onClear && onRemove && (
          <IconButton
            icon={<Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />}
            label={removeLabel ?? t('settings.providers.keyPoolRemove', { label: displayName })}
            showTooltip={false}
            size="sm"
            tone="muted"
            hoverTone="danger"
            onClick={onRemove}
            disabled={disabled}
          />
        )}
      </div>

      <p className={cx(FORM_HINT, 'mt-1')}>{t('settings.providers.keyPoolProxyPriority')}</p>

      {testResult && (
        <p
          role="status"
          className={cx(
            'mt-2 text-[11px] leading-[1.5]',
            testSucceeded ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]',
          )}
        >
          {testSucceeded
            ? t('settings.providers.keyPoolTestSuccess', { latency: testLatency ?? 0 })
            : t('settings.providers.keyPoolTestFailed', { error: testFailure || t('settings.providers.requestFailed') })}
        </p>
      )}
      {testError && (
        <p role="alert" className="mt-2 text-[11px] leading-[1.5] text-[var(--color-error)]">
          {t('settings.providers.keyPoolTestFailed', { error: testError })}
        </p>
      )}

      {showHeaders && (
        <div className="mt-3 flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
          <ProviderHeaderRowsEditor
            value={value.headers}
            disabled={disabled}
            onChange={(headers) => onChange({ headers })}
          />
        </div>
      )}
    </div>
  )
}

type HeaderRow = { id: string; name: string; value: string }

type ProviderHeaderRowsEditorProps = {
  value: Record<string, string> | undefined
  onChange: (headers: Record<string, string> | undefined) => void
  disabled?: boolean
}

/**
 * Row-based request headers: name on the left, value on the right. Keeps rows
 * in insertion order and emits a plain record for the provider payload.
 */
export function ProviderHeaderRowsEditor({ value, onChange, disabled = false }: ProviderHeaderRowsEditorProps) {
  const t = useTranslation()
  const [rows, setRows] = useState<HeaderRow[]>(() => Object.entries(value ?? {}).map(([name, headerValue]) => ({
    id: crypto.randomUUID(),
    name,
    value: headerValue,
  })))

  const duplicateNames = useMemo(() => {
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const row of rows) {
      const key = row.name.trim().toLowerCase()
      if (!key) continue
      if (seen.has(key)) duplicates.add(key)
      seen.add(key)
    }
    return duplicates
  }, [rows])

  const hasErrors = rows.some((row) => {
    const name = row.name.trim()
    if (!name) return false
    return !isValidHeaderName(name) || isReservedHeaderName(name) || duplicateNames.has(name.toLowerCase())
  })

  const emit = (nextRows: HeaderRow[]) => {
    setRows(nextRows)
    const headers: Record<string, string> = {}
    const seen = new Set<string>()
    for (const row of nextRows) {
      const name = row.name.trim()
      if (!name || !isValidHeaderName(name) || isReservedHeaderName(name)) continue
      const lower = name.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)
      headers[name] = row.value
    }
    onChange(Object.keys(headers).length > 0 ? headers : undefined)
  }

  const updateRow = (id: string, patch: Partial<HeaderRow>) => {
    emit(rows.map((row) => row.id === id ? { ...row, ...patch } : row))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={FORM_FIELD_LABEL}>{t('settings.providers.keyPoolHeaders')}</span>
      {rows.length === 0 ? (
        <p className={FORM_HINT}>{t('settings.providers.keyPoolHeadersEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={row.id} className="flex items-start gap-2">
              <Input
                aria-label={t('settings.providers.keyPoolHeaderNameAria', { index: index + 1 })}
                value={row.name}
                disabled={disabled}
                onChange={(event) => updateRow(row.id, { name: event.target.value })}
                placeholder={t('settings.providers.keyPoolHeaderNamePlaceholder')}
                containerClassName="min-w-0 flex-1"
                className="font-mono text-[13px]"
              />
              <Input
                aria-label={t('settings.providers.keyPoolHeaderValueAria', { index: index + 1 })}
                value={row.value}
                disabled={disabled}
                onChange={(event) => updateRow(row.id, { value: event.target.value })}
                placeholder={t('settings.providers.keyPoolHeaderValuePlaceholder')}
                containerClassName="min-w-0 flex-[2]"
                className="font-mono text-[13px]"
              />
              <IconButton
                icon={<Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />}
                label={t('settings.providers.keyPoolHeaderRemove', { index: index + 1 })}
                showTooltip={false}
                size="sm"
                tone="muted"
                hoverTone="danger"
                onClick={() => emit(rows.filter((entry) => entry.id !== row.id))}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}
      {hasErrors && (
        <p role="alert" className="text-[11px] leading-[1.5] text-[var(--color-error)]">
          {t('settings.providers.keyPoolHeadersError')}
        </p>
      )}
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => emit([...rows, { id: crypto.randomUUID(), name: '', value: '' }])}
          icon={<Plus size={13} strokeWidth={1.75} aria-hidden="true" />}
        >
          {t('settings.providers.keyPoolHeaderAdd')}
        </Button>
      </div>
      <p className={FORM_HINT}>{t('settings.providers.keyPoolHeadersHint')}</p>
    </div>
  )
}