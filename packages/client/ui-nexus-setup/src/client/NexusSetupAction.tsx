import { useEffect, useState } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NexusSetupPhase, NexusSetupPhases } from './controller.ts'
import type { NS } from './locales.ts'
import css from './NexusSetupAction.module.css'

/** Browser operations and state injected into the Session-header contribution. */
export interface NexusSetupActionInjected {
  hooks: {
    nexusSetupPhases: ObservableSnapshot<NexusSetupPhases>
  }
  /** Read one folder's status (once per page life). */
  check: (path: string) => Promise<void>
  /** Scaffold one folder; resolves true once it is a NEXUS project. */
  setUp: (path: string) => Promise<boolean>
  /** Hide the prompt for one folder until reload. */
  dismiss: (path: string) => void
}

/** Full props for the Session-header setup prompt. */
export type NexusSetupActionProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<NexusSetupActionInjected>

/** Phases in which the folder still needs setup and the prompt is offered. */
const OFFERED: ReadonlySet<NexusSetupPhase | undefined> = new Set(['needs-setup', 'setting-up', 'failed'])

/**
 * Offer one-click NEXUS setup for the session's folder when it has no `.nexus/`.
 * @param props - workspace state, per-folder phases, and setup operations.
 * @returns the header button and its dialog, or null when nothing is offered.
 */
export function NexusSetupAction(props: NexusSetupActionProps): React.JSX.Element | null {
  const { sessionId, useSessions, useNexusSetupPhases, check, t } = props
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const phase = useNexusSetupPhases(phases => cwd === undefined ? undefined : phases[cwd])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (cwd !== undefined && cwd !== '') void check(cwd)
  }, [cwd, check])

  if (cwd === undefined || cwd === '' || !OFFERED.has(phase)) return null
  const working = phase === 'setting-up'
  const close = (): void => {
    if (!working) setOpen(false)
  }
  const later = (): void => {
    if (working) return
    setOpen(false)
    props.dismiss(cwd)
  }
  const confirm = async (): Promise<void> => {
    if (await props.setUp(cwd)) setOpen(false)
  }

  return (
    <>
      <Tooltip label={t('action.tooltip')} side="bottom">
        <Button variant="outline" size="sm" onClick={() => { setOpen(true) }}>{t('action.label')}</Button>
      </Tooltip>
      <Modal
        open={open}
        onClose={close}
        title={t('dialog.title')}
        closeLabel={t('dialog.close')}
        footer={(
          <>
            <Button variant="ghost" disabled={working} onClick={later}>{t('dialog.later')}</Button>
            <Button variant="primary" disabled={working} aria-busy={working} onClick={() => { void confirm() }}>
              {working ? t('dialog.working') : t('dialog.confirm')}
            </Button>
          </>
        )}
      >
        <p className={css.body}>{t('dialog.body')}</p>
        <p className={css.folder}>{t('dialog.folder', { path: cwd })}</p>
        {phase === 'failed' && <p className={css.error} role="alert">{t('dialog.failed')}</p>}
      </Modal>
    </>
  )
}
