'use client'

import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react'

export interface AudioTrack {
  id: string
  title: string
  subtitle?: string
  audioUrl: string
  durationSeconds?: number
  coverImageUrl?: string
}

interface AudioPlayerContextType {
  currentTrack: AudioTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  isMinimized: boolean
  playTrack: (track: AudioTrack) => void
  togglePlayPause: () => void
  seekTo: (seconds: number) => void
  skipSeconds: (seconds: number) => void
  setSpeed: (rate: number) => void
  setIsMinimized: (val: boolean | ((prev: boolean) => boolean)) => void
  stopAndClose: () => void
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined)

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMinimized, setIsMinimized] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const audio = new Audio()
      audioRef.current = audio

      audio.ontimeupdate = () => setCurrentTime(audio.currentTime)
      audio.onloadedmetadata = () => setDuration(audio.duration || 0)
      audio.onended = () => setIsPlaying(false)
      audio.onplay = () => setIsPlaying(true)
      audio.onpause = () => setIsPlaying(false)

      return () => {
        audio.pause()
        audio.src = ''
      }
    }
  }, [])

  const playTrack = (track: AudioTrack) => {
    if (!audioRef.current) return
    setCurrentTrack(track)
    audioRef.current.src = track.audioUrl
    audioRef.current.playbackRate = playbackRate
    audioRef.current.play().catch((err) => console.warn('Audio play prevented:', err))
    setIsPlaying(true)
    setIsMinimized(false)
  }

  const togglePlayPause = () => {
    if (!audioRef.current || !currentTrack) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch(console.warn)
    }
  }

  const seekTo = (seconds: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    setCurrentTime(seconds)
  }

  const skipSeconds = (seconds: number) => {
    if (!audioRef.current) return
    const target = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + seconds))
    audioRef.current.currentTime = target
    setCurrentTime(target)
  }

  const setSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }

  const stopAndClose = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setCurrentTrack(null)
    setIsPlaying(false)
    setCurrentTime(0)
  }

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        playbackRate,
        isMinimized,
        playTrack,
        togglePlayPause,
        seekTo,
        skipSeconds,
        setSpeed,
        setIsMinimized,
        stopAndClose,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  )
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext)
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider')
  }
  return context
}
