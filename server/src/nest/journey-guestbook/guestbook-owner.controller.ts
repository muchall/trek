import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JourneyGuestbookService } from './journey-guestbook.service';
import { JourneyDomainService } from '../journey/journey-domain.service';
import { AddonGuard } from '../addons/addon.guard';
import { RequireAddon } from '../addons/require-addon.decorator';
import { ADDON_IDS } from '../../addons';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { User } from '../../types';
import { GuestbookAddCommentDto, GuestbookSettingsDto } from './guestbook.dto';

/**
 * Owner-only guestbook moderation. Same guard chain as JourneyController
 * (AddonGuard before JwtAuthGuard, per the documented contract) so deletion and
 * the open/closed toggle can only be performed by an authenticated owner.
 */
@Controller('api/journeys')
@UseGuards(AddonGuard, JwtAuthGuard)
@RequireAddon(ADDON_IDS.JOURNEY, 'Journey')
export class GuestbookOwnerController {
  constructor(
    private readonly guestbook: JourneyGuestbookService,
    private readonly journey: JourneyDomainService,
  ) {}

  @Get(':id/guestbook/comments')
  list(@Param('id') id: string, @CurrentUser() user: User) {
    const journeyId = this.requireOwner(id, user);
    return {
      comments: this.guestbook.listForJourney(journeyId),
      commentsEnabled: this.guestbook.commentsEnabled(journeyId),
      authorName: this.guestbook.authorName(journeyId),
    };
  }

  @Delete(':id/guestbook/comments/:commentId')
  remove(@Param('id') id: string, @Param('commentId') commentId: string, @CurrentUser() user: User) {
    const journeyId = this.requireOwner(id, user);
    const ok = this.guestbook.deleteComment(Number(commentId), journeyId);
    if (!ok) throw new HttpException({ error: 'Not found' }, 404);
    return { ok: true };
  }

  @Post(':id/guestbook/comments/:commentId/replies')
  reply(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() body: GuestbookAddCommentDto,
    @CurrentUser() user: User,
  ) {
    const journeyId = this.requireOwner(id, user);
    const text = String(body.body ?? '').trim();
    if (!text) throw new HttpException({ error: 'Reply cannot be empty' }, 400);
    const reply = this.guestbook.addReply(Number(commentId), journeyId, text);
    if (!reply) throw new HttpException({ error: 'Not found' }, 404);
    return { reply };
  }

  @Delete(':id/guestbook/replies/:replyId')
  removeReply(@Param('id') id: string, @Param('replyId') replyId: string, @CurrentUser() user: User) {
    const journeyId = this.requireOwner(id, user);
    const ok = this.guestbook.deleteReply(Number(replyId), journeyId);
    if (!ok) throw new HttpException({ error: 'Not found' }, 404);
    return { ok: true };
  }

  @Put(':id/guestbook/settings')
  setSettings(@Param('id') id: string, @Body() body: GuestbookSettingsDto, @CurrentUser() user: User) {
    const journeyId = this.requireOwner(id, user);
    if (body.commentsEnabled !== undefined) {
      if (typeof body.commentsEnabled !== 'boolean') {
        throw new HttpException({ error: 'commentsEnabled must be a boolean' }, 400);
      }
      this.guestbook.setCommentsEnabled(journeyId, body.commentsEnabled);
    }
    if (body.authorName !== undefined) {
      if (typeof body.authorName !== 'string') {
        throw new HttpException({ error: 'authorName must be a string' }, 400);
      }
      this.guestbook.setAuthorName(journeyId, body.authorName);
    }
    return {
      commentsEnabled: this.guestbook.commentsEnabled(journeyId),
      authorName: this.guestbook.authorName(journeyId),
    };
  }

  private requireOwner(id: string, user: User): number {
    const journeyId = Number(id);
    if (!this.journey.isOwner(journeyId, user.id)) {
      // 404 (not 403) so a non-owner cannot probe which journey ids exist.
      throw new HttpException({ error: 'Not found' }, 404);
    }
    return journeyId;
  }
}
