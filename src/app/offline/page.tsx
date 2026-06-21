import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Offline — ChurchCore LMS',
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div
        className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 border border-amber-200"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-8 h-8 text-amber-600"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3l18 18M8.111 8.111A5.5 5.5 0 0112 7c1.657 0 3.156.733 4.172 1.894M15.889 15.889A5.5 5.5 0 016.5 12.5M1.5 1.5l21 21"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 6a9.77 9.77 0 015.999-2c4.418 0 8 2.686 9.5 6.5a13.52 13.52 0 01-1.775 3.226M9.878 9.878A3 3 0 0112 9c1.657 0 3 1.343 3 3a3 3 0 01-.879 2.121"
          />
        </svg>
      </div>

      <div className="space-y-2 max-w-sm">
        <h1 className="text-2xl font-semibold text-foreground">You are offline</h1>
        <p className="text-sm text-muted-foreground">
          This content is not available without an internet connection.
          Visit this page while online to read it offline next time.
        </p>
      </div>

      <p className="text-xs text-muted-foreground max-w-xs">
        Once you reconnect, you can return to your courses and all your progress will be intact.
      </p>

      <Link href="/dashboard" className="btn btn-outline mt-2">
        Go to dashboard
      </Link>
    </div>
  )
}
