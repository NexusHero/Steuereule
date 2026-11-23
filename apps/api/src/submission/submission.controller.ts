import { Body, Controller, Delete, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { RequiresVerifiedEmail } from '../auth/requires-verified-email.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { SubmissionResultDto, SubmitTaxReturnDto } from './dto/submission.dto.js'
import { SubmissionService } from './submission.service.js'

/** „Ich habe die Erklärung abgegeben“ (ADR-0098 §8). Account-only like the Verlauf and the Bescheid it feeds. */
@ApiTags('abgabe')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class SubmissionController {
  constructor(@Inject(SubmissionService) private readonly service: SubmissionService) {}

  @Post(':jahr/abgabe')
  @HttpCode(200)
  @RequiresAccount()
  // Filing the return is the most sensitive outward action — it requires a verified email (ADR-0103 §4).
  @RequiresVerifiedEmail()
  @ApiParam({ name: 'jahr', type: Number, example: 2025, description: 'The tax year (Steuerjahr).' })
  @ApiBody({ type: SubmitTaxReturnDto })
  @ApiOkResponse({ type: SubmissionResultDto, description: 'The return as it stands is frozen as the filed version; the year is `eingereicht`.' })
  @ApiBadRequestResponse({ description: '`SUBMISSION_DATE_INVALID` (details.problem: format | vor-jahresende | in-der-zukunft).' })
  @ApiNotFoundResponse({ description: '`TAX_YEAR_NOT_FOUND`: nothing entered for the year yet.' })
  @ApiConflictResponse({ description: '`SUBMISSION_NOT_ALLOWED` (Eckjahr or closed year) or `SUBMISSION_HAS_ASSESSMENT` (a Bescheid is recorded).' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  submit(
    @CurrentUser() userId: string,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: SubmitTaxReturnDto,
  ): Promise<SubmissionResultDto> {
    return this.service.submit(userId, year, dto)
  }

  @Delete(':jahr/abgabe')
  @HttpCode(204)
  @RequiresAccount()
  @ApiParam({ name: 'jahr', type: Number, example: 2025, description: 'The tax year (Steuerjahr).' })
  @ApiNoContentResponse({ description: 'The submission is undone: the filed version is removed and the year is `entwurf` again.' })
  @ApiNotFoundResponse({ description: '`SUBMISSION_NOT_FOUND`: the year has no submission to undo.' })
  @ApiConflictResponse({ description: '`SUBMISSION_HAS_ASSESSMENT`: a Bescheid is recorded, the submission stays.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  async withdraw(@CurrentUser() userId: string, @Param('jahr', ParseTaxYearPipe) year: number): Promise<void> {
    await this.service.withdraw(userId, year)
  }
}
