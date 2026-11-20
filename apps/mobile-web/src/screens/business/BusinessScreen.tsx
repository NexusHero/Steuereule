import { useTranslation } from 'react-i18next'
import { APP_NS } from '../../i18n/resources'
import { BusinessHome } from './BusinessHome'
import { ProfilePage } from './ProfilePage'
import { BookPage } from './BookPage'
import { QuickEntryPage } from './QuickEntryPage'
import { BankPage } from './BankPage'
import { AssetsPage } from './AssetsPage'
import { ClosingPage } from './ClosingPage'
import { VatPage, TradeTaxPage, LossesPage } from './TaxPages'
import { ElsterPage } from './ElsterPage'
import { ExportPage } from './ExportPage'
import { CheckoutPage } from './CheckoutPage'
import { ProfessionPage } from './ProfessionPage'
import { TradeInputsPage } from './TradeInputsPage'
import { SharesPage } from './SharesPage'
import type { Person } from './businessKit'

export const BUSINESS_PAGES = ['profil', 'buch', 'erfassung', 'bank', 'anlagen', 'abschluss', 'umsatzsteuer', 'gewerbesteuer', 'verluste', 'elster', 'export', 'freischalten', 'beruf', 'gewerbedaten', 'beteiligungen'] as const
export type BusinessPage = (typeof BUSINESS_PAGES)[number]

export function isBusinessPage(value: string | undefined): value is BusinessPage {
  return value !== undefined && (BUSINESS_PAGES as readonly string[]).includes(value)
}

export interface BusinessPageProps {
  readonly taxYear: number
  readonly person: Person
  readonly onBack: () => void
  readonly onOpenPage: (page: BusinessPage | undefined) => void
}

export interface BusinessScreenProps extends BusinessPageProps {
  readonly page: string | undefined
  /** Back from the checkout of the self-employment tier: `?zahlung=erfolg` or `abbruch`. */
  readonly payment?: string | undefined
  /** A couple records one business per person; the area's overview switches between A and B. */
  readonly onChangePerson?: (person: Person) => void
}

/** The self-employed area (ADR-0101): an overview of one phone screen, every topic on a page of its own. */
export function BusinessScreen({ page, onChangePerson, payment, ...props }: BusinessScreenProps) {
  useTranslation(APP_NS)
  if (!isBusinessPage(page)) return <BusinessHome {...props} {...(onChangePerson ? { onChangePerson } : {})} />
  switch (page) {
    case 'profil':
      return <ProfilePage {...props} />
    case 'buch':
      return <BookPage {...props} />
    case 'erfassung':
      return <QuickEntryPage {...props} />
    case 'bank':
      return <BankPage {...props} />
    case 'anlagen':
      return <AssetsPage {...props} />
    case 'abschluss':
      return <ClosingPage {...props} />
    case 'umsatzsteuer':
      return <VatPage {...props} />
    case 'gewerbesteuer':
      return <TradeTaxPage {...props} />
    case 'verluste':
      return <LossesPage {...props} />
    case 'elster':
      return <ElsterPage {...props} payment={payment} />
    case 'export':
      return <ExportPage {...props} />
    case 'freischalten':
      return <CheckoutPage {...props} />
    case 'beruf':
      return <ProfessionPage {...props} />
    case 'gewerbedaten':
      return <TradeInputsPage {...props} />
    case 'beteiligungen':
      return <SharesPage {...props} />
  }
}
