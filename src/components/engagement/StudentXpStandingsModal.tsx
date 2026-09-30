'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Trophy, X, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface StudentXpStandingsModalProps {
  children: React.ReactNode
  buttonText?: string
  className?: string
}

export default function StudentXpStandingsModal({
  children,
  buttonText = 'Student XP Standings',
  className = '',
}: StudentXpStandingsModalProps) {
  const [isOpen, setIsOpen] = useState(false)

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
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 h-auto rounded-lg border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary hover:text-primary transition-colors ${className}`}
      >
        <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
        <span>{buttonText}</span>
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
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div className="relative w-full max-w-xl max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-50/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="standings-modal-title" className="text-base font-bold text-foreground">
                    {buttonText}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Formation rank &amp; community XP leaderboard
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close standings modal"
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {children}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-border text-xs">
              <span className="text-muted-foreground">
                Rankings update automatically with lesson completions.
              </span>
              <Button asChild variant="ghost" size="sm" className="text-xs font-semibold gap-1 text-primary">
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
