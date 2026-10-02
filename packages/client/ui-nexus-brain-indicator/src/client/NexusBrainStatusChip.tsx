import { useEffect, useState, useRef, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NS } from './locales.ts'
import css from './NexusBrainStatusChip.module.css'

export interface BrainState {
  status: 'synced' | 'drift' | 'disconnected'
  planId?: string
  planStatus?: string
  planNextStep?: string | null
  branch?: string | null
  dirty?: boolean | null
  testsSummary?: string
}

export interface NexusBrainChipInjected {
  getBrainState: (sessionId: SessionId) => BrainState
  openPlanTab: () => void
  subscribeBrainState?: (sessionId: SessionId, callback: () => void) => () => void
}

export type NexusBrainStatusChipProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<NexusBrainChipInjected>

export function NexusBrainStatusChip(props: NexusBrainStatusChipProps): ReactNode {
  const { sessionId, t } = props
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [brainState, setBrainState] = useState<BrainState>(() => props.getBrainState(sessionId))
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBrainState(props.getBrainState(sessionId))
    if (props.subscribeBrainState) {
      return props.subscribeBrainState(sessionId, () => {
        setBrainState(props.getBrainState(sessionId))
      })
    }
  }, [sessionId, props])

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => { window.removeEventListener('mousedown', handleClickOutside) }
  }, [popoverOpen])

  const dotClass = brainState.status === 'synced'
    ? css.statusSynced
    : brainState.status === 'drift'
      ? css.statusDrift
      : css.statusDisconnected

  const statusLabel = brainState.status === 'synced'
    ? t('chip.synced')
    : brainState.status === 'drift'
      ? t('chip.drift')
      : t('chip.disconnected')

  return (
    <div className={css.root} ref={popoverRef}>
      <button
        type="button"
        className={`${css.chipButton} ${popoverOpen ? css.chipButtonActive : ''}`}
        onClick={() => { setPopoverOpen(v => !v) }}
        title="NEXUS Project Brain Status"
      >
        <span className={`${css.statusDot} ${dotClass}`} />
        <span>🧠 Nexus</span>
        {brainState.planId ? (
          <span className={css.planText}>#{brainState.planId}</span>
        ) : (
          <span className={css.vitalsBadge}>{statusLabel}</span>
        )}
      </button>

      {popoverOpen && (
        <div className={css.popover}>
          <div className={css.popoverTitle}>
            <span>🧠</span>
            <span>NEXUS Brain Overview</span>
          </div>

          <div className={css.popoverSection}>
            <span className={css.popoverLabel}>Brain State</span>
            <span className={css.popoverValue}>{statusLabel}</span>
          </div>

          <div className={css.popoverSection}>
            <span className={css.popoverLabel}>Active Plan</span>
            <span className={css.popoverValue}>
              {brainState.planId ? `#${brainState.planId} (${brainState.planStatus ?? 'in_progress'})` : 'No active plan'}
            </span>
            {brainState.planNextStep && (
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Next: {brainState.planNextStep}
              </span>
            )}
          </div>

          {brainState.branch && (
            <div className={css.popoverSection}>
              <span className={css.popoverLabel}>Git Branch & Working Tree</span>
              <span className={css.popoverValue}>
                {brainState.branch} • {brainState.dirty ? '⚠️ Dirty' : '✅ Clean'}
              </span>
            </div>
          )}

          {brainState.testsSummary && (
            <div className={css.popoverSection}>
              <span className={css.popoverLabel}>Test Suite</span>
              <span className={css.popoverValue}>{brainState.testsSummary}</span>
            </div>
          )}

          <button
            type="button"
            className={css.openPlanButton}
            onClick={() => {
              setPopoverOpen(false)
              props.openPlanTab()
            }}
          >
            📋 Open Nexus Plan Tab
          </button>
        </div>
      )}
    </div>
  )
}
