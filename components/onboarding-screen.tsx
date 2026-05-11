'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AlbumCover } from '@/components/album-cover'
import { ALBUMS } from '@/lib/albums'
import { 
  getOnboardingState, 
  saveOnboardingState, 
  completeOnboarding,
  isOnboardingCompleted,
} from '@/lib/onboarding-state'
import { getResonatingRooms, ROOM_AFFINITIES } from '@/lib/room-affinity'

/**
 * LongPlay Onboarding - Initiation Into a Listening Culture
 * 
 * This is NOT app setup. This is the beginning of a listening relationship.
 * The First Identity Reveal is the emotional hook of the entire product.
 */

const STEPS = [
  'opening',           // Cinematic brand thesis
  'connect',           // Streaming connection (framed as opening history)
  'importing',         // Atmospheric loading
  'calibration-1',     // When does music matter most?
  'calibration-2',     // What do you look for in a record?
  'calibration-3',     // How do you return to music?
  'calibration-4',     // What kind of records stay with you?
  'reflection',        // Observations back to user
  'building',          // Cinematic transition to reveal
  'reveal-archetype',  // The archetype reveal
  'reveal-portrait',   // Taste portrait
  'reveal-rooms',      // Room affinities
  'complete',          // Welcome to LongPlay
] as const

type Step = typeof STEPS[number]

// Calibration question data
const CALIBRATION_QUESTIONS = {
  'calibration-1': {
    question: 'When does music matter most to you?',
    subtitle: 'Select all that feel true',
    multiSelect: true,
    options: [
      { id: 'driving-night', label: 'Driving alone at night' },
      { id: 'walking-cities', label: 'Walking through cities' },
      { id: 'morning-quiet', label: 'Early morning quiet' },
      { id: 'after-midnight', label: 'After everyone has gone to sleep' },
      { id: 'while-working', label: 'While working or creating' },
      { id: 'emotional-overwhelm', label: 'During emotional overwhelm' },
      { id: 'close-friends', label: 'With close friends' },
      { id: 'traveling', label: 'While traveling' },
    ],
  },
  'calibration-2': {
    question: 'What do you look for in a record?',
    subtitle: 'Choose what resonates most',
    multiSelect: true,
    options: [
      { id: 'atmosphere', label: 'Atmosphere' },
      { id: 'emotional-honesty', label: 'Emotional honesty' },
      { id: 'restraint', label: 'Restraint' },
      { id: 'transcendence', label: 'Transcendence' },
      { id: 'texture', label: 'Texture' },
      { id: 'intimacy', label: 'Intimacy' },
      { id: 'ambiguity', label: 'Ambiguity' },
      { id: 'warmth', label: 'Warmth' },
    ],
  },
  'calibration-3': {
    question: 'How do you return to music?',
    subtitle: 'Select what describes you',
    multiSelect: false,
    options: [
      { id: 'obsessive-replay', label: 'Replaying one record obsessively' },
      { id: 'mood-drift', label: 'Drifting between moods' },
      { id: 'context-discovery', label: 'Discovering through context' },
      { id: 'memory-revisit', label: 'Revisiting records tied to memory' },
      { id: 'emotional-precision', label: 'Searching for emotional precision' },
    ],
  },
  'calibration-4': {
    question: 'What kind of records stay with you?',
    subtitle: 'Choose all that apply',
    multiSelect: true,
    options: [
      { id: 'slow-reveal', label: 'Records that reveal themselves slowly' },
      { id: 'life-periods', label: 'Records tied to periods of life' },
      { id: 'emotional-distance', label: 'Records that create emotional distance first' },
      { id: 'cinematic', label: 'Records that feel cinematic' },
      { id: 'places', label: 'Records that sound like places' },
      { id: 'nocturnal', label: 'Records that feel nocturnal' },
      { id: 'fragile', label: 'Records that feel fragile' },
      { id: 'expansive', label: 'Records that feel spiritually expansive' },
    ],
  },
}

const STREAMING_SERVICES = [
  { id: 'spotify', name: 'Spotify', color: '#1DB954' },
  { id: 'apple-music', name: 'Apple Music', color: '#FA243C' },
  { id: 'tidal', name: 'TIDAL', color: '#000000' },
  { id: 'qobuz', name: 'Qobuz', color: '#0066CC' },
  { id: 'bandcamp', name: 'Bandcamp', color: '#1DA0C3' },
]

export function OnboardingScreen() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<Step>('opening')
  const [connectedServices, setConnectedServices] = useState<string[]>([])
  const [calibrationAnswers, setCalibrationAnswers] = useState<Record<string, string[]>>({})
  const [buildProgress, setBuildProgress] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)

  // Check if onboarding is already completed
  useEffect(() => {
    if (isOnboardingCompleted()) {
      router.replace('/')
      return
    }
    
    // Restore state from localStorage if returning
    const savedState = getOnboardingState()
    if (savedState.currentStep && STEPS.includes(savedState.currentStep as Step)) {
      setCurrentStep(savedState.currentStep as Step)
    }
    if (savedState.connectedServices) {
      setConnectedServices(savedState.connectedServices)
    }
    if (savedState.calibrationAnswers) {
      setCalibrationAnswers(savedState.calibrationAnswers)
    }
    
    setIsInitialized(true)
  }, [router])

  // Save state on changes
  useEffect(() => {
    if (!isInitialized) return
    
    saveOnboardingState({
      currentStep,
      connectedServices,
      calibrationAnswers,
    })
  }, [currentStep, connectedServices, calibrationAnswers, isInitialized])

  const handleConnect = (serviceId: string) => {
    setConnectedServices([...connectedServices, serviceId])
  }

  const handleCalibrationSelect = (step: string, optionId: string) => {
    const question = CALIBRATION_QUESTIONS[step as keyof typeof CALIBRATION_QUESTIONS]
    const current = calibrationAnswers[step] || []
    
    if (question.multiSelect) {
      if (current.includes(optionId)) {
        setCalibrationAnswers({ ...calibrationAnswers, [step]: current.filter(id => id !== optionId) })
      } else {
        setCalibrationAnswers({ ...calibrationAnswers, [step]: [...current, optionId] })
      }
    } else {
      setCalibrationAnswers({ ...calibrationAnswers, [step]: [optionId] })
    }
  }

  const handleContinue = () => {
    const currentIndex = STEPS.indexOf(currentStep)
    if (currentIndex < STEPS.length - 1) {
      const nextStep = STEPS[currentIndex + 1]
      setCurrentStep(nextStep)
      
      if (nextStep === 'importing') {
        simulateImport()
      }
      if (nextStep === 'building') {
        simulateBuild()
      }
    }
  }

  const simulateImport = () => {
    // Auto-advance after atmospheric pause
    setTimeout(() => setCurrentStep('calibration-1'), 3500)
  }

  const simulateBuild = () => {
    let progress = 0
    const interval = setInterval(() => {
      progress += Math.random() * 8
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        setTimeout(() => setCurrentStep('reveal-archetype'), 1200)
      }
      setBuildProgress(progress)
    }, 400)
  }

  const handleComplete = () => {
    // Mark onboarding as complete
    completeOnboarding({
      archetype: 'The Midnight Archivist',
      connectedServices,
      calibrationAnswers,
    })
    
    // Navigate to home
    router.push('/')
  }

  // Show loading while checking onboarding state
  if (!isInitialized) {
    return (
      <div className="grain min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border border-tobacco/30 rounded-full animate-pulse" />
      </div>
    )
  }

  return (
    <div className="grain min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Subtle progress indicator - only after opening */}
      {currentStep !== 'opening' && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="h-px bg-border/10">
            <div 
              className="h-full bg-tobacco/50 transition-all duration-1000"
              style={{ width: `${((STEPS.indexOf(currentStep) + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 flex flex-col">
        {currentStep === 'opening' && <OpeningStep onContinue={handleContinue} />}
        
        {currentStep === 'connect' && (
          <ConnectStep 
            services={STREAMING_SERVICES}
            connectedServices={connectedServices}
            onConnect={handleConnect}
            onContinue={handleContinue}
          />
        )}
        
        {currentStep === 'importing' && <ImportingStep />}
        
        {currentStep.startsWith('calibration-') && (
          <CalibrationStep
            step={currentStep}
            question={CALIBRATION_QUESTIONS[currentStep as keyof typeof CALIBRATION_QUESTIONS]}
            selected={calibrationAnswers[currentStep] || []}
            onSelect={(id) => handleCalibrationSelect(currentStep, id)}
            onContinue={handleContinue}
          />
        )}
        
        {currentStep === 'reflection' && (
          <ReflectionStep 
            answers={calibrationAnswers}
            onContinue={handleContinue} 
          />
        )}
        
        {currentStep === 'building' && <BuildingStep progress={buildProgress} />}
        
        {currentStep === 'reveal-archetype' && (
          <ArchetypeRevealStep onContinue={handleContinue} />
        )}
        
        {currentStep === 'reveal-portrait' && (
          <PortraitRevealStep onContinue={handleContinue} />
        )}
        
        {currentStep === 'reveal-rooms' && (
          <RoomsRevealStep onContinue={handleContinue} />
        )}
        
        {currentStep === 'complete' && (
          <CompleteStep onFinish={handleComplete} />
        )}
      </div>
    </div>
  )
}

// ============================================
// OPENING - Cinematic Brand Thesis
// ============================================
function OpeningStep({ onContinue }: { onContinue: () => void }) {
  const [phase, setPhase] = useState(0)
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1200),
      setTimeout(() => setPhase(2), 2800),
      setTimeout(() => setPhase(3), 4400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-16 text-center min-h-screen">
      <div className="max-w-lg">
        {/* Phase 0: LongPlay wordmark */}
        <div className={cn(
          "transition-all duration-1000 mb-8",
          phase >= 0 ? "opacity-100" : "opacity-0"
        )}>
          <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl text-cream tracking-tight">
            <span>Long</span>
            <span className="italic">Play</span>
          </h1>
        </div>
        
        {/* Phase 1: Category framing */}
        <p className={cn(
          "text-[10px] uppercase tracking-[0.5em] text-cream/50 mb-6 transition-all duration-1000",
          phase >= 1 ? "opacity-100" : "opacity-0"
        )}>
          A Listening Club
        </p>
        
        {/* Phase 2: Emotional thesis */}
        <p className={cn(
          "font-serif text-xl md:text-2xl text-cream/70 italic mb-16 transition-all duration-1000",
          phase >= 2 ? "opacity-100" : "opacity-0"
        )}>
          Where listening becomes identity
        </p>
        
        {/* Phase 3: Editorial framing + CTA */}
        <div className={cn(
          "transition-all duration-1000",
          phase >= 3 ? "opacity-100" : "opacity-0"
        )}>
          <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/40 to-transparent mx-auto mb-10" />
          
          <p className="text-muted-foreground leading-relaxed mb-12 max-w-md mx-auto">
            Most music platforms track what you play.
            <br />
            <span className="text-cream/80">LongPlay traces how music shapes you.</span>
          </p>
          
          <button
            onClick={onContinue}
            className="px-12 py-4 border border-cream/30 text-cream hover:bg-cream/5 transition-all duration-700"
          >
            Begin
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// CONNECT - Open Your Listening History
// ============================================
function ConnectStep({ 
  services, 
  connectedServices,
  onConnect, 
  onContinue 
}: { 
  services: typeof STREAMING_SERVICES
  connectedServices: string[]
  onConnect: (id: string) => void
  onContinue: () => void
}) {
  const hasConnection = connectedServices.length > 0

  return (
    <div className="flex-1 flex flex-col justify-center px-8 py-16">
      <div className="animate-fade-in max-w-md mx-auto w-full">
        <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-4 text-center">
          Your listening life begins here
        </p>
        
        <h2 className="font-serif text-3xl md:text-4xl text-cream mb-4 text-center">
          Bring your history
        </h2>
        
        <p className="text-muted-foreground leading-relaxed mb-12 text-center">
          Connect your streaming to open years of listening memory.
        </p>
        
        <div className="space-y-3 mb-12">
          {services.map((service) => {
            const isConnected = connectedServices.includes(service.id)
            
            return (
              <button
                key={service.id}
                onClick={() => !isConnected && onConnect(service.id)}
                disabled={isConnected}
                className={cn(
                  "w-full flex items-center justify-between p-4 border transition-all duration-500",
                  isConnected 
                    ? "border-olive/50 bg-olive/5" 
                    : "border-border/20 hover:border-cream/30 hover:bg-card/20"
                )}
              >
                <span className="text-cream">{service.name}</span>
                {isConnected ? (
                  <span className="text-xs text-olive uppercase tracking-wider">Connected</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Connect</span>
                )}
              </button>
            )
          })}
        </div>
        
        <button
          onClick={onContinue}
          disabled={!hasConnection}
          className={cn(
            "w-full py-4 border transition-all duration-500",
            hasConnection
              ? "border-cream/30 text-cream hover:bg-cream/5"
              : "border-border/10 text-muted-foreground/40 cursor-not-allowed"
          )}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

// ============================================
// IMPORTING - Atmospheric Loading
// ============================================
function ImportingStep() {
  const [message, setMessage] = useState(0)
  
  const messages = [
    "Opening your listening history...",
    "Tracing emotional patterns...",
    "Finding the records that stayed...",
  ]
  
  useEffect(() => {
    const interval = setInterval(() => {
      setMessage(m => (m + 1) % messages.length)
    }, 1100)
    return () => clearInterval(interval)
  }, [messages.length])

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-16 text-center min-h-screen">
      <div className="animate-fade-in max-w-md">
        {/* Subtle pulsing circle */}
        <div className="w-20 h-20 mx-auto mb-12 relative">
          <div className="absolute inset-0 rounded-full border border-tobacco/30 animate-pulse" />
          <div className="absolute inset-2 rounded-full border border-tobacco/20 animate-pulse" style={{ animationDelay: '300ms' }} />
          <div className="absolute inset-4 rounded-full border border-tobacco/10 animate-pulse" style={{ animationDelay: '600ms' }} />
        </div>
        
        <p className="font-serif text-xl text-cream/80 transition-all duration-500">
          {messages[message]}
        </p>
      </div>
    </div>
  )
}

// ============================================
// CALIBRATION - Emotionally Intelligent Questions
// ============================================
function CalibrationStep({
  step,
  question,
  selected,
  onSelect,
  onContinue,
}: {
  step: string
  question: { question: string; subtitle: string; multiSelect: boolean; options: { id: string; label: string }[] }
  selected: string[]
  onSelect: (id: string) => void
  onContinue: () => void
}) {
  const canContinue = selected.length > 0
  const stepNumber = parseInt(step.split('-')[1])

  return (
    <div className="flex-1 flex flex-col justify-center px-8 py-16">
      <div className="animate-fade-in max-w-lg mx-auto w-full">
        <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco/60 mb-8 text-center">
          {stepNumber} of 4
        </p>
        
        <h2 className="font-serif text-2xl md:text-3xl text-cream mb-3 text-center leading-relaxed">
          {question.question}
        </h2>
        
        <p className="text-sm text-muted-foreground mb-12 text-center">
          {question.subtitle}
        </p>
        
        <div className="grid grid-cols-2 gap-3 mb-12">
          {question.options.map((option) => {
            const isSelected = selected.includes(option.id)
            
            return (
              <button
                key={option.id}
                onClick={() => onSelect(option.id)}
                className={cn(
                  "p-4 text-left border transition-all duration-300",
                  isSelected 
                    ? "border-burgundy/60 bg-burgundy/10 text-cream" 
                    : "border-border/20 text-muted-foreground hover:border-cream/30 hover:text-cream"
                )}
              >
                <span className="text-sm">{option.label}</span>
              </button>
            )
          })}
        </div>
        
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className={cn(
            "w-full py-4 border transition-all duration-500",
            canContinue
              ? "border-cream/30 text-cream hover:bg-cream/5"
              : "border-border/10 text-muted-foreground/40 cursor-not-allowed"
          )}
        >
          Continue
        </button>
      </div>
    </div>
  )
}

// ============================================
// REFLECTION - Observations Back to User
// ============================================
function ReflectionStep({ 
  answers, 
  onContinue 
}: { 
  answers: Record<string, string[]>
  onContinue: () => void 
}) {
  const [phase, setPhase] = useState(0)
  
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2200),
      setTimeout(() => setPhase(3), 3800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  // Generate observations based on answers
  const observations = [
    "You appear drawn to atmosphere before immediacy.",
    "Your listening patterns suggest emotional accumulation matters more than novelty.",
    "You seem to value records that unfold slowly over time.",
  ]

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-16 text-center min-h-screen">
      <div className="max-w-lg">
        <p className={cn(
          "text-[10px] uppercase tracking-[0.4em] text-tobacco/60 mb-8 transition-all duration-1000",
          phase >= 0 ? "opacity-100" : "opacity-0"
        )}>
          We see something
        </p>
        
        <div className="space-y-6 mb-16">
          {observations.map((observation, i) => (
            <p 
              key={i}
              className={cn(
                "font-serif text-lg text-cream/80 transition-all duration-1000",
                phase >= i + 1 ? "opacity-100" : "opacity-0"
              )}
            >
              {observation}
            </p>
          ))}
        </div>
        
        <button
          onClick={onContinue}
          className={cn(
            "px-12 py-4 border border-cream/30 text-cream hover:bg-cream/5 transition-all duration-700",
            phase >= 3 ? "opacity-100" : "opacity-0"
          )}
        >
          Reveal my listening identity
        </button>
      </div>
    </div>
  )
}

// ============================================
// BUILDING - Cinematic Transition to Reveal
// ============================================
function BuildingStep({ progress }: { progress: number }) {
  const messages = [
    { threshold: 0, text: "Tracing emotional patterns..." },
    { threshold: 25, text: "Mapping recurring sonic tendencies..." },
    { threshold: 50, text: "Finding records that shaped you..." },
    { threshold: 75, text: "Building your listening portrait..." },
    { threshold: 95, text: "Almost there..." },
  ]
  
  const currentMessage = messages.reduce((acc, msg) => 
    progress >= msg.threshold ? msg : acc, messages[0]
  )

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-16 text-center min-h-screen">
      <div className="max-w-md">
        {/* Ethereal loading visualization */}
        <div className="w-32 h-32 mx-auto mb-12 relative">
          <div 
            className="absolute inset-0 rounded-full border border-burgundy/40"
            style={{
              transform: `scale(${0.8 + (progress / 500)})`,
              opacity: 0.3 + (progress / 200),
            }}
          />
          <div 
            className="absolute inset-4 rounded-full border border-tobacco/30"
            style={{
              transform: `scale(${0.9 + (progress / 400)})`,
              opacity: 0.4 + (progress / 300),
            }}
          />
          <div 
            className="absolute inset-8 rounded-full bg-burgundy/20"
            style={{
              transform: `scale(${0.5 + (progress / 200)})`,
              opacity: 0.5 + (progress / 200),
            }}
          />
        </div>
        
        <p className="font-serif text-xl text-cream/70 mb-4 transition-all duration-500">
          {currentMessage.text}
        </p>
        
        {/* Subtle progress bar */}
        <div className="w-48 h-px bg-border/20 mx-auto overflow-hidden">
          <div 
            className="h-full bg-tobacco/60 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================
// ARCHETYPE REVEAL - The Dramatic Moment
// ============================================
function ArchetypeRevealStep({ onContinue }: { onContinue: () => void }) {
  const [revealed, setRevealed] = useState(false)
  
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 600)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-16 text-center min-h-screen">
      <div className={cn(
        "max-w-lg transition-all duration-1500",
        revealed ? "opacity-100" : "opacity-0"
      )}>
        <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-8 animate-fade-in">
          Your listening archetype
        </p>
        
        <h2 
          className="font-serif text-4xl md:text-5xl lg:text-6xl text-cream mb-8 leading-tight animate-fade-in-slow"
          style={{ animationDelay: '300ms' }}
        >
          The Midnight Archivist
        </h2>
        
        <div 
          className="w-24 h-px bg-gradient-to-r from-transparent via-burgundy/50 to-transparent mx-auto mb-8 animate-fade-in"
          style={{ animationDelay: '600ms' }}
        />
        
        <p 
          className="text-lg text-muted-foreground leading-relaxed mb-12 animate-fade-in-slow"
          style={{ animationDelay: '800ms' }}
        >
          You listen like someone cataloging emotions for future reference. 
          Your taste gravitates toward records that reward repeated attention, 
          music that reveals new layers with each encounter.
        </p>
        
        {/* Sample albums */}
        <div 
          className="flex justify-center gap-4 mb-12 animate-fade-in"
          style={{ animationDelay: '1200ms' }}
        >
          {[ALBUMS.forEmma, ALBUMS.pinkMoon, ALBUMS.blue].map((album, i) => (
            <div 
              key={album.id} 
              className="w-20 h-20 overflow-hidden border border-border/20"
              style={{ animationDelay: `${1400 + (i * 150)}ms` }}
            >
              <AlbumCover
                src={album.cover}
                alt={album.title}
                title={album.title}
                artist={album.artist}
                className="w-full h-full"
              />
            </div>
          ))}
        </div>
        
        <button
          onClick={onContinue}
          className="px-12 py-4 border border-cream/30 text-cream hover:bg-cream/5 transition-all duration-700 animate-fade-in"
          style={{ animationDelay: '1600ms' }}
        >
          See my full portrait
        </button>
      </div>
    </div>
  )
}

// ============================================
// PORTRAIT REVEAL - Editorial Taste Portrait
// ============================================
function PortraitRevealStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex-1 flex flex-col px-8 py-16 overflow-y-auto">
      <div className="animate-fade-in max-w-2xl mx-auto w-full">
        <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-4 text-center">
          Your Taste Portrait
        </p>
        
        <h2 className="font-serif text-2xl md:text-3xl text-cream mb-8 text-center">
          What Your Listening Reveals
        </h2>
        
        <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-10" />
        
        {/* Editorial portrait */}
        <div className="space-y-6 mb-12">
          <p className="text-muted-foreground leading-relaxed text-lg">
            You are drawn less to genre than to <span className="text-cream">emotional architecture</span>. 
            Across ambient music, post-rock, jazz, and alternative records, you consistently 
            favor <span className="text-cream">atmosphere, restraint, and emotional accumulation</span> over immediacy.
          </p>
          
          <p className="text-muted-foreground leading-relaxed">
            Your listening reveals someone who treats melancholy as a form of comfort rather than 
            something to resolve. You trust <span className="text-cream">atmosphere before confession</span>, 
            preferring records that create space rather than fill it.
          </p>
          
          <p className="text-muted-foreground leading-relaxed">
            The records that stay with you tend to share a quality of 
            <span className="text-cream"> nocturnal introspection</span> — music that sounds best after midnight, 
            in solitude, when emotional precision matters more than entertainment.
          </p>
        </div>
        
        {/* Sonic tendencies */}
        <div className="border-t border-border/20 pt-8 mb-12">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-6">
            Emotional & Sonic Tendencies
          </p>
          
          <div className="flex flex-wrap gap-3">
            {['Atmosphere', 'Melancholy', 'Restraint', 'Texture', 'Nocturnal', 'Intimacy'].map((tag) => (
              <span 
                key={tag}
                className="px-4 py-2 border border-burgundy/30 text-cream/80 text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        
        <button
          onClick={onContinue}
          className="w-full py-4 border border-cream/30 text-cream hover:bg-cream/5 transition-all duration-700"
        >
          Find my rooms
        </button>
      </div>
    </div>
  )
}

// ============================================
// ROOMS REVEAL - Cultural Placement (NOT recommendations)
// ============================================
function RoomsRevealStep({ onContinue }: { onContinue: () => void }) {
  // Get rooms that resonate based on affinity system
  const resonatingRooms = getResonatingRooms().slice(0, 3)

  return (
    <div className="flex-1 flex flex-col px-8 py-16">
      <div className="animate-fade-in max-w-md mx-auto w-full">
        <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-4 text-center">
          You may feel most at home in
        </p>
        
        <h2 className="font-serif text-2xl md:text-3xl text-cream mb-6 text-center">
          Rooms That Resonate With Your Listening
        </h2>
        
        {/* Editorial framing - NOT recommendation language */}
        <p className="text-center text-muted-foreground text-sm mb-8 leading-relaxed">
          These are not suggestions. These are listening cultures that 
          align with your emotional tendencies.
        </p>
        
        <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-10" />
        
        <div className="space-y-4 mb-12">
          {resonatingRooms.map((affinity, i) => (
            <div 
              key={affinity.roomSlug}
              className={cn(
                "p-5 border bg-card/10 animate-fade-in-up",
                affinity.resonance === 'deep' 
                  ? "border-burgundy/40 bg-burgundy/5" 
                  : "border-border/20"
              )}
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-serif text-lg text-cream">{affinity.roomName}</h3>
                {affinity.resonance === 'deep' && (
                  <span className="text-[9px] uppercase tracking-[0.2em] text-burgundy border border-burgundy/50 px-2 py-0.5">
                    Primary
                  </span>
                )}
              </div>
              
              {/* Why this room resonates - editorial language */}
              <p className="text-sm text-cream/70 italic leading-relaxed mb-3">
                "{affinity.resonanceExplanation}"
              </p>
              
              {/* Emotional threads */}
              <div className="flex flex-wrap gap-2">
                {affinity.emotionalThreads.slice(0, 2).map((thread) => (
                  <span 
                    key={thread}
                    className="text-[10px] text-muted-foreground border border-border/20 px-2 py-0.5"
                  >
                    {thread}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        {/* Join language - cultural, not transactional */}
        <button
          onClick={onContinue}
          className="w-full py-4 bg-burgundy/80 border border-burgundy text-cream hover:bg-burgundy transition-all duration-500 mb-3"
        >
          Enter these listening cultures
        </button>
        
        <button
          onClick={onContinue}
          className="w-full py-3 text-muted-foreground hover:text-cream transition-colors text-sm"
        >
          I&apos;ll explore the rooms myself
        </button>
      </div>
    </div>
  )
}

// ============================================
// COMPLETE - Welcome to LongPlay
// ============================================
function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-16 text-center min-h-screen">
      <div className="animate-fade-in max-w-lg">
        <h2 className="font-serif text-4xl md:text-5xl text-cream mb-6">
          Welcome to LongPlay
        </h2>
        
        <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-8" />
        
        <p className="text-muted-foreground leading-relaxed mb-4">
          Your listening identity is ready.
        </p>
        
        <p className="text-muted-foreground leading-relaxed mb-12">
          Explore your profile, enter your rooms, and let your 
          understanding of yourself through music deepen over time.
        </p>
        
        <button
          onClick={onFinish}
          className="px-12 py-4 border border-cream/30 text-cream hover:bg-cream/5 transition-all duration-700"
        >
          Enter LongPlay
        </button>
      </div>
    </div>
  )
}
