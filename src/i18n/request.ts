import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const rawLocale = cookieStore.get('NEXT_LOCALE')?.value ?? 'en'
  const locale: 'en' | 'es' | 'pt' = rawLocale === 'es' ? 'es' : rawLocale === 'pt' ? 'pt' : 'en'

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
