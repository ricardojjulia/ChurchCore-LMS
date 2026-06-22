'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

interface BlockContent {
  teacher_uid:  string
  bio_override: string | null
  specialty:    string | null
  website:      string | null
}

interface TeacherProfile {
  display_name: string | null
  bio:          string | null
  specialty:    string[] | null
  website_url:  string | null
  avatar_url:   string | null
  org_id:       string | null
}

export default function TeacherPlugPlayer({
  blockContent,
  orgId,
}: {
  blockContent: Record<string, unknown>
  orgId:        string
}) {
  const content      = blockContent as unknown as BlockContent
  const [profile,    setProfile]    = useState<TeacherProfile | null>(null)
  const [photoUrl,   setPhotoUrl]   = useState<string | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!content.teacher_uid) { setLoading(false); return }
    const supabase = createClient()

    supabase
      .from('profiles')
      .select('display_name, bio, specialty, website_url, avatar_url, org_id')
      .eq('uid', content.teacher_uid)
      .single()
      .then(async ({ data, error: err }) => {
        if (err || !data) { setError('Instructor not found'); setLoading(false); return }

        // Verify the teacher belongs to the same org
        if (data.org_id !== orgId) { setError('Instructor not found'); setLoading(false); return }

        setProfile(data as TeacherProfile)

        // Fetch signed URL for private avatar
        if (data.avatar_url) {
          const { data: signed } = await supabase.storage
            .from('content-images')
            .createSignedUrl(data.avatar_url, 3600)
          if (signed?.signedUrl) setPhotoUrl(signed.signedUrl)
        }

        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
  }, [content.teacher_uid, orgId])

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
        <div className="h-3 bg-slate-100 rounded w-2/3" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="bg-white border border-border rounded-xl p-5 text-sm text-muted-foreground italic">
        Instructor card not available.
      </div>
    )
  }

  const name      = profile.display_name ?? 'Your Instructor'
  const initials  = name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
  const bio       = content.bio_override ?? profile.bio
  const specialty = content.specialty
    ?? (profile.specialty?.length ? profile.specialty.join(', ') : null)
  const website   = content.website ?? profile.website_url

  return (
    <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name}
            className="w-14 h-14 rounded-full object-cover shrink-0 border border-border"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary font-bold text-lg flex items-center justify-center shrink-0 border border-primary/20">
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-0.5">
            Your Instructor
          </p>
          <h3 className="text-lg font-extrabold text-foreground">{name}</h3>

          {/* Specialties */}
          {specialty && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {specialty.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (
                <span
                  key={s}
                  className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bio */}
      {bio && (
        <p className="mt-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {bio}
        </p>
      )}

      {/* Website */}
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-sm text-primary hover:underline font-medium"
        >
          {website.replace(/^https?:\/\//, '')} →
        </a>
      )}
    </div>
  )
}
