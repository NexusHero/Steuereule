import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import {
  getBusinessControllerEBilanzFileUrl,
  getBusinessControllerGobdUrl,
  useBusinessControllerEBilanz,
  useBusinessControllerProcedureDoc,
  useBusinessControllerSaveProcedureDoc,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, Note, Section } from './BusinessFrame'
import { personParams, type ApiProblem } from './businessKit'
import { downloadBusinessFile } from './businessDownload'
import { attempt, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

/** Exports: the GoBD data export for an audit, the Verfahrensdokumentation, and the E-Bilanz data set (not sent). */
export function ExportPage({ taxYear, person, business = 1, onBack, onOpenPage }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const doc = useBusinessControllerProcedureDoc(taxYear, params)
  const saveDoc = useBusinessControllerSaveProcedureDoc()
  const bilanz = useBusinessControllerEBilanz(taxYear, params)
  const refresh = useRefreshBusiness(taxYear)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [values, setValues] = useState<Readonly<Record<string, string>>>({})

  async function download(url: string, name: string) {
    setProblem(null)
    const result = await downloadBusinessFile(url, name)
    if (!result.ok) setProblem(result.problem)
  }

  async function saveValues() {
    setProblem(null)
    const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ''))
    const result = await attempt(() => saveDoc.mutateAsync({ jahr: taxYear, data: { values: filled }, ...(params ? { params } : {}) }))
    if (result.ok) {
      setValues({})
      refresh()
    } else setProblem(result.problem)
  }

  const docData = doc.data?.status === 200 ? doc.data.data : null
  const xbrl = bilanz.data?.status === 200 ? bilanz.data.data : null
  return (
    <BusinessFrame title={tr('business.seite.export')} onBack={onBack} testID="export-seite">
      {problem?.status === 402 ? (
        <Section testID="export-nicht-freigeschaltet">
          <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.export.nichtFreigeschaltet', { year: taxYear })}</Text>
          <Button onPress={() => onOpenPage('freischalten')} testID="export-freischalten">
            {tr('business.freischalten.knopf')}
          </Button>
        </Section>
      ) : problem !== null ? (
        <Note tone="error" testID={problem.code === 'BOOK_INTEGRITY_BROKEN' ? 'buch-integritaet-fehler' : 'business-speichern-fehler'}>
          {problem.message ?? tr('business.speichernFehler')}
        </Note>
      ) : null}

      <Section title={tr('business.export.gobd')}>
        <Note>{tr('business.export.gobdText')}</Note>
        <Button onPress={() => void download(getBusinessControllerGobdUrl(taxYear, params), `datenueberlassung-${taxYear}.zip`)} testID="gobd-export">
          {tr('business.export.gobdKnopf')}
        </Button>
      </Section>

      <Section title={tr('business.export.verfahren')} testID="export-verfahren">
        {docData === null ? <Note>{tr('business.laden')}</Note> : null}
        {docData !== null && docData.missing.length === 0 ? <Note testID="verfahren-vollstaendig">{tr('business.export.verfahrenVollstaendig')}</Note> : null}
        {docData?.missing.map((key) => (
          <Feld key={key} label={tr(`business.export.platzhalter.${key}`, { defaultValue: key })}>
            <Input value={values[key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [key]: v }))} accessibilityLabel={tr(`business.export.platzhalter.${key}`, { defaultValue: key })} testID={`verfahren-${key}`} />
          </Feld>
        ))}
        {docData !== null && docData.missing.length > 0 ? (
          <Button variant="ghost" onPress={() => void saveValues()} testID="verfahren-speichern">
            {tr('business.export.verfahrenSpeichern')}
          </Button>
        ) : null}
      </Section>

      <Section title={tr('business.export.ebilanz')} testID="export-ebilanz">
        <Text style={{ ...t.type.bodyStrong, color: t.color.tinte }} testID="ebilanz-nicht-uebermittelt">
          {tr('business.export.ebilanzNichtUebermittelt')}
        </Text>
        {xbrl?.note ? <Note>{xbrl.note}</Note> : null}
        <View style={{ marginTop: t.space.s2 }}>
          <Button variant="ghost" disabled={xbrl === null} onPress={() => void download(getBusinessControllerEBilanzFileUrl(taxYear, params), `e-bilanz-${taxYear}.xbrl`)} testID="ebilanz-datei">
            {tr('business.export.ebilanzDatei')}
          </Button>
        </View>
      </Section>
    </BusinessFrame>
  )
}
