// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent } from '@testing-library/react'
import { NexusBrainStatusChip } from '../src/client/NexusBrainStatusChip.tsx'
import { NexusPlanTab } from '../src/client/plan-tab/NexusPlanTab.tsx'
import { en } from '../src/client/locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

afterEach(() => {
  cleanup()
})

const translate = (key: keyof typeof en, params?: Record<string, string | number>) => {
  let val = en[key] || key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(`{{${k}}}`, String(v))
    }
  }
  return val
}

describe('Nexus Brain UI Indicators', () => {
  describe('NexusBrainStatusChip', () => {
    it('renders synced status and plan badge', () => {
      const openPlanTab = vi.fn()
      const getBrainState = vi.fn().mockReturnValue({
        status: 'synced',
        planId: '42',
        planStatus: 'in_progress',
        planNextStep: 'Implement test suite',
        branch: 'main',
        dirty: false,
        testsSummary: '10 passed',
      })

      const { container, getByText } = render(
        <NexusBrainStatusChip
          {...({
            sessionId: 's-123' as SessionId,
            t: translate,
            getBrainState,
            openPlanTab,
          } as unknown as Parameters<typeof NexusBrainStatusChip>[0])}
        />,
      )

      expect(container.textContent).toContain('🧠 Nexus')
      expect(container.textContent).toContain('#42')

      // Clicking opens popover
      const button = container.querySelector('button')!
      fireEvent.click(button)

      expect(container.textContent).toContain('NEXUS Brain Overview')
      expect(container.textContent).toContain('Implement test suite')
      expect(container.textContent).toContain('main • ✅ Clean')

      // Clicking Open Plan Tab button calls openPlanTab
      const openBtn = getByText('📋 Open Nexus Plan Tab')
      fireEvent.click(openBtn)
      expect(openPlanTab).toHaveBeenCalledOnce()
    })

    it('renders drift status when working tree is dirty', () => {
      const getBrainState = vi.fn().mockReturnValue({
        status: 'drift',
        planId: '10',
        branch: 'feat/test',
        dirty: true,
      })

      const { container } = render(
        <NexusBrainStatusChip
          {...({
            sessionId: 's-123' as SessionId,
            t: translate,
            getBrainState,
            openPlanTab: vi.fn(),
          } as unknown as Parameters<typeof NexusBrainStatusChip>[0])}
        />,
      )

      expect(container.querySelector('[class*="statusDrift"]')).toBeDefined()
    })
  })

  describe('NexusPlanTab', () => {
    it('renders active plan checklist and progress bar', () => {
      const tickStep = vi.fn()
      const getActivePlan = vi.fn().mockReturnValue({
        id: '19',
        title: 'Nexus Brain UI Indicators',
        status: 'in_progress',
        nextStep: 'Create UI indicators',
        steps: [
          { text: 'Create Status Chip', done: true },
          { text: 'Create Grounding Inspector', done: true },
          { text: 'Create Right Sidebar Plan Tab', done: false },
        ],
      })

      const { container } = render(
        <NexusPlanTab
          {...({
            t: translate,
            getActivePlan,
            tickStep,
          } as unknown as Parameters<typeof NexusPlanTab>[0])}
        />,
      )

      expect(container.textContent).toContain('Nexus Brain UI Indicators')
      expect(container.textContent).toContain('2 / 3 (67%)')
      expect(container.textContent).toContain('Create UI indicators')
      expect(container.textContent).toContain('Create Right Sidebar Plan Tab')

      // Clicking an uncompleted step ticks it
      const uncompletedItem = container.querySelectorAll('li')[2]
      expect(uncompletedItem).toBeDefined()
      if (uncompletedItem) {
        fireEvent.click(uncompletedItem)
        expect(tickStep).toHaveBeenCalledWith(2, true)
      }
    })

    it('renders empty state when no active plan is present', () => {
      const getActivePlan = vi.fn().mockReturnValue(null)

      const { container } = render(
        <NexusPlanTab
          {...({
            t: translate,
            getActivePlan,
          } as unknown as Parameters<typeof NexusPlanTab>[0])}
        />,
      )

      expect(container.textContent).toContain('No active plan found for this session.')
    })
  })
})
