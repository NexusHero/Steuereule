import { Inject, Injectable } from '@nestjs/common'
import { AssetService } from './asset.service.js'
import { BankImportService } from './bank-import.service.js'
import { BusinessElsterService } from './business-elster.service.js'
import { BusinessExportService } from './business-export.service.js'
import { BusinessProfileService } from './business-profile.service.js'
import { BusinessSummaryService } from './business-summary.service.js'
import { BusinessTaxService } from './business-tax.service.js'
import { LedgerService } from './ledger.service.js'
import { PayrollService } from './payroll.service.js'
import { VatService } from './vat.service.js'

/**
 * The self-employment path (ADR-0101) as one object, for the callers that were written against it: the
 * controller and the modules outside this folder. Every method delegates to the provider that owns it;
 * no rule lives here. New code depends on the provider it needs.
 */
@Injectable()
export class BusinessService {
  constructor(
    @Inject(BusinessProfileService) private readonly profiles: BusinessProfileService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(BankImportService) private readonly bank: BankImportService,
    @Inject(AssetService) private readonly fixedAssets: AssetService,
    @Inject(PayrollService) private readonly payrollRuns: PayrollService,
    @Inject(VatService) private readonly vat: VatService,
    @Inject(BusinessTaxService) private readonly tax: BusinessTaxService,
    @Inject(BusinessSummaryService) private readonly summary: BusinessSummaryService,
    @Inject(BusinessElsterService) private readonly elster: BusinessElsterService,
    @Inject(BusinessExportService) private readonly exports: BusinessExportService,
  ) {}

  // The businesses of a person and their profiles
  pathOpen(...args: Parameters<BusinessProfileService['pathOpen']>) {
    return this.profiles.pathOpen(...args)
  }
  getProfile(...args: Parameters<BusinessProfileService['getProfile']>) {
    return this.profiles.getProfile(...args)
  }
  listBusinesses(...args: Parameters<BusinessProfileService['listBusinesses']>) {
    return this.profiles.listBusinesses(...args)
  }
  addBusiness(...args: Parameters<BusinessProfileService['addBusiness']>) {
    return this.profiles.addBusiness(...args)
  }
  removeBusiness(...args: Parameters<BusinessProfileService['removeBusiness']>) {
    return this.profiles.removeBusiness(...args)
  }
  saveProfile(...args: Parameters<BusinessProfileService['saveProfile']>) {
    return this.profiles.saveProfile(...args)
  }

  // The book and the booking drafts
  getBook(...args: Parameters<LedgerService['getBook']>) {
    return this.ledger.getBook(...args)
  }
  post(...args: Parameters<LedgerService['post']>) {
    return this.ledger.post(...args)
  }
  reverse(...args: Parameters<LedgerService['reverse']>) {
    return this.ledger.reverse(...args)
  }
  quickEntry(...args: Parameters<LedgerService['quickEntry']>) {
    return this.ledger.quickEntry(...args)
  }
  lock(...args: Parameters<LedgerService['lock']>) {
    return this.ledger.lock(...args)
  }
  acceptedDraft(...args: Parameters<LedgerService['acceptedDraft']>) {
    return this.ledger.acceptedDraft(...args)
  }
  applyDraft(...args: Parameters<LedgerService['applyDraft']>) {
    return this.ledger.applyDraft(...args)
  }

  // Bank import
  importBank(...args: Parameters<BankImportService['importBank']>) {
    return this.bank.importBank(...args)
  }
  listBank(...args: Parameters<BankImportService['listBank']>) {
    return this.bank.listBank(...args)
  }
  acceptBank(...args: Parameters<BankImportService['acceptBank']>) {
    return this.bank.acceptBank(...args)
  }
  ignoreBank(...args: Parameters<BankImportService['ignoreBank']>) {
    return this.bank.ignoreBank(...args)
  }

  // Fixed assets and the Firmenwagen
  assets(...args: Parameters<AssetService['assets']>) {
    return this.fixedAssets.assets(...args)
  }
  createAsset(...args: Parameters<AssetService['createAsset']>) {
    return this.fixedAssets.createAsset(...args)
  }
  setAssetFacts(...args: Parameters<AssetService['setAssetFacts']>) {
    return this.fixedAssets.setAssetFacts(...args)
  }
  disposeAsset(...args: Parameters<AssetService['disposeAsset']>) {
    return this.fixedAssets.disposeAsset(...args)
  }
  bookDepreciation(...args: Parameters<AssetService['bookDepreciation']>) {
    return this.fixedAssets.bookDepreciation(...args)
  }
  companyCar(...args: Parameters<AssetService['companyCar']>) {
    return this.fixedAssets.companyCar(...args)
  }
  bookCompanyCar(...args: Parameters<AssetService['bookCompanyCar']>) {
    return this.fixedAssets.bookCompanyCar(...args)
  }

  // Lohn
  addPayrollRun(...args: Parameters<PayrollService['addPayrollRun']>) {
    return this.payrollRuns.addPayrollRun(...args)
  }
  payroll(...args: Parameters<PayrollService['payroll']>) {
    return this.payrollRuns.payroll(...args)
  }

  // Umsatzsteuer
  vatReturn(...args: Parameters<VatService['vatReturn']>) {
    return this.vat.vatReturn(...args)
  }
  vatPrepayments(...args: Parameters<VatService['vatPrepayments']>) {
    return this.vat.vatPrepayments(...args)
  }

  // Closing, Gewerbesteuer, losses, special tariffs
  closing(...args: Parameters<BusinessTaxService['closing']>) {
    return this.tax.closing(...args)
  }
  carryForward(...args: Parameters<BusinessTaxService['carryForward']>) {
    return this.tax.carryForward(...args)
  }
  lookupHebesatz(...args: Parameters<BusinessTaxService['lookupHebesatz']>) {
    return this.tax.lookupHebesatz(...args)
  }
  tradeTax(...args: Parameters<BusinessTaxService['tradeTax']>) {
    return this.tax.tradeTax(...args)
  }
  losses(...args: Parameters<BusinessTaxService['losses']>) {
    return this.tax.losses(...args)
  }
  specialTariffs(...args: Parameters<BusinessTaxService['specialTariffs']>) {
    return this.tax.specialTariffs(...args)
  }

  // For the estimate and the owl
  estimateInput(...args: Parameters<BusinessSummaryService['estimateInput']>) {
    return this.summary.estimateInput(...args)
  }
  digest(...args: Parameters<BusinessSummaryService['digest']>) {
    return this.summary.digest(...args)
  }
  bookingTarget(...args: Parameters<BusinessSummaryService['bookingTarget']>) {
    return this.summary.bookingTarget(...args)
  }

  // ELSTER fill-in help
  assertElsterOpen(...args: Parameters<BusinessElsterService['assertElsterOpen']>) {
    return this.elster.assertElsterOpen(...args)
  }
  elsterFormsWithValues(...args: Parameters<BusinessElsterService['elsterFormsWithValues']>) {
    return this.elster.elsterFormsWithValues(...args)
  }
  elsterHelp(...args: Parameters<BusinessElsterService['elsterHelp']>) {
    return this.elster.elsterHelp(...args)
  }

  // Exports
  gobdExport(...args: Parameters<BusinessExportService['gobdExport']>) {
    return this.exports.gobdExport(...args)
  }
  procedureDoc(...args: Parameters<BusinessExportService['procedureDoc']>) {
    return this.exports.procedureDoc(...args)
  }
  saveProcedureDoc(...args: Parameters<BusinessExportService['saveProcedureDoc']>) {
    return this.exports.saveProcedureDoc(...args)
  }
  eBilanz(...args: Parameters<BusinessExportService['eBilanz']>) {
    return this.exports.eBilanz(...args)
  }
  transmitEBilanz(...args: Parameters<BusinessExportService['transmitEBilanz']>) {
    return this.exports.transmitEBilanz(...args)
  }
}
