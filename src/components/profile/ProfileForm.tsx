'use client'

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
}

export default function ProfileForm({ userId, initialFullName, initialAvatarUrl, role, initialDateOfBirth = null }: Props) {
  const t = useTranslations()
  const [fullName, setFullName]         = useState(initialFullName)
  const [avatarUrl, setAvatarUrl]       = useState(initialAvatarUrl)
  const [dateOfBirth, setDateOfBirth]   = useState(initialDateOfBirth ?? '')
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
        updated_at:    new Date().toISOString(),
      })
      .eq('auth_id', userId)

    setSaving(false)
    if (updateError) { setError(updateError.message); return }
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
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          {t('profile.form.displayNameLabel')} <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setSuccess(false) }}
          placeholder={t('profile.form.fullNamePlaceholder')}
          required
          className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          {t('profile.form.avatarUrlLabel')}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{t('profile.form.avatarUrlHint')}</span>
        </label>
        <input
          type="url"
          value={avatarUrl}
          onChange={(e) => { setAvatarUrl(e.target.value); setSuccess(false) }}
          placeholder={t('profile.form.avatarUrlPlaceholder')}
          className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
        {avatarUrl && (
          <div className="mt-3 flex items-center gap-3">
            <img
              src={avatarUrl}
              alt={t('profile.form.avatarPreviewAlt')}
              className="w-12 h-12 rounded-full object-cover border border-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <span className="text-xs text-muted-foreground">{t('profile.form.previewCaption')}</span>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="date_of_birth" className="block text-sm font-semibold text-slate-700 mb-1">
          {t('profile.form.dobLabel')}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{t('profile.form.dobHint')}</span>
        </label>
        <input
          id="date_of_birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => { setDateOfBirth(e.target.value); setSuccess(false) }}
          max={new Date().toISOString().split('T')[0]}
          className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">{t('profile.form.roleFieldLabel')}</label>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {role === 'admin' ? t('profile.form.roleAdministrator')
              : role === 'manager' ? t('profile.form.roleManager')
              : role === 'teacher' ? t('profile.form.roleTeacher')
              : role === 'student' ? t('profile.form.roleStudent')
              : role}
          </Badge>
          <span className="text-xs text-muted-foreground">{t('profile.form.roleManagedHint')}</span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {error}
        </p>
      )}

      {success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
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
