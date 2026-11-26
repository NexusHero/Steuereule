import { useState } from 'react'
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
import { useApiFailureMessage } from '../../net/apiFailure'
import { InlineLoadFailure } from '../shared/InlineLoadFailure'
import { triggerSaveErrorHaptic } from '../shared/saveFeedback'
import { useConfirmAction } from '../../confirm/useConfirmAction'

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
  const failureMessage = useApiFailureMessage()
  const [endError, setEndError] = useState<unknown>(null)
  const confirmEnd = useConfirmAction('endPartnerLink')
  // NM-15: a failed load says so; it does not look like „not linked“.
  if (query.isError) {
    return <InlineLoadFailure what={tr('stammdaten.kopplungStand.statusLoadError')} error={query.error} onRetry={() => void query.refetch()} testID="kopplung-status-ladefehler" />
  }
  const link = query.data?.data.partnerLink ?? null
  if (!link || !link.ownAccount || link.validFromYear > taxYear) return null

  const text: TextStyle = { ...t.type.small, color: t.color.tinte2 }
  const box: ViewStyle = { gap: t.space.s1, marginBottom: t.space.s3 }

  const endLink = () => {
    setEndError(null)
    end.mutateAsync({ jahr: taxYear }).then(
      async () => {
        await queryClient.invalidateQueries({ queryKey: getHouseholdControllerGetQueryKey(taxYear) })
        onChanged()
      },
      (error: unknown) => {
        // NM-02: a refused or lost request is said, not only felt.
        triggerSaveErrorHaptic()
        setEndError(error)
      },
    )
  }

  if (link.endedFromYear !== null && link.endedFromYear <= taxYear) return null
  return (
    <View style={box} testID="kopplung-verknuepft">
      <Text style={text}>{tr('haushalt.partner.verknuepftSeit', { year: link.validFromYear })}</Text>
      {link.endedFromYear !== null ? (
        <Text style={text}>{tr('haushalt.partner.beendetAb', { year: link.endedFromYear - 1 })}</Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => confirmEnd.ask(endLink, { jahr: taxYear })}
          disabled={end.isPending}
          testID="kopplung-beenden"
        >
          <Text style={{ ...text, color: t.color.kiTinte, textDecorationLine: 'underline' }}>{tr('haushalt.partner.beenden', { year: taxYear })}</Text>
        </Pressable>
      )}
      {endError !== null ? (
        <Text style={{ ...text, color: t.color.tinte }} accessibilityRole="alert" testID="kopplung-beenden-fehler">
          {`${tr('apiFehler.saveHeading')} ${failureMessage(endError)}`}
        </Text>
      ) : null}
      {confirmEnd.dialog}
    </View>
  )
}
