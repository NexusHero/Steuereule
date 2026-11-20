import { accountFor, E_BILANZ_ELEMENTS, findAccount, type BalanceSheetPosition, type ChartOfAccounts } from './accounts'
import { vatOnNet, yearOf, type EntryDraft, type IsoDate } from './journal'

/**
 * The asset register (Anlagenverzeichnis, § 4 Abs. 3 S. 5 EStG for the EÜR, the Anlagenspiegel for the
 * Bilanz). The yearly depreciation is an input: depreciation.ts of the tax rules computes it; this
 * module only carries book values and turns the amounts into entries.
 */

export interface AssetDisposal {
  readonly date: IsoDate
  /** Net sale price; omitted when the asset was scrapped or withdrawn by other means. */
  readonly proceedsNet?: number
  /** VAT on the sale; a Kleinunternehmer or an exempt business sells without. */
  readonly vat?: 'ust19' | 'none'
}

export interface FixedAsset {
  readonly id: string
  readonly label: string
  /** The asset account it is capitalised on (its number in the ledger's chart). */
  readonly account: string
  readonly acquisitionDate: IsoDate
  /** Net acquisition or production cost in cents. */
  readonly acquisitionCost: number
  /** Depreciation per year in cents, including any Sonder-AfA, as depreciation.ts computed it. */
  readonly depreciationByYear: Readonly<Record<number, number>>
  readonly disposal?: AssetDisposal
}

export interface AssetRegisterRow {
  readonly id: string
  readonly label: string
  readonly account: string
  readonly acquisitionDate: IsoDate
  readonly acquisitionCost: number
  readonly openingBookValue: number
  readonly additions: number
  readonly depreciation: number
  /** Book value that left with a disposal in the year. */
  readonly disposals: number
  readonly closingBookValue: number
}

export class AssetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssetError'
  }
}

function depreciationThrough(asset: FixedAsset, year: number): number {
  let total = 0
  for (const [y, amount] of Object.entries(asset.depreciationByYear)) if (Number(y) <= year) total += amount
  return total
}

function validate(asset: FixedAsset): void {
  const years = Object.keys(asset.depreciationByYear).map(Number)
  if (!Number.isSafeInteger(asset.acquisitionCost) || asset.acquisitionCost < 0) throw new AssetError(`${asset.label}: Anschaffungskosten ungültig`)
  for (const y of years) {
    const amount = asset.depreciationByYear[y]!
    if (!Number.isSafeInteger(amount) || amount < 0) throw new AssetError(`${asset.label}: Abschreibung ${y} ungültig`)
    if (y < yearOf(asset.acquisitionDate)) throw new AssetError(`${asset.label}: Abschreibung vor der Anschaffung (${y})`)
    if (asset.disposal !== undefined && y > yearOf(asset.disposal.date)) throw new AssetError(`${asset.label}: Abschreibung nach dem Abgang (${y})`)
  }
  if (depreciationThrough(asset, Number.MAX_SAFE_INTEGER) > asset.acquisitionCost) throw new AssetError(`${asset.label}: mehr abgeschrieben als angeschafft`)
}

export function bookValueAtEndOf(asset: FixedAsset, year: number): number {
  if (yearOf(asset.acquisitionDate) > year) return 0
  if (asset.disposal !== undefined && yearOf(asset.disposal.date) <= year) return 0
  return asset.acquisitionCost - depreciationThrough(asset, year)
}

export function assetRegister(assets: readonly FixedAsset[], year: number): { readonly rows: readonly AssetRegisterRow[]; readonly totals: Omit<AssetRegisterRow, 'id' | 'label' | 'account' | 'acquisitionDate'> } {
  const rows: AssetRegisterRow[] = []
  for (const asset of assets) {
    validate(asset)
    const acquired = yearOf(asset.acquisitionDate)
    const disposedIn = asset.disposal === undefined ? null : yearOf(asset.disposal.date)
    if (acquired > year || (disposedIn !== null && disposedIn < year)) continue
    const depreciation = asset.depreciationByYear[year] ?? 0
    const openingBookValue = acquired === year ? 0 : asset.acquisitionCost - depreciationThrough(asset, year - 1)
    const additions = acquired === year ? asset.acquisitionCost : 0
    const disposals = disposedIn === year ? openingBookValue + additions - depreciation : 0
    rows.push({
      id: asset.id, label: asset.label, account: asset.account, acquisitionDate: asset.acquisitionDate, acquisitionCost: asset.acquisitionCost,
      openingBookValue, additions, depreciation, disposals, closingBookValue: openingBookValue + additions - depreciation - disposals,
    })
  }
  const total = (k: keyof AssetRegisterRow): number => rows.reduce((s, r) => s + (r[k] as number), 0)
  return {
    rows,
    totals: {
      acquisitionCost: total('acquisitionCost'), openingBookValue: total('openingBookValue'), additions: total('additions'),
      depreciation: total('depreciation'), disposals: total('disposals'), closingBookValue: total('closingBookValue'),
    },
  }
}

function depreciationAccount(chart: ChartOfAccounts, asset: FixedAsset): string {
  const account = findAccount(chart, asset.account)
  if (account?.depreciationConcept === null || account === null) throw new AssetError(`${asset.label}: Konto ${asset.account} ist kein Anlagekonto`)
  return accountFor(chart, account.depreciationConcept).number
}

/** One depreciation entry per asset with an amount in the year, dated at year end or at the disposal. */
export function depreciationDrafts(chart: ChartOfAccounts, assets: readonly FixedAsset[], year: number): readonly EntryDraft[] {
  const drafts: EntryDraft[] = []
  for (const asset of assets) {
    validate(asset)
    const amount = asset.depreciationByYear[year] ?? 0
    if (amount === 0) continue
    const disposedThisYear = asset.disposal !== undefined && yearOf(asset.disposal.date) === year
    drafts.push({
      date: disposedThisYear ? asset.disposal!.date : `${year}-12-31`,
      documentNumber: `AfA-${year}-${asset.id}`,
      text: `Abschreibung ${year}: ${asset.label}`,
      lines: [
        { account: depreciationAccount(chart, asset), side: 'debit', amount },
        { account: asset.account, side: 'credit', amount },
      ],
    })
  }
  return drafts
}

/**
 * Disposal entries of the year: the remaining book value leaves the asset account (as expense in the
 * EÜR, „Restbuchwert“), and a sale brings the proceeds to the bank. Book the year's depreciation first.
 */
export function disposalDrafts(chart: ChartOfAccounts, assets: readonly FixedAsset[], year: number, bankAccount: string): readonly EntryDraft[] {
  const drafts: EntryDraft[] = []
  for (const asset of assets) {
    validate(asset)
    const disposal = asset.disposal
    if (disposal === undefined || yearOf(disposal.date) !== year) continue
    const bookValue = asset.acquisitionCost - depreciationThrough(asset, year)
    const proceeds = disposal.proceedsNet ?? 0
    const bookValueAccount = accountFor(chart, proceeds >= bookValue ? 'asset_disposal_gain_book_value' : 'asset_disposal_loss_book_value').number
    if (bookValue > 0) {
      drafts.push({
        date: disposal.date,
        documentNumber: `Abgang-${asset.id}`,
        text: `Abgang ${asset.label}: Restbuchwert`,
        lines: [
          { account: bookValueAccount, side: 'debit', amount: bookValue },
          { account: asset.account, side: 'credit', amount: bookValue },
        ],
      })
    }
    if (proceeds > 0) {
      const vat = disposal.vat === 'none' ? 0 : vatOnNet(proceeds, 19)
      drafts.push({
        date: disposal.date,
        documentNumber: `Verkauf-${asset.id}`,
        text: `Verkauf ${asset.label}`,
        lines: [
          { account: bankAccount, side: 'debit', amount: proceeds + vat },
          { account: accountFor(chart, 'asset_sale_19').number, side: 'credit', amount: proceeds, taxKey: vat === 0 ? 'none' : 'ust19', amountIs: 'net' },
        ],
      })
    }
  }
  return drafts
}

export interface AnlagespiegelColumns {
  readonly acquisitionCostOpening: number
  readonly additions: number
  readonly disposalsAtCost: number
  readonly acquisitionCostClosing: number
  readonly depreciationOpening: number
  readonly depreciationOfYear: number
  /** Accumulated depreciation that leaves with the disposed assets. */
  readonly depreciationOnDisposals: number
  readonly depreciationClosing: number
  readonly bookValueOpening: number
  readonly bookValueClosing: number
}

export interface AnlagespiegelRow extends AnlagespiegelColumns {
  readonly position: BalanceSheetPosition
  readonly element: string
}

const ZERO: AnlagespiegelColumns = {
  acquisitionCostOpening: 0, additions: 0, disposalsAtCost: 0, acquisitionCostClosing: 0, depreciationOpening: 0,
  depreciationOfYear: 0, depreciationOnDisposals: 0, depreciationClosing: 0, bookValueOpening: 0, bookValueClosing: 0,
}

function addColumns(a: AnlagespiegelColumns, b: AnlagespiegelColumns): AnlagespiegelColumns {
  return Object.fromEntries((Object.keys(ZERO) as (keyof AnlagespiegelColumns)[]).map((k) => [k, a[k] + b[k]])) as unknown as AnlagespiegelColumns
}

/**
 * The gross Anlagenspiegel per fixed-asset position (§ 284 Abs. 3 HGB layout), a Mussfeld of the
 * E-Bilanz for Wirtschaftsjahre beginning after 31.12.2016 (BMF-Schreiben vom 24.5.2016). An asset
 * written off but still owned stays in at cost and with its full depreciation.
 */
export function anlagespiegel(chart: ChartOfAccounts, assets: readonly FixedAsset[], year: number): { readonly rows: readonly AnlagespiegelRow[]; readonly totals: AnlagespiegelColumns } {
  const byPosition = new Map<BalanceSheetPosition, AnlagespiegelColumns>()
  for (const asset of assets) {
    validate(asset)
    const account = findAccount(chart, asset.account)
    if (account === null || account.depreciationConcept === null) throw new AssetError(`${asset.label}: Konto ${asset.account} ist kein Anlagekonto`)
    const acquired = yearOf(asset.acquisitionDate)
    const disposedIn = asset.disposal === undefined ? null : yearOf(asset.disposal.date)
    if (acquired > year || (disposedIn !== null && disposedIn < year)) continue
    const isNew = acquired === year
    const leaves = disposedIn === year
    const costOpening = isNew ? 0 : asset.acquisitionCost
    const deprOpening = isNew ? 0 : depreciationThrough(asset, year - 1)
    const deprYear = asset.depreciationByYear[year] ?? 0
    const costClosing = leaves ? 0 : asset.acquisitionCost
    const deprClosing = leaves ? 0 : deprOpening + deprYear
    const columns: AnlagespiegelColumns = {
      acquisitionCostOpening: costOpening,
      additions: isNew ? asset.acquisitionCost : 0,
      disposalsAtCost: leaves ? asset.acquisitionCost : 0,
      acquisitionCostClosing: costClosing,
      depreciationOpening: deprOpening,
      depreciationOfYear: deprYear,
      depreciationOnDisposals: leaves ? deprOpening + deprYear : 0,
      depreciationClosing: deprClosing,
      bookValueOpening: costOpening - deprOpening,
      bookValueClosing: costClosing - deprClosing,
    }
    const position = account.hgb as BalanceSheetPosition
    byPosition.set(position, addColumns(byPosition.get(position) ?? ZERO, columns))
  }
  const rows = [...byPosition.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([position, columns]): AnlagespiegelRow => ({ position, element: E_BILANZ_ELEMENTS[position], ...columns }))
  return { rows, totals: rows.reduce<AnlagespiegelColumns>((t, r) => addColumns(t, r), ZERO) }
}
