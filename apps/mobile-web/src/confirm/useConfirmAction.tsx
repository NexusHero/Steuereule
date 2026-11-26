import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@steuereule/ui'
import { APP_NS } from '../i18n/resources'
import { DESTRUCTIVE_ACTIONS, type DestructiveActionId } from './destructiveActions'

interface Pending {
  readonly values: Readonly<Record<string, string | number>>
  readonly run: () => void
}

export interface ConfirmAction {
  /** Opens the dialog; `run` happens only on „confirm“. `values` fill the copy (name, year …). */
  readonly ask: (run: () => void, values?: Readonly<Record<string, string | number>>) => void
  /** Render this once in the screen; it is null while nothing is asked. */
  readonly dialog: ReactNode
}

/**
 * The confirmation of one registered destructive or final action (WEB-37, WEB-38). The copy comes from
 * `rueckfrage.<id>` and says what is lost or what becomes final; the dialog closes before `run` starts, so a
 * single-flight guard around `run` still sees one tap.
 */
export function useConfirmAction(id: DestructiveActionId): ConfirmAction {
  const { t } = useTranslation(APP_NS)
  const [pending, setPending] = useState<Pending | null>(null)
  const ask = useCallback((run: () => void, values: Readonly<Record<string, string | number>> = {}) => setPending({ run, values }), [])
  const action = DESTRUCTIVE_ACTIONS[id]
  const dialog =
    pending === null ? null : (
      <ConfirmDialog
        testID={`rueckfrage-${id}`}
        tone={action.tone}
        title={t(`rueckfrage.${id}.titel`, pending.values)}
        body={t(`rueckfrage.${id}.text`, pending.values)}
        confirmLabel={t(`rueckfrage.${id}.bestaetigen`, pending.values)}
        cancelLabel={t('rueckfrage.abbrechen')}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          setPending(null)
          pending.run()
        }}
      />
    )
  return { ask, dialog }
}
