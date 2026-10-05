// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, fireEvent, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { NexusSetupPhases } from '@deepseek-ai/dsh-client-ui-nexus-setup/client'
import { NexusBrainStatusChip, type NexusBrainStatusChipProps } from '../src/client/NexusBrainStatusChip.tsx'
import { NexusPlanTab } from '../src/client/plan-tab/NexusPlanTab.tsx'
import { NexusPlanTitle } from '../src/client/plan-tab/NexusPlanTitle.tsx'
import type { TurnBrainState } from '../src/client/brain-status.ts'
import { en } from '../src/client/locales.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

afterEach(() => {
  cleanup()
})

const SESSION = 's-123' as SessionId

const translate = (key: keyof typeof en, params?: Record<string, string | number>) => {
  let val = en[key] || key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(`{${k}}`, String(v))
    }
  }
  return val
}

interface ChipBench {
  /** Setup phases as the `nexusSetup` service publishes them; null = service absent. */
  phases: ReturnType<typeof createSnapshotStore<NexusSetupPhases | null>>
  checkWorkspace: ReturnType<typeof vi.fn>
  openSetup: ReturnType<typeof vi.fn>
  openPlanTab: ReturnType<typeof vi.fn>
  /** Publish a new turn context, as a model turn would. */
  setTurn: (turn: TurnBrainState | null) => void
  chip: () => HTMLElement
}

/** Render the chip over a driven phases source and a driven turn-context source. */
function bench(options: {
  cwd?: string | undefined
  phases?: NexusSetupPhases | null
  turn?: TurnBrainState | null
  openSetupResult?: boolean
}): ChipBench {
  const cwd = 'cwd' in options ? options.cwd : '/home/me/shop'
  const phases = createSnapshotStore<NexusSetupPhases | null>(options.phases === undefined ? {} : options.phases)
  let turn = options.turn ?? null
  const turnListeners = new Set<() => void>()
  const checkWorkspace = vi.fn()
  const openSetup = vi.fn(() => options.openSetupResult ?? true)
  const openPlanTab = vi.fn()
  const sessions = { byId: cwd === undefined ? {} : { [SESSION]: { id: SESSION, cwd } } }
  const props = (): NexusBrainStatusChipProps => ({
    sessionId: SESSION,
    t: translate,
    useSessions: <T,>(select: (snapshot: typeof sessions) => T): T => select(sessions),
    useNexusSetupPhases: <T,>(select: (value: NexusSetupPhases | null) => T): T => select(phases.getSnapshot()),
    hooks: { nexusSetupPhases: phases },
    getBrainState: () => turn,
    subscribeBrainState: (_sid: SessionId, callback: () => void) => {
      turnListeners.add(callback)
      return () => { turnListeners.delete(callback) }
    },
    checkWorkspace,
    openSetup,
    openPlanTab,
  } as unknown as NexusBrainStatusChipProps)
  const view = render(<NexusBrainStatusChip {...props()} />)
  phases.subscribe(() => { view.rerender(<NexusBrainStatusChip {...props()} />) })
  return {
    phases,
    checkWorkspace,
    openSetup,
    openPlanTab,
    setTurn: (next) => {
      turn = next
      act(() => { for (const listener of turnListeners) listener() })
    },
    chip: () => view.container.querySelector<HTMLElement>('[data-brain-status]')!,
  }
}

describe('Nexus Brain UI Indicators', () => {
  describe('NexusBrainStatusChip', () => {
    it('asks for the folder status on mount and shows a quiet spinner while it is unknown', () => {
      const { chip, checkWorkspace } = bench({ phases: {} })
      expect(checkWorkspace).toHaveBeenCalledWith('/home/me/shop')
      expect(chip().dataset.brainStatus).toBe('checking')
      expect(chip().querySelector('[data-state="ongoing"]')).not.toBeNull()
      expect(chip().textContent).toBe(en['chip.name'])
      expect(chip().textContent).not.toContain(en['chip.synced'])
    })

    it('does not claim to be synced for a folder that is not a NEXUS project, and opens setup on click', () => {
      const { chip, openSetup } = bench({ phases: { '/home/me/shop': 'needs-setup' } })
      expect(chip().dataset.brainStatus).toBe('not-project')
      expect(chip().textContent).toContain(en['chip.notProject'])
      expect(chip().textContent).not.toContain(en['chip.synced'])
      fireEvent.click(chip())
      expect(openSetup).toHaveBeenCalledWith(SESSION, '/home/me/shop')
      expect(screen.queryByText(en['popover.title'])).toBeNull()
    })

    it('explains a missing folder in the overview instead of offering setup', () => {
      const { chip, openSetup } = bench({ phases: { '/home/me/shop': 'missing' } })
      expect(chip().textContent).toContain(en['chip.notProject'])
      fireEvent.click(chip())
      expect(openSetup).not.toHaveBeenCalled()
      expect(screen.getByText(en['popover.title'])).toBeTruthy()
      expect(screen.getAllByText(en['chip.tooltip.missing']).length).toBeGreaterThan(0)
    })

    it('falls back to the overview when setup cannot be opened', () => {
      const { chip, openSetup } = bench({ phases: { '/home/me/shop': 'dismissed' }, openSetupResult: false })
      fireEvent.click(chip())
      expect(openSetup).toHaveBeenCalledOnce()
      expect(screen.getByText(en['popover.title'])).toBeTruthy()
    })

    it('reports an unknown status when no setup service or no folder is available', () => {
      expect(bench({ phases: null }).chip().textContent).toContain(en['chip.unknown'])
      cleanup()
      const noFolder = bench({ cwd: undefined })
      expect(noFolder.chip().dataset.brainStatus).toBe('unknown')
      expect(noFolder.checkWorkspace).not.toHaveBeenCalled()
      cleanup()
      expect(bench({ phases: { '/home/me/shop': 'unavailable' } }).chip().dataset.brainStatus).toBe('unknown')
    })

    it('refreshes to "ready" the moment setup succeeds, without waiting for a turn', () => {
      const { chip, phases } = bench({ phases: { '/home/me/shop': 'needs-setup' } })
      expect(chip().dataset.brainStatus).toBe('not-project')
      act(() => { phases.set({ '/home/me/shop': 'setting-up' }) })
      expect(chip().dataset.brainStatus).toBe('not-project')
      act(() => { phases.set({ '/home/me/shop': 'ready' }) })
      expect(chip().dataset.brainStatus).toBe('ready')
      expect(chip().textContent).toContain(en['chip.ready'])
      fireEvent.click(chip())
      expect(screen.getAllByText(en['chip.tooltip.ready']).length).toBeGreaterThan(0)
      expect(screen.queryByText(en['popover.openPlan'])).toBeNull()
    })

    it('switches to the turn context once a turn carries it, and keeps its plan and vitals', () => {
      const { chip, setTurn, openPlanTab } = bench({ phases: { '/home/me/shop': 'ready' } })
      expect(chip().dataset.brainStatus).toBe('ready')
      setTurn({
        status: 'synced',
        planId: '42',
        planStatus: 'in_progress',
        planNextStep: 'Implement test suite',
        branch: 'main',
        dirty: false,
        testsSummary: '10 passed',
      })
      expect(chip().dataset.brainStatus).toBe('synced')
      expect(chip().textContent).toContain('#42')

      fireEvent.click(chip())
      expect(screen.getByText(en['popover.title'])).toBeTruthy()
      expect(screen.getByText('Next: Implement test suite')).toBeTruthy()
      expect(screen.getByText(`main · ${en['popover.clean']}`)).toBeTruthy()
      expect(screen.getByText('10 passed')).toBeTruthy()

      fireEvent.click(screen.getByText(en['popover.openPlan']))
      expect(openPlanTab).toHaveBeenCalledOnce()
      expect(screen.queryByText(en['popover.title'])).toBeNull()
    })

    it('trusts the turn context over a stale "not a project" read', () => {
      const { chip } = bench({
        phases: { '/home/me/shop': 'needs-setup' },
        turn: { status: 'drift', branch: 'feat/test', dirty: true },
      })
      expect(chip().dataset.brainStatus).toBe('drift')
      expect(chip().querySelector('[data-state="warning"]')).not.toBeNull()
      expect(chip().textContent).toContain(en['chip.drift'])
      fireEvent.click(chip())
      expect(screen.getByText(en['popover.noPlan'])).toBeTruthy()
      expect(screen.getByText(`feat/test · ${en['popover.dirty']}`)).toBeTruthy()
    })

    it('describes the check in the overview while the status is being read', () => {
      const { chip } = bench({ phases: { '/home/me/shop': 'checking' } })
      fireEvent.click(chip())
      expect(screen.getByText(en['chip.tooltip.checking'], { selector: 'span' })).toBeTruthy()
    })

    it('shows a plan from the turn even when its status was not reported', () => {
      const { chip } = bench({ turn: { status: 'synced', planId: '9' } })
      fireEvent.click(chip())
      expect(screen.getByText('#9 (in_progress)')).toBeTruthy()
    })

    it('closes the overview on an outside click', () => {
      const { chip } = bench({ phases: { '/home/me/shop': 'ready' } })
      fireEvent.click(chip())
      fireEvent.mouseDown(chip())
      expect(screen.getByText(en['popover.title'])).toBeTruthy()
      fireEvent.mouseDown(document.body)
      expect(screen.queryByText(en['popover.title'])).toBeNull()
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

    it('renders the tab title with its glyph', () => {
      const { container } = render(
        <NexusPlanTitle {...({ useTabInfo: () => ({ tab: { title: 'Nexus Plan' } }) } as unknown as Parameters<typeof NexusPlanTitle>[0])} />,
      )
      expect(container.textContent).toBe('Nexus Plan')
      expect(container.querySelector('svg')).not.toBeNull()
    })

    it('untick a done step locally even without a tick callback, and shows an empty checklist', () => {
      const plan = { id: '5', status: 'todo', steps: [{ text: 'Done already', done: true }] }
      const view = render(
        <NexusPlanTab {...({ t: translate, getActivePlan: () => plan } as unknown as Parameters<typeof NexusPlanTab>[0])} />,
      )
      expect(view.container.textContent).toContain('Plan #5')
      fireEvent.click(view.container.querySelector('li')!)
      expect(view.container.textContent).toContain('0 / 1 (0%)')
      cleanup()
      const emptyPlan = { ...plan, steps: [] }
      const empty = render(
        <NexusPlanTab {...({ t: translate, getActivePlan: () => emptyPlan } as unknown as Parameters<typeof NexusPlanTab>[0])} />,
      )
      expect(empty.container.textContent).toContain('0 / 0 (0%)')
      expect(empty.container.textContent).toContain(en['tab.noSteps'])
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
