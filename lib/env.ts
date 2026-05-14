const requiredPublic = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const

const requiredServer = [
  'SUPABASE_SERVICE_ROLE_KEY',
] as const

function assertEnv(key: string, value: string | undefined, context: string): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `[env] Missing required environment variable: ${key} (required in ${context})`
    )
  }
  return value
}

export function validatePublicEnv() {
  for (const key of requiredPublic) {
    assertEnv(key, process.env[key], 'browser + server')
  }
}

export function validateServerEnv() {
  for (const key of [...requiredPublic, ...requiredServer]) {
    assertEnv(key, process.env[key], 'server only')
  }
}

export const env = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? '',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
}
