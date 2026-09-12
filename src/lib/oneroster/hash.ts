import { createHash } from 'crypto'

export function hashSourcedId(sourcedId: string): string {
  return createHash('sha256').update(sourcedId, 'utf8').digest('hex')
}
