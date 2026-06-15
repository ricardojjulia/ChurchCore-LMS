'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback } from 'react'
import { cn } from '@/lib/utils'

// Minimal toolbar for discussion replies — no headings, no images, no code blocks.
function ToolBtn({ onClick, active, label, children }: {
  onClick: () => void; active?: boolean; label: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active ? 'true' : 'false'}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

interface Props {
  onChange?:    (text: string) => void
  placeholder?: string
  value?:       string
  onSubmit?:    (text: string) => void
}

export default function DiscussionEditor({
  onChange,
  placeholder = 'Write a reply…',
  value = '',
  onSubmit,
}: Props) {
  const handleUpdate = useCallback(
    ({ editor }: { editor: ReturnType<typeof useEditor> & object }) => {
      onChange?.((editor as any).getText())
    },
    [onChange]
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable block types that don't belong in discussion replies
        heading:      false,
        codeBlock:    false,
        horizontalRule: false,
        blockquote:   false,
      }),
      Underline,
      Placeholder.configure({ placeholder }),
    ],
    content: value ? `<p>${value}</p>` : '',
    onUpdate: handleUpdate,
    editorProps: {
      attributes: { class: 'outline-none' },
      handleKeyDown(_, event) {
        // Cmd/Ctrl+Enter submits
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          const text = (editor as any)?.getText?.()?.trim()
          if (text && onSubmit) {
            onSubmit(text)
            editor?.commands.clearContent()
          }
          return true
        }
        return false
      },
    },
  })

  function getAndClear(): string {
    const text = editor?.getText()?.trim() ?? ''
    editor?.commands.clearContent()
    return text
  }

  // Expose getAndClear via a data attribute so parent can call it
  // (simpler than forwardRef + imperative handle for this use case)

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-white">
      {/* Mini toolbar */}
      {editor && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-slate-50">
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} label="Bold">
            <strong>B</strong>
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} label="Italic">
            <em>I</em>
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} label="Underline">
            <span className="underline">U</span>
          </ToolBtn>
          <span className="w-px h-4 bg-border mx-0.5" />
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} label="Bullet list">≡</ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} label="Ordered list">#≡</ToolBtn>
        </div>
      )}
      <EditorContent
        editor={editor}
        data-get-and-clear={JSON.stringify({ fn: 'getAndClear' })}
        className={cn(
          'prose prose-sm max-w-none px-4 py-3 min-h-[80px]',
          '[&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0'
        )}
      />
      {onSubmit && (
        <div className="flex justify-between items-center px-4 py-2 border-t border-border bg-slate-50">
          <span className="text-xs text-muted-foreground">⌘↵ to send</span>
          <button
            type="button"
            onClick={() => { const t = getAndClear(); if (t) onSubmit(t) }}
            className="bg-primary text-primary-foreground font-bold px-4 py-1.5 rounded-xl text-sm hover:bg-primary/90 transition-colors"
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}
