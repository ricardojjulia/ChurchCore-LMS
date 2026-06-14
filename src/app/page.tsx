import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-5xl font-extrabold text-white tracking-tight">
          ChurchCore <span className="text-indigo-400">LMS</span>
        </h1>
        <p className="text-slate-400 text-lg mt-3">
          A fast, secure, ministry-ready learning platform.
        </p>
      </div>
      <div className="flex gap-4 mt-2">
        <Link
          href="/login"
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/hq"
          className="px-6 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors"
        >
          Project HQ
        </Link>
      </div>
    </main>
  )
}
