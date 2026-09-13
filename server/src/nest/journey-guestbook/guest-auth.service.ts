import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { MailerService } from '../notifications/mailer/mailer.service';
import { JWT_SECRET } from '../../config';
import { getAppUrl } from '../../app-config/app-url';

const MAGIC_TOKEN_BYTES = 32;
const MAGIC_TTL_MS = 30 * 60 * 1000; // 30 minutes to click the emailed link
const GUEST_JWT_TTL = '90d';
const MAX_DISPLAY_NAME = 60;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface GuestClaims {
  cid: number;
  purpose: 'guest';
}

export interface Commenter {
  id: number;
  email: string;
  display_name: string;
}

@Injectable()
export class GuestAuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Issue a magic link for `email` scoped to a journey share token. Always
   * behaves the same whether or not the email already commented before, and the
   * caller must NOT branch its HTTP response on the outcome — mirroring the
   * password-reset flow, an unauthenticated caller must not be able to probe
   * which addresses exist. When SMTP is unconfigured the link is logged in a
   * fenced block so a self-hosting admin can still relay it.
   */
  async requestMagicLink(email: string, displayName: string, journeyToken: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const name = displayName.trim().slice(0, MAX_DISPLAY_NAME) || normalizedEmail.split('@')[0];

    // Invalidate any outstanding links for this address before minting a new
    // one (mirrors AuthService's password-reset flow): a "resend" must not leave
    // several live links, and the newest display name should be the one that wins.
    this.db.run(
      'UPDATE journey_commenter_magic_tokens SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL',
      nowIso(),
      normalizedEmail,
    );

    const raw = randomBytes(MAGIC_TOKEN_BYTES).toString('base64url');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + MAGIC_TTL_MS).toISOString();

    this.db.run(
      `INSERT INTO journey_commenter_magic_tokens (email, display_name, token_hash, journey_token, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      normalizedEmail,
      name,
      tokenHash,
      journeyToken,
      expiresAt,
    );

    const verifyUrl = `${getAppUrl()}/api/public/journey/guest/verify?token=${raw}`;

    const subject = 'Confirm your comment';
    const body =
      `Hi ${name},\n\n` +
      `Click the link below to confirm your email and start commenting on this journey.\n\n` +
      `${verifyUrl}\n\n` +
      `This link expires in 30 minutes. If you didn't request it, you can ignore this email.`;

    const delivered = await this.mailer.sendEmail(normalizedEmail, subject, body);
    if (!delivered) {
      // No SMTP (or send failed): fence the link to stdout the way the
      // password-reset flow does, so a self-hoster can still hand it over.
      console.log(
        `\n===== JOURNEY GUESTBOOK MAGIC LINK =====\n` +
          `to: ${normalizedEmail}\n` +
          `url: ${verifyUrl}\n` +
          `expires: 30 minutes\n` +
          `(SMTP not configured or send failed — deliver this link manually.)\n` +
          `========================================\n`,
      );
    }
  }

  /**
   * Consume a magic token: create-or-update the commenter, mark the token
   * consumed, and return the commenter plus the journey token to redirect back
   * to. Returns null when the token is unknown, expired, or already used.
   */
  verifyMagicToken(raw: string): { commenter: Commenter; journeyToken: string } | null {
    const tokenHash = hashToken(raw);
    const row = this.db.get<{
      id: number;
      email: string;
      display_name: string;
      journey_token: string;
      expires_at: string;
      consumed_at: string | null;
    }>('SELECT * FROM journey_commenter_magic_tokens WHERE token_hash = ?', tokenHash);

    if (!row) return null;
    if (row.consumed_at) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;

    return this.db.transaction(() => {
      this.db.run('UPDATE journey_commenter_magic_tokens SET consumed_at = ? WHERE id = ?', nowIso(), row.id);

      const existing = this.db.get<Commenter>('SELECT id, email, display_name FROM journey_commenters WHERE email = ?', row.email);
      let commenter: Commenter;
      if (existing) {
        this.db.run('UPDATE journey_commenters SET display_name = ?, last_seen_at = ? WHERE id = ?', row.display_name, nowIso(), existing.id);
        commenter = { ...existing, display_name: row.display_name };
      } else {
        const res = this.db.run('INSERT INTO journey_commenters (email, display_name) VALUES (?, ?)', row.email, row.display_name);
        commenter = { id: Number(res.lastInsertRowid), email: row.email, display_name: row.display_name };
      }
      return { commenter, journeyToken: row.journey_token };
    });
  }

  mintGuestJwt(commenterId: number): string {
    const payload: GuestClaims = { cid: commenterId, purpose: 'guest' };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: GUEST_JWT_TTL, algorithm: 'HS256' });
  }

  /** Resolve the commenter from a trek_guest cookie, or null. */
  resolveGuest(cookie: string | undefined): Commenter | null {
    if (!cookie) return null;
    let claims: GuestClaims;
    try {
      claims = jwt.verify(cookie, JWT_SECRET, { algorithms: ['HS256'] }) as GuestClaims;
    } catch {
      return null;
    }
    if (claims.purpose !== 'guest' || !claims.cid) return null;
    const commenter = this.db.get<Commenter>('SELECT id, email, display_name FROM journey_commenters WHERE id = ?', claims.cid);
    return commenter ?? null;
  }
}
