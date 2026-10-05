import { useEffect, useState, useRef, type ReactNode } from 'react'
import clsx from 'clsx'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { StateDot, Tooltip, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NexusSetupPhases } from '@deepseek-ai/dsh-client-ui-nexus-setup/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { resolveBrainState, type BrainState, type BrainStatus, type TurnBrainState } from './brain-status.ts'
import type { NexusBrainIndicatorKey, NS } from './locales.ts'
import css from './NexusBrainStatusChip.module.css'

export interface NexusBrainChipInjected {
  hooks: {
    /** Per-folder setup phases from the `nexusSetup` service; null when that service is not loaded. */
    nexusSetupPhases: ObservableSnapshot<NexusSetupPhases | null>
  }
  /** Brain facts from the latest turn's NEXUS context, or null before any. */
  getBrainState: (sessionId: SessionId) => TurnBrainState | null
  /** Re-read {@link getBrainState} whenever the Session's chat changes. */
  subscribeBrainState: (sessionId: SessionId, callback: () => void) => () => void
  /** Ask for the folder's NEXUS status (idempotent per folder). */
  checkWorkspace: (path: string) => void
  /** Open the "Set up NEXUS" dialog; false when it cannot be offered. */
  openSetup: (sessionId: SessionId, path: string) => boolean
  openPlanTab: () => void
}

export type NexusBrainStatusChipProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<NexusBrainChipInjected>

const DOT: Readonly<Record<BrainStatus, StateDotState>> = {
  'synced': 'done',
  'drift': 'warning',
  'ready': 'done',
  'not-project': 'idle',
  'checking': 'ongoing',
  'unknown': 'idle',
}

const LABEL: Readonly<Record<BrainStatus, NexusBrainIndicatorKey | null>> = {
  'synced': 'chip.synced',
  'drift': 'chip.drift',
  'ready': 'chip.ready',
  'not-project': 'chip.notProject',
  // A spinner says enough; loading text would only flash.
  'checking': null,
  'unknown': 'chip.unknown',
}

function tooltipKey(state: BrainState): NexusBrainIndicatorKey {
  switch (state.status) {
    case 'synced': return 'chip.tooltip.synced'
    case 'drift': return 'chip.tooltip.drift'
    case 'ready': return 'chip.tooltip.ready'
    case 'not-project': return state.canSetUp ? 'chip.tooltip.notProject' : 'chip.tooltip.missing'
    case 'checking': return 'chip.tooltip.checking'
    case 'unknown': return 'chip.tooltip.unknown'
  }
}

/**
 * Session-header NEXUS brain chip: an honest status for the Session's folder,
 * with plan and vitals from the latest turn once one carried NEXUS context.
 * @param props - Session runtime, setup phases, and turn-context readers.
 * @returns the chip and its overview popover.
 */
export function NexusBrainStatusChip(props: NexusBrainStatusChipProps): ReactNode {
  const { sessionId, t, useSessions, useNexusSetupPhases, checkWorkspace } = props
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const phase = useNexusSetupPhases(phases => phases === null ? null : cwd === undefined ? undefined : phases[cwd])
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [turn, setTurn] = useState<TurnBrainState | null>(() => props.getBrainState(sessionId))
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTurn(props.getBrainState(sessionId))
    return props.subscribeBrainState(sessionId, () => {
      setTurn(props.getBrainState(sessionId))
    })
  }, [sessionId, props])

  useEffect(() => {
    if (cwd !== undefined && cwd !== '') checkWorkspace(cwd)
  }, [cwd, checkWorkspace])

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

  const state = resolveBrainState(turn, cwd, phase)
  const fromTurn = state.status === 'synced' || state.status === 'drift' ? state : null
  const labelKey = LABEL[state.status]
  const statusLabel = labelKey === null ? null : t(labelKey)
  const muted = fromTurn === null && state.status !== 'ready'

  const onChipClick = (): void => {
    // A plain folder's chip is the way in to setup; everything else shows the overview.
    if (state.status === 'not-project' && state.canSetUp && cwd !== undefined && props.openSetup(sessionId, cwd)) return
    setPopoverOpen(v => !v)
  }

  return (
    <div className={css.root} ref={popoverRef}>
      <Tooltip label={t(tooltipKey(state))} side="bottom">
        <button
          type="button"
          className={clsx(css.chipButton, muted && css.chipMuted, popoverOpen && css.chipButtonActive)}
          data-brain-status={state.status}
          onClick={onChipClick}
        >
          <StateDot state={DOT[state.status]} size={state.status === 'checking' ? 10 : 6} />
          <span>{t('chip.name')}</span>
          {fromTurn?.planId !== undefined
            ? <span className={css.planText}>#{fromTurn.planId}</span>
            : statusLabel !== null && <span className={css.vitalsBadge}>{statusLabel}</span>}
        </button>
      </Tooltip>

      {popoverOpen && (
        <div className={css.popover}>
          <div className={css.popoverTitle}>{t('popover.title')}</div>

          <div className={css.popoverSection}>
            <span className={css.popoverLabel}>{t('popover.state')}</span>
            <span className={css.popoverValue}>{statusLabel ?? t(tooltipKey(state))}</span>
            {fromTurn === null && statusLabel !== null && (
              <span className={css.popoverHint}>{t(tooltipKey(state))}</span>
            )}
          </div>

          {fromTurn !== null && (
            <>
              <div className={css.popoverSection}>
                <span className={css.popoverLabel}>{t('popover.plan')}</span>
                <span className={css.popoverValue}>
                  {fromTurn.planId !== undefined ? `#${fromTurn.planId} (${fromTurn.planStatus ?? 'in_progress'})` : t('popover.noPlan')}
                </span>
                {fromTurn.planNextStep && (
                  <span className={css.popoverHint}>{t('popover.next', { step: fromTurn.planNextStep })}</span>
                )}
              </div>

              {fromTurn.branch && (
                <div className={css.popoverSection}>
                  <span className={css.popoverLabel}>{t('popover.branch')}</span>
                  <span className={css.popoverValue}>
                    {fromTurn.branch} · {fromTurn.dirty ? t('popover.dirty') : t('popover.clean')}
                  </span>
                </div>
              )}

              {fromTurn.testsSummary && (
                <div className={css.popoverSection}>
                  <span className={css.popoverLabel}>{t('popover.tests')}</span>
                  <span className={css.popoverValue}>{fromTurn.testsSummary}</span>
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
                {t('popover.openPlan')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
