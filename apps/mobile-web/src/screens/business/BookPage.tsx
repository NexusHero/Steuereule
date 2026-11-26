import { useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, DateInput, Feld, germanDateToIso, Input, useTheme } from '@steuereule/ui'
import { findAccount, type BookingTaxKey } from '@steuereule/core'
import {
  useBusinessControllerBook,
  useBusinessControllerLock,
  useBusinessControllerPost,
  useBusinessControllerReverse,
  type BookDto,
  type BookingDraftDto,
  type JournalEntryDto,
} from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Note, ProblemNote, Section } from './BusinessFrame'
import { domainReasonOf, eurosToCents, germanDay, personParams, plainCents, todayIso, type ApiProblem } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness, useSingleFlight } from './useBusiness'
import { useConfirmAction } from '../../confirm/useConfirmAction'
import { BusinessReceiptUpload } from './BusinessReceiptUpload'
import type { BusinessPageProps } from './BusinessScreen'

const TAX_KEYS: readonly BookingTaxKey[] = ['none', 'vst19', 'vst7', 'ust19', 'ust7', 'steuerfrei', 'kleinunternehmer']

/** The Steuerschlüssel sits on the line it taxes: input VAT on the expense (Soll), output VAT on the income (Haben). */
function draftOf(form: { date: string; text: string; documentNumber: string; debit: string; credit: string; cents: number; taxKey: BookingTaxKey }): BookingDraftDto {
  const withKey = form.taxKey === 'none' ? {} : { taxKey: form.taxKey }
  const onDebit = form.taxKey.startsWith('vst')
  return {
    date: form.date,
    documentNumber: form.documentNumber.trim(),
    text: form.text.trim(),
    lines: [
      { account: form.debit.trim(), side: 'debit', amount: form.cents, ...(onDebit ? withKey : {}) },
      { account: form.credit.trim(), side: 'credit', amount: form.cents, ...(onDebit ? {} : withKey) },
    ],
  }
}

function entryAmount(entry: JournalEntryDto): number {
  return entry.lines.filter((l) => l.side === 'debit' && l.taxPart !== 'tax').reduce((sum, l) => sum + l.amount, 0)
}

/** The book: entries, the state of its chain, a new booking, Storno and the Festschreibung. */
export function BookPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const query = useBusinessControllerBook(taxYear, params)
  const post = useBusinessControllerPost()
  const reverse = useBusinessControllerReverse()
  const lock = useBusinessControllerLock()
  const refresh = useRefreshBusiness(taxYear)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ date: '', text: '', documentNumber: '', debit: '', credit: '', amount: '', taxKey: 'none' as BookingTaxKey })
  const [formError, setFormError] = useState(false)
  const [lockDate, setLockDate] = useState('')
  const flight = useSingleFlight()
  const confirmReverse = useConfirmAction('bookingReverse')
  const confirmLock = useConfirmAction('bookLock')

  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data === undefined) {
    return (
      <BusinessFrame title={tr('business.seite.buch')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const book: BookDto = query.data.data
  const chainBroken = !book.integrity.ok || problem?.code === 'BOOK_INTEGRITY_BROKEN'
  const chainReason = problem?.code === 'BOOK_INTEGRITY_BROKEN' ? (domainReasonOf(problem.error) ?? null) : (book.integrity.reason ?? null)
  const accountLabel = (n: string) => findAccount(book.chart, n.trim())?.label ?? null

  async function submit() {
    setProblem(null)
    const cents = eurosToCents(form.amount)
    const date = germanDateToIso(form.date)
    if (cents === null || cents <= 0 || date === null || form.text.trim() === '' || form.documentNumber.trim() === '' || form.debit.trim() === '' || form.credit.trim() === '') {
      setFormError(true)
      return
    }
    setFormError(false)
    const result = await attempt(() => post.mutateAsync({ jahr: taxYear, data: draftOf({ ...form, date, cents }), ...(params ? { params } : {}) }))
    if (result.ok) {
      setAdding(false)
      setForm({ date: '', text: '', documentNumber: '', debit: '', credit: '', amount: '', taxKey: 'none' })
      refresh()
    } else setProblem(result.problem)
  }

  async function storno(entry: JournalEntryDto) {
    setProblem(null)
    const today = todayIso()
    const date = Number(today.slice(0, 4)) === taxYear ? today : `${taxYear}-12-31`
    const result = await attempt(() => reverse.mutateAsync({ jahr: taxYear, nummer: entry.number, data: { date, documentNumber: `Storno-${entry.number}` }, ...(params ? { params } : {}) }))
    if (result.ok) refresh()
    else setProblem(result.problem)
  }

  async function lockThrough() {
    setProblem(null)
    const through = germanDateToIso(lockDate)
    if (through === null) return setFormError(true)
    const result = await attempt(() => lock.mutateAsync({ jahr: taxYear, data: { through }, ...(params ? { params } : {}) }))
    if (result.ok) {
      setLockDate('')
      refresh()
    } else setProblem(result.problem)
  }

  const entries = [...book.entries].sort((a, b) => b.number - a.number)
  return (
    <BusinessFrame title={tr('business.seite.buch')} onBack={onBack}>
      {chainBroken ? (
        <Section>
          <Text style={{ ...t.type.bodyStrong, color: t.color.fehler }} accessibilityRole="alert" testID="buch-integritaet-fehler">
            {tr('business.buch.kette')}
          </Text>
          {chainReason ? <Text style={{ ...t.type.body, color: t.color.tinte }}>{chainReason}</Text> : null}
        </Section>
      ) : null}
      {problem !== null && problem.code !== 'BOOK_INTEGRITY_BROKEN' ? <ProblemNote problem={problem} testID="business-speichern-fehler" /> : null}

      <Section testID="buch-liste">
        {entries.length === 0 ? <Note testID="buch-leer">{tr('business.buch.leer')}</Note> : null}
        {entries.map((entry) => {
          const reversed = entry.reversedBy !== undefined && entry.reversedBy !== null
          return (
            <View key={entry.number} style={{ paddingVertical: t.space.s2, borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }} testID={`buch-eintrag-${entry.number}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space.s3 }}>
                <Text style={{ ...t.type.bodyStrong, color: t.color.tinte, flexShrink: 1 }}>{`${entry.number} · ${entry.text}`}</Text>
                <Text style={{ ...t.type.figure, color: t.color.tinte, fontVariant: ['tabular-nums'] }}>{plainCents(entryAmount(entry))}</Text>
              </View>
              <Text style={{ ...t.type.small, color: t.color.tinte2 }}>
                {[germanDay(entry.date), entry.documentNumber, entry.reversalOf !== null ? tr('business.buch.stornoZu', { nummer: entry.reversalOf }) : null, reversed ? tr('business.buch.storniert') : null].filter(Boolean).join(' · ')}
              </Text>
              {entry.reversalOf === null && !reversed ? (
                <Button variant="ghost" disabled={flight.busy} onPress={() => confirmReverse.ask(() => void flight.run(() => storno(entry)), { nummer: entry.number })} testID={`buch-storno-${entry.number}`}>
                  {tr('business.buch.stornieren')}
                </Button>
              ) : null}
            </View>
          )
        })}
      </Section>

      {adding ? (
        <Section title={tr('business.buch.neu')} testID="buch-formular">
          <Feld label={tr('business.buch.datum')}>
            <DateInput value={form.date} onChange={(date) => setForm((f) => ({ ...f, date }))} min={`${taxYear}-01-01`} max={`${taxYear}-12-31`} calendarLabel={tr('datum.kalender')} accessibilityLabel={tr('business.buch.datum')} testID="buch-datum" />
          </Feld>
          <Feld label={tr('business.buch.text')}>
            <Input value={form.text} onChange={(text) => setForm((f) => ({ ...f, text }))} accessibilityLabel={tr('business.buch.text')} testID="buch-text" />
          </Feld>
          <Feld label={tr('business.buch.beleg')}>
            <Input value={form.documentNumber} onChange={(documentNumber) => setForm((f) => ({ ...f, documentNumber }))} accessibilityLabel={tr('business.buch.beleg')} testID="buch-belegnummer" />
          </Feld>
          <Feld label={tr('business.buch.soll')}>
            <Input type="numeric" mono value={form.debit} onChange={(debit) => setForm((f) => ({ ...f, debit }))} accessibilityLabel={tr('business.buch.soll')} testID="buch-soll" />
          </Feld>
          {accountLabel(form.debit) ? <Note>{accountLabel(form.debit)}</Note> : null}
          <Feld label={tr('business.buch.haben')}>
            <Input type="numeric" mono value={form.credit} onChange={(credit) => setForm((f) => ({ ...f, credit }))} accessibilityLabel={tr('business.buch.haben')} testID="buch-haben" />
          </Feld>
          {accountLabel(form.credit) ? <Note>{accountLabel(form.credit)}</Note> : null}
          <Feld label={tr('business.buch.betrag')}>
            <Input type="numeric" mono value={form.amount} onChange={(amount) => setForm((f) => ({ ...f, amount }))} placeholder="119,00" accessibilityLabel={tr('business.buch.betrag')} testID="buch-betrag" />
          </Feld>
          <Feld label={tr('business.buch.steuerschluessel')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
              {TAX_KEYS.map((key) => (
                <Choice key={key} selected={form.taxKey === key} onPress={() => setForm((f) => ({ ...f, taxKey: key }))} testID={`buch-schluessel-${key}`}>
                  {tr(`business.steuerschluessel.${key}`)}
                </Choice>
              ))}
            </View>
          </Feld>
          {formError ? <Note tone="error" testID="buch-formular-fehler">{tr('business.buch.formularFehler')}</Note> : null}
          <Button onPress={() => void flight.run(submit)} disabled={flight.busy} testID="buch-buchen">
            {tr('business.buch.buchen')}
          </Button>
        </Section>
      ) : (
        <Button onPress={() => setAdding(true)} testID="buch-neu">
          {tr('business.buch.neu')}
        </Button>
      )}

      <Section>
        <BusinessReceiptUpload taxYear={taxYear} business={business} />
      </Section>

      <Section title={tr('business.buch.festschreiben')}>
        <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{book.lockedThrough ? tr('business.buch.festBis', { datum: germanDay(book.lockedThrough) }) : tr('business.buch.nichtFest')}</Text>
        <Feld label={tr('business.buch.festBisLabel')}>
          <DateInput value={lockDate} onChange={setLockDate} min={`${taxYear}-01-01`} max={`${taxYear}-12-31`} calendarLabel={tr('datum.kalender')} accessibilityLabel={tr('business.buch.festBisLabel')} testID="buch-fest-datum" />
        </Feld>
        <Button variant="ghost" disabled={lockDate.length !== 10 || flight.busy} onPress={() => (germanDateToIso(lockDate) === null ? setFormError(true) : confirmLock.ask(() => void flight.run(lockThrough), { datum: lockDate }))} testID="buch-festschreiben">
          {tr('business.buch.festschreiben')}
        </Button>
      </Section>
      {confirmReverse.dialog}
      {confirmLock.dialog}
    </BusinessFrame>
  )
}
