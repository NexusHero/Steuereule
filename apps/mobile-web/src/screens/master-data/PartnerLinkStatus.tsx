import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@steuereule/ui'
import {
  getHouseholdControllerGetQueryKey,
  useHouseholdControllerEndPartner,
  useHouseholdControllerGet,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'

/**
 * The spouse link without a year (#452 decision 2, ADR-0062 §3): shown while it is active, with
 * „ab Jahr X nicht mehr verknüpft“. A change of the Veranlagungsart never ends it.
 */
export function PartnerLinkStatus({ taxYear, onChanged }: { readonly taxYear: number; readonly onChanged: () => void }) {
  const t = useTheme()
  const { t: tr } = useTranslation(APP_NS)
  const queryClient = useQueryClient()
  const query = useHouseholdControllerGet(taxYear, { query: { retry: false } })
  const end = useHouseholdControllerEndPartner()
  const link = query.data?.status === 200 ? query.data.data.partnerLink : null
  if (!link || !link.ownAccount || link.validFromYear > taxYear) return null

  const text: TextStyle = { fontFamily: t.font.text, fontSize: t.size.s, color: t.color.tinte2 }
  const box: ViewStyle = { gap: t.space.s1, marginBottom: t.space.s3 }

  if (link.endedFromYear !== null && link.endedFromYear <= taxYear) return null
  return (
    <View style={box} testID="kopplung-verknuepft">
      <Text style={text}>{tr('haushalt.partner.verknuepftSeit', { year: link.validFromYear })}</Text>
      {link.endedFromYear !== null ? (
        <Text style={text}>{tr('haushalt.partner.beendetAb', { year: link.endedFromYear - 1 })}</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void end.mutateAsync({ jahr: taxYear }).then(async () => {
              await queryClient.invalidateQueries({ queryKey: getHouseholdControllerGetQueryKey(taxYear) })
              onChanged()
            })
          }
          testID="kopplung-beenden"
        >
          <Text style={{ ...text, color: t.color.kiTinte, textDecorationLine: 'underline' }}>{tr('haushalt.partner.beenden', { year: taxYear })}</Text>
        </Pressable>
      )}
    </View>
  )
}
