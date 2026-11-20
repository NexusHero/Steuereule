import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, DateInput, Feld, germanDateToIso, Input, isoDateToGerman, useTheme } from '@steuereule/ui'
import {
  businessControllerHebesatz,
  useBusinessControllerProfile,
  useBusinessControllerSaveProfile,
  type BusinessProfileDto,
  type BusinessProfileInputDto,
  type HebesatzLookupDto,
} from '@steuereule/api-client'
import { Choice } from './Choice'
import { APP_NS } from '../../i18n/resources'
import { BusinessFrame, BusinessQueryState, Note, Section } from './BusinessFrame'
import { personParams, type ApiProblem } from './businessKit'
import { attempt, queryProblem, useRefreshBusiness } from './useBusiness'
import type { BusinessPageProps } from './BusinessScreen'

const QUESTIONS = ['ownExpertWork', 'employsQualifiedStaff', 'leadsPersonally', 'tradesGoods'] as const
type QuestionId = (typeof QUESTIONS)[number]

function answerOf(profile: BusinessProfileDto, id: QuestionId): boolean | null {
  const value = profile.professionAnswers?.[id]
  return typeof value === 'boolean' ? value : null
}

/** Freiberuf or Gewerbe (the app suggests, you confirm), the way the books are kept, Kleinunternehmer, Gemeinde and Hebesatz. */
export function ProfilePage({ taxYear, person, onBack, onOpenPage }: BusinessPageProps) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const params = personParams(person)
  const query = useBusinessControllerProfile(taxYear, params)
  const saveProfile = useBusinessControllerSaveProfile()
  const refresh = useRefreshBusiness(taxYear)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [gemeinde, setGemeinde] = useState('')
  const [lookup, setLookup] = useState<HebesatzLookupDto | null>(null)
  const [lookupFailed, setLookupFailed] = useState(false)
  const [multiplier, setMultiplier] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<string | null>(null)

  const loadProblem = queryProblem(query)
  if (query.isPending || loadProblem !== null || query.data?.status !== 200) {
    return (
      <BusinessFrame title={tr('business.seite.profil')} onBack={onBack}>
        <BusinessQueryState pending={query.isPending} problem={loadProblem} onRetry={() => void query.refetch()} />
      </BusinessFrame>
    )
  }
  const profile = query.data.data

  async function save(patch: BusinessProfileInputDto) {
    setProblem(null)
    const result = await attempt(() => saveProfile.mutateAsync({ jahr: taxYear, data: patch, ...(params ? { params } : {}) }))
    if (result.ok) refresh()
    else setProblem(result.problem)
  }

  function answer(id: QuestionId, value: boolean) {
    const base = Object.fromEntries(QUESTIONS.map((q) => [q, answerOf(profile, q) ?? false]))
    void save({ professionAnswers: { ...profile.professionAnswers, ...base, [id]: value } })
  }

  async function findMunicipality() {
    setLookupFailed(false)
    setLookup(null)
    try {
      const response = await businessControllerHebesatz(taxYear, { gemeinde, ...params })
      if (response.status === 200) setLookup(response.data)
      else setLookupFailed(true)
    } catch {
      setLookupFailed(true)
    }
  }

  const suggestion = profile.suggestion
  const yesNo = (selected: boolean | null, onPick: (v: boolean) => void, id: string) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
      <Choice selected={selected === true} onPress={() => onPick(true)} testID={`${id}-ja`}>
        {tr('business.ja')}
      </Choice>
      <Choice selected={selected === false} onPress={() => onPick(false)} testID={`${id}-nein`}>
        {tr('business.nein')}
      </Choice>
    </View>
  )

  return (
    <BusinessFrame title={tr('business.seite.profil')} onBack={onBack} testID="selbststaendig-profil">
      {problem !== null ? <Note tone="error" testID="business-speichern-fehler">{problem.message ?? tr('business.speichernFehler')}</Note> : null}

      <Section title={tr('business.profil.artTitel')}>
        {QUESTIONS.map((id) => (
          <Feld key={id} label={tr(`business.profil.frage.${id}`)}>
            {yesNo(answerOf(profile, id), (v) => answer(id, v), `profil-frage-${id}`)}
          </Feld>
        ))}
        {suggestion !== null ? (
          <View testID="profil-vorschlag">
            <Text style={{ ...t.type.bodyStrong, color: t.color.tinte }}>{tr(`business.profil.vorschlag.${suggestion.suggestion}`)}</Text>
            {suggestion.reasons.map((reason) => (
              <Text key={reason} style={{ ...t.type.small, color: t.color.tinte2 }}>
                {`• ${reason}`}
              </Text>
            ))}
          </View>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => onOpenPage('beruf')} style={{ minHeight: 44, justifyContent: 'center' }} testID="profil-zu-beruf">
          <Text style={{ ...t.type.body, color: t.color.tinte, textDecorationLine: 'underline' }}>{tr('business.profil.berufGenauer')}</Text>
        </Pressable>
        <Note>{tr('business.profil.bestaetigen')}</Note>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
          {(['freiberuf', 'gewerbe'] as const).map((kind) => (
            <Choice key={kind} selected={profile.confirmedKind === kind} onPress={() => void save({ confirmedKind: kind })} testID={`profil-art-${kind}`}>
              {tr(`business.art.${kind}`)}
            </Choice>
          ))}
        </View>
      </Section>

      <Section title={tr('business.profil.buchfuehrung')}>
        <Feld label={tr('business.profil.gewinnermittlung')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            {(['euer', 'bilanz'] as const).map((mode) => (
              <Choice key={mode} selected={profile.mode === mode} onPress={() => void save({ mode })} testID={`profil-modus-${mode}`}>
                {tr(`business.modus.${mode}`)}
              </Choice>
            ))}
          </View>
        </Feld>
        <Feld label={tr('business.profil.kontenrahmen')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            {(['SKR03', 'SKR04'] as const).map((chart) => (
              <Choice key={chart} selected={profile.chart === chart} onPress={() => void save({ chart })} testID={`profil-konten-${chart}`}>
                {chart}
              </Choice>
            ))}
          </View>
        </Feld>
        <Feld label={tr('business.profil.beginn')}>
          <DateInput
            value={startDate ?? isoDateToGerman(profile.startDate ?? '')}
            onChange={(value) => {
              setStartDate(value)
              if (value.length === 10) {
                const iso = germanDateToIso(value)
                if (iso !== null) void save({ startDate: iso })
              } else if (value === '') void save({ startDate: null })
            }}
            calendarLabel={tr('datum.kalender')}
            accessibilityLabel={tr('business.profil.beginn')}
            testID="profil-beginn"
          />
        </Feld>
        <Feld label={tr('business.profil.kleinunternehmer')}>{yesNo(profile.smallBusiness, (v) => void save({ smallBusiness: v }), 'profil-klein')}</Feld>
        <Feld label={tr('business.profil.versteuerung')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.s2 }}>
            {(['ist', 'soll'] as const).map((method) => (
              <Choice key={method} selected={profile.vatMethod === method} onPress={() => void save({ vatMethod: method })} testID={`profil-ust-${method}`}>
                {tr(`business.profil.versteuerungArt.${method}`)}
              </Choice>
            ))}
          </View>
        </Feld>
      </Section>

      {profile.confirmedKind !== 'freiberuf' ? (
        <Section title={tr('business.profil.gemeinde')} testID="profil-gemeinde">
          <Feld label={tr('business.profil.gemeindeName')}>
            <Input value={gemeinde} onChange={setGemeinde} placeholder="Neustadt" accessibilityLabel={tr('business.profil.gemeindeName')} onSubmit={() => void findMunicipality()} testID="profil-gemeinde-name" />
          </Feld>
          <Button variant="ghost" disabled={gemeinde.trim().length < 2} onPress={() => void findMunicipality()} testID="profil-hebesatz-suchen">
            {tr('business.profil.hebesatzSuchen')}
          </Button>
          {lookupFailed ? <Note tone="error">{tr('business.profil.hebesatzFehler')}</Note> : null}
          {lookup?.kind === 'not_found' ? <Note testID="profil-hebesatz-keiner">{tr('business.profil.hebesatzKeiner')}</Note> : null}
          {lookup?.kind === 'found' && lookup.municipality ? (
            <MunicipalityRow m={lookup.municipality} lookup={lookup} onTake={(ags) => void save({ municipalityAgs: ags, multiplierOverride: null })} />
          ) : null}
          {lookup?.kind === 'choices' ? (lookup.choices ?? []).map((m) => <MunicipalityRow key={m.ags} m={m} lookup={lookup} onTake={(ags) => void save({ municipalityAgs: ags, multiplierOverride: null })} />) : null}
          <Feld label={tr('business.profil.hebesatzKorrektur')}>
            <Input
              type="numeric"
              mono
              value={multiplier ?? (profile.multiplierOverride === null ? '' : String(profile.multiplierOverride))}
              onChange={setMultiplier}
              placeholder="400"
              accessibilityLabel={tr('business.profil.hebesatzKorrektur')}
              onBlur={() => {
                if (multiplier === null) return
                const value = Number(multiplier.replace(',', '.'))
                void save({ multiplierOverride: multiplier.trim() === '' ? null : Number.isFinite(value) ? value : null })
              }}
              testID="profil-hebesatz-korrektur"
            />
          </Feld>
        </Section>
      ) : null}
      <Section>
        {profile.confirmedKind !== 'freiberuf' ? (
          <Pressable accessibilityRole="link" onPress={() => onOpenPage('gewerbedaten')} style={{ minHeight: 48, justifyContent: 'center' }} testID="profil-zu-gewerbedaten">
            <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.seite.gewerbedaten')} →</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => onOpenPage('beteiligungen')} style={{ minHeight: 48, justifyContent: 'center' }} testID="profil-zu-beteiligungen">
          <Text style={{ ...t.type.body, color: t.color.tinte }}>{tr('business.seite.beteiligungen')} →</Text>
        </Pressable>
      </Section>
    </BusinessFrame>
  )
}

function MunicipalityRow({ m, lookup, onTake }: { readonly m: { readonly ags: string; readonly name: string; readonly land: string; readonly multiplierPercent: number }; readonly lookup: HebesatzLookupDto; readonly onTake: (ags: string) => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  return (
    <View style={{ marginVertical: t.space.s2 }}>
      <Text style={{ fontVariant: ['tabular-nums'] }} testID={`profil-hebesatz-${m.ags}`}>
        {tr('business.profil.hebesatzZeile', { name: m.name, land: m.land, prozent: m.multiplierPercent, jahr: lookup.tableYear ?? '' })}
      </Text>
      {lookup.note ? <Note>{lookup.note}</Note> : null}
      <Button variant="ghost" onPress={() => onTake(m.ags)} testID={`profil-hebesatz-nehmen-${m.ags}`}>
        {tr('business.profil.hebesatzNehmen')}
      </Button>
    </View>
  )
}
