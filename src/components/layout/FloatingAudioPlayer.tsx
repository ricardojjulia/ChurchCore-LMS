'use client'

import React from 'react'
import { useAudioPlayer } from '@/lib/audio/AudioPlayerContext'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  X,
  ChevronDown,
  ChevronUp,
  Headphones,
} from 'lucide-react'

function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function FloatingAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isMinimized,
    togglePlayPause,
    seekTo,
    skipSeconds,
    setSpeed,
    setIsMinimized,
    stopAndClose,
  } = useAudioPlayer()

  if (!currentTrack) return null

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    seekTo((val / 100) * duration)
  }

  const speeds = [0.75, 1, 1.25, 1.5, 2]

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-md w-full sm:w-96 rounded-2xl bg-zinc-900/95 text-white backdrop-blur-md shadow-2xl border border-zinc-800 p-4 transition-all duration-200 animate-in slide-in-from-bottom-5">
      {/* Header / Track Info */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 truncate">
          <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-800 text-purple-400 flex-shrink-0">
            <Headphones className="w-4 h-4" />
          </div>
          <div className="truncate">
            <p className="font-semibold text-xs text-zinc-100 truncate">{currentTrack.title}</p>
            {currentTrack.subtitle && (
              <p className="text-[10px] text-zinc-400 truncate">{currentTrack.subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={stopAndClose}
            className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition"
            title="Close Player"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="mt-3 space-y-2.5">
          {/* Scrubber */}
          <div className="space-y-1">
            <input
              type="range"
              min="0"
              max="100"
              value={progressPercent || 0}
              onChange={handleSliderChange}
              className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span>{formatSeconds(currentTime)}</span>
              <span>{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center justify-between pt-1">
            {/* Speed Selector */}
            <div className="flex items-center gap-1">
              {speeds.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                    playbackRate === s
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Playback Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => skipSeconds(-15)}
                className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
                title="Rewind 15s"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={togglePlayPause}
                className="p-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30 transition transform active:scale-95"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>

              <button
                onClick={() => skipSeconds(15)}
                className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
                title="Forward 15s"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
