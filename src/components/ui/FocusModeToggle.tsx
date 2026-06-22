'use client'

import { useEffect } from 'react'

interface Props {
  isFocusMode: boolean
  toggle:      () => void
}

export function FocusModeToggle({ isFocusMode, toggle }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'f' && e.key !== 'F') return
      if (e.target instanceof HTMLInputElement) return
      if (e.target instanceof HTMLTextAreaElement) return
      if ((e.target as HTMLElement).isContentEditable) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  return (
    <button
      onClick={toggle}
      className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-white border border-border shadow-lg text-lg text-muted-foreground hover:text-foreground hover:shadow-xl transition-all"
      aria-label={isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}
      title={`${isFocusMode ? 'Exit' : 'Enter'} Focus Mode (F)`}
    >
      {isFocusMode ? '⊠' : '⊡'}
    </button>
  )
}
