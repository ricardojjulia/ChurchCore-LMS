'use client'

import { ProgressBar } from '@tremor/react'

export default function TremorProgressBar({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  return <ProgressBar value={value} className={className} />
}
