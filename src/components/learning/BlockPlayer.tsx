import { tiptapToHtml } from '@/utils/tiptap'
import VideoPlayer from './VideoPlayer'
import AssignmentPlayer from './AssignmentPlayer'
import QuizPlayer from './QuizPlayer'
import DiscussionPlayer from './DiscussionPlayer'
import LiveSessionPlayer from './LiveSessionPlayer'
import TeacherPlugPlayer from './TeacherPlugPlayer'
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
          <p className="italic text-muted-foreground">No content yet.</p>
        )}
      </div>
    )
  }

  // ── Video ──────────────────────────────────────────────────────────
  if (block.block_type_id === 'video_stream') {
    const url = content.url as string | undefined
    if (!url) return <p className="text-muted-foreground italic">No video URL configured.</p>
    return <VideoPlayer url={url} title={block.title} />
  }

  // ── File/Resource ──────────────────────────────────────────────────
  if (block.block_type_id === 'resource_file') {
    const url  = content.url as string | undefined
    const name = content.filename as string | undefined
    if (!url) return <p className="text-muted-foreground italic">File not available.</p>
    return (
      <div className="flex items-center gap-4 bg-white border border-border rounded-xl p-5">
        <span className="text-3xl" aria-hidden="true">📎</span>
        <div>
          <p className="font-semibold text-foreground">{name ?? 'Download file'}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="text-sm text-primary hover:text-primary/80 underline transition-colors"
          >
            Download →
          </a>
        </div>
      </div>
    )
  }

  // ── External URL ───────────────────────────────────────────────────
  if (block.block_type_id === 'external_url') {
    const url         = content.url as string | undefined
    const description = content.description as string | undefined
    if (!url) return <p className="text-muted-foreground italic">No URL configured.</p>
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

    return (
      <div>
        {instructions && (
          <div className="prose prose-sm max-w-none text-foreground mb-4">
            <p className="whitespace-pre-wrap">{instructions}</p>
          </div>
        )}
        {dueDate && (
          <p className="text-xs text-muted-foreground mb-4">
            Due: {new Date(dueDate).toLocaleDateString('en-US', { dateStyle: 'long', timeStyle: 'short' })}
          </p>
        )}
        <AssignmentPlayer
          blockId={block.id}
          instructions={instructions ?? ''}
          maxPoints={maxPoints}
          existingSub={submission as any}
          onComplete={onComplete}
        />
      </div>
    )
  }

  // ── Quiz ───────────────────────────────────────────────────────────
  if (block.block_type_id === 'quiz') {
    const questions = (content.questions as QuizQuestion[] | undefined) ?? []
    if (questions.length === 0) {
      return <p className="text-muted-foreground italic">No questions configured for this quiz.</p>
    }
    const desc = content.description as string | undefined
    return (
      <div>
        {desc && <p className="text-sm text-muted-foreground mb-4">{desc}</p>}
        <div className="flex items-center gap-3 mb-4 text-xs text-muted-foreground">
          <span>{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{questions.reduce((s, q) => s + q.points, 0)} points total</span>
        </div>
        <QuizPlayer
          blockId={block.id}
          questions={questions}
          blockXp={(block.gamification as any)?.base_xp_reward ?? 0}
          existingSub={submission as any}
          onComplete={onComplete}
        />
      </div>
    )
  }

  // ── Live Session ───────────────────────────────────────────────────
  if (block.block_type_id === 'live_session') {
    const meetingUrl   = content.meeting_url as string | undefined
    if (!meetingUrl) return <p className="text-muted-foreground italic">Meeting URL not configured.</p>
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
    if (!orgId) return <p className="text-muted-foreground italic">Instructor card not available.</p>
    return <TeacherPlugPlayer blockContent={block.content} orgId={orgId} />
  }

  return (
    <div className="bg-slate-50 border border-border rounded-xl p-5 text-center">
      <p className="text-muted-foreground text-sm italic">Block type not supported.</p>
    </div>
  )
}
