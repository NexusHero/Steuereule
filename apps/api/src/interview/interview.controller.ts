import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CurrentUser, CurrentUserKind } from '../auth/current-user.decorator.js'
import { UserContextGuard, type UserIdKind } from '../auth/user-context.guard.js'
import { ParseTaxYearPipe } from '../cockpit/parse-tax-year.pipe.js'
import { InterviewStateDto } from './dto/interview-state.dto.js'
import { PostAnswerDto } from './dto/post-answer.dto.js'
import { PostAnswerResponseDto } from './dto/post-answer-response.dto.js'
import { InterviewService } from './interview.service.js'

@ApiTags('interview')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class InterviewController {
  constructor(@Inject(InterviewService) private readonly interviewService: InterviewService) {}

  @Get(':jahr/interview')
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: InterviewStateDto, description: 'The caller’s Minimal-Gate state for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session targeting a catalogue entry other than the Minimal-Gate — that requires a signed-in account (ADR-0045).' })
  @ApiQuery({ name: 'eintrag', required: false, enum: ['minimal-gate', 'segment-2', 'lebenslagen', 'einkuenfte', 'sonderausgaben', 'segment-ch', 'alleinerziehend'], description: 'The catalogue entry to re-enter; absent → the Minimal-Gate.' })
  getInterview(
    @CurrentUser() userId: string,
    @CurrentUserKind() kind: UserIdKind,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('eintrag') entry?: string,
  ): Promise<InterviewStateDto> {
    return this.interviewService.getState(userId, year, entry, kind)
  }

  @Post(':jahr/interview/antworten')
  @HttpCode(200)
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiBody({ type: PostAnswerDto })
  @ApiOkResponse({ type: PostAnswerResponseDto, description: 'The next step and open-items count after this write.' })
  @ApiBadRequestResponse({ description: 'value is not an accepted answer for questionId — nothing was persisted.' })
  @ApiConflictResponse({ description: 'questionId is not reachable given the answers stored so far — nothing was persisted.' })
  @ApiUnauthorizedResponse({ description: 'Guest session targeting a catalogue entry other than the Minimal-Gate — that requires a signed-in account (ADR-0045).' })
  postAnswer(
    @CurrentUser() userId: string,
    @CurrentUserKind() kind: UserIdKind,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PostAnswerDto,
  ): Promise<PostAnswerResponseDto> {
    return this.interviewService.postAnswer(userId, year, dto, kind)
  }
}
