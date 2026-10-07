'use client'

import { useEffect, useState } from 'react'
import { Award, Share2, Copy, Check, X, Sparkles, ExternalLink } from 'lucide-react'
import { triggerCelebrationConfetti } from '@/lib/confetti'

interface CelebrationModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  badgeName?: string
  badgeImageUrl?: string
  verificationUrl?: string
  xpEarned?: number
}

export function CelebrationModal({
  isOpen,
  onClose,
  title,
  subtitle,
  badgeName,
  badgeImageUrl,
  verificationUrl,
  xpEarned = 100,
}: CelebrationModalProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isOpen) {
      triggerCelebrationConfetti(3500)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleCopyLink = () => {
    if (verificationUrl) {
      navigator.clipboard.writeText(verificationUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const linkedInUrl = verificationUrl
    ? `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
        badgeName || title
      )}&certUrl=${encodeURIComponent(verificationUrl)}`
    : null

  const whatsappUrl = verificationUrl
    ? `https://api.whatsapp.com/send?text=${encodeURIComponent(
        `I just completed "${title}" and earned a verifiable credential on ChurchCore LMS! 🎓✨ ${verificationUrl}`
      )}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-8 text-center overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Badge / Trophy Graphic */}
        <div className="mx-auto w-24 h-24 mb-6 relative">
          {badgeImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={badgeImageUrl} alt="Badge" className="w-full h-full object-contain drop-shadow-xl animate-bounce" />
          ) : (
            <div className="w-full h-full rounded-3xl bg-gradient-to-tr from-amber-500 to-amber-300 text-amber-950 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Award className="w-12 h-12" />
            </div>
          )}
          <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-indigo-600 text-white shadow">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>

        {/* Text */}
        <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
          {subtitle || 'Congratulations on completing this formative milestone!'}
        </p>

        {/* XP Badge */}
        {xpEarned > 0 && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-bold mt-4 border border-amber-200 dark:border-amber-800">
            <span>⭐</span> +{xpEarned} XP Earned
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 space-y-2.5">
          {linkedInUrl && (
            <a
              href={linkedInUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-[#0A66C2] hover:bg-[#004182] text-white font-semibold text-sm shadow transition"
            >
              <span>Add to LinkedIn Profile</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white font-semibold text-xs shadow transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share to WhatsApp / Small Group</span>
            </a>
          )}

          {verificationUrl && (
            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium text-xs border border-zinc-200 dark:border-zinc-700 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Verification URL Copied!' : 'Copy Verifiable Link'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
          >
            Continue Learning
          </button>
        </div>
      </div>
    </div>
  )
}
