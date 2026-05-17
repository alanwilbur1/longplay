/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [
    process.env.REPLIT_DEV_DOMAIN,
    '*.worf.replit.dev',
    '*.replit.dev',
  ].filter(Boolean),
  // Phase 3D — Truth Pass route consolidation.
  // Legacy / duplicate / fictional surfaces redirect to their canonical
  // counterpart so existing bookmarks and inbound links keep working
  // without the product carrying two doors to the same room.
  async redirects() {
    return [
      // Legacy aliases for the discovery surface.
      { source: '/clubs', destination: '/rooms', permanent: true },
      { source: '/club', destination: '/rooms', permanent: true },
      // Legacy un-slugged active room (hardcoded demo) — the slugged
      // /room/[slug] is the real active room.
      { source: '/room', destination: '/rooms', permanent: true },
      // Fictional retrospectives — honest archive surfaces are
      // /archive/moments and /archive/cycles.
      { source: '/archive/2026', destination: '/archive', permanent: true },
      { source: '/year-in-review', destination: '/archive', permanent: true },
      // Affinity was a static demo of identity affinity; identity is
      // the canonical destination for that exploration.
      { source: '/affinity', destination: '/identity', permanent: true },
    ]
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'i.scdn.co',
      },
      {
        protocol: 'https',
        hostname: '*.mzstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'is1-ssl.mzstatic.com',
      },
    ],
  },
}

export default nextConfig
