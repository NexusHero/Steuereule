import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { CurrentUser } from '../auth/current-user.decorator.js'
import { RequiresAccount } from '../auth/requires-account.guard.js'
import { UserContextGuard } from '../auth/user-context.guard.js'
// Reused directly, not duplicated — same lesson as REQ-001's R1 (see the pipe's own
// header comment): `jahr` is always validated against a sensible tax-year window,
// never just "parses as a number".
import { ParseSteuerjahrPipe } from '../cockpit/parse-steuerjahr.pipe.js'
import { InterviewStateDto } from './dto/interview-state.dto.js'
import { PostAnswerDto } from './dto/post-answer.dto.js'
import { PostAnswerResponseDto } from './dto/post-answer-response.dto.js'
import { InterviewService } from './interview.service.js'

@ApiTags('interview')
@Controller('v1/steuerjahre')
@UseGuards(UserContextGuard)
export class InterviewController {
  // Explicit token — see the comment on ProfileController's constructor.
  constructor(@Inject(InterviewService) private readonly interviewService: InterviewService) {}

  @Get(':jahr/interview')
  // #318 — no guest path: requires a real account session, not #317's eventual
  // generalisation. userId still comes only from @CurrentUser(); this only narrows
  // WHO may call the route, it never changes where the id comes from.
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  @ApiOkResponse({ type: InterviewStateDto, description: 'The caller’s Minimal-Gate state for this tax year — re-entry.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  getInterview(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
  ): Promise<InterviewStateDto> {
    return this.interviewService.getState(userId, jahr)
  }

  @Post(':jahr/interview/antworten')
  // Nest's own POST default is 201; this is an upsert-style write on an existing
  // resource (the tax year's interview), not "created a new resource" — 200 matches
  // the documented @ApiOkResponse and device.controller.ts's own POST /approve,
  // /token precedent.
  @HttpCode(200)
  @RequiresAccount()
  @ApiParam({
    name: 'jahr',
    type: Number,
    example: 2026,
    description: 'The tax year (Steuerjahr) — validated to a sensible window (ParseSteuerjahrPipe, same as Cockpit).',
  })
  // Explicit @ApiBody(): see ProfileController's PUT for why esbuild/tsx needs this
  // spelled out rather than inferred from `design:paramtypes`.
  @ApiBody({ type: PostAnswerDto })
  @ApiOkResponse({ type: PostAnswerResponseDto, description: 'The next step and open-items count after this write.' })
  @ApiBadRequestResponse({ description: 'value is not an accepted answer for questionId — nothing was persisted.' })
  @ApiConflictResponse({ description: 'questionId is not reachable given the answers stored so far — nothing was persisted.' })
  @ApiUnauthorizedResponse({ description: 'Guest session — this endpoint requires a signed-in account.' })
  postAnswer(
    @CurrentUser() userId: string,
    @Param('jahr', ParseSteuerjahrPipe) jahr: number,
    @Body() dto: PostAnswerDto,
  ): Promise<PostAnswerResponseDto> {
    return this.interviewService.postAnswer(userId, jahr, dto)
  }
}
