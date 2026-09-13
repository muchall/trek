import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { guestbookApi } from '../../../api/client'
import type { GuestbookComment } from './GuestbookProvider'

interface OwnerComment extends GuestbookComment {
  author_email: string
}

interface OwnerCtx {
  journeyId: number
  commentsEnabled: boolean
  forEntry: (entryId: string | number) => OwnerComment[]
  remove: (commentId: number) => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
}

const Ctx = createContext<OwnerCtx | null>(null)

/**
 * Owner-side moderation state: one authenticated fetch of every comment on the
 * journey, grouped by entry, plus the open/closed toggle. Shared with each
 * EntryCard's GuestbookOwnerThread so the whole timeline costs one request.
 */
export function OwnerGuestbookProvider({ journeyId, children }: { journeyId: number; children: ReactNode }) {
  const [comments, setComments] = useState<OwnerComment[]>([])
  const [commentsEnabled, setCommentsEnabled] = useState(true)

  const refresh = useCallback(async () => {
    const res = await guestbookApi.ownerList(journeyId).catch(() => null)
    if (res) {
      setComments(res.comments ?? [])
      setCommentsEnabled(!!res.commentsEnabled)
    }
  }, [journeyId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const byEntry = useMemo(() => {
    const map: Record<string, OwnerComment[]> = {}
    for (const c of comments) (map[String(c.entry_id)] ||= []).push(c)
    return map
  }, [comments])

  const forEntry = useCallback((entryId: string | number) => byEntry[String(entryId)] ?? [], [byEntry])

  const remove = useCallback(
    async (commentId: number) => {
      await guestbookApi.ownerDelete(journeyId, commentId)
      await refresh()
    },
    [journeyId, refresh],
  )

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      await guestbookApi.ownerSetSettings(journeyId, enabled)
      setCommentsEnabled(enabled)
    },
    [journeyId],
  )

  const value = useMemo<OwnerCtx>(
    () => ({ journeyId, commentsEnabled, forEntry, remove, setEnabled }),
    [journeyId, commentsEnabled, forEntry, remove, setEnabled],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOwnerGuestbook(): OwnerCtx | null {
  return useContext(Ctx)
}
