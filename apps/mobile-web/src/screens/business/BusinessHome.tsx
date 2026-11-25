import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import {
  useBusinessControllerAddBusiness,
  useBusinessControllerBank,
  useBusinessControllerBook,
  useBusinessControllerBusinesses,
  useBusinessControllerClosing,
  useBusinessControllerProfile,
  useLinkControllerGet,
} from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Note, ProblemNote, Section } from './BusinessFrame'
import { personParams, plainEuro, problemOf, type ApiProblem, type Person } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness, useSingleFlight } from './useBusiness'
import type { BusinessPage, BusinessPageProps } from './BusinessScreen'

interface LinkSpec {
  readonly page: BusinessPage
  readonly show: (facts: { readonly gewerbe: boolean; readonly euer: boolean }) => boolean
}

const LINKS: readonly LinkSpec[] = [
  { page: 'profil', show: () => true },
  { page: 'buch', show: () => true },
  { page: 'erfassung', show: (f) => f.euer },
  { page: 'bank', show: () => true },
  { page: 'anlagen', show: () => true },
  { page: 'firmenwagen', show: () => true },
  { page: 'lohn', show: () => true },
  { page: 'abschluss', show: () => true },
  { page: 'umsatzsteuer', show: () => true },
  { page: 'voranmeldungen', show: () => true },
  { page: 'gewerbesteuer', show: (f) => f.gewerbe },
  { page: 'verluste', show: () => true },
  { page: 'sondertarife', show: () => true },
  { page: 'elster', show: () => true },
  { page: 'export', show: () => true },
  { page: 'freischalten', show: () => true },
]

/** The area's first screen: a short status, what is open, and the way into each page. Roughly one phone screen. */
export function BusinessHome({
  taxYear,
  person,
  business = 1,
  onBack,
  onOpenPage,
  onChangePerson,
  onChangeBusiness,
}: BusinessPageProps & { readonly onChangePerson?: (person: Person) => void; readonly onChangeBusiness?: (business: number) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const profile = useBusinessControllerProfile(taxYear, params)
  const book = useBusinessControllerBook(taxYear, params, { query: { enabled: profile.isSuccess } })
  const closing = useBusinessControllerClosing(taxYear, params, { query: { enabled: profile.isSuccess, retry: false } })
  const bank = useBusinessControllerBank(taxYear, params, { query: { enabled: profile.isSuccess } })
  // A joint return keeps one business per spouse (`?person=`): the switch exists only for such a couple.
  const household = useLinkControllerGet(taxYear, { query: { enabled: onChangePerson !== undefined } })
  const couple = household.data !== undefined && household.data.data.filingType === 'zusammen' && !household.data.data.personBHasOwnAccount
  const partnerName = household.data?.data.personB?.firstName?.trim() || null
  // Several businesses of one person (ADR-0101 §22): a Freiberuf beside a Gewerbe, two Gewerbebetriebe.
  const businesses = useBusinessControllerBusinesses(taxYear, personParams(person), { query: { enabled: onChangeBusiness !== undefined && profile.isSuccess } })
  const add = useBusinessControllerAddBusiness()
  const refresh = useRefreshBusiness(taxYear)
  const [newName, setNewName] = useState<string | null>(null)
  const [addProblem, setAddProblem] = useState<ApiProblem | null>(null)
  const flight = useSingleFlight()
  const problem = queryProblem(profile)
  const title = tr('business.titel', { year: taxYear })

  if (profile.isPending || problem !== null || profile.data === undefined) {
    return (
      <BusinessFrame title={title} onBack={onBack}>
        <BusinessQueryState pending={profile.isPending} problem={problem} onRetry={() => void profile.refetch()} />
      </BusinessFrame>
    )
  }

  const p = profile.data.data
  const entries = book.data?.data ?? null
  const openBank = bank.data?.data.filter((x) => x.status === 'offen').length ?? 0
  const brokenChain = entries !== null && !entries.integrity.ok
  const kind = p.confirmedKind === null ? tr('business.status.nichtBestaetigt') : tr(`business.art.${p.confirmedKind}`)
  const mode = p.mode === 'euer' ? tr('business.modus.euer') : tr('business.modus.bilanz')

  const open: { readonly key: string; readonly text: string; readonly page: BusinessPage; readonly tone?: 'error' }[] = []
  if (brokenChain) open.push({ key: 'kette', text: tr('business.offen.kette'), page: 'buch', tone: 'error' })
  if (p.confirmedKind === null) open.push({ key: 'art', text: tr('business.offen.art'), page: 'profil' })
  if (entries !== null && entries.entries.length === 0) open.push({ key: 'buchungen', text: tr('business.offen.keineBuchungen'), page: p.mode === 'euer' ? 'erfassung' : 'buch' })
  if (openBank > 0) open.push({ key: 'bank', text: tr('business.offen.bank', { count: openBank }), page: 'bank' })

  // The one number of the area: the year's profit (or loss) as the book stands, in euros.
  const closed = closing.data?.data ?? null
  // NC-16: a link to a business that is not in the person's list (`?betrieb=99`) opens no phantom profile.
  const knownBusinesses = businesses.data?.data
  const unknownBusiness = business > 1 && knownBusinesses !== undefined && !knownBusinesses.some((b) => b.business === business)
  if (unknownBusiness && onChangeBusiness) {
    return (
      <BusinessFrame title={title} onBack={onBack} testID="selbststaendig-uebersicht">
        <Note tone="error" testID="business-betrieb-unbekannt">
          {tr('business.betriebe.unbekannt', { nummer: business })}
        </Note>
        <Button onPress={() => onChangeBusiness(1)} testID="business-betrieb-zum-ersten">
          {tr('business.betriebe.zumErsten')}
        </Button>
      </BusinessFrame>
    )
  }
  const profitEur = closed === null ? null : closed.euer !== null ? closed.euer.profit.profitEur : closed.bilanz !== null ? closed.bilanz.incomeStatement.profit / 100 : null
  const facts = { gewerbe: p.confirmedKind !== 'freiberuf', euer: p.mode === 'euer' }
  return (
    <BusinessFrame title={title} onBack={onBack} testID="selbststaendig-uebersicht">
      {onChangePerson && household.isError ? <ProblemNote problem={problemOf(household.error)} testID="business-person-fehler" /> : null}
      {couple && onChangePerson ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginBottom: t.space.s3 }} testID="business-person">
          <Choice selected={person === 'A'} onPress={() => onChangePerson('A')} testID="business-person-A">
            {tr('business.person.A')}
          </Choice>
          <Choice selected={person === 'B'} onPress={() => onChangePerson('B')} testID="business-person-B">
            {partnerName ?? tr('business.person.B')}
          </Choice>
        </View>
      ) : null}
      {onChangeBusiness ? (
        <Section title={tr('business.betriebe.titel')} testID="business-betriebe">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            {(knownBusinesses ?? [{ business: 1, name: p.name, kind: p.confirmedKind, mode: p.mode }]).map((b) => (
              <Choice key={b.business} selected={b.business === business} onPress={() => onChangeBusiness(b.business)} testID={`business-betrieb-${b.business}`}>
                {b.name?.trim() || tr('business.betriebe.ohneName', { nummer: b.business })}
              </Choice>
            ))}
            {newName === null ? (
              <Choice selected={false} onPress={() => setNewName('')} testID="business-betrieb-neu">
                {tr('business.betriebe.neu')}
              </Choice>
            ) : null}
          </View>
          {/* NC-17: a failed list says so; the further businesses are not silently gone. */}
          {businesses.isError ? (
            <>
              <ProblemNote problem={problemOf(businesses.error)} testID="business-betriebe-fehler" />
              <Button variant="ghost" onPress={() => void businesses.refetch()} testID="business-betriebe-erneut">
                {tr('apiFehler.retry')}
              </Button>
            </>
          ) : null}
          {newName !== null ? (
            <View style={{ gap: t.space.s2, marginTop: t.space.s3 }}>
              <Feld label={tr('business.betriebe.name')}>
                <Input value={newName} onChange={setNewName} accessibilityLabel={tr('business.betriebe.name')} testID="business-betrieb-name" />
              </Feld>
              <Button
                disabled={newName.trim() === '' || flight.busy}
                onPress={() =>
                  void flight.run(async () => {
                    setAddProblem(null)
                    const outcome = await attempt(() => add.mutateAsync({ jahr: taxYear, data: { name: newName.trim() }, ...(person === 'B' ? { params: { person: 'B' } } : {}) }))
                    if (!outcome.ok) return setAddProblem(outcome.problem)
                    setNewName(null)
                    refresh()
                    const created = outcome.response.data as { readonly business?: number } | undefined
                    if (created?.business !== undefined) onChangeBusiness(created.business)
                  })
                }
                testID="business-betrieb-anlegen"
              >
                {tr('business.betriebe.anlegen')}
              </Button>
              <ProblemNote problem={addProblem} />
            </View>
          ) : null}
        </Section>
      ) : null}
      <Section>
        <Text style={{ ...t.type.bodyStrong, color: t.color.tinte }} testID="business-status">
          {tr('business.status.zeile', { art: kind, modus: mode, konten: p.chart })}
        </Text>
        {profitEur !== null ? (
          <Text style={{ ...t.type.figureStrong, color: t.color.tinte, fontVariant: ['tabular-nums'] }} testID="business-gewinn">
            {profitEur < 0 ? tr('business.status.verlust', { betrag: plainEuro(Math.abs(profitEur)) }) : tr('business.status.gewinn', { betrag: plainEuro(profitEur) })}
          </Text>
        ) : null}
        <Text style={{ ...t.type.small, color: t.color.tinte2 }}>
          {entries !== null ? tr('business.status.buchungen', { count: entries.entries.length }) : book.isError ? '' : tr('business.status.buchLaedt')}
        </Text>
        {book.isError ? <ProblemNote problem={problemOf(book.error)} testID="business-buch-fehler" /> : null}
        {bank.isError ? <ProblemNote problem={problemOf(bank.error)} testID="business-bank-fehler" /> : null}
      </Section>

      <Section title={tr('business.offen.titel')} testID="business-offen">
        {open.length === 0 ? <Note>{tr('business.offen.nichts')}</Note> : null}
        {open.map((item) => (
          <Pressable key={item.key} accessibilityRole="button" onPress={() => onOpenPage(item.page)} style={{ minHeight: 44, justifyContent: 'center' }} testID={`business-offen-${item.key}`}>
            <Text style={{ ...t.type.body, color: item.tone === 'error' ? t.color.fehler : t.color.tinte, textDecorationLine: 'underline' }}>{item.text}</Text>
          </Pressable>
        ))}
      </Section>

      <Section>
        <View>
          {LINKS.filter((l) => l.show(facts)).map((link) => (
            <Pressable
              key={link.page}
              accessibilityRole="link"
              accessibilityLabel={tr(`business.seite.${link.page}`)}
              onPress={() => onOpenPage(link.page)}
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }}
              testID={`business-link-${link.page}`}
            >
              <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr(`business.seite.${link.page}`)}</Text>
              <Text style={{ ...t.type.body, color: t.color.tinte2 }} accessible={false}>
                →
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>
    </BusinessFrame>
  )
}
