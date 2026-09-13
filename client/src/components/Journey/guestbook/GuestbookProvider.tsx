import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { guestbookApi } from '../../../api/client'

export interface GuestbookReply {
  id: number
  body: string
  created_at: string
  author_name: string
}

export interface GuestbookComment {
  id: number
  entry_id: number
  body: string
  created_at: string
  author_name: string
  commenter_id: number
  likeCount: number
  likedByMe: boolean
  replies: GuestbookReply[]
}

interface EntryState {
  comments: GuestbookComment[]
  likeCount: number
  likedByMe: boolean
}

interface Me {
  id: number
  display_name: string
  email: string
}

interface GuestbookCtx {
  token: string
  me: Me | null
  commentsEnabled: boolean
  forEntry: (entryId: string | number) => EntryState
  requestLink: (email: string, displayName: string, website?: string) => Promise<void>
  addComment: (entryId: string | number, body: string) => Promise<void>
  toggleLike: (entryId: string | number) => Promise<void>
  toggleCommentLike: (commentId: number) => Promise<void>
}

const Ctx = createContext<GuestbookCtx | null>(null)

const EMPTY: EntryState = { comments: [], likeCount: 0, likedByMe: false }

/**
 * One fetch of the whole journey's guestbook (comments + like tallies keyed by
 * entry id) plus the current commenter, shared with every GuestbookThread so a
 * 16-entry page makes one request, not sixteen. Writes refetch the summary to
 * stay simple and correct rather than surgically patching local state.
 */
export function GuestbookProvider({ token, children }: { token: string; children: ReactNode }) {
  const [byEntry, setByEntry] = useState<Record<string, EntryState>>({})
  const [commentsEnabled, setCommentsEnabled] = useState(true)
  const [me, setMe] = useState<Me | null>(null)

  const refresh = useCallback(async () => {
    const [summary, meRes] = await Promise.all([
      guestbookApi.summary(token).catch(() => null),
      guestbookApi.me(token).catch(() => ({ commenter: null })),
    ])
    if (summary) {
      setByEntry(summary.byEntry ?? {})
      setCommentsEnabled(!!summary.commentsEnabled)
    }
    setMe(meRes?.commenter ?? null)
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const forEntry = useCallback((entryId: string | number) => byEntry[String(entryId)] ?? EMPTY, [byEntry])

  const requestLink = useCallback(
    async (email: string, displayName: string, website = '') => {
      await guestbookApi.requestLink(token, email, displayName, website)
    },
    [token],
  )

  const addComment = useCallback(
    async (entryId: string | number, body: string) => {
      await guestbookApi.addComment(token, entryId, body)
      await refresh()
    },
    [token, refresh],
  )

  const toggleLike = useCallback(
    async (entryId: string | number) => {
      await guestbookApi.toggleLike(token, entryId)
      await refresh()
    },
    [token, refresh],
  )

  const toggleCommentLike = useCallback(
    async (commentId: number) => {
      await guestbookApi.toggleCommentLike(token, commentId)
      await refresh()
    },
    [token, refresh],
  )

  const value = useMemo<GuestbookCtx>(
    () => ({ token, me, commentsEnabled, forEntry, requestLink, addComment, toggleLike, toggleCommentLike }),
    [token, me, commentsEnabled, forEntry, requestLink, addComment, toggleLike, toggleCommentLike],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Null outside a provider, so the thread can render nothing when unshared. */
export function useGuestbook(): GuestbookCtx | null {
  return useContext(Ctx)
}
