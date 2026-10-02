'use client'

import React, { useRef, useState, useEffect } from 'react'
import { sendVideoHeartbeat } from '@/app/actions/video'
import type { VideoCaption } from '@/lib/video'

interface Props {
  videoAssetId: string
  blockId?: string
  hlsUrl: string
  thumbnailUrl?: string
  title?: string
  duration?: number
  captions?: VideoCaption[]
  onCompleted?: () => void
}

export default function HostedVideoPlayer({
  videoAssetId,
  blockId,
  hlsUrl,
  thumbnailUrl,
  title,
  duration = 0,
  captions = [],
  onCompleted,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [maxTime, setMaxTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState(duration)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [completed, setCompleted] = useState(false)
  const [volume, setVolume] = useState(1)

  // Track max position
  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const cur = videoRef.current.currentTime
    setCurrentTime(cur)
    if (cur > maxTime) {
      setMaxTime(cur)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current && videoRef.current.duration) {
      setTotalDuration(videoRef.current.duration)
    }
  }

  // Periodic heartbeat sync
  useEffect(() => {
    if (!isPlaying) return

    const interval = setInterval(async () => {
      if (!videoRef.current || totalDuration <= 0) return

      const cur = videoRef.current.currentTime
      const res = await sendVideoHeartbeat({
        videoAssetId,
        blockId,
        currentSeconds: cur,
        maxPosition: maxTime,
        duration: totalDuration,
      })

      if (res.completed && !completed) {
        setCompleted(true)
        onCompleted?.()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [isPlaying, videoAssetId, blockId, maxTime, totalDuration, completed, onCompleted])

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed)
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
    }
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl group">
      {/* Video Element */}
      <video
        ref={videoRef}
        src={hlsUrl}
        poster={thumbnailUrl}
        playsInline
        className="w-full aspect-video object-contain bg-black"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        controls
      >
        {captions.map((cap, idx) => (
          <track
            key={idx}
            kind="subtitles"
            src={cap.url}
            srcLang={cap.language}
            label={cap.label}
          />
        ))}
      </video>

      {/* Progress & Speed Header Overlay */}
      <div className="p-3 bg-gradient-to-t from-slate-950/90 to-slate-950/40 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white truncate max-w-xs">{title || 'Video Lesson'}</span>
          {completed && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              ✓ Completed
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span>Speed:</span>
          {[0.75, 1, 1.25, 1.5, 2].map(speed => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                playbackRate === speed
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
