'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/upload/image', { method: 'POST', body: fd })
  if (!res.ok) return null
  const { url } = await res.json()
  return url as string
}

// ── Toolbar ────────────────────────────────────────────────────────────────

function ToolBtn({
  onClick, active, disabled, label, children,
}: {
  onClick:   () => void
  active?:   boolean
  disabled?: boolean
  label:     string
  children:  React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ? 'true' : 'false'}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="w-px h-5 bg-border mx-0.5 shrink-0" />
}

function Toolbar({ editor, onImageUpload }: { editor: Editor; onImageUpload: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-border bg-slate-50 rounded-t-xl">
      {/* History */}
      <ToolBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} label="Undo">↩</ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} label="Redo">↪</ToolBtn>
      <Divider />

      {/* Headings */}
      <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} label="Heading 1">H1</ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} label="Heading 2">H2</ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} label="Heading 3">H3</ToolBtn>
      <Divider />

      {/* Inline marks */}
      <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} label="Bold">
        <strong>B</strong>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} label="Italic">
        <em>I</em>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} label="Underline">
        <span className="underline">U</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} label="Strikethrough">
        <span className="line-through">S</span>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} label="Inline code">
        <code className="text-xs">{'<>'}</code>
      </ToolBtn>
      <Divider />

      {/* Lists */}
      <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} label="Bullet list">≡</ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} label="Ordered list">#≡</ToolBtn>
      <Divider />

      {/* Block */}
      <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} label="Blockquote">❝</ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} label="Code block">
        <code className="text-xs">{'{ }'}</code>
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} label="Horizontal rule">—</ToolBtn>
      <Divider />
      <ToolBtn onClick={onImageUpload} label="Insert image">🖼</ToolBtn>
    </div>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────

interface Props {
  content?:     object | null
  onChange?:    (json: object) => void
  placeholder?: string
  editable?:    boolean
  minHeight?:   string
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start writing…',
  editable    = true,
  minHeight   = '320px',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpdate = useCallback(
    ({ editor }: { editor: Editor }) => onChange?.(editor.getJSON()),
    [onChange]
  )

  async function insertUploadedImage(file: File, editor: Editor) {
    const url = await uploadImage(file)
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false }),
      Underline,
      Placeholder.configure({ placeholder }),
    ],
    content:  content ?? { type: 'doc', content: [] },
    editable,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: { class: 'outline-none' },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        const imageFile = Array.from(files).find((f) => f.type.startsWith('image/'))
        if (!imageFile) return false
        event.preventDefault()
        insertUploadedImage(imageFile, view.state as unknown as Editor)
        return true
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) { event.preventDefault(); insertUploadedImage(file, view.state as unknown as Editor); return true }
          }
        }
        return false
      },
    },
  })

  // Sync external content changes (initial load after async fetch)
  useEffect(() => {
    if (!editor || !content) return
    const current = JSON.stringify(editor.getJSON())
    const next    = JSON.stringify(content)
    if (current !== next) editor.commands.setContent(content)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editor, editable])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && editor) insertUploadedImage(file, editor)
    e.target.value = ''
  }

  return (
    <div className={cn(
      'border border-border rounded-xl overflow-hidden bg-white',
      !editable && 'border-transparent'
    )}>
      {editable && editor && (
        <Toolbar editor={editor} onImageUpload={() => fileInputRef.current?.click()} />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        aria-label="Upload image"
        onChange={handleFileSelect}
      />
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm max-w-none px-5 py-4',
          '[&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0'
        )}
        style={{ minHeight: editable ? minHeight : undefined }}
      />
    </div>
  )
}
