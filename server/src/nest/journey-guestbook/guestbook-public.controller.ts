import { Body, Controller, Get, HttpException, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JourneyGuestbookService } from './journey-guestbook.service';
import { GuestAuthService, Commenter } from './guest-auth.service';
import { JourneyShareService } from '../journey/journey-share.service';
import { RateLimitService } from '../common/rate-limit.service';
import { GUEST_COOKIE_NAME } from './guestbook-cookie';
import { AddonGuard } from '../addons/addon.guard';
import { RequireAddon } from '../addons/require-addon.decorator';
import { ADDON_IDS } from '../../addons';
import { Public } from '../auth/public.decorator';
import { GuestbookAddCommentDto } from './guestbook.dto';

const RL_WINDOW_MS = 10 * 60 * 1000;

/**
 * Public read + write for the journey guestbook. Every route is share-token
 * validated (a wrong token, an entry from another journey, a hidden timeline,
 * or a skeleton entry all 404 via validateShareTokenForEntry); writes
 * additionally require a verified commenter cookie and an open guestbook.
 */
@Public('journey guestbook: verified public commenters, no TREK account')
@UseGuards(AddonGuard)
@RequireAddon(ADDON_IDS.JOURNEY, 'Journey')
@Controller('api/public/journey')
export class GuestbookPublicController {
  constructor(
    private readonly guestbook: JourneyGuestbookService,
    private readonly guest: GuestAuthService,
    private readonly share: JourneyShareService,
    private readonly rl: RateLimitService,
  ) {}

  @Get(':token/guestbook')
  summary(@Param('token') token: string, @Req() req: Request) {
    const journeyId = this.share.timelineJourneyIdForToken(token);
    if (journeyId == null) throw new HttpException({ error: 'Not found' }, 404);
    const commenter = this.currentGuest(req);
    return this.guestbook.summaryForJourney(journeyId, commenter?.id ?? null);
  }

  @Get(':token/entries/:entryId/guestbook')
  list(@Param('token') token: string, @Param('entryId') entryId: string, @Req() req: Request) {
    const journeyId = this.requireEntry(token, entryId);
    const commenter = this.currentGuest(req);
    return this.guestbook.listForEntry(entryId, commenter?.id ?? null, journeyId);
  }

  @Post(':token/entries/:entryId/comments')
  addComment(
    @Param('token') token: string,
    @Param('entryId') entryId: string,
    @Body() body: GuestbookAddCommentDto,
    @Req() req: Request,
  ) {
    const journeyId = this.requireEntry(token, entryId);
    const commenter = this.requireGuest(req);
    this.requireOpen(journeyId);
    this.throttle('guestbook-comment', commenter, req);

    const text = String(body.body ?? '').trim();
    if (!text) throw new HttpException({ error: 'Comment cannot be empty' }, 400);

    const comment = this.guestbook.addComment(entryId, commenter.id, text);
    if (!comment) throw new HttpException({ error: 'Comment cannot be empty' }, 400);
    return { comment };
  }

  @Post(':token/entries/:entryId/like')
  like(@Param('token') token: string, @Param('entryId') entryId: string, @Req() req: Request) {
    const journeyId = this.requireEntry(token, entryId);
    const commenter = this.requireGuest(req);
    this.requireOpen(journeyId);
    this.throttle('guestbook-like', commenter, req);
    return this.guestbook.toggleLike(entryId, commenter.id);
  }

  @Post(':token/comments/:commentId/like')
  likeComment(@Param('token') token: string, @Param('commentId') commentId: string, @Req() req: Request) {
    const journeyId = this.share.timelineJourneyIdForToken(token);
    if (journeyId == null) throw new HttpException({ error: 'Not found' }, 404);
    const commenter = this.requireGuest(req);
    this.requireOpen(journeyId);
    const cid = Number(commentId);
    // The comment must live in the journey this token unlocks, or 404 — a
    // token cannot like comments on another journey.
    if (this.guestbook.commentJourneyId(cid) !== journeyId) {
      throw new HttpException({ error: 'Not found' }, 404);
    }
    this.throttle('guestbook-comment-like', commenter, req);
    return this.guestbook.toggleCommentLike(cid, commenter.id);
  }

  private requireEntry(token: string, entryId: string): number {
    const match = this.share.validateShareTokenForEntry(token, entryId);
    if (!match) throw new HttpException({ error: 'Not found' }, 404);
    return match.journeyId;
  }

  private currentGuest(req: Request): Commenter | null {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[GUEST_COOKIE_NAME];
    return this.guest.resolveGuest(cookie);
  }

  private requireGuest(req: Request): Commenter {
    const commenter = this.currentGuest(req);
    if (!commenter) throw new HttpException({ error: 'Verify your email to comment', code: 'GUEST_AUTH_REQUIRED' }, 401);
    return commenter;
  }

  private requireOpen(journeyId: number): void {
    if (!this.guestbook.commentsEnabled(journeyId)) {
      throw new HttpException({ error: 'Comments are closed for this journey' }, 403);
    }
  }

  private throttle(bucket: string, commenter: Commenter, req: Request): void {
    const now = Date.now();
    if (!this.rl.check(bucket, String(commenter.id), 30, RL_WINDOW_MS, now)) {
      throw new HttpException({ error: 'Too many requests' }, 429);
    }
    if (!this.rl.check(`${bucket}-ip`, req.ip || 'unknown', 60, RL_WINDOW_MS, now)) {
      throw new HttpException({ error: 'Too many requests' }, 429);
    }
  }
}
