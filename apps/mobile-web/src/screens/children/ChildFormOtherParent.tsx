// The other parent's details, asked when that parent lives in Germany or has died.
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip, DateInput, Feld, Input } from '@steuereule/ui'
import { OTHER_CHILD_RELATIONSHIPS } from '@steuereule/core'
import { AddressSearch } from '../shared/AddressSearch'
import { todayIso } from '../shared/today'
import { APP_NS } from '../../i18n/resources'
import { type makeStyles } from './ChildrenScreen.styles'
import { KINSHIP_LABEL } from './childrenModel'
import { addressLine } from './childrenDerive'
import { type ChildForm } from './useChildForm'

export interface ChildFormOtherParentProps {
  readonly form: ChildForm
  readonly styles: ReturnType<typeof makeStyles>
}

export function ChildFormOtherParent({ form, styles }: ChildFormOtherParentProps) {
  const { t: tr } = useTranslation(APP_NS)
  const {
    ae,
    opName,
    setOpName,
    opBirthDate,
    setOpBirthDate,
    opAddress,
    setOpAddress,
    opKind,
    setOpKind,
    opDiedOn,
    setOpDiedOn,
  } = form
  return (
    <>
      <Feld label="Name, Vorname">
        <Input value={opName} onChange={setOpName} placeholder="z.B. Muster, Max" accessibilityLabel="Name des anderen Elternteils" autoComplete="off" />
      </Feld>
      <Feld label="Geburtsdatum (TT.MM.JJJJ)">
        <DateInput
          value={opBirthDate}
          onChange={setOpBirthDate}
          calendarLabel={tr('datum.kalender')}
          accessibilityLabel="Geburtsdatum des anderen Elternteils"
          max={todayIso()}
          testID="kind-ae-geburtsdatum"
        />
      </Feld>
      <AddressSearch
        postalCode=""
        testIDPrefix="kind-ae"
        onPick={(address) => setOpAddress(addressLine(address))}
      />
      <Feld label={ae === 'Inland' ? 'Adresse' : 'Letzte bekannte Adresse (optional)'}>
        <Input value={opAddress} onChange={setOpAddress} accessibilityLabel="Adresse des anderen Elternteils" autoComplete="off" />
      </Feld>
      <Feld label="Kindschaftsverhältnis zum anderen Elternteil">
        <View style={styles.chips}>
          {OTHER_CHILD_RELATIONSHIPS.map((value) => (
            <Chip key={value} active={opKind === value} onPress={() => setOpKind(value)} testID={`kind-ae-art-${value}`}>
              {KINSHIP_LABEL[value]}
            </Chip>
          ))}
        </View>
      </Feld>
      {ae === 'Verstorben' ? (
        <Feld label="Todestag (TT.MM.JJJJ)">
          <DateInput
            value={opDiedOn}
            onChange={setOpDiedOn}
            calendarLabel={tr('datum.kalender')}
            accessibilityLabel="Todestag des anderen Elternteils"
            max={todayIso()}
            testID="kind-ae-todestag"
          />
        </Feld>
      ) : null}
    </>
  )
}
