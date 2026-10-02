import { useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from '../locales.ts'
import css from './NexusPlanTab.module.css'

export interface PlanStep {
  id?: string
  text: string
  done: boolean
}

export interface ActivePlanData {
  id: string
  title?: string
  status: string
  nextStep?: string | null
  steps: PlanStep[]
}

export interface NexusPlanTabInjected {
  getActivePlan: () => ActivePlanData | null
  tickStep?: (stepIndex: number, done: boolean) => void
}

export type NexusPlanTabProps =
  PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<typeof NS>
  & InjectFace<NexusPlanTabInjected>

export function NexusPlanTab(props: NexusPlanTabProps): ReactNode {
  const { t } = props
  const activePlan = props.getActivePlan()
  const [localSteps, setLocalSteps] = useState<PlanStep[]>(() => activePlan?.steps ?? [])

  if (!activePlan) {
    return (
      <div className={css.root}>
        <div className={css.emptyState}>
          <span className={css.emptyIcon}>📋</span>
          <p>{t('tab.noActivePlan')}</p>
        </div>
      </div>
    )
  }

  const steps = localSteps.length > 0 ? localSteps : activePlan.steps
  const doneCount = steps.filter(s => s.done).length
  const totalCount = steps.length
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const toggleStep = (index: number) => {
    const updated = steps.map((s, i) => i === index ? { ...s, done: !s.done } : s)
    setLocalSteps(updated)
    props.tickStep?.(index, updated[index]?.done ?? false)
  }

  return (
    <div className={css.root} data-nexus-plan-tab>
      <div className={css.header}>
        <div className={css.titleRow}>
          <h2 className={css.planTitle}>
            <span>📋</span>
            <span>{activePlan.title || `Plan #${activePlan.id}`}</span>
          </h2>
          <span className={css.statusPill}>{activePlan.status}</span>
        </div>

        <div className={css.progressBarContainer}>
          <div className={css.progressLabel}>
            <span>{t('tab.progress')}</span>
            <span>{doneCount} / {totalCount} ({percent}%)</span>
          </div>
          <div className={css.progressBarTrack}>
            <div className={css.progressBarFill} style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <div className={css.scrollArea}>
        {activePlan.nextStep && (
          <div className={css.nextStepBox}>
            <div className={css.nextStepHeader}>
              <span>⚡</span>
              <span>{t('tab.nextStep')}</span>
            </div>
            <div className={css.nextStepText}>{activePlan.nextStep}</div>
          </div>
        )}

        <div className={css.checklistSection}>
          <div className={css.checklistHeader}>Action Checklist</div>
          {steps.length > 0 ? (
            <ul className={css.checklist}>
              {steps.map((step, idx) => (
                <li
                  key={idx}
                  className={`${css.checkItem} ${step.done ? css.checkItemDone : ''}`}
                  onClick={() => { toggleStep(idx) }}
                >
                  <div className={`${css.checkbox} ${step.done ? css.checkboxChecked : ''}`}>
                    {step.done && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className={`${css.checkItemText} ${step.done ? css.checkItemTextDone : ''}`}>
                    {step.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className={css.emptyNotice}>No checklist steps defined in this plan.</div>
          )}
        </div>
      </div>
    </div>
  )
}
