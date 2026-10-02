import { useState, type ReactNode } from 'react'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import css from './NexusBrainGrounding.module.css'

export interface NexusComposedContext {
  contract_version?: string
  task?: string
  gate?: { status: string; required?: boolean; reason?: string } | null
  skills?: Array<{
    name: string
    source?: string
    matchedTrigger?: string
    score?: number
    required?: boolean
  }>
  plan?: {
    id: string
    status: string
    nextStep?: string | null
    title?: string
  } | null
  knowledge?: Array<{
    category?: string
    title?: string
    source?: string
    excerpt?: string
    snippet?: string
  }>
  vitals?: {
    branch?: string | null
    dirty?: boolean | null
    testsSummary?: string
  }
  truncated?: boolean
}

export interface NexusBrainGroundingProps {
  composed: NexusComposedContext
  rawText: string
  t: ChatViewSlotProps['t']
}

export function NexusBrainGroundingBody({ composed, rawText }: NexusBrainGroundingProps): ReactNode {
  const [showRaw, setShowRaw] = useState(false)

  const plan = composed.plan
  const skills = composed.skills ?? []
  const knowledge = composed.knowledge ?? []
  const vitals = composed.vitals

  return (
    <div className={css.container} data-nexus-grounding-inspector>
      <div className={css.headerRow}>
        <div className={css.badgeGroup}>
          <span className={css.nexusTag}>🧠 Grounded by Nexus</span>
          {composed.contract_version !== undefined && (
            <span className={css.versionTag}>v{composed.contract_version}</span>
          )}
        </div>
        <button
          type="button"
          className={css.rawToggle}
          onClick={() => { setShowRaw(v => !v) }}
          aria-expanded={showRaw}
        >
          {showRaw ? 'Hide Raw Grounding Pack' : 'View Raw Grounding Pack'}
        </button>
      </div>

      {showRaw && (
        <div className={css.rawContainer}>
          <pre className={css.rawPre}>{rawText}</pre>
        </div>
      )}

      {/* Active Plan Section */}
      <div className={css.section}>
        <div className={css.sectionHeader}>
          <span className={css.sectionIcon}>📋</span>
          <span>Active Plan</span>
        </div>
        {plan !== null && plan !== undefined ? (
          <div className={css.card}>
            <div>
              <span className={css.planId}>Plan: #{plan.id}</span>
              <span className={css.planStatus}>{plan.status}</span>
            </div>
            {plan.nextStep !== null && plan.nextStep !== undefined && (
              <div className={css.planNextStep}>
                <strong>Next step:</strong> {plan.nextStep}
              </div>
            )}
          </div>
        ) : (
          <div className={css.emptyNotice}>No active plan tracked in the brain for this task.</div>
        )}
      </div>

      {/* Triggered Skills Section */}
      <div className={css.section}>
        <div className={css.sectionHeader}>
          <span className={css.sectionIcon}>⚡</span>
          <span>Triggered Skills ({skills.length})</span>
        </div>
        {skills.length > 0 ? (
          <ul className={css.itemsList}>
            {skills.map((skill, index) => (
              <li key={index} className={css.itemRow}>
                <div className={css.itemMain}>
                  <div className={css.itemName}>
                    {skill.name}
                    {skill.required === true && (
                      <span className={css.requiredBadge}>REQUIRED</span>
                    )}
                  </div>
                  {skill.matchedTrigger !== undefined && (
                    <div className={css.itemSub}>Trigger: &ldquo;{skill.matchedTrigger}&rdquo;</div>
                  )}
                </div>
                {skill.score !== undefined && (
                  <span className={css.itemBadge}>{Math.round(skill.score * 100)}% match</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className={css.emptyNotice}>No specialized skills triggered for this task.</div>
        )}
      </div>

      {/* Matched Knowledge Section */}
      <div className={css.section}>
        <div className={css.sectionHeader}>
          <span className={css.sectionIcon}>📚</span>
          <span>Knowledge Entries ({knowledge.length})</span>
        </div>
        {knowledge.length > 0 ? (
          <ul className={css.itemsList}>
            {knowledge.map((item, index) => (
              <li key={index} className={css.itemRow}>
                <div className={css.itemMain}>
                  <div className={css.itemName}>
                    {item.title ?? item.category ?? 'Knowledge Item'}
                  </div>
                  {item.source !== undefined && (
                    <div className={css.itemSub}>{item.source}</div>
                  )}
                  {(item.excerpt ?? item.snippet) !== undefined && (
                    <div className={css.planNextStep}>
                      {item.excerpt ?? item.snippet}
                    </div>
                  )}
                </div>
                {item.category !== undefined && (
                  <span className={css.itemBadge}>{item.category}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className={css.emptyNotice}>No long-term knowledge entries matched.</div>
        )}
      </div>

      {/* Vitals Section */}
      {vitals !== undefined && (
        <div className={css.section}>
          <div className={css.sectionHeader}>
            <span className={css.sectionIcon}>🩺</span>
            <span>Repository Vitals</span>
          </div>
          <div className={css.vitalsGrid}>
            <div className={css.vitalCard}>
              <span className={css.vitalLabel}>Branch</span>
              <span className={css.vitalValue}>{vitals.branch ?? 'unknown'}</span>
            </div>
            <div className={css.vitalCard}>
              <span className={css.vitalLabel}>Working Tree</span>
              <span className={`${css.vitalValue} ${vitals.dirty ? css.dirtyStatus : css.cleanStatus}`}>
                {vitals.dirty ? 'Dirty (uncommitted)' : 'Clean'}
              </span>
            </div>
            <div className={css.vitalCard}>
              <span className={css.vitalLabel}>Tests</span>
              <span className={css.vitalValue}>{vitals.testsSummary || 'None'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
