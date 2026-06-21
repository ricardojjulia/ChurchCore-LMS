import { createClient } from '@/utils/supabase/server'

const BUCKET = 'content-images'

export async function getSignedImageUrl(path: string): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600) // 1-hour expiry
  return data?.signedUrl ?? ''
}
