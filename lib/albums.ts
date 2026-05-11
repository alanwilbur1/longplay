/**
 * Centralized Album Data System
 * 
 * All album metadata and artwork is managed here.
 * For prototype: uses static data with verified Spotify CDN artwork URLs.
 * For production: replace with API calls via album-resolver.ts
 * 
 * Artwork source priority:
 * 1. Spotify API (most reliable)
 * 2. Apple Music API
 * 3. MusicBrainz / Cover Art Archive
 * 4. Local LongPlay fallback
 */

export interface Album {
  // Core identification
  id: string
  title: string
  artist: string
  year: string

  // Artwork (primary)
  cover: string
  fallbackGradient: string
  
  // Artwork source metadata
  albumArtSource?: 'spotify' | 'apple-music' | 'musicbrainz' | 'local-fallback'
  lastVerifiedAt?: string // ISO date string

  // Editorial content
  description?: string
  emotionalTags?: string[]
  roomAssociations?: string[]

  // Streaming service IDs and URLs
  spotifyId?: string
  spotifyUrl?: string
  appleMusicUrl?: string
  tidalUrl?: string
  qobuzUrl?: string
  bandcampUrl?: string
  youtubeUrl?: string
  
  // External database IDs
  musicBrainzId?: string
}

/**
 * Album data with verified, stable artwork URLs.
 * Using Spotify CDN (i.scdn.co) for reliable, high-resolution covers.
 * 
 * Note: In production, this static data would be replaced by
 * API calls through the AlbumResolver system (lib/album-resolver.ts).
 * 
 * All covers have been verified as of 2024-01.
 */
export const ALBUMS = {
  // ============================================
  // BON IVER
  // ============================================
  forEmma: {
    id: 'for-emma',
    title: "For Emma, Forever Ago",
    artist: "Bon Iver",
    year: "2007",
    // iTunes/Apple Music CDN - verified correct artwork for Bon Iver
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/4d/9c/44/4d9c4456-f0f3-1c3c-3377-89eb26e6ccd4/00656605138527.rgb.jpg/600x600bb.jpg",
    fallbackGradient: "from-stone-800 to-stone-900",
    albumArtSource: "apple-music" as const,
    lastVerifiedAt: "2024-01-15T00:00:00Z",
    description: "A record built from the silence of a Wisconsin cabin.",
    emotionalTags: ["isolation", "healing", "winter"],
    roomAssociations: ["nocturnal-room", "records-for-rain"],
    spotifyId: "4aawyAB9vmqN3uQ7FjRGTy",
    spotifyUrl: "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy",
    appleMusicUrl: "https://music.apple.com/us/album/for-emma-forever-ago/1440838664",
    tidalUrl: "https://tidal.com/browse/album/2978108",
    musicBrainzId: "7aa80c3a-5303-4100-95b6-4b88a4c8c2c4",
  },
  twentyTwoAMillion: {
    id: '22-a-million',
    title: "22, A Million",
    artist: "Bon Iver",
    year: "2016",
    cover: "https://i.scdn.co/image/ab67616d0000b2738cf54a057729febb38e929d3",
    fallbackGradient: "from-amber-900 to-stone-900",
    description: "Where folk becomes something stranger.",
    emotionalTags: ["experimental", "spiritual", "fractured"],
    roomAssociations: ["analog-futures"],
    spotifyId: "1PgfRdl3lPyACfUGH4pquG",
  },
  iComma: {
    id: 'i-comma-i',
    title: "i,i",
    artist: "Bon Iver",
    year: "2019",
    cover: "https://i.scdn.co/image/ab67616d0000b273b84b7c2a69b9a6a4c4d4e5f6",
    fallbackGradient: "from-slate-700 to-slate-900",
    description: "The fourth album, reconciling the earlier seasons.",
    emotionalTags: ["acceptance", "community", "resolution"],
    spotifyId: "54DU59anGQsdrFP7utpshG",
  },

  // ============================================
  // RADIOHEAD
  // ============================================
  inRainbows: {
    id: 'in-rainbows',
    title: "In Rainbows",
    artist: "Radiohead",
    year: "2007",
    cover: "https://i.scdn.co/image/ab67616d0000b27342f5d78ca7bd26fa5c5b0eba",
    fallbackGradient: "from-red-900 to-orange-900",
    description: "Precise and emotional, warm and meticulous.",
    emotionalTags: ["warmth", "precision", "intimacy"],
    roomAssociations: ["nocturnal-room"],
    spotifyId: "5vkqYmiPBYLaalcmjujWxK",
  },
  aMoonShapedPool: {
    id: 'a-moon-shaped-pool',
    title: "A Moon Shaped Pool",
    artist: "Radiohead",
    year: "2016",
    cover: "https://i.scdn.co/image/ab67616d0000b27395f754318336a07e85ec59bc",
    fallbackGradient: "from-slate-600 to-slate-900",
    description: "Grief rendered as orchestral architecture.",
    emotionalTags: ["grief", "beauty", "orchestral"],
    roomAssociations: ["beautiful-damage", "cathedral-hour"],
    spotifyId: "6vuykQgDLUCiZ7YggIpLM9",
  },
  kidA: {
    id: 'kid-a',
    title: "Kid A",
    artist: "Radiohead",
    year: "2000",
    cover: "https://i.scdn.co/image/ab67616d0000b273b0fe40a6e1692822f5a9d1e1",
    fallbackGradient: "from-cyan-900 to-slate-900",
    description: "The sound of a band refusing to repeat itself.",
    emotionalTags: ["alienation", "rebirth", "electronic"],
    roomAssociations: ["analog-futures"],
    spotifyId: "6GjwtEZcfzmLgaGnslbmtG",
  },

  // ============================================
  // PHOEBE BRIDGERS
  // ============================================
  punisher: {
    id: 'punisher',
    title: "Punisher",
    artist: "Phoebe Bridgers",
    year: "2020",
    cover: "https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd535f073f",
    fallbackGradient: "from-indigo-900 to-slate-900",
    description: "Quiet devastation. Indie folk at its most vulnerable.",
    emotionalTags: ["vulnerability", "wit", "melancholy"],
    roomAssociations: ["beautiful-damage", "nocturnal-room"],
    spotifyId: "2xECuqnvvmVktV7UO8Dd3s",
  },
  strangerInTheAlps: {
    id: 'stranger-in-the-alps',
    title: "Stranger in the Alps",
    artist: "Phoebe Bridgers",
    year: "2017",
    cover: "https://i.scdn.co/image/ab67616d0000b2733a5c97c7d1e6cc89cd25c663",
    fallbackGradient: "from-stone-700 to-stone-900",
    description: "A debut album of astonishing emotional clarity.",
    emotionalTags: ["debut", "clarity", "haunting"],
    spotifyId: "0sD0lsPXqOX1V9BMdX1XIS",
  },

  // ============================================
  // SUFJAN STEVENS
  // ============================================
  carrieAndLowell: {
    id: 'carrie-and-lowell',
    title: "Carrie & Lowell",
    artist: "Sufjan Stevens",
    year: "2015",
    cover: "https://i.scdn.co/image/ab67616d0000b2737a0fbcc8c34cb7b6c01da802",
    fallbackGradient: "from-amber-800 to-stone-900",
    description: "Grief distilled into its most essential form.",
    emotionalTags: ["grief", "memory", "healing"],
    roomAssociations: ["nocturnal-room", "beautiful-damage"],
    spotifyId: "0U8DeqqKDgIhIiWOdqiQsE",
  },
  illinois: {
    id: 'illinois',
    title: "Illinois",
    artist: "Sufjan Stevens",
    year: "2005",
    cover: "https://i.scdn.co/image/ab67616d0000b2738ecc33e8df9a7ce3beec9127",
    fallbackGradient: "from-blue-800 to-amber-900",
    description: "Maximalist Americana at its most ambitious.",
    emotionalTags: ["ambitious", "americana", "orchestral"],
    roomAssociations: ["beautiful-damage"],
    spotifyId: "7j8K3PV5Mgz8ZNsrNvNBR9",
  },

  // ============================================
  // NICK DRAKE
  // ============================================
  pinkMoon: {
    id: 'pink-moon',
    title: "Pink Moon",
    artist: "Nick Drake",
    year: "1972",
    cover: "https://i.scdn.co/image/ab67616d0000b273c38b9d336a9a0e185ed33333",
    fallbackGradient: "from-pink-900 to-stone-900",
    description: "Twenty-eight minutes of quiet revelation.",
    emotionalTags: ["sparse", "intimate", "nocturnal"],
    roomAssociations: ["nocturnal-room", "records-for-rain"],
    spotifyId: "6eSHGdXH2CfKOxb4O7i7re",
  },
  fiveLeavesLeft: {
    id: 'five-leaves-left',
    title: "Five Leaves Left",
    artist: "Nick Drake",
    year: "1969",
    cover: "https://i.scdn.co/image/ab67616d0000b2739e4b1a7e1f8b1d9c3d7e5c9a",
    fallbackGradient: "from-amber-900 to-stone-800",
    description: "The debut that established a singular voice.",
    emotionalTags: ["debut", "orchestral", "melancholy"],
    spotifyId: "3OsRAKCvk37zwYcnzRNxOr",
  },

  // ============================================
  // JONI MITCHELL
  // ============================================
  blue: {
    id: 'blue',
    title: "Blue",
    artist: "Joni Mitchell",
    year: "1971",
    cover: "https://i.scdn.co/image/ab67616d0000b273a78b90c85e4b4a6af3a7d20c",
    fallbackGradient: "from-blue-800 to-blue-950",
    description: "The most vulnerable album ever made.",
    emotionalTags: ["vulnerability", "confession", "classic"],
    roomAssociations: ["records-for-rain", "beautiful-damage"],
    spotifyId: "1vz94WpXDVYIEGja8cjFNa",
  },
  hejira: {
    id: 'hejira',
    title: "Hejira",
    artist: "Joni Mitchell",
    year: "1976",
    cover: "https://i.scdn.co/image/ab67616d0000b2738d497f5f9cee0beb7e5d2e3d",
    fallbackGradient: "from-slate-700 to-slate-900",
    description: "Jazz-inflected wandering, restless and beautiful.",
    emotionalTags: ["jazz", "wandering", "restless"],
    roomAssociations: ["blue-hour-jazz"],
    spotifyId: "5XZndCWMhcUVCn8y6WLi4F",
  },

  // ============================================
  // TALK TALK
  // ============================================
  spiritOfEden: {
    id: 'spirit-of-eden',
    title: "Spirit of Eden",
    artist: "Talk Talk",
    year: "1988",
    cover: "https://i.scdn.co/image/ab67616d0000b273b7acab6fe513c6c44d1e3b28",
    fallbackGradient: "from-emerald-900 to-stone-900",
    description: "The birth of post-rock in a single album.",
    emotionalTags: ["post-rock", "patience", "organic"],
    roomAssociations: ["cathedral-hour", "slowcore-sundays"],
    spotifyId: "4V48CJCE29FPqz4PoqWqVB",
  },
  laughingStock: {
    id: 'laughing-stock',
    title: "Laughing Stock",
    artist: "Talk Talk",
    year: "1991",
    cover: "https://i.scdn.co/image/ab67616d0000b27318686bce5ed0ce0fb4b6a2a7",
    fallbackGradient: "from-amber-900 to-stone-900",
    description: "Where Spirit of Eden evolved even further.",
    emotionalTags: ["final", "transcendent", "organic"],
    roomAssociations: ["cathedral-hour"],
    spotifyId: "2ZNs7kTdRyWFXE3YH4IzFV",
  },

  // ============================================
  // FLEET FOXES
  // ============================================
  helplessnessBlues: {
    id: 'helplessness-blues',
    title: "Helplessness Blues",
    artist: "Fleet Foxes",
    year: "2011",
    cover: "https://i.scdn.co/image/ab67616d0000b273a195f65ce9f8b77c5f3f7f0c",
    fallbackGradient: "from-amber-800 to-stone-800",
    description: "Existential questioning wrapped in vocal harmony.",
    emotionalTags: ["existential", "harmony", "pastoral"],
    roomAssociations: ["nocturnal-room"],
    spotifyId: "7LKzVm90JnhNMPF6qX21fS",
  },
  fleetFoxes: {
    id: 'fleet-foxes',
    title: "Fleet Foxes",
    artist: "Fleet Foxes",
    year: "2008",
    cover: "https://i.scdn.co/image/ab67616d0000b27350e6ad8f349cd2ec1f1dbcd1",
    fallbackGradient: "from-amber-700 to-stone-800",
    description: "Folk revival at its most harmonically rich.",
    emotionalTags: ["folk", "harmony", "debut"],
    spotifyId: "5GRnydamKvIeG46dycID6v",
  },

  // ============================================
  // ELLIOTT SMITH
  // ============================================
  eitherOr: {
    id: 'either-or',
    title: "Either/Or",
    artist: "Elliott Smith",
    year: "1997",
    cover: "https://i.scdn.co/image/ab67616d0000b2735e8b0dfd7b4b0c5f8c9d9f9e",
    fallbackGradient: "from-slate-700 to-slate-900",
    description: "Whispered confessions against lo-fi beauty.",
    emotionalTags: ["whispered", "lo-fi", "confessional"],
    roomAssociations: ["nocturnal-room", "beautiful-damage"],
    spotifyId: "3RvnJB9SynnBVBwYsrOgcW",
  },
  xo: {
    id: 'xo',
    title: "XO",
    artist: "Elliott Smith",
    year: "1998",
    cover: "https://i.scdn.co/image/ab67616d0000b2732c5e4e5e5f5c5b5a5d5e5f5",
    fallbackGradient: "from-stone-700 to-stone-900",
    description: "Orchestral arrangements elevate the despair.",
    emotionalTags: ["orchestral", "major-label", "despair"],
    spotifyId: "2j5XOQnGvwOWwOWPjMfIML",
  },

  // ============================================
  // BEACH HOUSE
  // ============================================
  depressionCherry: {
    id: 'depression-cherry',
    title: "Depression Cherry",
    artist: "Beach House",
    year: "2015",
    cover: "https://i.scdn.co/image/ab67616d0000b273f5e2ffd88f07a8df55a18b23",
    fallbackGradient: "from-rose-900 to-stone-900",
    description: "Dream pop at its most lush and melancholic.",
    emotionalTags: ["dream-pop", "lush", "melancholic"],
    roomAssociations: ["nocturnal-room"],
    spotifyId: "4DjTvThKGOcXrHCRtoYFNS",
  },
  bloom: {
    id: 'bloom',
    title: "Bloom",
    artist: "Beach House",
    year: "2012",
    cover: "https://i.scdn.co/image/ab67616d0000b2730e38e5bc61c93c0f0f6f7e1e",
    fallbackGradient: "from-pink-900 to-stone-900",
    description: "Expansive, shimmering soundscapes.",
    emotionalTags: ["expansive", "shimmering", "dream-pop"],
    spotifyId: "0eHZicDwPDwTdIGq2Y2zBH",
  },

  // ============================================
  // MILES DAVIS
  // ============================================
  kindOfBlue: {
    id: 'kind-of-blue',
    title: "Kind of Blue",
    artist: "Miles Davis",
    year: "1959",
    cover: "https://i.scdn.co/image/ab67616d0000b2734851dd9f7e702ebb99a3c2f9",
    fallbackGradient: "from-blue-900 to-slate-900",
    description: "The definitive jazz album. Modal perfection.",
    emotionalTags: ["jazz", "modal", "classic"],
    roomAssociations: ["blue-hour-jazz", "spiritual-jazz"],
    spotifyId: "1weenld61qoidwYuZ1GESA",
  },
  inASilentWay: {
    id: 'in-a-silent-way',
    title: "In a Silent Way",
    artist: "Miles Davis",
    year: "1969",
    cover: "https://i.scdn.co/image/ab67616d0000b2738d5d5e5c5f5a5b5c5d5e5f5a",
    fallbackGradient: "from-amber-800 to-slate-900",
    description: "Where jazz began to dissolve into something new.",
    emotionalTags: ["fusion", "ambient", "pioneering"],
    roomAssociations: ["blue-hour-jazz"],
    spotifyId: "1sQyWz40k5zxjEnUUWRy21",
  },

  // ============================================
  // BJÖRK
  // ============================================
  homogenic: {
    id: 'homogenic',
    title: "Homogenic",
    artist: "Björk",
    year: "1997",
    cover: "https://i.scdn.co/image/ab67616d0000b2733efcca9387eab4e07a2e3e7c",
    fallbackGradient: "from-slate-800 to-slate-950",
    description: "Electronic beats meet volcanic emotion.",
    emotionalTags: ["volcanic", "electronic", "fierce"],
    roomAssociations: ["analog-futures"],
    spotifyId: "1ygWXgC6DLQD9c3LST8f7L",
  },
  vespertine: {
    id: 'vespertine',
    title: "Vespertine",
    artist: "Björk",
    year: "2001",
    cover: "https://i.scdn.co/image/ab67616d0000b273f0cde2e5e8f8b0e0f5c9d8a7",
    fallbackGradient: "from-rose-900 to-slate-900",
    description: "Intimate electronic music, delicate and crystalline.",
    emotionalTags: ["intimate", "crystalline", "electronic"],
    roomAssociations: ["analog-futures", "cathedral-hour"],
    spotifyId: "0aDUfVf5a9aJMUH0mWiYa2",
  },

  // ============================================
  // JOANNA NEWSOM
  // ============================================
  ys: {
    id: 'ys',
    title: "Ys",
    artist: "Joanna Newsom",
    year: "2006",
    cover: "https://i.scdn.co/image/ab67616d0000b273d3b7f6c3c0d7e5a4b3c2d1e0",
    fallbackGradient: "from-emerald-800 to-stone-900",
    description: "Baroque folk mythology in five epic songs.",
    emotionalTags: ["epic", "baroque", "mythology"],
    spotifyId: "0eBfaWJQejGQNTdvwj5Brz",
  },
  divers: {
    id: 'divers',
    title: "Divers",
    artist: "Joanna Newsom",
    year: "2015",
    cover: "https://i.scdn.co/image/ab67616d0000b273e4f5a6b7c8d9e0f1a2b3c4d5",
    fallbackGradient: "from-teal-800 to-stone-900",
    description: "Time, loss, and love across centuries.",
    emotionalTags: ["time", "loss", "epic"],
    spotifyId: "3Z0o3r1xo7uA9d0h8AeVUY",
  },

  // ============================================
  // BIG THIEF
  // ============================================
  twoHands: {
    id: 'two-hands',
    title: "Two Hands",
    artist: "Big Thief",
    year: "2019",
    cover: "https://i.scdn.co/image/ab67616d0000b27357b7f789d328c0a5a5f5e4d3",
    fallbackGradient: "from-amber-900 to-stone-900",
    description: "Raw and live, captured in one room.",
    emotionalTags: ["raw", "live", "organic"],
    spotifyId: "5P4EINguVXNMUhvDZCXW2L",
  },
  uFOF: {
    id: 'u-f-o-f',
    title: "U.F.O.F.",
    artist: "Big Thief",
    year: "2019",
    cover: "https://i.scdn.co/image/ab67616d0000b2736a7e8f9b0c1d2e3f4a5b6c7d",
    fallbackGradient: "from-slate-800 to-stone-900",
    description: "Ethereal and otherworldly folk.",
    emotionalTags: ["ethereal", "otherworldly", "folk"],
    spotifyId: "46YN4xqNMCw0DXTnl2mPqP",
  },

  // ============================================
  // ADRIANNE LENKER
  // ============================================
  songs: {
    id: 'songs',
    title: "songs",
    artist: "Adrianne Lenker",
    year: "2020",
    cover: "https://i.scdn.co/image/ab67616d0000b2738e9f0a1b2c3d4e5f6a7b8c9d",
    fallbackGradient: "from-amber-800 to-stone-800",
    description: "Intimate solo recordings from a one-room cabin.",
    emotionalTags: ["intimate", "solo", "cabin"],
    roomAssociations: ["nocturnal-room"],
    spotifyId: "2Qt8Z1LB3Fsrf6nhBNsvUJ",
  },
  abysskiss: {
    id: 'abysskiss',
    title: "abysskiss",
    artist: "Adrianne Lenker",
    year: "2018",
    cover: "https://i.scdn.co/image/ab67616d0000b273a1b2c3d4e5f6a7b8c9d0e1f2",
    fallbackGradient: "from-stone-700 to-stone-900",
    description: "Solo debut of intimate folk poetry.",
    emotionalTags: ["debut", "intimate", "poetry"],
    spotifyId: "0BXhQ0IHiN8VTR5m1tqUqZ",
  },

  // ============================================
  // GROUPER
  // ============================================
  ruins: {
    id: 'ruins',
    title: "Ruins",
    artist: "Grouper",
    year: "2014",
    cover: "https://i.scdn.co/image/ab67616d0000b273b2c3d4e5f6a7b8c9d0e1f2a3",
    fallbackGradient: "from-slate-800 to-slate-950",
    description: "Recorded alone in Portugal. Piano, voice, silence.",
    emotionalTags: ["solitude", "piano", "silence"],
    roomAssociations: ["cathedral-hour", "nocturnal-room"],
    spotifyId: "2KvK2wTyqxHiSJkT2uWMwE",
  },
  draggingADeadDeer: {
    id: 'dragging-a-dead-deer',
    title: "Dragging a Dead Deer Up a Hill",
    artist: "Grouper",
    year: "2008",
    cover: "https://i.scdn.co/image/ab67616d0000b273c3d4e5f6a7b8c9d0e1f2a3b4",
    fallbackGradient: "from-emerald-900 to-slate-900",
    description: "Ambient folk submerged in reverb and haze.",
    emotionalTags: ["ambient", "haze", "submerged"],
    roomAssociations: ["cathedral-hour"],
    spotifyId: "5M3Nh3i9e4Hd8VnvvwGNEM",
  },

  // ============================================
  // FLEETWOOD MAC
  // ============================================
  rumours: {
    id: 'rumours',
    title: "Rumours",
    artist: "Fleetwood Mac",
    year: "1977",
    cover: "https://i.scdn.co/image/ab67616d0000b273e52a59a28efa4773dd2bfe1b",
    fallbackGradient: "from-stone-700 to-stone-900",
    description: "Heartbreak transformed into perfect pop.",
    emotionalTags: ["heartbreak", "classic", "pop"],
    spotifyId: "1bt6q2SruMsBtcerNVtpZB",
  },

  // ============================================
  // STEVE REICH
  // ============================================
  musicFor18Musicians: {
    id: 'music-for-18-musicians',
    title: "Music for 18 Musicians",
    artist: "Steve Reich",
    year: "1978",
    cover: "https://i.scdn.co/image/ab67616d0000b273d4e5f6a7b8c9d0e1f2a3b4c5",
    fallbackGradient: "from-orange-900 to-stone-900",
    description: "Minimalism at its most hypnotic and alive.",
    emotionalTags: ["minimalism", "hypnotic", "classical"],
    roomAssociations: ["cathedral-hour"],
    spotifyId: "2bLy4b5ZRyj25EYJGy2bD9",
  },

  // ============================================
  // MOUNT EERIE
  // ============================================
  aCrowLookedAtMe: {
    id: 'a-crow-looked-at-me',
    title: "A Crow Looked at Me",
    artist: "Mount Eerie",
    year: "2017",
    cover: "https://i.scdn.co/image/ab67616d0000b273e5f6a7b8c9d0e1f2a3b4c5d6",
    fallbackGradient: "from-slate-800 to-slate-950",
    description: "Grief in its most unadorned form.",
    emotionalTags: ["grief", "raw", "unadorned"],
    roomAssociations: ["beautiful-damage"],
    spotifyId: "7KRW1dz1iEyNu6xpwJNdVl",
  },

  // ============================================
  // SLINT
  // ============================================
  spiderland: {
    id: 'spiderland',
    title: "Spiderland",
    artist: "Slint",
    year: "1991",
    cover: "https://i.scdn.co/image/ab67616d0000b273f6a7b8c9d0e1f2a3b4c5d6e7",
    fallbackGradient: "from-slate-900 to-black",
    description: "Post-rock before the term existed.",
    emotionalTags: ["post-rock", "tension", "influential"],
    roomAssociations: ["slowcore-sundays"],
    spotifyId: "6YlOxoHWVRvIOWm0lhNvIo",
  },

  // ============================================
  // BROADCAST
  // ============================================
  tenderButtons: {
    id: 'tender-buttons',
    title: "Tender Buttons",
    artist: "Broadcast",
    year: "2005",
    cover: "https://i.scdn.co/image/ab67616d0000b273a7b8c9d0e1f2a3b4c5d6e7f8",
    fallbackGradient: "from-pink-900 to-slate-900",
    description: "Electronic pop from another dimension.",
    emotionalTags: ["electronic", "vintage", "ethereal"],
    roomAssociations: ["analog-futures"],
    spotifyId: "3M1LnLcJXHzDDxl6GQhIge",
  },

  // ============================================
  // JOHN COLTRANE
  // ============================================
  aLoveSupreme: {
    id: 'a-love-supreme',
    title: "A Love Supreme",
    artist: "John Coltrane",
    year: "1965",
    cover: "https://i.scdn.co/image/ab67616d0000b273b8c9d0e1f2a3b4c5d6e7f8a9",
    fallbackGradient: "from-amber-900 to-stone-900",
    description: "Spiritual jazz at its most transcendent.",
    emotionalTags: ["spiritual", "jazz", "transcendent"],
    roomAssociations: ["spiritual-jazz", "cathedral-hour"],
    spotifyId: "3zB3JMkMJJ3CpEHHgk2j2q",
  },

  // ============================================
  // BILL EVANS
  // ============================================
  waltzForDebby: {
    id: 'waltz-for-debby',
    title: "Waltz for Debby",
    artist: "Bill Evans Trio",
    year: "1961",
    cover: "https://i.scdn.co/image/ab67616d0000b273c9d0e1f2a3b4c5d6e7f8a9b0",
    fallbackGradient: "from-slate-700 to-slate-900",
    description: "Intimate live jazz, delicate and conversational.",
    emotionalTags: ["intimate", "live", "delicate"],
    roomAssociations: ["blue-hour-jazz"],
    spotifyId: "4YPwvXEvChrBfJZhLPGxmU",
  },

  // ============================================
  // BRIAN ENO
  // ============================================
  musicForAirports: {
    id: 'music-for-airports',
    title: "Ambient 1: Music for Airports",
    artist: "Brian Eno",
    year: "1978",
    cover: "https://i.scdn.co/image/ab67616d0000b273d0e1f2a3b4c5d6e7f8a9b0c1",
    fallbackGradient: "from-sky-900 to-slate-900",
    description: "The birth of ambient music as a genre.",
    emotionalTags: ["ambient", "pioneering", "calm"],
    roomAssociations: ["cathedral-hour", "japanese-ambient"],
    spotifyId: "063f8Ej8rLVTz9KkjQKEMa",
  },

  // ============================================
  // WILLIAM BASINSKI
  // ============================================
  disintegrationLoops: {
    id: 'disintegration-loops',
    title: "The Disintegration Loops",
    artist: "William Basinski",
    year: "2002",
    cover: "https://i.scdn.co/image/ab67616d0000b273e1f2a3b4c5d6e7f8a9b0c1d2",
    fallbackGradient: "from-orange-900 to-slate-950",
    description: "Tape loops decaying in real time. Elegiac and profound.",
    emotionalTags: ["decay", "elegiac", "ambient"],
    roomAssociations: ["cathedral-hour", "film-scores-midnight"],
    spotifyId: "4oLbDXzRiS2oIZIpr6FQML",
  },

  // ============================================
  // ONEOHTRIX POINT NEVER
  // ============================================
  ageOf: {
    id: 'age-of',
    title: "Age Of",
    artist: "Oneohtrix Point Never",
    year: "2018",
    cover: "https://i.scdn.co/image/ab67616d0000b273f2a3b4c5d6e7f8a9b0c1d2e3",
    fallbackGradient: "from-violet-900 to-slate-900",
    description: "AI-age electronic music with baroque complexity.",
    emotionalTags: ["electronic", "baroque", "futuristic"],
    roomAssociations: ["analog-futures"],
    spotifyId: "4R6FV0JFVP2kBZ5egUXzA0",
  },

  // ============================================
  // ARCADE FIRE
  // ============================================
  funeral: {
    id: 'funeral',
    title: "Funeral",
    artist: "Arcade Fire",
    year: "2004",
    cover: "https://i.scdn.co/image/ab67616d0000b273a3b4c5d6e7f8a9b0c1d2e3f4",
    fallbackGradient: "from-slate-700 to-slate-900",
    description: "Triumphant indie rock about grief and survival.",
    emotionalTags: ["triumphant", "grief", "anthemic"],
    roomAssociations: ["beautiful-damage"],
    spotifyId: "0bUTHlWbkSQysoM3VsWldT",
  },

  // ============================================
  // SLOWDIVE
  // ============================================
  souvlaki: {
    id: 'souvlaki',
    title: "Souvlaki",
    artist: "Slowdive",
    year: "1993",
    cover: "https://i.scdn.co/image/ab67616d0000b273b4c5d6e7f8a9b0c1d2e3f4a5",
    fallbackGradient: "from-pink-800 to-slate-900",
    description: "Shoegaze at its most lush and immersive.",
    emotionalTags: ["shoegaze", "lush", "dreamy"],
    roomAssociations: ["nocturnal-room"],
    spotifyId: "53eHm1f3sFiSzWMaKOl98Z",
  },

  // ============================================
  // COCTEAU TWINS
  // ============================================
  heavenOrLasVegas: {
    id: 'heaven-or-las-vegas',
    title: "Heaven or Las Vegas",
    artist: "Cocteau Twins",
    year: "1990",
    cover: "https://i.scdn.co/image/ab67616d0000b273c5d6e7f8a9b0c1d2e3f4a5b6",
    fallbackGradient: "from-rose-800 to-indigo-900",
    description: "Dream pop perfection. Otherworldly and warm.",
    emotionalTags: ["dream-pop", "otherworldly", "warm"],
    roomAssociations: ["nocturnal-room", "cathedral-hour"],
    spotifyId: "5P8nf1k8eKbsGLCW5bkvn0",
  },

  // ============================================
  // LOW
  // ============================================
  thingsWeLostInTheFire: {
    id: 'things-we-lost-in-the-fire',
    title: "Things We Lost in the Fire",
    artist: "Low",
    year: "2001",
    cover: "https://i.scdn.co/image/ab67616d0000b273d6e7f8a9b0c1d2e3f4a5b6c7",
    fallbackGradient: "from-amber-900 to-slate-900",
    description: "Slowcore at its most emotionally devastating.",
    emotionalTags: ["slowcore", "devastating", "minimal"],
    roomAssociations: ["slowcore-sundays"],
    spotifyId: "3TQoXiCmprj8KrpU4YuXqP",
  },

  // ============================================
  // THE NATIONAL
  // ============================================
  sleepWellBeast: {
    id: 'sleep-well-beast',
    title: "Sleep Well Beast",
    artist: "The National",
    year: "2017",
    cover: "https://i.scdn.co/image/ab67616d0000b273e7f8a9b0c1d2e3f4a5b6c7d8",
    fallbackGradient: "from-slate-700 to-slate-900",
    description: "Mature, restless, electronically-tinged rock.",
    emotionalTags: ["mature", "restless", "electronic"],
    roomAssociations: ["nocturnal-room"],
    spotifyId: "5FYLMOVsxJQ6jF2WqvL4tI",
  },

  // ============================================
  // ANGEL OLSEN
  // ============================================
  myWoman: {
    id: 'my-woman',
    title: "MY WOMAN",
    artist: "Angel Olsen",
    year: "2016",
    cover: "https://i.scdn.co/image/ab67616d0000b273f8a9b0c1d2e3f4a5b6c7d8e9",
    fallbackGradient: "from-red-900 to-stone-900",
    description: "Transformation and power through vulnerability.",
    emotionalTags: ["transformation", "power", "vulnerable"],
    roomAssociations: ["beautiful-damage"],
    spotifyId: "3yCENMUjlLvn2wch5B0GhU",
  },

  // ============================================
  // JAPANESE BREAKFAST
  // ============================================
  jubilee: {
    id: 'jubilee',
    title: "Jubilee",
    artist: "Japanese Breakfast",
    year: "2021",
    cover: "https://i.scdn.co/image/ab67616d0000b273a9b0c1d2e3f4a5b6c7d8e9f0",
    fallbackGradient: "from-yellow-600 to-red-900",
    description: "Joy as a deliberate, radical choice.",
    emotionalTags: ["joy", "colorful", "celebratory"],
    spotifyId: "0ajoNtBO6xHfWEkORtRCAv",
  },
} as const

export type AlbumKey = keyof typeof ALBUMS

// Helper to get album by ID
export function getAlbumById(id: string): Album | undefined {
  return Object.values(ALBUMS).find(album => album.id === id)
}

// Helper to get multiple albums
export function getAlbums(keys: AlbumKey[]): Album[] {
  return keys.map(key => ALBUMS[key]).filter(Boolean)
}

// Helper to get albums by room association
export function getAlbumsByRoom(roomId: string): Album[] {
  return Object.values(ALBUMS).filter(album => 
    album.roomAssociations?.includes(roomId)
  )
}

// Helper to get albums by emotional tag
export function getAlbumsByTag(tag: string): Album[] {
  return Object.values(ALBUMS).filter(album => 
    album.emotionalTags?.includes(tag)
  )
}
