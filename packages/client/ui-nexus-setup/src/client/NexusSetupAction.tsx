import { useEffect } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NexusSetupPhase, NexusSetupPhases } from './controller.ts'
import type { NS } from './locales.ts'
import css from './NexusSetupAction.module.css'

/** Browser operations and state injected into the Session-header contribution. */
export interface NexusSetupActionInjected {
  hooks: {
    nexusSetupPhases: ObservableSnapshot<NexusSetupPhases>
    /** Session whose setup dialog is open, shared with other plugins through the `nexusSetup` service. */
    nexusSetupDialog: ObservableSnapshot<SessionId | null>
  }
  /** Read one folder's status (once per page life). */
  check: (path: string) => Promise<void>
  /** Scaffold one folder; resolves true once it is a NEXUS project. */
  setUp: (path: string) => Promise<boolean>
  /** Hide the prompt for one folder until reload. */
  dismiss: (path: string) => void
  /** Open the dialog in this Session's header. */
  openDialog: (sessionId: SessionId, path: string) => void
  /** Close the dialog when it belongs to this Session. */
  closeDialog: (sessionId: SessionId) => void
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
  const { sessionId, useSessions, useNexusSetupPhases, useNexusSetupDialog, check, t } = props
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const phase = useNexusSetupPhases(phases => cwd === undefined ? undefined : phases[cwd])
  // The dialog state lives in the controller so the brain status chip can open it too.
  const open = useNexusSetupDialog(target => target === sessionId)

  useEffect(() => {
    if (cwd !== undefined && cwd !== '') void check(cwd)
  }, [cwd, check])

  if (cwd === undefined || cwd === '' || !OFFERED.has(phase)) return null
  const working = phase === 'setting-up'
  const close = (): void => {
    if (!working) props.closeDialog(sessionId)
  }
  const later = (): void => {
    /* v8 ignore next -- "Not now" is disabled while setup runs; the guard only backs that up. */
    if (working) return
    props.closeDialog(sessionId)
    props.dismiss(cwd)
  }
  const confirm = async (): Promise<void> => {
    if (await props.setUp(cwd)) props.closeDialog(sessionId)
  }

  return (
    <>
      <Tooltip label={t('action.tooltip')} side="bottom">
        <Button variant="outline" size="sm" onClick={() => { props.openDialog(sessionId, cwd) }}>{t('action.label')}</Button>
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
