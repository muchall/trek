import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface GuestbookComment {
  id: number;
  entry_id: string;
  body: string;
  created_at: string;
  author_name: string;
  commenter_id: number;
}

export interface EntryGuestbook {
  comments: GuestbookComment[];
  likeCount: number;
  likedByMe: boolean;
  commentsEnabled: boolean;
}

const MAX_BODY = 2000;

@Injectable()
export class JourneyGuestbookService {
  constructor(private readonly db: DatabaseService) {}

  /** Comments are open by default; a row only exists once the owner has toggled. */
  commentsEnabled(journeyId: number): boolean {
    const row = this.db.get<{ comments_enabled: number }>(
      'SELECT comments_enabled FROM journey_guestbook_settings WHERE journey_id = ?',
      journeyId,
    );
    return row ? !!row.comments_enabled : true;
  }

  setCommentsEnabled(journeyId: number, enabled: boolean): void {
    this.db.run(
      `INSERT INTO journey_guestbook_settings (journey_id, comments_enabled, updated_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       ON CONFLICT(journey_id) DO UPDATE SET comments_enabled = excluded.comments_enabled, updated_at = excluded.updated_at`,
      journeyId,
      enabled ? 1 : 0,
    );
  }

  listForEntry(entryId: string, commenterId: number | null, journeyId: number): EntryGuestbook {
    const comments = this.db.all<GuestbookComment>(
      `SELECT c.id, c.entry_id, c.body, c.created_at, c.commenter_id, jc.display_name AS author_name
       FROM journey_entry_comments c
       JOIN journey_commenters jc ON jc.id = c.commenter_id
       WHERE c.entry_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`,
      entryId,
    );
    const likeRow = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM journey_entry_likes WHERE entry_id = ?', entryId);
    const likedByMe = commenterId
      ? !!this.db.get('SELECT 1 FROM journey_entry_likes WHERE entry_id = ? AND commenter_id = ?', entryId, commenterId)
      : false;
    return {
      comments,
      likeCount: likeRow?.n ?? 0,
      likedByMe,
      commentsEnabled: this.commentsEnabled(journeyId),
    };
  }

  /**
   * All comments + like tallies for a whole journey in one shot, keyed by entry
   * id, so the public page renders every entry's guestbook without an N+1 fan-out.
   */
  summaryForJourney(journeyId: number, commenterId: number | null): {
    byEntry: Record<string, { comments: GuestbookComment[]; likeCount: number; likedByMe: boolean }>;
    commentsEnabled: boolean;
  } {
    const comments = this.db.all<GuestbookComment>(
      `SELECT c.id, c.entry_id, c.body, c.created_at, c.commenter_id, jc.display_name AS author_name
       FROM journey_entry_comments c
       JOIN journey_commenters jc ON jc.id = c.commenter_id
       JOIN journey_entries je ON je.id = c.entry_id
       WHERE je.journey_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`,
      journeyId,
    );
    const likeRows = this.db.all<{ entry_id: number; n: number }>(
      `SELECT l.entry_id, COUNT(*) AS n
       FROM journey_entry_likes l JOIN journey_entries je ON je.id = l.entry_id
       WHERE je.journey_id = ? GROUP BY l.entry_id`,
      journeyId,
    );
    const mine = commenterId
      ? new Set(
          this.db
            .all<{ entry_id: number }>(
              `SELECT l.entry_id FROM journey_entry_likes l JOIN journey_entries je ON je.id = l.entry_id
               WHERE je.journey_id = ? AND l.commenter_id = ?`,
              journeyId,
              commenterId,
            )
            .map((r) => String(r.entry_id)),
        )
      : new Set<string>();

    const byEntry: Record<string, { comments: GuestbookComment[]; likeCount: number; likedByMe: boolean }> = {};
    const ensure = (eid: string) => (byEntry[eid] ||= { comments: [], likeCount: 0, likedByMe: mine.has(eid) });
    for (const c of comments) ensure(String(c.entry_id)).comments.push(c);
    for (const l of likeRows) ensure(String(l.entry_id)).likeCount = l.n;
    return { byEntry, commentsEnabled: this.commentsEnabled(journeyId) };
  }

  addComment(entryId: string, commenterId: number, body: string): GuestbookComment | null {
    const trimmed = body.trim();
    if (!trimmed) return null;
    const capped = trimmed.slice(0, MAX_BODY);
    const res = this.db.run(
      'INSERT INTO journey_entry_comments (entry_id, commenter_id, body) VALUES (?, ?, ?)',
      entryId,
      commenterId,
      capped,
    );
    return this.db.get<GuestbookComment>(
      `SELECT c.id, c.entry_id, c.body, c.created_at, c.commenter_id, jc.display_name AS author_name
       FROM journey_entry_comments c JOIN journey_commenters jc ON jc.id = c.commenter_id
       WHERE c.id = ?`,
      Number(res.lastInsertRowid),
    ) ?? null;
  }

  /** Toggle: returns the resulting state and fresh count. */
  toggleLike(entryId: string, commenterId: number): { liked: boolean; likeCount: number } {
    return this.db.transaction(() => {
      const existing = this.db.get('SELECT id FROM journey_entry_likes WHERE entry_id = ? AND commenter_id = ?', entryId, commenterId);
      if (existing) {
        this.db.run('DELETE FROM journey_entry_likes WHERE entry_id = ? AND commenter_id = ?', entryId, commenterId);
      } else {
        this.db.run('INSERT INTO journey_entry_likes (entry_id, commenter_id) VALUES (?, ?)', entryId, commenterId);
      }
      const row = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM journey_entry_likes WHERE entry_id = ?', entryId);
      return { liked: !existing, likeCount: row?.n ?? 0 };
    });
  }

  /** All non-deleted comments across a journey's entries, for the owner view. */
  listForJourney(journeyId: number): Array<GuestbookComment & { author_email: string }> {
    return this.db.all<GuestbookComment & { author_email: string }>(
      `SELECT c.id, c.entry_id, c.body, c.created_at, c.commenter_id,
              jc.display_name AS author_name, jc.email AS author_email
       FROM journey_entry_comments c
       JOIN journey_commenters jc ON jc.id = c.commenter_id
       JOIN journey_entries je ON je.id = c.entry_id
       WHERE je.journey_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC`,
      journeyId,
    );
  }

  /** Soft-delete a comment, but only if it belongs to an entry in this journey. */
  deleteComment(commentId: number, journeyId: number): boolean {
    const res = this.db.run(
      `UPDATE journey_entry_comments
       SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ? AND deleted_at IS NULL
         AND entry_id IN (SELECT id FROM journey_entries WHERE journey_id = ?)`,
      commentId,
      journeyId,
    );
    return res.changes > 0;
  }
}
