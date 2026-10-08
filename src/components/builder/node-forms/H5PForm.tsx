'use client'

import { useState } from 'react'
import type { BlockFormData, H5PContent } from '@/types/blocks'
import { FormShell, Field, XpField, Toggle } from './FormShell'
import { normalizeH5PEmbedUrl, parseH5PPackage } from '@/lib/h5p/parser'

interface Props {
  initial?: {
    title?: string
    embed_type?: 'url' | 'package' | 'embed_code'
    url?: string
    embed_code?: string
    package_url?: string
    package_path?: string
    package_filename?: string
    package_title?: string
    package_main_library?: string
    passing_score_pct?: number
    require_passing?: boolean
    aspect_ratio?: '16:9' | '4:3' | '1:1' | 'auto'
    gamification?: { base_xp_reward?: number }
  }
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

export default function H5PForm({ initial, onSave, onCancel }: Props) {
  const [embedType, setEmbedType] = useState<'url' | 'package'>(
    initial?.embed_type === 'package' ? 'package' : 'url'
  )
  const [title, setTitle] = useState(initial?.title ?? '')
  const [urlInput, setUrlInput] = useState(initial?.url || initial?.embed_code || '')
  const [passingScore, setPassingScore] = useState<number | string>(
    initial?.passing_score_pct ?? 70
  )
  const [requirePassing, setRequirePassing] = useState(
    initial?.require_passing ?? true
  )
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '1:1' | 'auto'>(
    initial?.aspect_ratio ?? '16:9'
  )
  const [xp, setXp] = useState(initial?.gamification?.base_xp_reward ?? 50)

  // Package upload state
  const [packageFileName, setPackageFileName] = useState(initial?.package_filename ?? '')
  const [packagePath, setPackagePath] = useState(initial?.package_path ?? '')
  const [packageUrl, setPackageUrl] = useState(initial?.package_url ?? '')
  const [packageMainLibrary, setPackageMainLibrary] = useState(initial?.package_main_library ?? '')
  const [packageError, setPackageError] = useState<string | null>(null)
  const [isParsingPackage, setIsParsingPackage] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const cleanUrl = normalizeH5PEmbedUrl(urlInput)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setPackageError(null)
    setIsParsingPackage(true)

    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parseH5PPackage(buffer)

      if (!parsed.valid || !parsed.metadata) {
        setPackageError(parsed.error || 'Could not parse .h5p file.')
        setIsParsingPackage(false)
        return
      }

      setPackageFileName(file.name)
      if (parsed.metadata.mainLibrary) {
        setPackageMainLibrary(parsed.metadata.mainLibrary)
      }

      // Autofill title if empty
      if (!title.trim() && parsed.metadata.title) {
        setTitle(parsed.metadata.title)
      }

      // Upload to server storage
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload/h5p', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok || data.error) {
        setPackageError(data.error || 'Failed to upload .h5p package to storage.')
      } else {
        setPackagePath(data.path)
      }
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : 'Error reading .h5p file.')
    } finally {
      setIsParsingPackage(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    const content: H5PContent = {
      embed_type: embedType,
      aspect_ratio: aspectRatio,
      passing_score_pct: passingScore ? Number(passingScore) : 70,
      require_passing: requirePassing,
    }

    if (embedType === 'url') {
      if (!cleanUrl) return
      content.url = cleanUrl
      content.embed_code = urlInput.trim()
    } else {
      if (!packageFileName) return
      content.package_filename = packageFileName
      content.package_path = packagePath
      content.package_url = packageUrl
      content.package_main_library = packageMainLibrary
    }

    onSave({
      title: title.trim(),
      content: content as unknown as Record<string, unknown>,
      gamification: { base_xp_reward: xp },
    })
  }

  return (
    <FormShell title="H5P Interactive Activity" icon="✨" onCancel={onCancel} onSubmit={handleSubmit}>
      {/* Tab switch between Embed URL and .h5p Package */}
      <div className="flex rounded-lg bg-slate-900/80 p-1 border border-slate-800 mb-4">
        <button
          type="button"
          onClick={() => setEmbedType('url')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
            embedType === 'url'
              ? 'bg-fuchsia-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Embed URL / iFrame
        </button>
        <button
          type="button"
          onClick={() => setEmbedType('package')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
            embedType === 'package'
              ? 'bg-fuchsia-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Upload .h5p File
        </button>
      </div>

      <Field label="Activity Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Interactive Video: Paul's Missionary Journeys"
          className="input"
          required
        />
      </Field>

      {embedType === 'url' ? (
        <Field
          label="H5P Embed URL or &lt;iframe&gt; Code"
          required
          hint="Paste the embed link or embed code from H5P.com, Lumi, Curriki, WordPress, etc."
        >
          <textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={3}
            placeholder="https://h5p.org/h5p/embed/... or <iframe src='...'></iframe>"
            className="input font-mono text-xs"
            required
          />
          {cleanUrl && (
            <p className="text-xs text-fuchsia-400 mt-1 truncate">
              Detected URL: <span className="font-mono">{cleanUrl}</span>
            </p>
          )}
        </Field>
      ) : (
        <Field
          label="Upload .h5p Package File"
          required={!packageFileName}
          hint="Upload an interactive package exported from Lumi Desktop, H5P editor, or OER repository."
        >
          <div className="flex flex-col gap-2">
            <input
              type="file"
              accept=".h5p,.zip"
              onChange={handleFileUpload}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-fuchsia-950 file:text-fuchsia-300 hover:file:bg-fuchsia-900 text-xs text-slate-300"
            />
            {isParsingPackage && (
              <p className="text-xs text-slate-400 animate-pulse">Analyzing .h5p structure…</p>
            )}
            {packageError && (
              <p className="text-xs text-rose-400">{packageError}</p>
            )}
            {packageFileName && (
              <div className="rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/20 p-3 text-xs flex items-center justify-between">
                <div>
                  <p className="font-semibold text-fuchsia-200">{packageFileName}</p>
                  {packageMainLibrary && (
                    <p className="text-slate-400 mt-0.5 font-mono text-[11px]">
                      Activity Type: {packageMainLibrary}
                    </p>
                  )}
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                  Verified .h5p
                </span>
              </div>
            )}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Passing Score (%)"
          hint="Minimum grade percentage required to pass and earn XP."
        >
          <input
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Display Aspect Ratio">
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as any)}
            className="input"
          >
            <option value="16:9">16:9 (Widescreen)</option>
            <option value="4:3">4:3 (Standard)</option>
            <option value="1:1">1:1 (Square)</option>
            <option value="auto">Auto / Dynamic Height</option>
          </select>
        </Field>
      </div>

      <Toggle
        label="Require passing grade to complete"
        hint="Students must meet the passing percentage before this block is marked complete."
        value={requirePassing}
        onChange={setRequirePassing}
      />

      <XpField value={xp} onChange={setXp} />

      {/* Live Preview Button */}
      {cleanUrl && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1.5"
          >
            {showPreview ? 'Hide Interactive Preview' : '👁️ Preview H5P Activity'}
          </button>
          {showPreview && (
            <div className="mt-3 rounded-xl border border-border overflow-hidden bg-slate-950 p-2">
              <div
                className={`w-full ${
                  aspectRatio === '16:9'
                    ? 'aspect-video'
                    : aspectRatio === '4:3'
                    ? 'aspect-[4/3]'
                    : aspectRatio === '1:1'
                    ? 'aspect-square'
                    : 'h-96'
                }`}
              >
                <iframe
                  src={cleanUrl}
                  title="H5P Preview"
                  className="w-full h-full border-0 rounded-lg"
                  allow="autoplay; fullscreen; microphone; camera; midi; encrypted-media"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </FormShell>
  )
}
