import { Metadata } from 'next'
import SignupForm from './SignupForm'

export const metadata: Metadata = {
  title: 'Start Your 14-Day Free Trial | ChurchCore LMS',
  description: 'Create your church, ministry, or school learning workspace in minutes with a 14-day free trial.',
}

export default function SignupPage() {
  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
      {/* Left side: Hero value prop */}
      <div className="md:w-5/12 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center font-bold text-lg text-white shadow-lg">
              ✝
            </div>
            <span className="text-xl font-bold tracking-tight">ChurchCore LMS</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 leading-tight">
            Equip Your Ministry with Modern Learning
          </h1>
          <p className="text-slate-300 text-base md:text-lg mb-8 leading-relaxed">
            The multi-tenant learning management system built specifically for churches, ministries, Christian schools, and seminaries.
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                ✓
              </div>
              <p className="text-sm text-slate-300">
                <strong className="text-white">Instant Setup:</strong> Pre-seeded with starter courses and ready-to-run modules.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                ✓
              </div>
              <p className="text-sm text-slate-300">
                <strong className="text-white">AI Tutor & Creator:</strong> Grounded theological AI tutor and automated outline generator.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                ✓
              </div>
              <p className="text-sm text-slate-300">
                <strong className="text-white">Full Feature Access:</strong> Gamification, verified PDF certificates, and guardian portal included.
              </p>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                ✓
              </div>
              <p className="text-sm text-slate-300">
                <strong className="text-white">No Credit Card Required:</strong> 14-day full trial with zero commitment.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-8 mt-8 border-t border-slate-800 text-xs text-slate-400">
          Trusted by church plants, discipleship tracks, and Bible institutes worldwide.
        </div>

        {/* Decorative background glow */}
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Right side: Signup Form Card */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 p-8 md:p-10">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Create Your Learning Workspace
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Start your 14-day free trial today. Cancel or change plans anytime.
            </p>
          </div>

          <SignupForm />
        </div>
      </div>
    </main>
  )
}
