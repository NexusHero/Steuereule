// Export module (ADR-0013 §4, REQ-011): wires the export endpoint, its service,
// repository seam, PDF renderer seam, and audit dependency. Mirrors the same
// DI pattern as ProfileModule / CockpitModule.
import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ExportController } from './export.controller.js'
import { ExportService } from './export.service.js'
import { PrismaExportRepository } from './export.repository.prisma.js'
import { EXPORT_REPOSITORY } from './export.repository.js'
import { PDF_RENDERER } from './pdf-renderer.js'
import { LoggingPdfRenderer } from './logging-pdf-renderer.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ExportController],
  providers: [
    ExportService,
    { provide: EXPORT_REPOSITORY, useClass: PrismaExportRepository },
    { provide: PDF_RENDERER, useClass: LoggingPdfRenderer },
  ],
})
export class ExportModule {}
