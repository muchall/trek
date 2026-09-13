import { useState } from 'react'
import { Heart, MessageCircle, Send } from 'lucide-react'
import { useGuestbook } from './GuestbookProvider'

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?'
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * Public per-entry guestbook: a like heart with count, a collapsible comment
 * list, and either a comment box (verified guest) or an inline email/name form
 * that requests a magic link. Renders nothing when there is no provider (the
 * journey isn't share-scoped) — the owner side has its own component.
 */
export function GuestbookThread({ entryId }: { entryId: string | number }) {
  const gb = useGuestbook()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!gb) return null
  const state = gb.forEntry(entryId)
  const hasComments = state.comments.length > 0

  const submitComment = async () => {
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    setError(null)
    try {
      await gb.addComment(entryId, body)
      setDraft('')
    } catch {
      setError('Could not post your comment. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const submitLink = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !name.trim()) {
      setError('Enter your name and a valid email.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await gb.requestLink(email.trim(), name.trim())
      setLinkSent(true)
    } catch {
      setError('Could not send the link. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
      // The whole entry card is clickable (opens the entry detail); keep
      // guestbook clicks, typing and selection from bubbling up to it.
      onClick={(e) => e.stopPropagation()}
    >
      {/* Action row: like + comment toggle */}
      <div className="flex items-center gap-4 text-[12px]">
        <button
          type="button"
          onClick={() => gb.me && gb.toggleLike(entryId)}
          disabled={!gb.me}
          title={gb.me ? '' : 'Verify your email to like'}
          className={`inline-flex items-center gap-1.5 transition-colors ${
            state.likedByMe ? 'text-rose-500' : 'text-zinc-500 hover:text-rose-500'
          } ${gb.me ? '' : 'cursor-default opacity-70'}`}
        >
          <Heart size={15} fill={state.likedByMe ? 'currentColor' : 'none'} />
          {state.likeCount > 0 && <span>{state.likeCount}</span>}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 text-zinc-500 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <MessageCircle size={15} />
          <span>{hasComments ? `${state.comments.length} comments` : 'Comment'}</span>
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {/* Existing comments */}
          {state.comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
                {initials(c.author_name)}
              </div>
              <div className="min-w-0">
                <div className="text-[12px]">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">{c.author_name}</span>
                  <span className="ml-2 text-[11px] text-zinc-400">{formatWhen(c.created_at)}</span>
                </div>
                <div className="whitespace-pre-wrap break-words text-[13px] text-zinc-700 dark:text-zinc-300">{c.body}</div>
              </div>
            </div>
          ))}
          {!hasComments && <div className="text-[12px] text-zinc-400">Be the first to leave a comment.</div>}

          {/* Compose */}
          {!gb.commentsEnabled ? (
            <div className="text-[12px] italic text-zinc-400">Comments are closed for this journey.</div>
          ) : gb.me ? (
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder={`Comment as ${gb.me.display_name}…`}
                className="min-h-[38px] flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={submitComment}
                disabled={busy || !draft.trim()}
                className="inline-flex h-[38px] items-center gap-1 rounded-lg bg-zinc-900 px-3 text-[12px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                <Send size={13} /> Post
              </button>
            </div>
          ) : linkSent ? (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
              Check your email — we sent you a link to confirm and start commenting.
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="text-[12px] text-zinc-500">Leave a comment — confirm your email once.</div>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  className="w-1/2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <button
                type="button"
                onClick={submitLink}
                disabled={busy}
                className="self-start rounded-lg bg-zinc-900 px-3 py-2 text-[12px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                Send me the link
              </button>
            </div>
          )}
          {error && <div className="text-[12px] text-rose-500">{error}</div>}
        </div>
      )}
    </div>
  )
}
