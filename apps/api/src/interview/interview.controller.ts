import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common'
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
import { LinkService } from '../link/link.service.js'
import { ParsePersonPipe } from '../link/parse-person.pipe.js'
import { InterviewStateDto } from './dto/interview-state.dto.js'
import { PostAnswerDto } from './dto/post-answer.dto.js'
import { PostAnswerResponseDto } from './dto/post-answer-response.dto.js'
import { InterviewService, PERSONAL_ENTRY_IDS } from './interview.service.js'

@ApiTags('interview')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class InterviewController {
  constructor(
    @Inject(InterviewService) private readonly interviewService: InterviewService,
    @Inject(LinkService) private readonly link: LinkService,
  ) {}

  /** Person B answers only the personal entries, recorded by the user in B's record (ADR-0088). */
  private async partner(userId: string, year: number, entry: string | undefined): Promise<string> {
    if (entry === undefined || !(PERSONAL_ENTRY_IDS as readonly string[]).includes(entry)) {
      throw new BadRequestException('Für Person B gibt es nur die persönlichen Kataloge (Lebenslagen, Sonderausgaben).')
    }
    return this.link.dataUser(userId, year, 'B')
  }

  @Get(':jahr/interview')
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: InterviewStateDto, description: 'The caller’s Minimal-Gate state for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session targeting a catalogue entry other than the Minimal-Gate — that requires a signed-in account (ADR-0045).' })
  @ApiQuery({ name: 'eintrag', required: false, enum: ['minimal-gate', 'segment-2', 'lebenslagen', 'einkuenfte', 'sonderausgaben', 'segment-ch', 'alleinerziehend', 'haushalt', 'gesundheit', 'vorauszahlungen', 'berufsprofil'], description: 'The catalogue entry to re-enter; absent → the Minimal-Gate.' })
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: the personal entries (Lebenslagen, Sonderausgaben) of a partner the user records (ADR-0088).' })
  async getInterview(
    @CurrentUser() userId: string,
    @CurrentUserKind() kind: UserIdKind,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Query('eintrag') entry?: string,
    @Query('person', ParsePersonPipe) person: 'A' | 'B' = 'A',
  ): Promise<InterviewStateDto> {
    if (person === 'B') return this.interviewService.getState(await this.partner(userId, year, entry), year, entry, kind)
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
  @ApiQuery({ name: 'person', required: false, enum: ['A', 'B'], description: 'B: an answer of a personal entry for a partner the user records (ADR-0088).' })
  async postAnswer(
    @CurrentUser() userId: string,
    @CurrentUserKind() kind: UserIdKind,
    @Param('jahr', ParseTaxYearPipe) year: number,
    @Body() dto: PostAnswerDto,
    @Query('person', ParsePersonPipe) person: 'A' | 'B' = 'A',
  ): Promise<PostAnswerResponseDto> {
    if (person === 'B') return this.interviewService.postAnswer(await this.link.dataUser(userId, year, 'B'), year, dto, kind, true)
    return this.interviewService.postAnswer(userId, year, dto, kind)
  }
}
