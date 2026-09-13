import { Heart, Trash2 } from 'lucide-react'
import { useOwnerGuestbook } from './OwnerGuestbookProvider'

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * Owner-facing list of guest comments on one entry, each with a delete control.
 * Renders nothing outside an OwnerGuestbookProvider or when the entry has no
 * comments, so it can be dropped into both the desktop and mobile entry cards.
 */
export function GuestbookOwnerThread({ entryId }: { entryId: string | number }) {
  const owner = useOwnerGuestbook()
  if (!owner) return null
  const comments = owner.forEntry(entryId)
  if (comments.length === 0) return null

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        <Heart size={11} /> Guest comments · {comments.length}
      </div>
      <div className="flex flex-col gap-2">
        {comments.map((c) => (
          <div key={c.id} className="group flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12px]">
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">{c.author_name}</span>
                <span className="ml-2 text-[11px] text-zinc-400">{c.author_email}</span>
                <span className="ml-2 text-[11px] text-zinc-400">{formatWhen(c.created_at)}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-[13px] text-zinc-700 dark:text-zinc-300">{c.body}</div>
            </div>
            <button
              type="button"
              onClick={() => owner.remove(c.id)}
              title="Delete comment"
              className="flex-shrink-0 rounded-md p-1 text-zinc-300 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/20"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
