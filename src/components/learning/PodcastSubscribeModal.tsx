'use client'

import { useState } from 'react'
import { Headphones, Copy, Check, ExternalLink, X, Radio, ShieldCheck } from 'lucide-react'

interface PodcastSubscribeModalProps {
  isOpen: boolean
  onClose: () => void
  courseTitle: string
  feedToken: string
}

export function PodcastSubscribeModal({
  isOpen,
  onClose,
  courseTitle,
  feedToken,
}: PodcastSubscribeModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lms.churchcore.org'
  const httpFeedUrl = `${origin}/api/feeds/podcast/${feedToken}`
  const rawFeedHostAndPath = httpFeedUrl.replace(/^https?:\/\//, '')
  const podcastSchemeUrl = `podcast://${rawFeedHostAndPath}`
  const overcastUrl = `overcast://x-callback-url/add?url=${encodeURIComponent(httpFeedUrl)}`
  const pocketCastsUrl = `pktc://subscribe/${rawFeedHostAndPath}`

  const handleCopy = () => {
    navigator.clipboard.writeText(httpFeedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Discipleship Podcast Feed
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Listen to course audio lessons & devotionals on your favorite podcast app.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-5 space-y-4">
          <div className="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900 flex items-center gap-2.5 text-xs text-purple-900 dark:text-purple-200">
            <Radio className="w-4 h-4 flex-shrink-0 text-purple-600 dark:text-purple-400" />
            <span>
              Connected to: <strong>{courseTitle}</strong>
            </span>
          </div>

          {/* Quick Subscription Buttons */}
          <div className="space-y-2">
            <a
              href={podcastSchemeUrl}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-zinc-900 dark:text-zinc-100 text-sm font-medium transition"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                Apple Podcasts
              </span>
              <ExternalLink className="w-4 h-4 text-zinc-400" />
            </a>

            <a
              href={overcastUrl}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-zinc-900 dark:text-zinc-100 text-sm font-medium transition"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                Overcast
              </span>
              <ExternalLink className="w-4 h-4 text-zinc-400" />
            </a>

            <a
              href={pocketCastsUrl}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-zinc-900 dark:text-zinc-100 text-sm font-medium transition"
            >
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Pocket Casts
              </span>
              <ExternalLink className="w-4 h-4 text-zinc-400" />
            </a>
          </div>

          {/* Private RSS Feed URL */}
          <div>
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
              Private RSS Feed URL (Any Podcast App)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={httpFeedUrl}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 select-all"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow transition flex-shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Privacy Note */}
          <div className="flex items-start gap-2 pt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>
              This is your private learner feed URL. Do not share it publicly. It will automatically update whenever new audio lessons and devotionals are added.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
