import { toolHandler } from './tool-call-context.js'

export const requestPersonalDataConsentTool = toolHandler(['request_personal_data_consent'], (_call, ctx) => {
  // The card is the app's: the answer carries it whatever the model writes next (ADR-0091).
  if (ctx.consent) {
    ctx.answer({ ok: true, alreadyGranted: true, note: 'Die Einwilligung liegt vor. Bereite die persönlichen Angaben als Entwürfe vor.' })
    return
  }
  ctx.turn.consentRequested = true
  ctx.answer({ ok: true, shown: true, note: 'Die App zeigt die Einwilligung unter deiner Antwort. Sag dem Nutzer in einem Satz, dass er dort „Erlauben“ wählen oder die Angaben selbst in der Maske eintragen kann. Danach geht das Gespräch von selbst weiter.' })
})
