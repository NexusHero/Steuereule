// The child's relationship to the spouse or partner (Anlage Kind, Person B).
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Chip, Feld } from '@steuereule/ui'
import { CHILD_RELATIONSHIPS, type ChildRelationship } from '@steuereule/core'
import { APP_NS } from '../../i18n/resources'
import { type makeStyles } from './ChildrenScreen.styles'
import { KINSHIP_LABEL } from './childrenModel'

export interface SpouseRelationshipFieldProps {
  readonly styles: ReturnType<typeof makeStyles>
  readonly partnerName?: string | undefined
  readonly relationshipB: ChildRelationship | null
  readonly setRelationshipB: (value: ChildRelationship | null) => void
}

/** Married people need it for the joint return; for everyone else it sits among the further details. */
export function SpouseRelationshipField({ styles, partnerName, relationshipB, setRelationshipB }: SpouseRelationshipFieldProps) {
  const { t: tr } = useTranslation(APP_NS)
  return (
    <Feld label={partnerName ? tr('kinder.verhaeltnisZuPartnerName', { name: partnerName, defaultValue: 'Kindschaftsverhältnis zu {{name}}' }) : tr('kinder.verhaeltnisZuPartner', 'Kindschaftsverhältnis zu deinem Partner')}>
      <View style={styles.chips}>
        {CHILD_RELATIONSHIPS.map((value) => (
          <Chip key={value} active={relationshipB === value} onPress={() => setRelationshipB(value)} testID={`kind-verhaeltnis-b-${value}`}>
            {KINSHIP_LABEL[value]}
          </Chip>
        ))}
        <Chip active={relationshipB === null} onPress={() => setRelationshipB(null)} testID="kind-verhaeltnis-b-keins">
          Keines
        </Chip>
      </View>
    </Feld>
  )
}
