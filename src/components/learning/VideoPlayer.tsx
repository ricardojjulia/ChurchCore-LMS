'use client'

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m?.[1] ?? null
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/)
  return m?.[1] ?? null
}

export default function VideoPlayer({ url, title }: { url: string; title: string }) {
  const ytId     = extractYouTubeId(url)
  const vimeoId  = extractVimeoId(url)

  if (ytId) {
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden border border-border">
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    )
  }

  if (vimeoId) {
    return (
      <div className="aspect-video w-full rounded-xl overflow-hidden border border-border">
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}`}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    )
  }

  // Raw video file
  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <video src={url} controls className="w-full" title={title} />
    </div>
  )
}
