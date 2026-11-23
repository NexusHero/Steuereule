// The reads behind the structured preview and the sections they make, in the order of the official forms.
import { useTranslation } from 'react-i18next'
import type { Answers, Screen } from '@steuereule/core'
import {
  useCapitalControllerGet,
  useChSalaryCertificateControllerGet,
  useChildrenControllerList,
  useCommuteControllerGet,
  useConfirmationControllerGet,
  useInterviewControllerGetInterview,
  useLinkControllerGet,
  useLstbControllerGetLstb,
  useMasterDataControllerRead,
  usePrintoutControllerLiveValues,
  usePensionControllerGet,
  useRentalControllerGet,
} from '@steuereule/api-client'
import { APP_NS } from '../../i18n/resources'
import { useExpertMode } from '../../lib/expertModePreference'
import { useAcroFieldSaver } from './useAcroFieldSaver'
import { formatProvenanceBadge, provenanceIndex } from './glassFormProvenance'
import { est1aSection, haushaltSection, vorsorgeSection } from './glassFormHouseholdRows'
import { anlageNSection, nGreSection } from './glassFormEmploymentRows'
import { kapSection, kindSection, rentalSection, renteSection } from './glassFormAssetRows'
import { countRows, visibleSectionsFor } from './glassFormFilter'
import type { GlassFormSection, GlassLiveValues, GlassRowContext } from './glassFormTypes'

export function useGlassFormPreview(year: number, activeFilter: string) {
  const { t: tr } = useTranslation(APP_NS)

  const masterDataQuery = useMasterDataControllerRead()
  const linkQuery = useLinkControllerGet(year)
  const interviewQuery = useInterviewControllerGetInterview(year)
  const lstbQuery = useLstbControllerGetLstb(year)
  const commuteQuery = useCommuteControllerGet(year)
  const chQuery = useChSalaryCertificateControllerGet(year)
  const pensionQuery = usePensionControllerGet(year)
  const capitalQuery = useCapitalControllerGet(year)
  const rentalQuery = useRentalControllerGet(year)
  const childrenQuery = useChildrenControllerList(year)
  const confirmationQuery = useConfirmationControllerGet(year)

  const expertMode = useExpertMode()
  const saveAcroField = useAcroFieldSaver({
    year,
    masterData: masterDataQuery.data?.status === 200 ? masterDataQuery.data.data : null,
  })
  // What the printout would print, per copy (A/B, each child, each rental object), straight from the API.
  // Both views read it: the official form shows it in place, the structured rows name the same values.
  const liveValuesQuery = usePrintoutControllerLiveValues(year)
  const liveForms = liveValuesQuery.data?.status === 200 ? liveValuesQuery.data.data.forms : []
  // Without printed values (a year without Vordrucke, Person B's own account) the rows fall back to the masks' figures.
  const live: GlassLiveValues = { forms: liveForms, hasLive: liveForms.length > 0, settled: !liveValuesQuery.isPending }

  const linkData = linkQuery.data?.status === 200 ? linkQuery.data.data : null
  const isJoint = linkData?.filingType === 'zusammen'
  const partnerName = linkData?.personB?.firstName?.trim() || 'Partner (Person B)'

  const lstbBQuery = useLstbControllerGetLstb(year, { person: 'B' }, { query: { enabled: isJoint } })
  const commuteBQuery = useCommuteControllerGet(year, { person: 'B' }, { query: { enabled: isJoint } })
  const chBQuery = useChSalaryCertificateControllerGet(year, { person: 'B' }, { query: { enabled: isJoint } })
  const pensionBQuery = usePensionControllerGet(year, { person: 'B' }, { query: { enabled: isJoint } })
  const interviewBQuery = useInterviewControllerGetInterview(
    year,
    { eintrag: 'lebenslagen', person: 'B' },
    { query: { enabled: isJoint } },
  )

  const provenanceByKey = provenanceIndex(confirmationQuery.data?.status === 200 ? confirmationQuery.data.data : null)
  const prov = (screen: Screen, field?: string): string => {
    const found = field ? provenanceByKey.get(`${screen}.${field}`) : undefined
    return formatProvenanceBadge(found, tr)
  }
  const ctx: GlassRowContext = { year, isJoint, partnerName, tr: (key, options) => tr(key, options ?? {}), prov }

  const md = masterDataQuery.data?.status === 200 ? masterDataQuery.data.data : null
  const answers = (interviewQuery.data?.status === 200 ? interviewQuery.data.data.answers : {}) as Answers
  const answersB = (interviewBQuery.data?.status === 200 ? interviewBQuery.data.data.answers : {}) as Answers
  const lstb = lstbQuery.data?.status === 200 ? lstbQuery.data.data : null
  const lstbB = lstbBQuery.data?.status === 200 ? lstbBQuery.data.data : null
  const commute = commuteQuery.data?.status === 200 ? commuteQuery.data.data : null
  const commuteB = commuteBQuery.data?.status === 200 ? commuteBQuery.data.data : null
  const ch = chQuery.data?.status === 200 ? chQuery.data.data : null
  const chB = chBQuery.data?.status === 200 ? chBQuery.data.data : null
  const kinderData = childrenQuery.data?.status === 200 ? childrenQuery.data.data : null
  const cap = capitalQuery.data?.status === 200 ? capitalQuery.data.data : null
  const rental = rentalQuery.data?.status === 200 ? rentalQuery.data.data : null
  const pension = pensionQuery.data?.status === 200 ? pensionQuery.data.data : null
  const pensionB = pensionBQuery.data?.status === 200 ? pensionBQuery.data.data : null

  const sections: GlassFormSection[] = [
    est1aSection(md, linkData, answers, answersB, ctx),
    anlageNSection({ lstb, lstbB, commute, commuteB, answers }, live, ctx),
    nGreSection(ch, chB, live, ctx),
    vorsorgeSection(lstb, lstbB, answers, live, ctx),
    kindSection(kinderData, ctx),
    kapSection(cap, ctx),
    rentalSection(rental, ctx),
    renteSection(pension, pensionB, ctx),
    haushaltSection(answers, ctx),
  ].filter((section): section is GlassFormSection => section !== null)

  return {
    liveForms,
    expertMode,
    saveAcroField,
    partnerName,
    sections,
    totalRows: countRows(sections),
    visibleSections: visibleSectionsFor(sections, activeFilter),
  }
}
