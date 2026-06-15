// Server-safe Tiptap HTML generation. Import only in server components / actions.
// Do NOT import in 'use client' files.
import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'

const SERVER_EXTENSIONS = [StarterKit, Image, Underline]

const EMPTY_DOC = { type: 'doc', content: [] }

export function tiptapToHtml(doc: object | string | null | undefined): string {
  if (!doc) return ''
  // Legacy: if stored as a plain string, return as-is
  if (typeof doc === 'string') return doc
  try {
    return generateHTML(doc, SERVER_EXTENSIONS)
  } catch {
    return ''
  }
}

export function isTiptapDoc(value: unknown): value is object {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as Record<string, unknown>).type === 'doc'
  )
}

export { EMPTY_DOC }
