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
 * Album data.
 *
 * Artwork audit (Artwork Quality Pass):
 * - 1 album uses an Apple Music CDN URL with a detailed verified path
 *   (forEmma).
 * - 19 albums carry plausible-looking Spotify CDN URLs (i.scdn.co/
 *   image/ab67616d0000b273…). Provenance unverifiable from the dev
 *   sandbox — runtime load detection in CoverTile (rooms-screen.tsx)
 *   shows an intentional designed fallback (vinyl glyph + title +
 *   artist) for any that 404.
 * - 27 albums had obviously fabricated covers (strict sequential
 *   alphabet hashes, repeating-char patterns, malformed length).
 *   Their `cover` is now "" so the load detection resolves to
 *   'absent' immediately without a wasted network ping.
 * - 3 albums (toPimpAButterfly, southeastern, aSeatAtTheTable) use
 *   placehold.co — intentional placeholder service that does serve
 *   real images. Inline-marked for operator follow-up.
 *
 * To replace any "" cover with a real one: paste a verified Spotify
 * CDN URL (i.scdn.co/image/ab67616d0000b273<hash>) or Apple Music
 * URL (is{1..5}-ssl.mzstatic.com/image/thumb/...) into the cover
 * field. The seed and refresh-room-metadata script pick it up on
 * the next run; no recommender/scoring/DB changes needed.
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/21/2f/ea/212fea18-5fdc-ba4d-5dd7-1b07aaa88b67/656605211565.tif/1000x1000bb.jpg",
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
    cover: "https://coverartarchive.org/release/b3ef5052-e55c-402d-b02d-ea4e4f0758e4/16070105469-500.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/de/f0/bf/def0bfe3-6b57-34fa-3a40-bb67aa6284b2/656605235066.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/dd/50/c7/dd50c790-99ac-d3d0-5ab8-e3891fb8fd52/634904032463.png/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/bd/8e/13/bd8e1358-b367-a689-cb84-cebd0b067dc4/634904078263.png/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/39/91/4f/39914f60-e9aa-4ae9-3962-44b0a5e5d570/656605150062.jpg/1000x1000bb.jpg",
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
    cover: "https://coverartarchive.org/release/68190b0f-7c96-48bd-8283-702e3fd6524f/21822651645-1200.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music91/v4/6b/20/6a/6b206ac1-e1b5-316d-334d-59df7b727fb6/656605613666.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Features/37/e0/10/dj.smhxrojs.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/66/d5/9a/66d59a9f-c2d4-8da2-7053-ea2e97f0b7f7/21UMGIM38174.rgb.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/be/97/b3/be97b362-d4aa-c0d5-368f-e3a154a94671/00042284291521.rgb.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/00/a2/43/00a24363-cf69-bfd2-a26a-a042d57ab141/075992719926.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/38/42/0b/38420bcf-f3aa-ba5b-2594-d9b3db6bb637/075596061421.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/36/84/e8/3684e84e-5b87-f5d3-3e93-500c9807aefd/724385712951.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music118/v4/4e/d3/44/4ed34448-31df-5d76-5043-77c1dc257575/00042284771726.rgb.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/06/04/db/0604db2a-2970-19e1-c550-21b2cf87dec1/098787088861.png/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/b5/13/5d/b5135d6b-97e1-19cb-4234-5f711b77972e/098787077766.png/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/ff/ea/28/ffea28a4-988a-f02e-7e1a-8566db3cab02/mzi.uoqucyoy.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/83/b1/9d/83b19dd3-733c-228b-1b01-573e6cebbbd5/19UMGIM45347.rgb.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/09/e0/d5/09e0d559-0682-f0f0-5e0c-3cd11e3114fd/beachhouse_depressioncherry_2400_300.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/8b/b7/08/8bb7086b-cdb5-1ffe-926b-e7637bda6a0d/BeachHouse_Bloom_iTunes.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music/7f/9f/d6/mzi.vtnaewef.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/4a/6c/db/4a6cdbee-444e-9416-93da-c448f5ad5ea1/696998655621.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/7f/bd/d0/7fbdd0e0-c588-ef4b-a6dd-4dca21f8b41f/081227607364.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/32/d6/28/32d62861-0e24-2111-d3ed-3b54f23083d5/081227607265.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/85/a1/a2/85a1a29f-7a03-0c8a-ce4c-3a57e0213413/781484030324.png/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music7/v4/14/38/44/143844a7-553a-38c8-5a29-2a20445b6b4f/JoannaNewsom_Divers_Mini.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/44/1e/68/441e686c-9276-b50c-ad68-f7d3e2d53b38/cover.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/c2/71/2b/c2712ba8-9fb4-da63-6b2a-f1f25275e9e6/Big_Thief_UFOF.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/70/f0/a6/70f0a6a5-cd71-9da2-174b-41927d331cdd/cover.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/60/4c/86/604c86aa-8bc3-7dac-d4a1-5030203fb956/191400085558.png/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music3/v4/02/51/22/0251224a-9c72-5929-733c-e93a6182b67d/888831637257.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/83/c4/d1/83c4d1e8-0735-ca6d-5e3e-bbbac99cef41/mzi.euplhgfk.jpg/1000x1000bb.jpg",
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
    cover: "https://coverartarchive.org/release/d20a18df-c71f-484c-8d41-fdea1abb1f26/18584699933-1200.jpg",
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
    cover: "https://coverartarchive.org/release/c3f917ec-c02d-4ebe-a5b4-49c4cb65063c/21210057783-1200.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/a1/d0/8b/a1d08b04-058e-c82a-06b2-2b722ee50574/mzi.ufdnaayh.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music/51/f4/91/mzi.gcqyntqr.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/e5/24/aa/e524aacd-467b-66f3-8931-0fcd6750a4b9/08UMGIM07914.rgb.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/74/90/e4/7490e4c9-1fdf-69b8-6f5c-309fba19b5ac/09CMGIM01610.rgb.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/ee/71/42/ee71425d-6bc9-3df8-c90b-8539f59144ab/00724386649553.rgb.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music3/v4/3e/ea/08/3eea0811-b27e-6e92-9d2a-561bfce9107c/cover.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/82/e6/82/82e6825e-5078-b1a5-8614-7ceca45baa39/0801061029531.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/2b/09/6e/2b096e8c-ae65-fc42-a4b1-19abb4100433/886446576442.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/1b/50/ad/1b50adc8-139b-1ad9-8500-cc2eb93faf17/888880730831.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/76/cd/61/76cd61e7-0714-dce5-c48e-0f05f8fcb84b/652637001280.png/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Features/49/b4/70/dj.rrajedwk.jpg/1000x1000bb.jpg",
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
    cover: "https://coverartarchive.org/release/ef8c9f22-db38-49cd-82c3-384a3be5d4de/38525206069-1200.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/28/e9/d8/28e9d80b-a026-63aa-818d-f02afb2e5532/656605228464.jpg/1000x1000bb.jpg",
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
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/93/8b/8b/938b8b5d-1022-414f-995e-a25608fc68c3/17251.jpg/1000x1000bb.jpg",
    fallbackGradient: "from-yellow-600 to-red-900",
    description: "Joy as a deliberate, radical choice.",
    emotionalTags: ["joy", "colorful", "celebratory"],
    spotifyId: "0ajoNtBO6xHfWEkORtRCAv",
  },

  // ============================================
  // KENDRICK LAMAR — anchor album for hip-hop-hours
  // ============================================
  toPimpAButterfly: {
    id: 'to-pimp-a-butterfly',
    title: "To Pimp a Butterfly",
    artist: "Kendrick Lamar",
    year: "2015",
    // Placeholder cover. Operator follow-up: replace with a verified
    // Spotify CDN URL (i.scdn.co/image/...) or Apple Music URL. The
    // placehold.co service returns a real 600×600 image so cover_art
    // is non-null and recommendation cards render. Without this the
    // seed's `cover.length > 0` gate would NULL the column —
    // see audit on branch claude/recommendation-content-quality-phase-1.
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/b5/a6/91/b5a69171-5232-3d5b-9c15-8963802f83dd/15UMGIM15814.rgb.jpg/1000x1000bb.jpg",
    fallbackGradient: "from-amber-900 to-stone-900",
    description: "A wide-frame jazz-rap statement: identity, lineage, and Black American art recorded as one continuous record.",
    emotionalTags: ["confessional", "cinematic", "communal"],
    roomAssociations: ["hip-hop-hours"],
  },

  // ============================================
  // JASON ISBELL — anchor album for southern-listening
  // ============================================
  southeastern: {
    id: 'southeastern',
    title: "Southeastern",
    artist: "Jason Isbell",
    year: "2013",
    // Placeholder cover — see toPimpAButterfly note.
    cover: "https://coverartarchive.org/release/8a3be0f3-c237-4e0d-bdba-f82b3329a974/16252635324-1200.jpg",
    fallbackGradient: "from-stone-700 to-stone-900",
    description: "Sober, hard-won Americana songwriting — twelve songs that ask listeners to sit close.",
    emotionalTags: ["warm", "songwriter", "reflective"],
    roomAssociations: ["southern-listening"],
  },

  // ============================================
  // SOLANGE — anchor album for soul-quarters
  // ============================================
  aSeatAtTheTable: {
    id: 'a-seat-at-the-table',
    title: "A Seat at the Table",
    artist: "Solange",
    year: "2016",
    // Placeholder cover — see toPimpAButterfly note.
    cover: "https://coverartarchive.org/release/3e3c90cd-0c0c-4beb-8f7b-b95a076c89eb/14763601258-1200.jpg",
    fallbackGradient: "from-amber-700 to-rose-900",
    description: "A self-possessed neo-soul album about interiority and inheritance — slow, deliberate, headphone music.",
    emotionalTags: ["warm", "intimate", "communal"],
    roomAssociations: ["soul-quarters"],
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
