import type { Request, Response } from 'express';
import { cookieOptions } from '../common/cookie';

/**
 * The public guestbook commenter cookie. Deliberately separate from
 * trek_session: a verified public commenter is not a TREK user and must never
 * be resolvable by the app's auth guards. Reuses cookieOptions() for the
 * httpOnly/secure/sameSite/path discipline (so the Secure-over-plain-HTTP
 * behaviour matches the login cookie exactly) and pins its own long maxAge —
 * the real "may this guest still comment" decision is the per-journey toggle
 * enforced server-side, so a long cookie only avoids needless re-verification.
 */
export const GUEST_COOKIE_NAME = 'trek_guest';

/** 90 days — matches the guest JWT exp minted in guest-auth.service. */
export const GUEST_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function setGuestCookie(res: Response, token: string, req?: Request): void {
  const base = cookieOptions(false, req, true);
  res.cookie(GUEST_COOKIE_NAME, token, { ...base, maxAge: GUEST_COOKIE_MAX_AGE_MS });
}

export function clearGuestCookie(res: Response, req?: Request): void {
  res.clearCookie(GUEST_COOKIE_NAME, cookieOptions(true, req));
}
