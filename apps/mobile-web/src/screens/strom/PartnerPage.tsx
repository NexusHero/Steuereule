// The Strom's partner step (Echtdatentest 18.11.2026): a married user names Person B, so the masks
// after it can be recorded for B — the rest of B's details stay in „Angaben für die Erklärung“.
import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { isGermanDate } from '@steuereule/core'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import { getLinkControllerGetQueryKey, useLinkControllerGet, useLinkControllerUpdatePersonB } from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { germanToIso, isoToGerman } from '../master-data/masterDataMapping'
import { useApiFailureMessage } from '../../net/apiFailure'
import { InlineLoadFailure } from '../shared/InlineLoadFailure'
import { makeStyles } from './StromPages'

export function PartnerPage({ taxYear, onSaved }: { readonly taxYear: number; readonly onSaved: () => void }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const linkQuery = useLinkControllerGet(taxYear)
  // NM-15: the fields start from what is stored — never empty fields whose save rewrites the stored name.
  if (linkQuery.isPending) return <Text style={styles.help}>{tr('strom.laden')}</Text>
  if (linkQuery.isError) {
    return <InlineLoadFailure what={tr('strom.partnerSchritt.ladefehler')} error={linkQuery.error} onRetry={() => void linkQuery.refetch()} testID="strom-partner-ladefehler" />
  }
  return <PartnerForm taxYear={taxYear} personB={linkQuery.data.data.personB ?? null} onSaved={onSaved} />
}

type PersonB = { readonly firstName?: string | null; readonly lastName?: string | null; readonly geburtsdatum?: string | null }

function PartnerForm({ taxYear, personB, onSaved }: { readonly taxYear: number; readonly personB: PersonB | null; readonly onSaved: () => void }) {
  const t = useTheme()
  const styles = makeStyles(t)
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const failureMessage = useApiFailureMessage()
  const updatePersonB = useLinkControllerUpdatePersonB()
  const [failure, setFailure] = useState<unknown>(null)
  const [firstName, setFirstName] = useState(personB?.firstName ?? '')
  const [lastName, setLastName] = useState(personB?.lastName ?? '')
  const [birthDate, setBirthDate] = useState(isoToGerman(personB?.geburtsdatum ?? null))
  const [problem, setProblem] = useState<'fehlt' | 'datumFalsch' | 'fehler' | null>(null)

  function save() {
    if (firstName.trim() === '' || birthDate.trim() === '') return setProblem('fehlt')
    if (!isGermanDate(birthDate)) return setProblem('datumFalsch')
    setProblem(null)
    // Only what this page asks: the other fields of B (tax id, occupation, religion) stay as they are.
    updatePersonB.mutate(
      { jahr: taxYear, data: { firstName: firstName.trim(), lastName: lastName.trim() || null, geburtsdatum: germanToIso(birthDate) } },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getLinkControllerGetQueryKey(taxYear) })
          onSaved()
        },
        onError: (error) => {
          // NM-07: the reason, not one text for every status.
          setFailure(error)
          setProblem('fehler')
        },
      },
    )
  }

  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">
        {tr('strom.partnerSchritt.titel')}
      </Text>
      <Text style={styles.help}>{tr('strom.partnerSchritt.hilfe')}</Text>
      <Feld label={tr('strom.partnerSchritt.vorname')}>
        <Input value={firstName} onChange={setFirstName} accessibilityLabel={tr('strom.partnerSchritt.vorname')} testID="strom-partner-vorname" />
      </Feld>
      <Feld label={tr('strom.partnerSchritt.nachname')}>
        <Input value={lastName} onChange={setLastName} accessibilityLabel={tr('strom.partnerSchritt.nachname')} testID="strom-partner-nachname" />
      </Feld>
      <Feld label={tr('strom.partnerSchritt.geburtsdatum')}>
        <Input value={birthDate} onChange={setBirthDate} placeholder="TT.MM.JJJJ" accessibilityLabel={tr('strom.partnerSchritt.geburtsdatum')} testID="strom-partner-geburtsdatum" />
      </Feld>
      {problem !== null ? (
        <Text style={styles.warn} accessibilityRole="alert" testID="strom-partner-fehler">
          {problem === 'fehler' && failure !== null ? `${tr('apiFehler.saveHeading')} ${failureMessage(failure)} ${tr('apiFehler.saveKept')}` : tr(`strom.partnerSchritt.${problem}`)}
        </Text>
      ) : null}
      <Button onPress={save} disabled={updatePersonB.isPending} testID="strom-weiter">
        {tr('strom.weiter')}
      </Button>
    </View>
  )
}
