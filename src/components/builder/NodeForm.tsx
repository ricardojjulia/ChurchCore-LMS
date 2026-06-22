'use client'

import type { CourseBlock, BlockTypeId, BlockFormData } from '@/types/blocks'
import PageForm from './node-forms/PageForm'
import VideoForm from './node-forms/VideoForm'
import FileForm from './node-forms/FileForm'
import UrlForm from './node-forms/UrlForm'
import AssignmentForm from './node-forms/AssignmentForm'
import QuizForm from './node-forms/QuizForm'
import DiscussionForm from './node-forms/DiscussionForm'
import LiveSessionForm from './node-forms/LiveSessionForm'
import TeacherPlugForm from './node-forms/TeacherPlugForm'

interface Props {
  blockTypeId: BlockTypeId
  initial?: CourseBlock
  onSave: (data: BlockFormData) => void
  onCancel: () => void
}

function extractInitial(block?: CourseBlock): Record<string, unknown> {
  if (!block) return {}
  return { title: block.title, ...(block.content as Record<string, unknown>), gamification: block.gamification }
}

export default function NodeForm({ blockTypeId, initial, onSave, onCancel }: Props) {
  const init = extractInitial(initial)
  const props = { initial: init as any, onSave: onSave as any, onCancel }

  switch (blockTypeId) {
    case 'page':          return <PageForm {...props} />
    case 'video_stream':  return <VideoForm {...props} />
    case 'resource_file': return <FileForm {...props} />
    case 'external_url':  return <UrlForm {...props} />
    case 'assignment':    return <AssignmentForm {...props} />
    case 'quiz':          return <QuizForm {...props} />
    case 'discussion':    return <DiscussionForm {...props} />
    case 'live_session':  return <LiveSessionForm {...props} />
    case 'teacher_plug':  return <TeacherPlugForm {...props} />
    default:              return null
  }
}
