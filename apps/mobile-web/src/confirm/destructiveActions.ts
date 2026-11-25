import type { ConfirmTone } from '@steuereule/ui'

/**
 * Every mask action that loses data or cannot be taken back (WEB-37, WEB-38, WEB-18, NC-14, NR-19). Each one
 * asks through `useConfirmAction(id)` and the shared `ConfirmDialog`; the copy lives under
 * `rueckfrage.<id>.{titel,text,bestaetigen}` in the locales and says what is lost or what becomes final.
 *
 * `screen` and `trigger` (the button's testID, without a per-row suffix) bind an entry to its button. Which
 * operations are destructive is declared by the API, not here: every DELETE and every write marked
 * `x-destructive` (`@Destructive()`) in `apps/api/openapi.json`, the spec the generated client comes from. The
 * lock test (`destructiveActions.lock.test.tsx`) fails when a source file calls one of them (hook, plain
 * function or mutation options) without being the screen that asks for it here, a file named in its
 * `calledFrom`, or an excused row of `UNCONFIRMED_DESTRUCTIVE_MUTATIONS`.
 */
export interface DestructiveAction {
  readonly tone: ConfirmTone
  /** The source file (relative to apps/mobile-web) that renders the button. */
  readonly screen: string
  /** The button's testID, or its prefix when the id carries a row (e.g. `buch-storno-` + number). */
  readonly trigger: string
  /** The generated mutation hooks this action reaches, if it has its own (some go through a save). */
  readonly mutations: readonly string[]
  /**
   * Files that hold the mutation and hand it to `screen` as a callback, which asks before it calls it (a data
   * hook next to the card with the button, the connected screen around a list).
   */
  readonly calledFrom?: readonly string[]
}

export const DESTRUCTIVE_ACTIONS = {
  // WEB-37 / NM-03
  singleAssessment: { tone: 'destructive', screen: 'src/screens/master-data/MasterDataScreen.tsx', trigger: 'kopplung-einzel', mutations: [] },
  endPartnerLink: { tone: 'destructive', screen: 'src/screens/master-data/PartnerLinkStatus.tsx', trigger: 'kopplung-beenden', mutations: ['useHouseholdControllerEndPartner'] },
  householdLeave: { tone: 'destructive', screen: 'src/screens/children/HouseholdChildrenSection.tsx', trigger: 'haushalt-nicht-mehr-dabei-', mutations: ['useHouseholdControllerLeave'] },
  householdDelete: { tone: 'destructive', screen: 'src/screens/children/HouseholdChildrenSection.tsx', trigger: 'haushalt-loeschen-', mutations: ['useHouseholdControllerDelete'] },
  lstbDiscardDraft: { tone: 'destructive', screen: 'src/screens/lstb/scan/LstbScanPanel.tsx', trigger: 'lstb-scan-discard', mutations: [] },
  rentalRemoveRepair: { tone: 'destructive', screen: 'src/screens/rental/RentalScreen.tsx', trigger: '-entfernen', mutations: [] },
  // WEB-18
  childDelete: { tone: 'destructive', screen: 'src/screens/children/ChildCard.tsx', trigger: 'kind-loeschen-', mutations: ['useChildrenControllerDelete'], calledFrom: ['src/screens/children/useChildren.ts'] },
  // WEB-38 / NC-04
  bookingReverse: { tone: 'final', screen: 'src/screens/business/BookPage.tsx', trigger: 'buch-storno-', mutations: ['useBusinessControllerReverse'] },
  bookLock: { tone: 'final', screen: 'src/screens/business/BookPage.tsx', trigger: 'buch-festschreiben', mutations: ['useBusinessControllerLock'] },
  assetDispose: { tone: 'final', screen: 'src/screens/business/AssetsPage.tsx', trigger: 'anlage-abgang-buchen', mutations: ['useBusinessControllerDisposeAsset'] },
  depreciationBook: { tone: 'final', screen: 'src/screens/business/AssetsPage.tsx', trigger: 'anlage-afa-buchen', mutations: ['useBusinessControllerBookDepreciation'] },
  openingBalance: { tone: 'final', screen: 'src/screens/business/ClosingPage.tsx', trigger: 'abschluss-eroeffnung', mutations: ['useBusinessControllerCarryForward'] },
  eBilanzSend: { tone: 'final', screen: 'src/screens/business/ExportPage.tsx', trigger: 'ebilanz-senden', mutations: ['useBusinessControllerTransmitEBilanz'] },
  // NC-14
  bankIgnore: { tone: 'destructive', screen: 'src/screens/business/BankPage.tsx', trigger: 'bank-ignorieren-', mutations: ['useBusinessControllerIgnoreBank'] },
  shareRemove: { tone: 'destructive', screen: 'src/screens/business/SharesPage.tsx', trigger: 'beteiligung-entfernen-', mutations: [] },
  proposalDiscard: { tone: 'destructive', screen: 'src/screens/confirmation/ConfirmationScreen.tsx', trigger: 'vorschlag-verwerfen-', mutations: ['useConfirmationControllerDecideProposal'] },
  taskDiscard: { tone: 'destructive', screen: 'src/screens/confirmation/ConfirmationScreen.tsx', trigger: 'aufgabe-verwerfen-', mutations: ['useConfirmationControllerDecideTask'] },
  submissionWithdraw: { tone: 'destructive', screen: 'src/screens/cockpit/SubmissionMarker.tsx', trigger: 'cockpit-abgabe-zuruecknehmen', mutations: ['useSubmissionControllerWithdraw'] },
  // NR-19
  noteDelete: {
    tone: 'destructive',
    screen: 'src/screens/advisor/chat/ProjectNotes.tsx',
    trigger: 'eule-note-delete',
    mutations: ['useAdvisorControllerDeleteNote'],
    calledFrom: ['src/screens/advisor/OwlModeScreen.connected.tsx'],
  },
  assistantRevoke: { tone: 'destructive', screen: 'src/screens/profile/AssistentenListSection.tsx', trigger: 'assistent-widerrufen-', mutations: ['useAssistantsControllerRevoke'] },
} as const satisfies Record<string, DestructiveAction>

export type DestructiveActionId = keyof typeof DESTRUCTIVE_ACTIONS

/**
 * Destructive operations (as their generated hook) that a screen calls with a confirmation of its own instead
 * of the registry, each with its reason. A screen that calls a new destructive operation lands in the
 * registry or here; the lock test fails otherwise.
 */
export const UNCONFIRMED_DESTRUCTIVE_MUTATIONS: Readonly<Record<string, string>> = {
  useAccountDeletionControllerDeleteAccount: 'Account deletion asks for the password and a typed confirmation of its own (P7, PrivacyScreen).',
  useAdvisorControllerClearConversation: 'The owl settings ask with their own card that names what is lost (advisor.chat.clear.confirmBody).',
  useAdvisorControllerDeleteConversation: 'Called only after the clear confirmation above.',
  useReceiptControllerDelete: 'The receipt inbox asks with its own confirmation (ReceiptsScreen).',
}
