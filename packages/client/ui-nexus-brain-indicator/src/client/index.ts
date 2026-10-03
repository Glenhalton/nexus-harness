/**
 * Nexus Brain & Context Indicators:
 * - Header Brain Status Chip in conversation.session.header.utilities
 * - Interactive Nexus Plan Tab in the right sidebar
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { NS, en, zh, type NexusBrainIndicatorKey } from './locales.ts'
import { NEXUS_PLAN_ID, nexusPlanDefinition } from './plan-tab/definition.tsx'
import { NexusPlanTab, type ActivePlanData } from './plan-tab/NexusPlanTab.tsx'
import { NexusPlanTitle } from './plan-tab/NexusPlanTitle.tsx'
import { NexusBrainStatusChip, type BrainState, type NexusBrainChipInjected } from './NexusBrainStatusChip.tsx'

export type { NexusBrainIndicatorKey } from './locales.ts'
export type { BrainState } from './NexusBrainStatusChip.tsx'
export type { ActivePlanData, PlanStep } from './plan-tab/NexusPlanTab.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    nexusBrainIndicator: NexusBrainIndicatorKey
  }
}

export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'uiConversation', 'sessions']

/** Helper to extract brain and plan state from the latest session chat nodes. */
export function extractBrainFromSession(
  ctx: ClientContext,
  sessionId: SessionId,
): { state: BrainState; planData: ActivePlanData | null } {
  try {
    const bound = ctx.uiConversation.binding(sessionId)
    const chatSource = bound.target('chat')
    const snapshot = chatSource.getSnapshot()
    if (!snapshot) return { state: { status: 'disconnected' }, planData: null }

    const nodes = snapshot.legacy.nodes
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i] as {
        kind?: string
        source?: { kind?: string; sections?: Array<{ text?: string }> }
        content?: Array<{ type: string; text?: string }>
      } | undefined

      if (
        node?.kind === 'context'
        && node.source?.kind === 'nexus-brain-context'
      ) {
        let text = ''
        const sections = node.source.sections
        if (Array.isArray(sections) && sections.length > 0 && typeof sections[0]?.text === 'string') {
          text = sections[0].text
        } else if (Array.isArray(node.content)) {
          for (const block of node.content) {
            if (block.type === 'text' && typeof block.text === 'string') text += block.text
          }
        }

        const openBrace = text.indexOf('{')
        const closeBrace = text.lastIndexOf('}')
        if (openBrace >= 0 && closeBrace > openBrace) {
          try {
            const parsed = JSON.parse(text.slice(openBrace, closeBrace + 1)) as {
              plan?: {
                id?: string
                title?: string
                status?: string
                nextStep?: string
                steps?: Array<{ text: string; done: boolean }>
              }
              vitals?: {
                branch?: string
                dirty?: boolean
                testsSummary?: string
              }
            }
            const plan = parsed.plan
            const vitals = parsed.vitals
            const planId = plan?.id
            return {
              state: {
                status: vitals?.dirty ? 'drift' : 'synced',
                ...(planId !== undefined && { planId }),
                ...(plan?.status !== undefined && { planStatus: plan.status }),
                ...(plan?.nextStep !== undefined && { planNextStep: plan.nextStep }),
                ...(vitals?.branch !== undefined && { branch: vitals.branch }),
                ...(vitals?.dirty !== undefined && { dirty: vitals.dirty }),
                ...(vitals?.testsSummary !== undefined && { testsSummary: vitals.testsSummary }),
              },
              planData: plan && planId ? {
                id: planId,
                title: plan.title || `Plan #${planId}`,
                status: plan.status || 'in_progress',
                nextStep: plan.nextStep ?? null,
                steps: Array.isArray(plan.steps) ? plan.steps : (plan.nextStep ? [{ text: plan.nextStep, done: false }] : []),
              } : null,
            }
          } catch {
            // parsing error fallback
          }
        }
      }
    }
  } catch {
    // binding error fallback
  }
  return { state: { status: 'synced' }, planData: null }
}

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)

  // 1. Register dictionaries
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-nexus-brain-indicator: dictionaries')

  // 2. Register right sidebar tab type
  ctx.effect(() => ctx.sidebarRightTabs.register(nexusPlanDefinition(t)), 'ui-nexus-brain-indicator: sidebar tab type')

  // 3. Register right sidebar tab body and title
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: NEXUS_PLAN_ID,
    locale: NS,
    inject: (sessionId: SessionId) => ({
      getActivePlan: () => extractBrainFromSession(ctx, sessionId).planData,
    }),
  }, NexusPlanTab)), 'ui-nexus-brain-indicator: plan tab body')

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: NEXUS_PLAN_ID,
  }, NexusPlanTitle)), 'ui-nexus-brain-indicator: plan tab title')

  // 4. Register Header Brain Status Chip
  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'nexus-brain-status',
    order: -5,
    locale: NS,
    inject: (_sessionId: SessionId): NexusBrainChipInjected => ({
      getBrainState: sid => extractBrainFromSession(ctx, sid).state,
      openPlanTab: () => {
        try {
          ctx.sidebarRight.openTab('nexus-plan')
        } catch {
          // ignore navigation error if sidebar unmounted
        }
      },
      subscribeBrainState: (sid, callback) => {
        try {
          const bound = ctx.uiConversation.binding(sid)
          const chatSource = bound.target('chat')
          return chatSource.subscribe(callback)
        } catch {
          return () => {}
        }
      },
    }),
  }, NexusBrainStatusChip)), 'ui-nexus-brain-indicator: header status chip')
}
