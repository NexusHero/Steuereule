// Where a value of the preview comes from: the badge text and the lookup from the confirmation API.
import type { useTranslation } from 'react-i18next'
import type { ConfirmationResponseDto, ProvenanceDto } from '@steuereule/api-client'
import type { APP_NS } from '../../i18n/resources'

export function formatProvenanceBadge(
  provenance: ProvenanceDto | undefined,
  tr: ReturnType<typeof useTranslation<typeof APP_NS>>['t'],
): string {
  if (!provenance) return tr('bestaetigung.herkunft.nutzer', { defaultValue: 'Selbst eingetragen' })
  switch (provenance.kind) {
    case 'nutzer':
      return tr('bestaetigung.herkunft.nutzer', { defaultValue: 'Selbst eingetragen' })
    case 'uebernahme':
      return tr('bestaetigung.herkunft.uebernahme', {
        vorjahr: provenance.lastYear,
        defaultValue: `Übernahme aus ${provenance.lastYear}`,
      })
    case 'assistent':
      return provenance.receiptId
        ? tr('bestaetigung.herkunft.assistentBeleg', { name: provenance.name, defaultValue: `${provenance.name} (Beleg)` })
        : tr('bestaetigung.herkunft.assistent', { name: provenance.name, defaultValue: provenance.name })
    case 'beleg':
      return tr('bestaetigung.herkunft.beleg', { defaultValue: 'Aus Beleg' })
  }
}

/** Every confirmed value's provenance, by its key and by `screen.field`. */
export function provenanceIndex(confirmation: ConfirmationResponseDto | null): Map<string, ProvenanceDto> {
  const provenanceByKey = new Map<string, ProvenanceDto>()
  if (confirmation) {
    for (const annex of confirmation.annexes) {
      for (const item of annex.values) {
        provenanceByKey.set(item.key, item.provenance)
        provenanceByKey.set(`${item.screen}.${item.field}`, item.provenance)
      }
    }
  }
  return provenanceByKey
}
