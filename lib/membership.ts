/**
 * LongPlay Membership System
 * 
 * Membership is NOT "paying for app features."
 * It IS: joining a listening culture.
 * 
 * The tone communicates:
 * - intentional listening
 * - cultural participation
 * - archival value
 * - deeper reflection
 * - belonging
 */

export type MembershipTier = 'free' | 'member' | 'patron'

export interface MembershipBenefit {
  id: string
  label: string
  description: string
  available: boolean
}

export interface MembershipTierDetails {
  id: MembershipTier
  name: string
  tagline: string
  philosophy: string
  price: string | null
  priceSubtext?: string
  benefits: MembershipBenefit[]
  emotionalFraming: string
  cta: string
  ctaSubtext?: string
}

// Membership tier definitions with cultural positioning
export const MEMBERSHIP_TIERS: Record<MembershipTier, MembershipTierDetails> = {
  free: {
    id: 'free',
    name: 'Explorer',
    tagline: 'For those beginning to listen differently',
    philosophy: 'A first step into intentional listening. Experience a single club cycle, glimpse your emerging identity, and discover what deeper attention to music might offer.',
    price: null,
    benefits: [
      { id: 'club-access', label: 'Current cycle access', description: 'Join one active listening cycle', available: true },
      { id: 'partial-identity', label: 'Identity preview', description: 'A glimpse of your archetype', available: true },
      { id: 'basic-annotations', label: 'Basic annotations', description: 'Save up to 10 reflections', available: true },
      { id: 'room-preview', label: 'Room preview', description: 'Observe the listening room', available: true },
      { id: 'limited-archive', label: 'Limited archive', description: 'Last 4 weeks only', available: false },
      { id: 'identity-evolution', label: 'Identity evolution', description: 'How you change over time', available: false },
      { id: 'curator-notes', label: "Curator's notes", description: 'Editorial context', available: false },
    ],
    emotionalFraming: 'An invitation to slow down.',
    cta: 'Begin Exploring',
    ctaSubtext: 'No commitment required',
  },
  
  member: {
    id: 'member',
    name: 'Member',
    tagline: 'For listeners who want to understand not just what they love, but why',
    philosophy: 'The full LongPlay experience. Participate in unlimited listening cycles, develop a complete portrait of your musical identity, preserve your listening history, and join a community of intentional listeners.',
    price: '$9',
    priceSubtext: 'per month',
    benefits: [
      { id: 'unlimited-clubs', label: 'Unlimited club access', description: 'Join any listening club', available: true },
      { id: 'full-identity', label: 'Complete identity portrait', description: 'Your full archetype and taste essay', available: true },
      { id: 'unlimited-annotations', label: 'Unlimited annotations', description: 'Capture every meaningful moment', available: true },
      { id: 'full-archive', label: 'Complete archive', description: 'Your entire listening history', available: true },
      { id: 'identity-evolution', label: 'Identity evolution', description: 'Watch how you change', available: true },
      { id: 'curator-notes', label: "Curator's notes", description: 'Weekly editorial context', available: true },
      { id: 'year-review', label: 'Year in Review essays', description: 'Annual listening portraits', available: true },
      { id: 'compatibility', label: 'Listening compatibility', description: 'Find kindred listeners', available: true },
    ],
    emotionalFraming: 'For those who believe music deserves attention.',
    cta: 'Become a Member',
    ctaSubtext: 'Cancel anytime',
  },
  
  patron: {
    id: 'patron',
    name: 'Patron',
    tagline: 'For listeners who believe music deserves deeper attention, memory, and conversation',
    philosophy: 'Support the culture of intentional listening. Access curator salons, private rooms, expanded identity essays, seasonal artifacts, and help sustain a space where music is treated as art worth studying.',
    price: '$22',
    priceSubtext: 'per month',
    benefits: [
      { id: 'everything-member', label: 'Everything in Member', description: 'The complete experience', available: true },
      { id: 'curator-salons', label: 'Curator salons', description: 'Live conversations with curators', available: true },
      { id: 'private-rooms', label: 'Private & limited rooms', description: 'Intimate listening spaces', available: true },
      { id: 'advanced-essays', label: 'Advanced identity essays', description: 'Deeper psychological portraits', available: true },
      { id: 'seasonal-artifacts', label: 'Seasonal artifacts', description: 'Digital and printed keepsakes', available: true },
      { id: 'early-access', label: 'Early access clubs', description: 'Join cycles before release', available: true },
      { id: 'creator-sessions', label: 'Creator sessions', description: 'Artist and label conversations', available: true },
      { id: 'archive-exports', label: 'Archival exports', description: 'Beautiful PDF archives', available: true },
      { id: 'identity-cards', label: 'Collectible identity cards', description: 'Premium shareable artifacts', available: true },
    ],
    emotionalFraming: 'Sustaining a culture of listening.',
    cta: 'Become a Patron',
    ctaSubtext: 'Support intentional listening',
  },
}

// User membership state
export interface UserMembership {
  tier: MembershipTier
  memberSince: string
  renewalDate?: string
  cyclesCompleted: number
  archiveDepth: number
  savedMoments: number
  clubsJoined: string[]
}

// Gift membership configuration
export interface GiftMembershipOption {
  duration: string
  price: string
  savings?: string
  framing: string
}

export const GIFT_OPTIONS: GiftMembershipOption[] = [
  {
    duration: '3 months',
    price: '$25',
    framing: 'A season of intentional listening',
  },
  {
    duration: '6 months',
    price: '$48',
    savings: 'Save $6',
    framing: 'Half a year of musical discovery',
  },
  {
    duration: '1 year',
    price: '$89',
    savings: 'Save $19',
    framing: 'A complete listening journey',
  },
]

// Featured creator/curator clubs for aspiration
export interface FeaturedCuratorClub {
  id: string
  name: string
  curator: string
  curatorRole: string
  description: string
  tier: 'member' | 'patron'
  comingSoon?: boolean
}

export const FEATURED_CURATOR_CLUBS: FeaturedCuratorClub[] = [
  {
    id: 'nocturnal-room',
    name: 'The Nocturnal Room',
    curator: 'Sarah Chen',
    curatorRole: 'Music Critic, The Quietus',
    description: 'Late-night listening for those who find clarity after midnight',
    tier: 'member',
  },
  {
    id: 'ambient-cycles',
    name: 'Ambient Cycles',
    curator: 'Marcus Weaver',
    curatorRole: 'Ambient Producer',
    description: 'Monthly explorations of environmental and atmospheric music',
    tier: 'member',
  },
  {
    id: 'vinyl-salon',
    name: 'The Vinyl Salon',
    curator: 'Light in the Attic Records',
    curatorRole: 'Reissue Label',
    description: 'Rediscovered records with the stories behind their resurrection',
    tier: 'patron',
    comingSoon: true,
  },
  {
    id: 'composers-room',
    name: "The Composer's Room",
    curator: 'Contemporary Classical Quarterly',
    curatorRole: 'Publication',
    description: 'Living composers in conversation with their scores',
    tier: 'patron',
    comingSoon: true,
  },
]

// Membership value previews for conversion moments
export const MEMBERSHIP_VALUE_PREVIEWS = {
  identity: {
    title: 'Your Full Listening Identity',
    description: 'A complete portrait of who you are through music—your archetype, taste essay, emotional dimensions, and how you evolve.',
    memberOnly: true,
  },
  archive: {
    title: 'Your Listening Life Archive',
    description: 'Every cycle, annotation, and moment preserved. A lifelong museum of your inner life through music.',
    memberOnly: true,
  },
  yearReview: {
    title: 'Year in Review Essays',
    description: 'Annual literary portraits of your listening journey—not statistics, but stories.',
    memberOnly: true,
  },
  curatorSalons: {
    title: 'Curator Salons',
    description: 'Live conversations with the critics, producers, and labels who shape how we hear.',
    patronOnly: true,
  },
}

// Subtle conversion prompts (invitational, not pushy)
export const CONVERSION_PROMPTS = {
  archiveLimit: 'Your listening history continues beyond this view.',
  identityPreview: 'This is a preview of your listening identity.',
  annotationLimit: "You've reached your annotation limit for this cycle.",
  curatorNote: "Curator's notes are available to Members.",
  yearReview: 'Your Year in Review essay is waiting.',
  compatibility: 'Discover listeners who hear like you.',
}
