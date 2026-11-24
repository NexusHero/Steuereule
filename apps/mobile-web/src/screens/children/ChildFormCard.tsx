// The form card that adds a child or edits one.
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Button, Card, Chip, DateInput, Feld, Input, type UiTheme } from '@steuereule/ui'
import { CHILD_RELATIONSHIPS, OTHER_PARENT_STATUSES, type GermanState } from '@steuereule/core'
import { todayIso } from '../shared/today'
import { TaxIdHint } from '../shared/TaxIdHint'
import { APP_NS } from '../../i18n/resources'
import { useApiFailureMessage } from '../../net/apiFailure'
import { type makeStyles } from './ChildrenScreen.styles'
import { KINSHIP_LABEL, OTHER_PARENT_LABEL } from './childrenModel'
import { ChildFormMoreDetails } from './ChildFormMoreDetails'
import { ChildFormOtherParent } from './ChildFormOtherParent'
import { SpouseRelationshipField } from './SpouseRelationshipField'
import { type ChildForm } from './useChildForm'

export interface ChildFormCardProps {
  readonly form: ChildForm
  readonly styles: ReturnType<typeof makeStyles>
  readonly t: UiTheme
  readonly taxYear: number
  readonly married: boolean
  readonly partnerName?: string | undefined
  readonly suggestedLastName: string
  readonly addressState: GermanState | null
}

export function ChildFormCard({ form, styles, t, taxYear, married, partnerName, suggestedLastName, addressState }: ChildFormCardProps) {
  const { t: tr } = useTranslation(APP_NS)
  const failureMessage = useApiFailureMessage()
  const {
    kinder,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    copiedFrom,
    geburtsdatum,
    setBirthDate,
    taxId,
    setTaxId,
    saving,
    saveError,
    relationship,
    setRelationship,
    familyBenefitsOffice,
    setFamilyBenefitsOffice,
    inland,
    setInland,
    ae,
    setAe,
    registered,
    setRegistered,
    childBenefitToMe,
    setChildBenefitToMe,
    edited,
    moreOpen,
    setMoreOpen,
    opKnown,
    typedOffice,
    officeSuggestions,
    copyFromSibling,
    handleSave,
  } = form
  return (
    <Card style={styles.formCard}>
      <Text style={styles.formTitle}>
        {edited ? tr('kinder.editTitle', 'Kind bearbeiten') : tr('kinder.addTitle', 'Kind hinzufügen')}
      </Text>
      {edited === null && kinder.length > 0 ? (
        <View style={styles.copyBox} testID="kind-geschwister">
          <Text style={styles.kindDetail}>
            {copiedFrom !== null
              ? tr('kinder.geschwister.uebernommen', { name: copiedFrom, defaultValue: 'Von {{name}} übernommen. Bitte prüf die Angaben; Vorname, Geburtsdatum und Steuer-ID fehlen noch.' })
              : tr('kinder.geschwister.frage', 'Gleiche Familie? Übernimm Nachname, Familienkasse, Verhältnis, Wohnsitz und anderen Elternteil von einem Geschwisterkind.')}
          </Text>
          <View style={styles.chips}>
            {kinder.map((k, index) => (
              <Chip key={k.id} active={false} onPress={() => copyFromSibling(k)} testID={`kind-geschwister-${index}`}>
                {tr('kinder.geschwister.von', { name: k.firstName, defaultValue: 'Von {{name}} übernehmen' })}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      <Feld label="Vorname">
        <Input value={firstName} onChange={setFirstName} placeholder="z.B. Lina" accessibilityLabel="Vorname" autoComplete="given-name" testID="kind-vorname" />
      </Feld>
      <Feld label="Nachname">
        <Input value={lastName} onChange={setLastName} placeholder="z.B. Mustermann" accessibilityLabel="Nachname" autoComplete="family-name" testID="kind-nachname" />
      </Feld>
      {edited === null && suggestedLastName !== '' && lastName === suggestedLastName && copiedFrom === null ? (
        <Text style={styles.suggestion} testID="kind-nachname-vorschlag">
          {tr('kinder.nachnameVorschlag', 'Vorschlag: dein eigener Nachname. Ändere ihn, wenn das Kind anders heißt.')}
        </Text>
      ) : null}
      <Feld label="Geburtsdatum (TT.MM.JJJJ)">
        <DateInput
          value={geburtsdatum}
          onChange={setBirthDate}
          calendarLabel={tr('datum.kalender')}
          accessibilityLabel="Geburtsdatum"
          max={todayIso()}
          testID="kind-geburtsdatum"
        />
      </Feld>
      <Feld label="Steuer-Identifikationsnummer">
        <Input
          value={taxId}
          onChange={setTaxId}
          placeholder="11 Ziffern"
          type="numeric"
          accessibilityLabel="Steuer-Identifikationsnummer"
          testID="kind-steuerid"
        />
        <TaxIdHint value={taxId} testID="kind-steuerid-hinweis" />
      </Feld>
      <Feld label="Kindschaftsverhältnis zu dir">
        <View style={styles.chips}>
          {CHILD_RELATIONSHIPS.map((value) => (
            <Chip key={value} active={relationship === value} onPress={() => setRelationship(value)} testID={`kind-verhaeltnis-${value}`}>
              {KINSHIP_LABEL[value]}
            </Chip>
          ))}
        </View>
      </Feld>
      {married ? <SpouseRelationshipField styles={styles} {...(partnerName ? { partnerName } : {})} relationshipB={form.relationshipB} setRelationshipB={form.setRelationshipB} /> : null}
      <Feld label="Für das Kindergeld zuständige Familienkasse">
        <Input
          value={familyBenefitsOffice}
          onChange={setFamilyBenefitsOffice}
          placeholder="z.B. Familienkasse Sachsen"
          accessibilityLabel="Familienkasse"
          testID="kind-familienkasse"
        />
      </Feld>
      {officeSuggestions.length > 0 ? (
        <View style={styles.officeBox} testID="kind-familienkasse-vorschlaege">
          <Text style={styles.kindDetail}>
            {typedOffice === '' && addressState !== null
              ? tr('kinder.familienkasse.ausAdresse', 'Vorschlag aus deiner Adresse. Die Familienkasse steht auf deinem Kindergeldbescheid.')
              : tr('kinder.familienkasse.waehlen', 'Tippe zum Auswählen. Die Familienkasse steht auf deinem Kindergeldbescheid.')}
          </Text>
          <View style={styles.chips}>
            {officeSuggestions.map((name, index) => (
              <Chip key={name} active={false} onPress={() => setFamilyBenefitsOffice(name)} testID={`kind-familienkasse-vorschlag-${index}`}>
                {name.replace('Familienkasse ', '')}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      <Feld label={`Hat das Kind ${taxYear} durchgehend in Deutschland gewohnt?`}>
        <View style={styles.chips}>
          <Chip active={inland === true} onPress={() => setInland(true)} testID="kind-inland-ja">
            Ja
          </Chip>
          <Chip active={inland === false} onPress={() => setInland(false)} testID="kind-inland-nein">
            Nein
          </Chip>
        </View>
      </Feld>
      <Feld label="Der andere Elternteil (nicht nötig, wenn ihr beide Eltern seid und zusammen veranlagt werdet)">
        <View style={styles.chips}>
          {OTHER_PARENT_STATUSES.map((status) => (
            <Chip key={status} active={ae === status} onPress={() => setAe(status)} testID={`kind-ae-${status}`}>
              {OTHER_PARENT_LABEL[status]}
            </Chip>
          ))}
        </View>
      </Feld>
      {opKnown ? <ChildFormOtherParent form={form} styles={styles} /> : null}
      {married ? null : (
      <>
      <Text style={styles.formTitle}>{tr('kinder.entlastungTitel', 'Entlastungsbetrag für Alleinerziehende')}</Text>
      <Text style={styles.kindDetail}>
        {tr(
          'kinder.entlastungHilfe',
          'Nur wenn du allein mit dem Kind lebst. Der Ausdruck beantragt ihn für das ganze Jahr; Teilzeiträume kann er noch nicht.',
        )}
      </Text>
      <Feld label={`War das Kind ${taxYear} das ganze Jahr bei dir gemeldet?`}>
        <View style={styles.chips}>
          <Chip active={registered === true} onPress={() => setRegistered(true)} testID="kind-gemeldet-ja">
            Ja
          </Chip>
          <Chip active={registered === false} onPress={() => setRegistered(false)} testID="kind-gemeldet-nein">
            Nein
          </Chip>
        </View>
      </Feld>
      <Feld label={`Wurde das Kindergeld ${taxYear} das ganze Jahr an dich ausgezahlt?`}>
        <View style={styles.chips}>
          <Chip active={childBenefitToMe === true} onPress={() => setChildBenefitToMe(true)} testID="kind-kindergeld-an-mich-ja">
            Ja
          </Chip>
          <Chip active={childBenefitToMe === false} onPress={() => setChildBenefitToMe(false)} testID="kind-kindergeld-an-mich-nein">
            Nein
          </Chip>
        </View>
      </Feld>
      </>
      )}
      <Button
        variant="ghost"
        onPress={() => setMoreOpen(!moreOpen)}
        style={styles.toggleButton}
        testID="kind-weitere-angaben"
      >
        {moreOpen
          ? tr('kinder.wenigerAngaben', 'Weitere Angaben ausblenden')
          : tr('kinder.weitereAngaben', 'Weitere Angaben (Kindergeld, Versicherung des Kindes, Schweizer Zulage)')}
      </Button>
      {moreOpen ? <ChildFormMoreDetails form={form} styles={styles} t={t} married={married} {...(partnerName ? { partnerName } : {})} /> : null}
      {saveError !== null ? (
        <Text style={{ ...t.type.small, color: t.color.fehler, marginTop: t.space.s2 }} accessibilityRole="alert" testID="kind-speichern-fehler">
          {saveError === 'server'
            ? `${tr('kinder.nichtGespeichert')} ${failureMessage(form.saveFailure, { validation: tr('kinder.speichernFehler') })}`
            : tr(saveError === 'pflicht' ? 'kinder.pflichtFehlt' : 'kinder.datumFalsch')}
        </Text>
      ) : null}
      <Button onPress={handleSave} disabled={saving} style={styles.addButton} testID="kind-speichern">
        {saving ? tr('kinder.speichert') : tr('kinder.save', 'Kind speichern')}
      </Button>
    </Card>
  )
}
