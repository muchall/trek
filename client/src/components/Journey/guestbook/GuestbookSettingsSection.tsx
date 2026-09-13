import { useEffect, useState } from 'react'
import { guestbookApi } from '../../../api/client'
import { useTranslation } from '../../../i18n'

/**
 * Owner guestbook settings, reused by the desktop settings dialog and the
 * mobile settings sheet: the reply display name and the comments on/off toggle.
 * Loads and saves through guestbookApi on its own, so it drops into any dialog.
 */
export function GuestbookSettingsSection({ journeyId }: { journeyId: number }) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(true)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    guestbookApi
      .ownerList(journeyId)
      .then((r) => {
        if (cancelled || !r) return
        setEnabled(!!r.commentsEnabled)
        setName(r.authorName ?? '')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [journeyId])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await guestbookApi.ownerSetSettings(journeyId, { commentsEnabled: enabled, authorName: name.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <label className="text-[10px] font-semibold tracking-[0.12em] uppercase text-zinc-500 block mb-1.5">
        {t('journey.guestbook.settingsTitle')}
      </label>

      {/* Comments on/off */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled((v) => !v)}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-left"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] text-zinc-900 dark:text-white">{t('journey.guestbook.commentsEnabled')}</span>
          <span className="block text-[11px] text-zinc-500">{t('journey.guestbook.commentsEnabledHint')}</span>
        </span>
        <span
          aria-hidden="true"
          className={`w-9 h-5 rounded-full flex-shrink-0 p-0.5 transition-colors ${enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
        >
          <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : ''}`} />
        </span>
      </button>

      {/* Display name for replies */}
      <div className="mt-3">
        <label className="text-[11px] text-zinc-500 block mb-1">{t('journey.guestbook.displayName')}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder={t('journey.guestbook.displayNamePlaceholder')}
          className="w-full px-3.5 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-xl text-[14px] bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:border-zinc-400"
        />
        <p className="mt-1 text-[11px] text-zinc-400">{t('journey.guestbook.displayNameHint')}</p>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {saved ? t('journey.guestbook.saved') : t('journey.guestbook.save')}
      </button>
    </div>
  )
}
