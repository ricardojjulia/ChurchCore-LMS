export interface CapacitorConfig {
  appId: string
  appName: string
  webDir: string
  server?: {
    androidScheme?: string
    url?: string
    cleartext?: boolean
  }
  plugins?: Record<string, unknown>
}

const config: CapacitorConfig = {
  appId: 'org.churchcore.lms',
  appName: 'ChurchCore LMS',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    url: process.env.CAPACITOR_SERVER_URL || undefined,
    cleartext: process.env.NODE_ENV !== 'production',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#020617', // slate-950
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#020617',
    },
  },
}

export default config
