'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { 
  MEMBERSHIP_TIERS, 
  GIFT_OPTIONS, 
  FEATURED_CURATOR_CLUBS,
  type MembershipTier,
  type UserMembership,
} from '@/lib/membership'

// Current user membership (would come from auth/database)
const USER_MEMBERSHIP: UserMembership = {
  tier: 'member',
  memberSince: 'Winter 2024',
  renewalDate: 'January 15, 2025',
  cyclesCompleted: 23,
  archiveDepth: 4237,
  savedMoments: 156,
  clubsJoined: ['The Nocturnal Room', 'Beautiful Damage', 'Records for Rain'],
}

export function MembershipScreen() {
  const [selectedTier, setSelectedTier] = useState<MembershipTier>('member')
  const [showGift, setShowGift] = useState(false)
  
  const currentTier = MEMBERSHIP_TIERS[USER_MEMBERSHIP.tier]
  
  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-24">
      {/* ============================================ */}
      {/* HERO - Cultural Positioning */}
      {/* ============================================ */}
      <section className="px-6 pt-20 pb-16 md:px-12 lg:px-24 text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco/80 mb-4">
          Membership
        </p>
        <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-cream mb-6 max-w-2xl mx-auto leading-tight">
          Support a culture of<br />intentional listening
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
          LongPlay membership is not about app features.<br />
          It is about joining a listening culture.
        </p>
      </section>

      {/* ============================================ */}
      {/* YOUR MEMBERSHIP - Current Status */}
      {/* ============================================ */}
      <section className="px-6 py-12 md:px-12 lg:px-24 bg-card/30 border-y border-border/20">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-6">
            Your Membership
          </p>
          
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="font-serif text-2xl text-cream">
                  LongPlay {currentTier.name}
                </h2>
                <span className="text-[10px] uppercase tracking-wider text-burgundy px-2 py-1 border border-burgundy/40 rounded-full">
                  Active
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                {currentTier.tagline}
              </p>
              <p className="text-xs text-tobacco">
                Member since {USER_MEMBERSHIP.memberSince}
              </p>
            </div>
            
            <div className="text-left md:text-right">
              <p className="text-xs text-muted-foreground mb-1">Renews</p>
              <p className="text-cream">{USER_MEMBERSHIP.renewalDate}</p>
            </div>
          </div>
          
          {/* Membership Stats */}
          <div className="grid grid-cols-3 gap-4 mt-8 pt-8 border-t border-border/20">
            <div>
              <p className="font-serif text-2xl text-cream">{USER_MEMBERSHIP.cyclesCompleted}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cycles</p>
            </div>
            <div>
              <p className="font-serif text-2xl text-cream">{USER_MEMBERSHIP.savedMoments}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Moments</p>
            </div>
            <div>
              <p className="font-serif text-2xl text-cream">{USER_MEMBERSHIP.clubsJoined.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Clubs</p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* MEMBERSHIP TIERS - Editorial, Not SaaS */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
              Ways to Belong
            </p>
            <h2 className="font-serif text-2xl md:text-3xl text-cream">
              Choose how deeply you want to listen
            </h2>
          </div>
          
          {/* Tier Cards - Editorial Layout */}
          <div className="grid md:grid-cols-3 gap-6">
            {(['free', 'member', 'patron'] as MembershipTier[]).map((tierId) => {
              const tier = MEMBERSHIP_TIERS[tierId]
              const isCurrentTier = USER_MEMBERSHIP.tier === tierId
              const isSelected = selectedTier === tierId
              
              return (
                <button
                  key={tierId}
                  onClick={() => setSelectedTier(tierId)}
                  className={cn(
                    'text-left p-6 md:p-8 border transition-all duration-500',
                    isSelected
                      ? 'border-burgundy/50 bg-burgundy/5'
                      : 'border-border/20 hover:border-border/40',
                    isCurrentTier && 'ring-1 ring-tobacco/30'
                  )}
                >
                  {/* Tier Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-serif text-xl text-cream mb-1">{tier.name}</h3>
                      {tier.price ? (
                        <p className="text-muted-foreground">
                          <span className="text-cream font-serif text-2xl">{tier.price}</span>
                          <span className="text-sm">/{tier.priceSubtext?.replace('per ', '')}</span>
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-sm">Free</p>
                      )}
                    </div>
                    {isCurrentTier && (
                      <span className="text-[9px] uppercase tracking-wider text-tobacco border border-tobacco/30 px-2 py-1">
                        Current
                      </span>
                    )}
                  </div>
                  
                  {/* Tagline */}
                  <p className="text-sm text-cream/80 mb-4 leading-relaxed">
                    {tier.tagline}
                  </p>
                  
                  {/* Emotional Framing */}
                  <p className="text-xs text-tobacco italic mb-6">
                    {tier.emotionalFraming}
                  </p>
                  
                  {/* Benefits Preview */}
                  <div className="space-y-2">
                    {tier.benefits.slice(0, 5).map((benefit) => (
                      <div 
                        key={benefit.id}
                        className={cn(
                          'flex items-center gap-2 text-sm',
                          benefit.available ? 'text-cream/70' : 'text-muted-foreground/50'
                        )}
                      >
                        {benefit.available ? (
                          <svg className="w-4 h-4 text-olive shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-muted-foreground/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                          </svg>
                        )}
                        <span>{benefit.label}</span>
                      </div>
                    ))}
                    {tier.benefits.length > 5 && (
                      <p className="text-xs text-muted-foreground pt-2">
                        + {tier.benefits.length - 5} more
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          
          {/* Selected Tier Detail */}
          <div className="mt-12 p-8 border border-border/20 bg-card/20">
            <div className="max-w-2xl">
              <h3 className="font-serif text-2xl text-cream mb-4">
                {MEMBERSHIP_TIERS[selectedTier].name}
              </h3>
              <p className="text-cream/80 leading-relaxed mb-8">
                {MEMBERSHIP_TIERS[selectedTier].philosophy}
              </p>
              
              {/* Full Benefits */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {MEMBERSHIP_TIERS[selectedTier].benefits.filter(b => b.available).map((benefit) => (
                  <div key={benefit.id} className="flex gap-3">
                    <svg className="w-5 h-5 text-tobacco shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-cream text-sm">{benefit.label}</p>
                      <p className="text-xs text-muted-foreground">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* CTA */}
              {USER_MEMBERSHIP.tier !== selectedTier && (
                <div className="flex items-center gap-4">
                  <button className="px-6 py-3 bg-burgundy/20 border border-burgundy/40 text-cream text-sm uppercase tracking-wider hover:bg-burgundy/30 transition-all duration-500">
                    {MEMBERSHIP_TIERS[selectedTier].cta}
                  </button>
                  {MEMBERSHIP_TIERS[selectedTier].ctaSubtext && (
                    <span className="text-xs text-muted-foreground">
                      {MEMBERSHIP_TIERS[selectedTier].ctaSubtext}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* CURATOR CLUBS PREVIEW - Aspiration */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-card/20 border-y border-border/20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
              Curator-Led Clubs
            </p>
            <h2 className="font-serif text-2xl md:text-3xl text-cream mb-4">
              Listening guided by those who shape how we hear
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Critics, producers, labels, and artists leading intimate cycles of discovery.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {FEATURED_CURATOR_CLUBS.map((club) => (
              <div 
                key={club.id}
                className={cn(
                  'p-6 border transition-all duration-500',
                  club.comingSoon 
                    ? 'border-border/10 bg-background/50 opacity-70'
                    : 'border-border/20 hover:border-border/40'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-serif text-lg text-cream">{club.name}</h3>
                    <p className="text-xs text-tobacco">{club.curator}</p>
                    <p className="text-[10px] text-muted-foreground">{club.curatorRole}</p>
                  </div>
                  {club.comingSoon ? (
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground border border-border/30 px-2 py-1">
                      Coming Soon
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-wider text-burgundy border border-burgundy/30 px-2 py-1">
                      {club.tier === 'patron' ? 'Patron' : 'Member'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {club.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* GIFT MEMBERSHIP */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
              Gift
            </p>
            <h2 className="font-serif text-2xl md:text-3xl text-cream mb-4">
              Give the gift of intentional listening
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Gift someone a deeper relationship with music. Not app access—a cultural experience.
            </p>
          </div>
          
          <button
            onClick={() => setShowGift(!showGift)}
            className="w-full p-6 border border-tobacco/30 bg-tobacco/5 hover:bg-tobacco/10 transition-all duration-500 text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-lg text-cream mb-1">Gift a Membership</h3>
                <p className="text-sm text-muted-foreground">
                  Starting at $25 for 3 months
                </p>
              </div>
              <svg 
                className={cn(
                  'w-5 h-5 text-tobacco transition-transform duration-300',
                  showGift && 'rotate-180'
                )} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </button>
          
          {showGift && (
            <div className="border border-t-0 border-tobacco/30 p-6 animate-fade-in">
              <div className="grid md:grid-cols-3 gap-4">
                {GIFT_OPTIONS.map((option) => (
                  <button
                    key={option.duration}
                    className="p-5 border border-border/20 hover:border-burgundy/40 hover:bg-burgundy/5 transition-all duration-500 text-left"
                  >
                    <p className="text-xs text-tobacco mb-2">{option.duration}</p>
                    <p className="font-serif text-2xl text-cream mb-1">{option.price}</p>
                    {option.savings && (
                      <p className="text-xs text-olive mb-2">{option.savings}</p>
                    )}
                    <p className="text-xs text-muted-foreground italic">
                      {option.framing}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============================================ */}
      {/* MEMBERSHIP PHILOSOPHY */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-card/30 border-t border-border/20">
        <div className="max-w-2xl mx-auto text-center">
          <blockquote className="font-serif text-xl md:text-2xl text-cream/90 leading-relaxed mb-6">
            "Membership supports a slower, more intentional culture of listening."
          </blockquote>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Your membership sustains a space where albums are studied, not skipped. 
            Where listening history becomes personal archaeology. Where music is treated 
            as art worth the attention it asks for.
          </p>
        </div>
      </section>

      {/* ============================================ */}
      {/* BACK TO PROFILE */}
      {/* ============================================ */}
      <section className="px-6 py-12 md:px-12 lg:px-24">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-cream transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span>Back to Profile</span>
          </Link>
        </div>
      </section>
    </div>
  )
}
