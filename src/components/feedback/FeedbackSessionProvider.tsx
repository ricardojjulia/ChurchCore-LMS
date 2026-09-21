'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const SESSION_KEY = 'cc_feedback_session'
const MAX_BREADCRUMBS = 5

interface FeedbackSessionContext {
  sessionId: string | null
  breadcrumbs: string[]
  elapsedSeconds: number
}

const FeedbackSessionCtx = createContext<FeedbackSessionContext>({
  sessionId: null,
  breadcrumbs: [],
  elapsedSeconds: 0,
})

export function useFeedbackSession(): FeedbackSessionContext {
  return useContext(FeedbackSessionCtx)
}

export function FeedbackSessionProvider({ children }: { children: React.ReactNode }) {
  // When demo mode is off, render children immediately — add zero listeners, zero storage writes.
  if (!DEMO_MODE) {
    return <>{children}</>
  }

  return <ActiveProvider>{children}</ActiveProvider>
}

function ActiveProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const startedAt = useRef<number>(Date.now())

  // Initialise session ID from sessionStorage (or generate and persist one).
  // All sessionStorage access is inside useEffect so it never runs during SSR.
  useEffect(() => {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, id)
    }
    setSessionId(id)
    startedAt.current = Date.now()
  }, [])

  // Track last-5-route breadcrumbs whenever the pathname changes.
  useEffect(() => {
    if (!pathname) return
    setBreadcrumbs(prev => {
      const next = [...prev, pathname]
      return next.slice(-MAX_BREADCRUMBS)
    })
  }, [pathname])

  // Update elapsed seconds every 5 s (cheap enough, stops mattering when tab is hidden).
  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.current) / 1000))
    }, 5_000)
    return () => clearInterval(id)
  }, [])

  return (
    <FeedbackSessionCtx.Provider value={{ sessionId, breadcrumbs, elapsedSeconds }}>
      {children}
    </FeedbackSessionCtx.Provider>
  )
}
