import { useState } from 'react'
import { Heart, Reply, Send, Trash2 } from 'lucide-react'
import { useOwnerGuestbook } from './OwnerGuestbookProvider'
import { useTranslation } from '../../../i18n'
import type { GuestbookComment } from './GuestbookProvider'

type OwnerComment = GuestbookComment & { author_email: string }

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** One comment row with its replies, a reply composer and delete controls. */
function OwnerCommentRow({
  c,
  onDelete,
  onReply,
  onDeleteReply,
}: {
  c: OwnerComment
  onDelete: (id: number) => void
  onReply: (id: number, body: string) => Promise<void>
  onDeleteReply: (id: number) => void
}) {
  const { t } = useTranslation()
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    try {
      await onReply(c.id, body)
      setDraft('')
      setReplying(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12px]">
          <span className="font-semibold text-zinc-800 dark:text-zinc-100">{c.author_name}</span>
          <span className="ml-2 text-[11px] text-zinc-400">{c.author_email}</span>
          <span className="ml-2 text-[11px] text-zinc-400">{formatWhen(c.created_at)}</span>
          {c.likeCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-[11px] text-rose-500">
              <Heart size={10} fill="currentColor" /> {c.likeCount}
            </span>
          )}
        </div>
        <div className="whitespace-pre-wrap break-words text-[13px] text-zinc-700 dark:text-zinc-300">{c.body}</div>

        {/* Existing replies */}
        {c.replies.map((r) => (
          <div key={r.id} className="mt-2 flex items-start justify-between gap-2 border-l-2 border-zinc-200 pl-2.5 dark:border-zinc-700">
            <div className="min-w-0">
              <div className="text-[11px]">
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {t('journey.guestbook.you')}
                </span>
                <span className="ml-2 text-zinc-400">{formatWhen(r.created_at)}</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-[12px] text-zinc-600 dark:text-zinc-400">{r.body}</div>
            </div>
            <button
              type="button"
              onClick={() => onDeleteReply(r.id)}
              title={t('journey.guestbook.deleteReply')}
              className="flex-shrink-0 rounded-md p-1 text-zinc-300 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {/* Reply composer */}
        {replying ? (
          <div className="mt-2 flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              placeholder={t('journey.guestbook.replyPlaceholder')}
              className="min-h-[34px] flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !draft.trim()}
              className="inline-flex h-[34px] items-center gap-1 rounded-lg bg-zinc-900 px-2.5 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
            >
              <Send size={12} /> {t('journey.guestbook.send')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReplying(true)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            <Reply size={12} /> {t('journey.guestbook.reply')}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDelete(c.id)}
        title={t('journey.guestbook.deleteComment')}
        className="flex-shrink-0 rounded-md p-1 text-zinc-300 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

/**
 * Owner-facing list of guest comments on one entry: each with its replies, a
 * reply composer and delete controls. Renders nothing outside an
 * OwnerGuestbookProvider or when the entry has no comments, so it drops into
 * both the desktop and mobile entry cards.
 */
export function GuestbookOwnerThread({ entryId }: { entryId: string | number }) {
  const { t } = useTranslation()
  const owner = useOwnerGuestbook()
  if (!owner) return null
  const comments = owner.forEntry(entryId) as OwnerComment[]
  if (comments.length === 0) return null

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        <Heart size={11} /> {t('journey.guestbook.guestCommentsCount', { count: comments.length })}
      </div>
      <div className="flex flex-col gap-3">
        {comments.map((c) => (
          <OwnerCommentRow
            key={c.id}
            c={c}
            onDelete={owner.remove}
            onReply={owner.reply}
            onDeleteReply={owner.removeReply}
          />
        ))}
      </div>
    </div>
  )
}
