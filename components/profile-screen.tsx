'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resetOnboarding } from '@/lib/onboarding-state'

// User data (would come from auth/database)
const USER = {
  name: 'Elena Vasquez',
  handle: '@elenavasquez',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
  memberSince: 'March 2023',
  tier: 'LongPlay Member',
  archiveSize: 4237,
  savedMoments: 156,
}

const CONNECTED_SERVICES = [
  { name: 'Spotify', connected: true, lastSync: '2 hours ago' },
  { name: 'Apple Music', connected: false, lastSync: null },
  { name: 'Last.fm', connected: true, lastSync: '1 day ago' },
]

const JOINED_ROOMS = [
  { name: 'The Nocturnal Room', role: 'Member', joined: 'March 2023' },
  { name: 'Beautiful Damage', role: 'Member', joined: 'May 2023' },
  { name: 'Records for Rain', role: 'Member', joined: 'August 2023' },
]

export function ProfileScreen() {
  const router = useRouter()
  
  const handleRestartOnboarding = () => {
    if (window.confirm('This will reset your onboarding progress and redirect you to the beginning. Continue?')) {
      resetOnboarding()
      router.push('/onboarding')
    }
  }

  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-24">
      {/* Header */}
      <section className="px-6 pt-16 pb-8 md:px-12 lg:px-24">
        <div className="flex items-start gap-6">
          <Avatar className="h-20 w-20 md:h-24 md:w-24 border-2 border-tobacco/30">
            <AvatarImage src={USER.avatar} alt={USER.name} />
            <AvatarFallback className="bg-tobacco/20 text-cream text-xl">
              {USER.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <h1 className="font-serif text-2xl md:text-3xl text-cream mb-1">
              {USER.name}
            </h1>
            <p className="text-muted-foreground text-sm mb-3">{USER.handle}</p>
            <p className="text-xs text-tobacco">Member since {USER.memberSince}</p>
          </div>
        </div>
      </section>

      {/* Membership Status */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Membership</h2>
        </div>
        
        <Link 
          href="/membership"
          className="block bg-burgundy/10 border border-burgundy/30 p-5 hover:bg-burgundy/15 transition-all duration-500"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg text-cream">{USER.tier}</h3>
            <span className="text-xs text-burgundy px-2 py-1 border border-burgundy/50 rounded-full">Active</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Full access to all identity features, unlimited clubs, and your complete listening archive.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Member since {USER.memberSince}</span>
            <span className="text-tobacco flex items-center gap-1">
              Manage
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          </div>
        </Link>
      </section>

      {/* Archive Stats */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">Your Archive</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border border-border/20">
            <p className="font-serif text-3xl text-cream mb-1">{USER.archiveSize.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">listening moments</p>
          </div>
          <div className="p-4 border border-border/20">
            <p className="font-serif text-3xl text-cream mb-1">{USER.savedMoments}</p>
            <p className="text-xs text-muted-foreground">saved reflections</p>
          </div>
        </div>
        
        <Link 
          href="/listening-life"
          className="block mt-4 text-sm text-tobacco hover:text-cream transition-colors"
        >
          Explore your listening life →
        </Link>
      </section>

      {/* Connected Services */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Connected Services</h2>
          <button className="text-xs text-tobacco hover:text-cream transition-colors">
            Add service
          </button>
        </div>
        
        <div className="space-y-3">
          {CONNECTED_SERVICES.map((service) => (
            <div 
              key={service.name}
              className="flex items-center justify-between p-4 border border-border/20"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${service.connected ? 'bg-olive' : 'bg-muted'}`} />
                <span className="text-cream">{service.name}</span>
              </div>
              {service.connected ? (
                <span className="text-xs text-muted-foreground">
                  Synced {service.lastSync}
                </span>
              ) : (
                <button className="text-xs text-tobacco hover:text-cream transition-colors">
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Joined Rooms */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your Rooms</h2>
          <Link 
            href="/rooms"
            className="text-xs text-tobacco hover:text-cream transition-colors"
          >
            Discover rooms
          </Link>
        </div>
        
        <div className="space-y-3">
          {JOINED_ROOMS.map((room) => (
            <Link 
              key={room.name}
              href={`/rooms/${room.name.toLowerCase().replace(/\s+/g, '-')}`}
              className="flex items-center justify-between p-4 border border-border/20 hover:border-border/40 transition-colors"
            >
              <div>
                <h3 className="font-serif text-cream">{room.name}</h3>
                <p className="text-xs text-muted-foreground">Joined {room.joined}</p>
              </div>
              <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>
      </section>

      {/* Settings */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">Settings</h2>
        
        <div className="space-y-2">
          <SettingsLink label="Privacy" description="Control who sees your listening" />
          <SettingsLink label="Notifications" description="Manage email and push alerts" />
          <SettingsLink label="Export Data" description="Download your archive" />
          <SettingsLink label="Account" description="Email, password, and security" />
        </div>
      </section>

      {/* Identity Link - Prominent CTA */}
      <section className="mx-6 md:mx-12 lg:mx-24 my-8">
        <Link 
          href="/identity"
          className="block p-6 bg-burgundy/10 border border-burgundy/30 hover:bg-burgundy/15 transition-all duration-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-xl text-cream mb-2">Your Listening Identity</h3>
              <p className="text-sm text-muted-foreground">
                Explore your archetype, taste portrait, and emotional dimensions.
              </p>
            </div>
            <svg className="w-6 h-6 text-burgundy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </div>
        </Link>
      </section>

      {/* Sign Out */}
      <section className="px-6 py-8 md:px-12 lg:px-24">
        <button className="text-sm text-muted-foreground hover:text-cream transition-colors">
          Sign out
        </button>
      </section>

      {/* Developer/Testing Section */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-dashed border-border/30 bg-card/5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">
          Testing Tools
        </p>
        <button
          onClick={handleRestartOnboarding}
          className="px-4 py-2 border border-burgundy/30 text-burgundy hover:bg-burgundy/10 text-sm transition-all duration-300"
        >
          Restart Onboarding
        </button>
        <p className="text-xs text-muted-foreground/50 mt-2">
          Resets onboarding state and returns to /onboarding
        </p>
      </section>
    </div>
  )
}

function SettingsLink({ label, description }: { label: string; description: string }) {
  return (
    <button className="w-full flex items-center justify-between p-4 border border-border/20 hover:border-border/40 transition-colors text-left">
      <div>
        <h3 className="text-cream">{label}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  )
}
