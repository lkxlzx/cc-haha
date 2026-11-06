// desktop/src/pages/settings/ProviderKeyPoolSection.tsx

import { Info, Plus } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Tooltip } from '@/components/ui/Tooltip'
import { cx } from '@/lib/cx'
import { useTranslation } from '../../i18n'
import type {
  ProviderApiKeyEntry,
  ProviderKeyPool,
  ProviderKeyPoolMode,
  ProviderTestResult,
} from '../../types/provider'
import { createProviderApiKeyEntry } from '../../lib/providerKeyPool'
import { ProviderApiKeyLine } from './ProviderApiKeyLine'

type ProviderKeyPoolSectionProps = {
  value: ProviderKeyPool
  onChange: (value: ProviderKeyPool) => void
  disabled?: boolean
  /** Enabled only when the form has a base URL and an effective model. */
  canTest?: boolean
  onTestKey?: (key: ProviderApiKeyEntry) => Promise<ProviderTestResult | null>
}

const FORM_SECTION_LABEL = 'block text-[13px] font-semibold text-[var(--color-text-secondary)]'
const FORM_FIELD_LABEL = 'text-sm font-medium text-[var(--color-text-primary)]'
const FORM_HINT = 'text-[11px] leading-[1.5] text-[var(--color-text-tertiary)]'

export function ProviderKeyPoolSection({
  value,
  onChange,
  disabled = false,
  canTest = false,
  onTestKey,
}: ProviderKeyPoolSectionProps) {
  const t = useTranslation()

  const updateKey = (id: string, patch: Partial<ProviderApiKeyEntry>) => {
    onChange({
      ...value,
      keys: value.keys.map((key) => key.id === id ? { ...key, ...patch } : key),
    })
  }

  const removeKey = (id: string) => {
    onChange({ ...value, keys: value.keys.filter((key) => key.id !== id) })
  }

  const addKey = () => {
    onChange({ ...value, keys: [...value.keys, createProviderApiKeyEntry()] })
  }

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={FORM_SECTION_LABEL}>{t('settings.providers.keyPoolTitle')}</span>
          <p className={cx(FORM_HINT, 'mt-1')}>{t('settings.providers.keyPoolDesc')}</p>
        </div>
        <Tooltip content={t('settings.providers.keyPoolModeTooltip')} placement="bottom-end">
          <IconButton
            icon={<Info size={12} strokeWidth={2} aria-hidden="true" />}
            label={t('settings.providers.keyPoolModeHelp')}
            showTooltip={false}
            size="2xs"
            tone="muted"
            shape="circle"
          />
        </Tooltip>
      </div>

      <div className="flex flex-col gap-2">
        <span className={FORM_FIELD_LABEL}>{t('settings.providers.keyPoolMode')}</span>
        <SegmentedControl<ProviderKeyPoolMode>
          label={t('settings.providers.keyPoolMode')}
          layout="fill"
          size="sm"
          value={value.mode}
          onChange={(mode) => onChange({ ...value, mode })}
          items={[
            { value: 'session_sticky', label: t('settings.providers.keyPoolModeSticky') },
            { value: 'round_robin', label: t('settings.providers.keyPoolModeRoundRobin') },
            { value: 'failover', label: t('settings.providers.keyPoolModeFailover') },
          ]}
        />
        <p className={FORM_HINT}>
          {t(value.mode === 'session_sticky'
            ? 'settings.providers.keyPoolModeStickyDesc'
            : value.mode === 'round_robin'
              ? 'settings.providers.keyPoolModeRoundRobinDesc'
              : 'settings.providers.keyPoolModeFailoverDesc')}
        </p>
      </div>

      {value.keys.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-3">
          <p className={FORM_HINT}>{t('settings.providers.keyPoolEmpty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {value.keys.map((entry, index) => (
            <ProviderApiKeyLine
              key={entry.id}
              value={entry}
              displayName={entry.label?.trim() || t('settings.providers.keyPoolKeyLabel', { index: index + 1 })}
              showEnabled
              showMeta
              disabled={disabled}
              canTest={canTest}
              onTest={onTestKey ? () => onTestKey(entry) : undefined}
              onChange={(patch) => updateKey(entry.id, patch)}
              onRemove={() => removeKey(entry.id)}
            />
          ))}
        </div>
      )}

      <div>
        <Button
          variant="secondary"
          size="base"
          disabled={disabled}
          onClick={addKey}
          icon={<Plus size={14} strokeWidth={1.75} aria-hidden="true" />}
        >
          {t('settings.providers.keyPoolAdd')}
        </Button>
      </div>
    </div>
  )
}