'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Props {
  userId: string
  initialFullName: string
  initialAvatarUrl: string
  role: string
  initialDateOfBirth?: string | null
  initialEmailDigest?: boolean
}

export default function ProfileForm({ userId, initialFullName, initialAvatarUrl, role, initialDateOfBirth = null, initialEmailDigest = true }: Props) {
  const t = useTranslations()
  const [fullName, setFullName]         = useState(initialFullName)
  const [avatarUrl, setAvatarUrl]       = useState(initialAvatarUrl)
  const [dateOfBirth, setDateOfBirth]   = useState(initialDateOfBirth ?? '')
  const [emailDigest, setEmailDigest]   = useState(initialEmailDigest)
  const [saving, setSaving]             = useState(false)
  const [success, setSuccess]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const router = useRouter()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError(t('profile.form.displayNameRequiredError')); return }
    setSaving(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name:  fullName.trim(),
        avatar_url:    avatarUrl.trim() || null,
        date_of_birth: dateOfBirth.trim() || null,
        email_digest_enabled: emailDigest,
        updated_at:    new Date().toISOString(),
      })
      .eq('auth_id', userId)

    setSaving(false)
    if (updateError) { setError(t('profile.form.saveError')); return }
    setSuccess(true)
    router.refresh()
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1">
          {t('profile.form.displayNameLabel')} <span className="text-destructive">*</span>
        </label>
        <input aria-label={t('profile.form.displayNameLabel')}
          type="text"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setSuccess(false) }}
          placeholder={t('profile.form.fullNamePlaceholder')}
          required
          className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1">
          {t('profile.form.avatarUrlLabel')}
          <span className="ml-2 text-xs font-normal text-slate-400">{t('profile.form.avatarUrlHint')}</span>
        </label>
        <input aria-label={t('profile.form.avatarUrlLabel')}
          type="url"
          value={avatarUrl}
          onChange={(e) => { setAvatarUrl(e.target.value); setSuccess(false) }}
          placeholder={t('profile.form.avatarUrlPlaceholder')}
          className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
        />
        {avatarUrl && (
          <div className="mt-3 flex items-center gap-3">
            <Image
              src={avatarUrl}
              alt={t('profile.form.avatarPreviewAlt')}
              className="w-12 h-12 rounded-full object-cover border border-slate-700"
              width={48}
              height={48}
              unoptimized
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <span className="text-xs text-slate-400">{t('profile.form.previewCaption')}</span>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="date_of_birth" className="block text-sm font-semibold text-slate-200 mb-1">
          {t('profile.form.dobLabel')}
          <span className="ml-2 text-xs font-normal text-slate-400">{t('profile.form.dobHint')}</span>
        </label>
        <input
          id="date_of_birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => { setDateOfBirth(e.target.value); setSuccess(false) }}
          max={new Date().toISOString().split('T')[0]}
          className="w-full border border-slate-700 rounded-md px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
        />
      </div>

      {role === 'student' && (
        <div className="flex items-start gap-3">
          <input
            id="email_digest_enabled"
            type="checkbox"
            checked={emailDigest}
            onChange={(e) => { setEmailDigest(e.target.checked); setSuccess(false) }}
            className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="email_digest_enabled" className="text-sm">
            <span className="block font-semibold text-slate-200">{t('profile.form.emailDigestLabel')}</span>
            <span className="block text-xs text-slate-400">{t('profile.form.emailDigestHint')}</span>
          </label>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-2">{t('profile.form.roleFieldLabel')}</label>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {role === 'admin' ? t('profile.form.roleAdministrator')
              : role === 'manager' ? t('profile.form.roleManager')
              : role === 'teacher' ? t('profile.form.roleTeacher')
              : role === 'student' ? t('profile.form.roleStudent')
              : role}
          </Badge>
          <span className="text-xs text-slate-400">{t('profile.form.roleManagedHint')}</span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {error}
        </p>
      )}

      {success && (
        <p className="text-sm text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 rounded-md px-4 py-3">
          {t('profile.form.saveSuccessNotice')}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}
          className="text-muted-foreground hover:text-destructive">
          {t('common.signOut')}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? t('common.savingButton') : t('profile.form.saveButton')}
        </Button>
      </div>
    </form>
  )
}
