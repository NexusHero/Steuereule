import { Body, Controller, Get, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common'
import {
  ApiBody,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { AssessmentService } from './assessment.service.js'
import { ParseAssessmentFieldPipe } from './parse-assessment-field.pipe.js'
import { PutAssessmentFieldDto } from './dto/assessment-field.dto.js'
import {
  AssessmentResponseDto,
  SetAssessmentDateDto,
  SetAssessmentStatusDto,
  SetAppealDto,
} from './dto/assessment-response.dto.js'

@ApiTags('bescheid')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class AssessmentController {
  constructor(@Inject(AssessmentService) private readonly service: AssessmentService) {}

  @Get(':jahr/bescheid')
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The caller’s Bescheid — re-entry (fields + Abgleich + Frist).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  get(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<AssessmentResponseDto> {
    return this.service.getState(userId, year)
  }

  @Put(':jahr/bescheid/feld/:feld')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiParam({ name: 'feld', type: String, example: 'einnahmen', description: 'One of the five Bescheid figures (ParseBescheidFeldPipe).' })
  @ApiBody({ type: PutAssessmentFieldDto })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The updated Bescheid and its derived Abgleich + Frist.' })
  setField(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Param('feld', ParseAssessmentFieldPipe) field: Parameters<AssessmentService['setField']>[2],
    @Body() dto: PutAssessmentFieldDto,
  ): Promise<AssessmentResponseDto> {
    return this.service.setField(userId, year, field, dto)
  }

  @Put(':jahr/bescheid/datum')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetAssessmentDateDto })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The updated Bescheid (Bescheiddatum + Frist).' })
  setDate(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SetAssessmentDateDto,
  ): Promise<AssessmentResponseDto> {
    return this.service.setDate(userId, year, dto)
  }

  @Put(':jahr/bescheid/status')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetAssessmentStatusDto })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The Bescheid after the validated transition.' })
  setStatus(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SetAssessmentStatusDto,
  ): Promise<AssessmentResponseDto> {
    return this.service.setStatus(userId, year, dto)
  }

  @Put(':jahr/bescheid/einspruch')
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2026, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SetAppealDto })
  @ApiOkResponse({ type: AssessmentResponseDto, description: 'The Bescheid after filing the Einspruch (validated transition).' })
  setAppeal(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SetAppealDto,
  ): Promise<AssessmentResponseDto> {
    return this.service.setAppeal(userId, year, dto)
  }
}
