// Shared Tiptap extension list used by both the client editor and server-side
// generateHTML. Import this file in both contexts — it has no browser deps.
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'

export const BASE_EXTENSIONS = [StarterKit, Image, Underline]
