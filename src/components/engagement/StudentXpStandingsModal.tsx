'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Trophy, X, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface StudentXpStandingsModalProps {
  children: React.ReactNode
  buttonText?: string
  className?: string
}

export default function StudentXpStandingsModal({
  children,
  buttonText,
  className = '',
}: StudentXpStandingsModalProps) {
  const t = useTranslations('dashboard.summary')
  const [isOpen, setIsOpen] = useState(false)
  const displayButtonText = buttonText ?? t('studentStandings')

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  // Prevent background scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 h-auto rounded-lg border-amber-500/30 bg-amber-950/30 hover:bg-amber-950/50 text-amber-300 hover:text-amber-200 transition-colors ${className}`}
      >
        <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <span>{displayButtonText}</span>
      </Button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="standings-modal-title"
        >
          {/* Backdrop blur & overlay */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-xl max-h-[85vh] bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 text-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="standings-modal-title" className="text-base font-bold text-white font-display">
                    {displayButtonText}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t('communityLeaderboard')}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close standings modal"
                className="rounded-full p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {children}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-950/60 border-t border-slate-800 text-xs">
              <span className="text-slate-400">
                Leaderboard
              </span>
              <Button asChild variant="ghost" size="sm" className="text-xs font-semibold gap-1 text-amber-300 hover:text-amber-200">
                <Link href="/leaderboard">
                  Full Page <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
