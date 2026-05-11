'use client'

import { useState } from 'react'

interface ListeningModuleProps {
  spotifyId?: string
  appleMusicUrl?: string
  amazonMusicUrl?: string
  bandcampUrl?: string
  youtubeUrl?: string
  tidalUrl?: string
  qobuzUrl?: string
  albumTitle: string
  artist: string
  variant?: 'full' | 'compact' | 'minimal'
}

const SERVICES = [
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Stream anywhere',
    culture: 'Broad accessibility',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    ),
  },
  {
    id: 'apple',
    name: 'Apple Music',
    description: 'Lossless audio',
    culture: 'Polished listening',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.997 6.124c0-.738-.065-1.47-.24-2.19-.317-1.31-1.062-2.31-2.18-3.043C21.003.517 20.373.285 19.7.164c-.517-.093-1.038-.135-1.564-.15-.04-.003-.083-.01-.124-.013H5.988c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208c-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.802.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03c.525 0 1.048-.034 1.57-.1.823-.106 1.597-.35 2.296-.81.84-.553 1.472-1.287 1.88-2.208.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.042-1.8-.6-1.965-1.49-.196-1.06.49-2.09 1.57-2.36.376-.09.758-.14 1.14-.18.39-.04.78-.08 1.16-.14.25-.04.47-.15.52-.42.03-.117.04-.24.04-.36V8.17c0-.26-.1-.46-.36-.53-.32-.087-.65-.14-.98-.2L13.02 7c-.49-.08-.98-.17-1.47-.26-.1-.02-.2 0-.28.1-.04.06-.06.14-.06.21v8.27c0 .32-.02.64-.1.95-.2.74-.68 1.25-1.41 1.49-.43.14-.87.21-1.32.23-.96.04-1.82-.59-2-1.49-.21-1.06.47-2.1 1.55-2.38.38-.1.76-.15 1.15-.19.38-.04.76-.08 1.13-.14.28-.04.5-.16.54-.46.02-.1.03-.2.03-.3V5.96c0-.27.1-.48.36-.57.2-.07.4-.12.6-.15l4.47-.76c.67-.11 1.34-.24 2.01-.34.29-.04.58-.01.83.14.22.14.33.34.36.6.02.1.02.2.02.3v5z"/>
      </svg>
    ),
  },
  {
    id: 'tidal',
    name: 'TIDAL',
    description: 'Master quality',
    culture: 'Audiophile listening',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0L8 4l4 4 4-4-4-4zm0 8l-4 4 4 4 4-4-4-4zm-8 0l-4 4 4 4 4-4-4-4zm16 0l-4 4 4 4 4-4-4-4zM12 16l-4 4 4 4 4-4-4-4z"/>
      </svg>
    ),
  },
  {
    id: 'qobuz',
    name: 'Qobuz',
    description: 'Hi-Res audio',
    culture: 'Archival listening',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-13v8l7-4-7-4z"/>
      </svg>
    ),
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    description: 'Support the artist',
    culture: 'Direct & independent',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M0 18.75l7.437-13.5H24l-7.438 13.5H0z"/>
      </svg>
    ),
  },
  {
    id: 'amazon',
    name: 'Amazon Music',
    description: 'HD streaming',
    culture: 'Integrated listening',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.958 10.09c0 1.232.029 2.256-.591 3.351-.502.891-1.301 1.438-2.186 1.438-1.214 0-1.922-.924-1.922-2.292 0-2.692 2.415-3.182 4.7-3.182v.685zm3.186 7.705a.66.66 0 01-.753.077c-1.058-.876-1.247-1.282-1.826-2.117-1.748 1.782-2.986 2.315-5.249 2.315-2.681 0-4.768-1.655-4.768-4.968 0-2.586 1.402-4.345 3.399-5.206 1.729-.75 4.144-.883 5.989-1.09v-.405c0-.748.058-1.632-.381-2.278-.381-.579-1.113-.818-1.759-.818-1.195 0-2.261.614-2.522 1.885-.054.283-.261.561-.549.576l-3.066-.333c-.259-.056-.548-.266-.474-.663.71-3.72 4.085-4.84 7.111-4.84 1.548 0 3.569.411 4.786 1.584 1.549 1.438 1.401 3.355 1.401 5.444v4.93c0 1.483.615 2.134 1.193 2.936.203.288.247.632-.012.847-.65.543-1.808 1.557-2.443 2.124l-.077-.071z"/>
        <path d="M21.74 18.137c-1.484 1.096-3.638 1.679-5.491 1.679-2.6 0-4.94-.963-6.712-2.564-.139-.126-.015-.297.152-.199 1.912 1.113 4.277 1.781 6.722 1.781 1.648 0 3.463-.34 5.133-.997.252-.091.463.166.196.3z"/>
        <path d="M22.48 17.24c-.19-.245-.802-.115-.997-.058-.166.019-.192-.125-.043-.229 1.06-.745.96-2.238.504-2.508-.156-.093-.363-.044-.55-.044h-.858c-.127 0-.234-.095-.234-.219v-.069c.126-1.285.131-1.285.211-1.5.063-.169.126-.338.126-.507 0-.381-.257-.693-.582-.693-.193 0-.387.104-.515.276l-.053.079c-.08.12-.107.261-.127.398-.021.144-.036.288-.079.427l-.176.593-.145.488a.66.66 0 01-.127.24.338.338 0 01-.266.122h-.469a.34.34 0 01-.339-.34v-.047c.009-.206.087-.402.186-.58.205-.365.514-.682.908-.883.393-.201.861-.296 1.333-.296.577 0 1.161.128 1.617.442.456.314.758.805.758 1.398 0 .349-.079.698-.209 1.02-.129.323-.31.62-.523.888-.385.483-.891.877-1.488 1.056l-.015.004-.032.007c-.021.005-.042.01-.064.012-.022.003-.046.004-.07.003l-.08-.007c-.27-.036-.527-.15-.738-.313-.21-.163-.372-.372-.482-.601-.11-.23-.167-.479-.167-.729 0-.059.003-.118.009-.177l.03-.18c.026-.117.066-.23.117-.337.101-.212.25-.401.433-.55.183-.149.4-.256.633-.31.117-.027.238-.04.359-.04.219 0 .436.04.637.121.202.08.386.2.539.351.153.151.273.333.35.533.077.2.112.413.112.627 0 .239-.044.477-.128.699l-.027.07a1.79 1.79 0 01-.176.339c-.073.107-.158.205-.254.291-.095.086-.201.161-.316.222l-.085.043-.176.08c.18.022.354-.014.508-.103z"/>
      </svg>
    ),
  },
  {
    id: 'youtube',
    name: 'YouTube Music',
    description: 'Music videos',
    culture: 'Visual listening',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/>
      </svg>
    ),
  },
]

export function ListeningModule({
  spotifyId,
  appleMusicUrl,
  amazonMusicUrl,
  bandcampUrl,
  youtubeUrl,
  tidalUrl,
  qobuzUrl,
  albumTitle,
  artist,
  variant = 'full',
}: ListeningModuleProps) {
  const [showEmbed, setShowEmbed] = useState(false)
  const [selectedService, setSelectedService] = useState<string | null>(null)

  const availableServices = SERVICES.filter((service) => {
    switch (service.id) {
      case 'spotify': return !!spotifyId
      case 'apple': return !!appleMusicUrl
      case 'amazon': return !!amazonMusicUrl
      case 'bandcamp': return !!bandcampUrl
      case 'youtube': return !!youtubeUrl
      case 'tidal': return !!tidalUrl
      case 'qobuz': return !!qobuzUrl
      default: return false
    }
  })

  const getServiceUrl = (serviceId: string) => {
    switch (serviceId) {
      case 'spotify': return `https://open.spotify.com/album/${spotifyId}`
      case 'apple': return appleMusicUrl
      case 'amazon': return amazonMusicUrl
      case 'bandcamp': return bandcampUrl
      case 'youtube': return youtubeUrl
      case 'tidal': return tidalUrl
      case 'qobuz': return qobuzUrl
      default: return '#'
    }
  }

  if (variant === 'minimal') {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {availableServices.slice(0, 4).map((service) => (
          <a
            key={service.id}
            href={getServiceUrl(service.id) || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-muted/20 border border-border/20 text-muted-foreground hover:text-cream hover:bg-muted/40 transition-all duration-500 text-sm"
            title={`Open in ${service.name}`}
          >
            {service.icon}
            <span className="hidden sm:inline">{service.name}</span>
          </a>
        ))}
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className="bg-navy/20 border border-border/20 p-5 animate-fade-in">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">Listen</p>
        
        <div className="flex flex-wrap gap-3">
          {availableServices.map((service) => (
            <a
              key={service.id}
              href={getServiceUrl(service.id) || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-4 py-2.5 bg-muted/20 border border-border/20 text-cream/80 hover:text-cream hover:bg-muted/40 hover:border-burgundy/30 transition-all duration-500 text-sm group"
            >
              <span className="text-muted-foreground group-hover:text-cream transition-colors duration-500">
                {service.icon}
              </span>
              <span>{service.name}</span>
            </a>
          ))}
        </div>
      </div>
    )
  }

  // Full variant
  return (
    <div className="bg-navy/20 border border-border/20 animate-fade-in overflow-hidden">
      {/* Spotify Embed Section - Cinematic Treatment */}
      {spotifyId && (
        <div className="border-b border-border/20">
          {!showEmbed ? (
            <button
              onClick={() => setShowEmbed(true)}
              className="w-full px-6 py-8 flex flex-col items-center justify-center gap-4 hover:bg-navy/30 transition-colors duration-500 group"
            >
              <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center border border-border/30 group-hover:border-burgundy/40 transition-colors duration-500">
                <svg className="w-6 h-6 text-cream/60 group-hover:text-cream transition-colors duration-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-cream/90 font-serif text-lg mb-1">Begin Listening</p>
                <p className="text-xs text-muted-foreground">Stream via Spotify</p>
              </div>
            </button>
          ) : (
            <div className="p-4 md:p-6 bg-[#0D0D0D]">
              <iframe
                src={`https://open.spotify.com/embed/album/${spotifyId}?utm_source=generator&theme=0`}
                width="100%"
                height="352"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-lg"
                style={{ 
                  colorScheme: 'dark',
                  filter: 'saturate(0.85) brightness(0.95)',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Alternative Services */}
      <div className="p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-5">
          {spotifyId ? 'Also Available On' : 'Listen On'}
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {availableServices
            .filter((s) => s.id !== 'spotify' || !spotifyId)
            .map((service) => (
              <a
                key={service.id}
                href={getServiceUrl(service.id) || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={() => setSelectedService(service.id)}
                onMouseLeave={() => setSelectedService(null)}
                className={`relative px-4 py-4 border transition-all duration-500 group ${
                  selectedService === service.id 
                    ? 'bg-muted/40 border-burgundy/40' 
                    : 'bg-muted/10 border-border/20 hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground group-hover:text-cream transition-colors duration-500">
                    {service.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-cream/90 truncate">{service.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{service.culture}</p>
                  </div>
                </div>
              </a>
            ))}
        </div>

        {/* Listening Philosophy Note */}
        <p className="text-xs text-muted-foreground/60 mt-6 leading-relaxed italic">
          LongPlay is the space for reflection. Begin your listening, then return here to capture what the music means to you.
        </p>
      </div>
    </div>
  )
}

// Compact inline version for listening rooms
export function ListeningPills({
  spotifyId,
  appleMusicUrl,
  tidalUrl,
  bandcampUrl,
}: {
  spotifyId?: string
  appleMusicUrl?: string
  tidalUrl?: string
  bandcampUrl?: string
}) {
  const services = [
    { id: 'spotify', url: spotifyId ? `https://open.spotify.com/album/${spotifyId}` : null, label: 'Spotify' },
    { id: 'apple', url: appleMusicUrl, label: 'Apple' },
    { id: 'tidal', url: tidalUrl, label: 'TIDAL' },
    { id: 'bandcamp', url: bandcampUrl, label: 'Bandcamp' },
  ].filter((s) => s.url)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground mr-1">Listen:</span>
      {services.map((service) => (
        <a
          key={service.id}
          href={service.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-1 text-[11px] bg-muted/30 text-muted-foreground hover:text-cream border border-border/20 hover:border-burgundy/30 transition-all duration-500"
        >
          {service.label}
        </a>
      ))}
    </div>
  )
}
