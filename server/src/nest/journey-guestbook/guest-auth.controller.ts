import { Body, Controller, Get, HttpException, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GuestAuthService } from './guest-auth.service';
import { JourneyShareService } from '../journey/journey-share.service';
import { RateLimitService } from '../common/rate-limit.service';
import { setGuestCookie, GUEST_COOKIE_NAME } from './guestbook-cookie';
import { AddonGuard } from '../addons/addon.guard';
import { RequireAddon } from '../addons/require-addon.decorator';
import { ADDON_IDS } from '../../addons';
import { Public } from '../auth/public.decorator';
import { getAppUrl } from '../../app-config/app-url';
import { GuestbookRequestLinkDto } from './guestbook.dto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RL_WINDOW_MS = 15 * 60 * 1000;

/**
 * Public magic-link auth for journey guestbook commenters. AddonGuard leads the
 * chain (the documented contract: a disabled addon 404s even anonymous callers),
 * and @Public keeps the global auth guard from demanding a TREK session — these
 * routes intentionally serve visitors who have no account.
 */
@Public('journey guestbook: verified public commenters are not TREK users')
@UseGuards(AddonGuard)
@RequireAddon(ADDON_IDS.JOURNEY, 'Journey')
@Controller('api/public/journey')
export class GuestAuthController {
  constructor(
    private readonly guest: GuestAuthService,
    private readonly share: JourneyShareService,
    private readonly rl: RateLimitService,
  ) {}

  @Post(':token/guest/request-link')
  async requestLink(
    @Param('token') token: string,
    @Body() body: GuestbookRequestLinkDto,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    // The token must map to a real shared journey, or this is not a guestbook.
    if (this.share.journeyIdForToken(token) == null) {
      throw new HttpException({ error: 'Not found' }, 404);
    }

    // Honeypot: bots fill hidden fields, humans never see this one. Accept
    // silently and send nothing, so a bot cannot tell it was filtered.
    if (String(body.website ?? '').trim() !== '') {
      return { ok: true };
    }

    const email = String(body.email ?? '').trim().toLowerCase();
    const displayName = String(body.displayName ?? '').trim();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      throw new HttpException({ error: 'A valid email is required' }, 400);
    }
    if (!displayName) {
      throw new HttpException({ error: 'A name is required' }, 400);
    }

    // Rate limit per-IP and per-target-email: this endpoint makes TREK send
    // mail to an address the caller chose, so it is an abuse surface. Kept
    // tight — a real guest verifies once, not a handful of times an hour.
    const ip = req.ip || 'unknown';
    const now = Date.now();
    if (!this.rl.check('guestbook-link-ip', ip, 5, RL_WINDOW_MS, now)) {
      throw new HttpException({ error: 'Too many requests' }, 429);
    }
    if (!this.rl.check('guestbook-link-email', email, 3, RL_WINDOW_MS, now)) {
      throw new HttpException({ error: 'Too many requests' }, 429);
    }

    await this.guest.requestMagicLink(email, displayName, token);
    // Never leak whether the address is new or returning.
    return { ok: true };
  }

  @Get('guest/verify')
  verify(@Query('token') token: string, @Res() res: Response, @Req() req: Request): void {
    const result = token ? this.guest.verifyMagicToken(token) : null;
    if (!result) {
      res.redirect(302, `${getAppUrl()}/?guestbook=link-invalid`);
      return;
    }
    const jwt = this.guest.mintGuestJwt(result.commenter.id);
    setGuestCookie(res, jwt, req);
    res.redirect(302, `${getAppUrl()}/public/journey/${result.journeyToken}?guestbook=verified`);
  }

  @Get(':token/guest/me')
  me(@Req() req: Request): { commenter: { id: number; display_name: string; email: string } | null } {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[GUEST_COOKIE_NAME];
    const commenter = this.guest.resolveGuest(cookie);
    return { commenter: commenter ? { id: commenter.id, display_name: commenter.display_name, email: commenter.email } : null };
  }
}
