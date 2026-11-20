import { useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Feld, Input, useTheme } from '@steuereule/ui'
import {
  useBusinessControllerAcceptBank,
  useBusinessControllerBank,
  useBusinessControllerIgnoreBank,
  useBusinessControllerImportBank,
  type BankImportDtoPreset,
  type BankImportResultDto,
  type BankTransactionDto,
} from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Note, Section } from './BusinessFrame'
import { germanDay, personParams, signedCents, type ApiProblem } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'
import { buildMapping, EMPTY_MAPPING, MappingForm, type MappingState } from './BankMapping'
import type { BusinessPageProps } from './BusinessScreen'

type Source = BankImportDtoPreset | 'camt053' | 'eigene'
const SOURCES: readonly Source[] = ['sparkasse', 'ing', 'dkb', 'commerzbank', 'camt053', 'eigene']

/** Bank statements as a file (CSV with a preset, or CAMT.053); the app suggests, you accept or ignore. No bank login. */
export function BankPage({ taxYear, person, business = 1, onBack }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person, business)
  const query = useBusinessControllerBank(taxYear, params)
  const importBank = useBusinessControllerImportBank()
  const accept = useBusinessControllerAcceptBank()
  const ignore = useBusinessControllerIgnoreBank()
  const refresh = useRefreshBusiness(taxYear)
  const [source, setSource] = useState<Source>('sparkasse')
  const [mapping, setMapping] = useState<MappingState>(EMPTY_MAPPING)
  const [result, setResult] = useState<BankImportResultDto | null>(null)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.bank')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const open = query.data.data.filter((x) => x.status === 'offen')

  async function onFile(file: File) {
    setProblem(null)
    setResult(null)
    const columns = source === 'eigene' ? buildMapping(mapping) : null
    if (source === 'eigene' && columns === null) return setProblem({ status: 0, code: null, message: tr('business.bank.mapping.unvollstaendig') })
    const content = await file.text()
    const data = source === 'camt053' ? { format: 'camt053' as const, content } : columns !== null ? { format: 'csv' as const, content, mapping: columns } : { format: 'csv' as const, content, preset: source as BankImportDtoPreset }
    const outcome = await attempt(() => importBank.mutateAsync({ jahr: taxYear, data, ...(params ? { params } : {}) }))
    if (outcome.ok) {
      setResult(outcome.response.data as BankImportResultDto)
      refresh()
    } else setProblem(outcome.problem)
  }

  async function take(row: BankTransactionDto, data: { account?: string; taxKey?: string; remember?: boolean }) {
    setProblem(null)
    const outcome = await attempt(() => accept.mutateAsync({ jahr: taxYear, umsatzId: row.id, data, ...(params ? { params } : {}) }))
    if (outcome.ok) refresh()
    else setProblem(outcome.problem)
  }

  async function skip(row: BankTransactionDto) {
    setProblem(null)
    const outcome = await attempt(() => ignore.mutateAsync({ jahr: taxYear, umsatzId: row.id, ...(params ? { params } : {}) }))
    if (outcome.ok) refresh()
    else setProblem(outcome.problem)
  }

  return (
    <BusinessFrame title={tr('business.seite.bank')} onBack={onBack} testID="bank-import">
      <Section title={tr('business.bank.importTitel')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginBottom: t.space.s3 }}>
          {SOURCES.map((s) => (
            <Choice key={s} selected={source === s} onPress={() => setSource(s)} testID={`bank-quelle-${s}`}>
              {tr(`business.bank.quelle.${s}`)}
            </Choice>
          ))}
        </View>
        {source === 'eigene' ? <MappingForm state={mapping} onChange={setMapping} /> : null}
        {Platform.OS === 'web' ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.txt,.xml"
              data-testid="bank-datei-input"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void onFile(file)
              }}
            />
            <Button onPress={() => inputRef.current?.click()} testID="bank-datei-waehlen">
              {tr('business.bank.dateiWaehlen')}
            </Button>
          </>
        ) : (
          <Note>{tr('business.bank.nurWeb')}</Note>
        )}
        {result !== null ? (
          <Text style={{ ...t.type.body, color: t.color.tinte, marginTop: t.space.s2 }} testID="bank-ergebnis">
            {tr('business.bank.ergebnis', { added: result.added, duplicates: result.duplicates, outside: result.outsideYear })}
          </Text>
        ) : null}
        {problem !== null ? <Note tone="error" testID="business-speichern-fehler">{problem.message ?? tr('business.speichernFehler')}</Note> : null}
      </Section>

      <Section title={tr('business.bank.vorschlaege', { count: open.length })}>
        {open.length === 0 ? <Note testID="bank-leer">{tr('business.bank.leer')}</Note> : null}
        {open.map((row) => (
          <BankRow key={row.id} row={row} onTake={(data) => void take(row, data)} onSkip={() => void skip(row)} />
        ))}
      </Section>
    </BusinessFrame>
  )
}

function BankRow({ row, onTake, onSkip }: { readonly row: BankTransactionDto; readonly onTake: (data: { account?: string; taxKey?: string; remember?: boolean }) => void; readonly onSkip: () => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const [account, setAccount] = useState('')
  const [remember, setRemember] = useState(false)
  const amount = row.transaction.amount
  const who = row.transaction.counterpartyName ?? row.transaction.reference
  const suggestion = row.suggestion
  return (
    <View style={{ paddingVertical: t.space.s2, borderBottomWidth: 1, borderBottomColor: t.color.linieWeich }} testID={`bank-zeile-${row.id}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.space.s3 }}>
        <Text style={{ ...t.type.bodyStrong, color: t.color.tinte, flexShrink: 1 }}>{who}</Text>
        <Text style={{ ...t.type.figure, color: amount < 0 ? t.color.tinte : t.color.ok, fontVariant: ['tabular-nums'] }}>{signedCents(amount)}</Text>
      </View>
      <Text style={{ ...t.type.small, color: t.color.tinte2 }}>{germanDay(row.transaction.bookingDate)}</Text>
      {suggestion !== null ? (
        <Text style={{ ...t.type.small, color: t.color.tinte }} testID={`bank-vorschlag-${row.id}`}>
          {tr('business.bank.vorschlag', { konto: suggestion.account, text: suggestion.text })}
        </Text>
      ) : (
        <Feld label={tr('business.bank.konto')}>
          <Input type="numeric" mono value={account} onChange={setAccount} accessibilityLabel={tr('business.bank.konto')} testID={`bank-konto-${row.id}`} />
        </Feld>
      )}
      <Choice selected={remember} onPress={() => setRemember((r) => !r)} testID={`bank-merken-${row.id}`}>
        {tr('business.bank.regelMerken')}
      </Choice>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2, marginTop: t.space.s2 }}>
        <View style={{ flex: 1 }}>
          <Button disabled={suggestion === null && account.trim() === ''} onPress={() => onTake({ ...(suggestion === null ? { account: account.trim() } : {}), remember })} testID={`bank-buchen-${row.id}`}>
            {tr('business.bank.buchen')}
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="ghost" onPress={onSkip} testID={`bank-ignorieren-${row.id}`}>
            {tr('business.bank.ignorieren')}
          </Button>
        </View>
      </View>
    </View>
  )
}
