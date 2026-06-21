import { OfflineBanner } from '@/components/layout/OfflineBanner'

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineBanner />
      {children}
    </>
  )
}
