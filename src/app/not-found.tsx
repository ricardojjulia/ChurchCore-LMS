import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-2xl font-semibold">Page not found</h2>
      <p className="max-w-md text-muted-foreground">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link href="/dashboard" className="btn btn-primary">
        Return to dashboard
      </Link>
    </div>
  )
}
