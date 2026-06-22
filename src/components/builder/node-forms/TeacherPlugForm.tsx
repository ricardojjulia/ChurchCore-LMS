'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { BlockFormData } from '@/types/blocks'
import { FormShell, Field } from './FormShell'

interface Props {
  initial?: {
    title?:          string
    teacher_uid?:    string
    bio_override?:   string | null
    specialty?:      string | null
    website?:        string | null
  }
  onSave:   (data: BlockFormData) => void
  onCancel: () => void
}

export default function TeacherPlugForm({ initial, onSave, onCancel }: Props) {
  const [title,        setTitle]       = useState(initial?.title ?? 'Meet Your Instructor')
  const [bioOverride,  setBioOverride] = useState(initial?.bio_override ?? '')
  const [specialty,    setSpecialty]   = useState(initial?.specialty ?? '')
  const [website,      setWebsite]     = useState(initial?.website ?? '')
  const [teacherUid,   setTeacherUid]  = useState(initial?.teacher_uid ?? '')
  const [profileName,  setProfileName] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('uid, display_name, bio, specialty, website_url')
        .eq('auth_id', user.id)
        .single()
        .then(({ data }) => {
          if (!data) return
          setProfileName(data.display_name ?? '')
          // Auto-fill teacher_uid only for a brand-new block
          if (!initial?.teacher_uid) {
            setTeacherUid(data.uid)
          }
          // Auto-fill specialty and website if not already overridden
          if (!initial?.specialty && data.specialty?.length) {
            setSpecialty((data.specialty as string[]).join(', '))
          }
          if (!initial?.website && data.website_url) {
            setWebsite(data.website_url)
          }
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !teacherUid) return
    onSave({
      title: title.trim(),
      content: {
        teacher_uid:   teacherUid,
        bio_override:  bioOverride.trim() || null,
        specialty:     specialty.trim()   || null,
        website:       website.trim()     || null,
      },
    })
  }

  return (
    <FormShell title="Teacher Card" icon="👤" onCancel={onCancel} onSubmit={handleSubmit}>
      <Field label="Block Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meet Your Instructor"
          className="input"
          required
        />
      </Field>

      {profileName && (
        <div className="text-xs text-muted-foreground bg-slate-100 rounded-lg px-3 py-2">
          Auto-filled from your profile: <strong>{profileName}</strong>
        </div>
      )}

      <Field label="Course-specific bio" hint="Leave blank to show your profile bio">
        <textarea
          value={bioOverride}
          onChange={(e) => setBioOverride(e.target.value)}
          placeholder="In this course, I'll guide you through…"
          rows={4}
          className="input resize-y"
        />
      </Field>

      <Field label="Specialties" hint="Comma-separated, e.g. Greek & Hebrew, Youth Ministry">
        <input
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          placeholder="Biblical Studies, Discipleship"
          className="input"
        />
      </Field>

      <Field label="Website or link">
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://…"
          className="input"
        />
      </Field>
    </FormShell>
  )
}
