'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Props {
  userId: string
  initialFullName: string
  initialAvatarUrl: string
  role: string
}

const ROLE_LABELS: Record<string, string> = {
  admin:   'Administrator',
  manager: 'Manager',
  teacher: 'Teacher',
  student: 'Student',
}

export default function ProfileForm({ userId, initialFullName, initialAvatarUrl, role }: Props) {
  const [fullName, setFullName]     = useState(initialFullName)
  const [avatarUrl, setAvatarUrl]   = useState(initialAvatarUrl)
  const [saving, setSaving]         = useState(false)
  const [success, setSuccess]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const router = useRouter()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Display name is required.'); return }
    setSaving(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: fullName.trim(),
        avatar_url: avatarUrl.trim() || null,
        updated_at: new Date().toISOString(),
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
          Display Name <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setSuccess(false) }}
          placeholder="Your full name"
          required
          className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Avatar URL
          <span className="ml-2 text-xs font-normal text-muted-foreground">(optional — paste any image URL)</span>
        </label>
        <input
          type="url"
          value={avatarUrl}
          onChange={(e) => { setAvatarUrl(e.target.value); setSuccess(false) }}
          placeholder="https://example.com/avatar.jpg"
          className="w-full border border-input rounded-md px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring transition"
        />
        {avatarUrl && (
          <div className="mt-3 flex items-center gap-3">
            <img
              src={avatarUrl}
              alt="Avatar preview"
              className="w-12 h-12 rounded-full object-cover border border-border"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <span className="text-xs text-muted-foreground">Preview</span>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Role</label>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{ROLE_LABELS[role] ?? role}</Badge>
          <span className="text-xs text-muted-foreground">Managed by administrators</span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
          {error}
        </p>
      )}

      {success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3">
          Profile saved successfully.
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}
          className="text-muted-foreground hover:text-destructive">
          Sign out
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Profile'}
        </Button>
      </div>
    </form>
  )
}
