'use client'

import { useTranslations } from 'next-intl'
import { tiptapToHtml } from '@/utils/tiptap'
import VideoPlayer from './VideoPlayer'
import AssignmentPlayer from './AssignmentPlayer'
import QuizPlayer from './QuizPlayer'
import DiscussionPlayer from './DiscussionPlayer'
import LiveSessionPlayer from './LiveSessionPlayer'
import TeacherPlugPlayer from './TeacherPlugPlayer'
import AttendancePlayer from './AttendancePlayer'
import type { CourseBlock, QuizQuestion } from '@/types/blocks'

interface Submission {
  status:    string
  content:   Record<string, unknown>
  score:     number | null
  max_score: number | null
  grade_pct: number | null
  feedback:  string | null
}

interface Props {
  block:       CourseBlock
  orgId?:      string
  submission?: Submission | null
  onComplete?: (xpAwarded: number) => void
  viewerRole?: string
}

export default function BlockPlayer({ block, orgId, submission, onComplete, viewerRole }: Props) {
  const t = useTranslations()
  const content = block.content as Record<string, unknown>

  // ── Page ───────────────────────────────────────────────────────────
  if (block.block_type_id === 'page') {
    const body = content.body as string | object | undefined
    const html = tiptapToHtml(body)
    return (
      <div className="prose prose-sm max-w-none text-foreground leading-relaxed">
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="italic text-muted-foreground">{t('learning.block.emptyPageBody')}</p>
        )}
      </div>
    )
  }

  // ── Video ──────────────────────────────────────────────────────────
  if (block.block_type_id === 'video_stream') {
    const url = content.url as string | undefined
    if (!url) return <p className="text-muted-foreground italic">{t('learning.block.noVideoUrl')}</p>
    return (
      <VideoPlayer
        url={url}
        title={block.title}
        blockId={block.id}
        durationMinutes={(content.duration_minutes as number | undefined) ?? undefined}
        mustView={((content.requirements as Record<string, unknown> | undefined)?.must_view as boolean | undefined) ?? false}
        existingSub={submission as any}
        onComplete={onComplete}
      />
    )
  }

  // ── File/Resource ──────────────────────────────────────────────────
  if (block.block_type_id === 'resource_file') {
    const url  = content.url as string | undefined
    const name = content.filename as string | undefined
    if (!url) return <p className="text-muted-foreground italic">{t('learning.block.fileUnavailable')}</p>
    return (
      <div className="flex items-center gap-4 bg-white border border-border rounded-xl p-5">
        <span className="text-3xl" aria-hidden="true">📎</span>
        <div>
          <p className="font-semibold text-foreground">{name ?? t('learning.block.downloadFileFallback')}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="text-sm text-primary hover:text-primary/80 underline transition-colors"
          >
            {t('learning.block.downloadButton')}
          </a>
        </div>
      </div>
    )
  }

  // ── External URL ───────────────────────────────────────────────────
  if (block.block_type_id === 'external_url') {
    const url         = content.url as string | undefined
    const description = content.description as string | undefined
    if (!url) return <p className="text-muted-foreground italic">{t('learning.block.noUrlConfigured')}</p>
    return (
      <div className="flex items-start gap-4 bg-white border border-border rounded-xl p-5">
        <span className="text-2xl mt-0.5" aria-hidden="true">🔗</span>
        <div>
          {description && <p className="text-sm text-muted-foreground mb-2">{description}</p>}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary font-semibold hover:text-primary/80 underline transition-colors break-all"
          >
            {url}
          </a>
        </div>
      </div>
    )
  }

  // ── Assignment ─────────────────────────────────────────────────────
  if (block.block_type_id === 'assignment') {
    const instructions = content.instructions as string | undefined
    const maxPoints    = (content.max_points as number | undefined) ?? 100
    const dueDate      = content.due_date as string | undefined

    const submissionType = (content.submission_type as 'text' | 'file' | 'both' | undefined) ?? 'both'
    return (
      <div>
        {instructions && (
          <div className="prose prose-sm max-w-none text-foreground mb-4">
            <p className="whitespace-pre-wrap">{instructions}</p>
          </div>
        )}
        {dueDate && (
          <p className="text-xs text-muted-foreground mb-4">
            {t('learning.block.dueLabel')} {new Date(dueDate).toLocaleDateString('en-US', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        )}
        <AssignmentPlayer
          blockId={block.id}
          instructions={instructions ?? ''}
          maxPoints={maxPoints}
          submissionType={submissionType}
          existingSub={submission as any}
          onComplete={onComplete}
        />
      </div>
    )
  }

  // ── Quiz ───────────────────────────────────────────────────────────
  if (block.block_type_id === 'quiz') {
    const questions = (content.questions as QuizQuestion[] | undefined) ?? []
    const bankDraws = (content.bank_draws as Array<{ bank_id: string; count: number }> | undefined) ?? []
    // A quiz may be built entirely from question-bank draws (resolved by
    // QuizPlayer on mount), so "empty" means no inline questions AND no draws.
    if (questions.length === 0 && bankDraws.length === 0) {
      return <p className="text-muted-foreground italic">{t('learning.block.quizEmpty')}</p>
    }
    const desc = content.description as string | undefined
    const drawnCount = bankDraws.reduce((s, d) => s + (d.count ?? 0), 0)
    const quizTotalPoints = questions.reduce((s, q) => s + q.points, 0)
    return (
      <div>
        {desc && <p className="text-sm text-muted-foreground mb-4">{desc}</p>}
        <div className="flex items-center gap-3 mb-4 text-xs text-muted-foreground">
          <span>{t('learning.block.questionCountTemplate', { count: questions.length + drawnCount })}</span>
          {bankDraws.length === 0 && (
            <>
              <span>·</span>
              <span>{t('learning.block.pointsTotalTemplate', { n: quizTotalPoints })}</span>
            </>
          )}
        </div>
        <QuizPlayer
          blockId={block.id}
          questions={questions}
          blockXp={(block.gamification as any)?.base_xp_reward ?? 0}
          timeLimitMinutes={(content.time_limit_minutes as number | null | undefined) ?? null}
          bankDraws={bankDraws}
          attemptsAllowed={(content.attempts_allowed as number | undefined) ?? 0}
          attemptsUsed={(submission as any)?.attempt_number ?? (submission ? 1 : 0)}
          minimumGradePct={((content.requirements as Record<string, unknown> | undefined)?.minimum_grade_pct as number | undefined) ?? 0}
          existingSub={submission as any}
          onComplete={onComplete}
        />
      </div>
    )
  }

  // ── Live Session ───────────────────────────────────────────────────
  if (block.block_type_id === 'live_session') {
    const meetingUrl   = content.meeting_url as string | undefined
    if (!meetingUrl) return <p className="text-muted-foreground italic">{t('learning.block.noMeetingUrl')}</p>
    return (
      <LiveSessionPlayer
        title={block.title}
        meetingUrl={meetingUrl}
        scheduledFor={content.scheduled_for as string | null | undefined}
        durationMin={content.duration_min as number | null | undefined}
        provider={content.provider as string | null | undefined}
        recordingUrl={content.recording_url as string | null | undefined}
        description={content.description as string | null | undefined}
      />
    )
  }

  // ── Discussion ─────────────────────────────────────────────────────
  if (block.block_type_id === 'discussion') {
    const prompt    = content.prompt as string | undefined
    const ownReply  = submission?.content?.text as string | null | undefined
    const maxScore  = (content.max_score as number | undefined) ?? 10
    return (
      <DiscussionPlayer
        blockId={block.id}
        prompt={prompt}
        ownReplyText={ownReply ?? null}
        viewerRole={viewerRole}
        maxScore={maxScore}
      />
    )
  }

  // ── Teacher Plug ───────────────────────────────────────────────────
  if (block.block_type_id === 'teacher_plug') {
    if (!orgId) return <p className="text-muted-foreground italic">{t('common.instructorCardUnavailable')}</p>
    return <TeacherPlugPlayer blockContent={block.content} orgId={orgId} />
  }

  // ── Attendance ─────────────────────────────────────────────────────
  if (block.block_type_id === 'attendance') {
    return (
      <AttendancePlayer
        blockId={block.id}
        sessionTitle={(content.session_title as string | null | undefined) ?? null}
        trackingMode={(content.tracking_mode as 'auto' | 'manual' | 'both' | undefined) ?? 'both'}
        points={(content.points_possible as number | undefined) ?? 0}
        existingSub={submission as any}
      />
    )
  }

  return (
    <div className="bg-slate-50 border border-border rounded-xl p-5 text-center">
      <p className="text-muted-foreground text-sm italic">{t('learning.block.unsupportedType')}</p>
    </div>
  )
}
