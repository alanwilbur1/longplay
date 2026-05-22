/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: 'is1-ssl.mzstatic.com' },
      { protocol: 'https', hostname: 'is2-ssl.mzstatic.com' },
      { protocol: 'https', hostname: 'is3-ssl.mzstatic.com' },
      { protocol: 'https', hostname: 'is4-ssl.mzstatic.com' },
      { protocol: 'https', hostname: 'is5-ssl.mzstatic.com' },
    ],
  },
}

// `allowedDevOrigins` is a Next.js dev-server-only setting. Vercel's
// build-time `modifyConfig` step has been observed to choke on wildcard
// entries here ("TypeError: The 'path' argument must be of type string.
// Received undefined"). Attaching this only when NODE_ENV !== 'production'
// keeps the dev-server allowance for Replit while leaving the production
// build config untouched. The image wildcards previously listed under
// `images.remotePatterns` (`*.mzstatic.com`) were also replaced with
// explicit subdomains, since wildcard hostnames in `remotePatterns` have
// been a sporadic source of build-time URL-parse failures.
if (process.env.NODE_ENV !== 'production') {
  const devOrigins = [
    process.env.REPLIT_DEV_DOMAIN,
    '*.worf.replit.dev',
    '*.replit.dev',
  ].filter(Boolean)
  if (devOrigins.length > 0) {
    nextConfig.allowedDevOrigins = devOrigins
  }
}

export default nextConfig
