import { z } from 'zod';

/**
 * Journey guestbook API contract — comments + likes left by email-verified
 * public visitors on a shared journey's entries, plus owner-side moderation.
 *
 * Deliberately permissive, the same doctrine as the journey schema: the
 * handlers validate their own bodies and answer with their own pinned messages
 * ('A valid email is required', 'A name is required', 'Comment cannot be
 * empty', 'commentsEnabled must be a boolean'). These schemas exist to give the
 * boot-time body-contract gate something to point at; a strict schema would
 * have the global pipe answer first, with a different body.
 */

export const guestbookRequestLinkSchema = z.looseObject({
  email: z.unknown(),
  displayName: z.unknown(),
  // Honeypot: a hidden field real users never fill. A non-empty value marks a
  // bot; the handler silently accepts and sends nothing.
  website: z.unknown().optional(),
});

export const guestbookAddCommentSchema = z.looseObject({
  body: z.unknown(),
});

export const guestbookSettingsSchema = z.looseObject({
  commentsEnabled: z.unknown(),
});
