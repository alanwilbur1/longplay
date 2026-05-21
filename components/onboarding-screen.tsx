'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AlbumCover } from '@/components/album-cover'
import { ALBUMS } from '@/lib/albums'
import {
  getOnboardingState,
  saveOnboardingState,
} from '@/lib/onboarding-state'
import { getResonatingRooms, ROOM_AFFINITIES } from '@/lib/room-affinity'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { ensureUserProfile } from '@/lib/actions/auth'
import { saveOnboardingCompletion, getOnboardingStatus } from '@/lib/actions/onboarding'
import { initiateConnection, listMyConnections } from '@/lib/actions/streaming'

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

// `/onboarding` is an authenticated-only surface (gated by proxy.ts).
// The first three steps of the wizard — `opening` (marketing splash with
// "Begin" + "Already a member? Log in"), `connect` (streaming-service
// connection prompt), and `importing` (atmospheric loading screen) —
// were designed for pre-auth visitors. Signed-in listeners arriving
// from /sign-in must skip them and land directly on the first real
// calibration step.
// Steps that belonged to the pre-auth marketing/loading flow. Now that
// the proxy redirects unauth to /sign-in, none of these are reachable
// with a session — they are excluded from the wizard's restore and
// next-step logic. 'connect' is intentionally NOT here anymore: it is
// now the FIRST authenticated step (streaming connection prompt that
// actually wires to listening_connections via lib/actions/streaming).
const PRE_AUTH_STEPS: ReadonlySet<Step> = new Set(['opening', 'importing'])
const FIRST_AUTHENTICATED_STEP: Step = 'connect'

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

const DEV_MODE = process.env.NODE_ENV === 'development'

export function OnboardingScreen() {
  const router = useRouter()
  // Default to the first authenticated step. The proxy guarantees that
  // anyone reaching /onboarding has a Supabase session, so the pre-auth
  // marketing splash should never render here.
  const [currentStep, setCurrentStep] = useState<Step>(FIRST_AUTHENTICATED_STEP)
  const [connectedServices, setConnectedServices] = useState<string[]>([])
  const [calibrationAnswers, setCalibrationAnswers] = useState<Record<string, string[]>>({})
  const [buildProgress, setBuildProgress] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)
  const [debugStatus, setDebugStatus] = useState('loading onboarding state')
  const [devDiagInfo, setDevDiagInfo] = useState<{
    authenticated: boolean
    userId: string
    onboardingCompleted: boolean
    decision: string
  } | null>(null)

  // Check if onboarding is already completed.
  // Auth must resolve before we trust any completion flag:
  // localStorage is treated as a cache only when an active Supabase session
  // exists. Without a session the localStorage flag is stale (from a prior
  // signed-in session) and must be ignored to prevent a redirect loop.
  useEffect(() => {
    setDebugStatus('checking auth + onboarding state')
    const supabase = getSupabaseBrowserClient()

    function showOnboardingFlow() {
      const savedState = getOnboardingState()
      // Only restore an in-progress step that is a real authenticated
      // wizard step. Pre-auth steps (opening/connect/importing) and the
      // terminal 'complete' step are ignored — a stale saved value
      // must not bring the marketing splash back for a signed-in user.
      const saved = savedState.currentStep as Step | undefined
      const isResumableStep =
        !!saved &&
        STEPS.includes(saved) &&
        saved !== 'complete' &&
        !PRE_AUTH_STEPS.has(saved)
      const resolved: Step = isResumableStep ? saved! : FIRST_AUTHENTICATED_STEP
      const ignored = !!saved && !isResumableStep

      setCurrentStep(resolved)

      if (DEV_MODE) {
        console.log('[onboarding] step resolution', {
          savedCurrentStep: saved ?? null,
          resolvedCurrentStep: resolved,
          ignored,
          reason: ignored
            ? saved === 'complete'
              ? 'terminal step'
              : PRE_AUTH_STEPS.has(saved as Step)
                ? 'pre-auth step'
                : 'unknown step'
            : saved
              ? 'resumed from saved'
              : 'no saved step',
        })
      }

      // If we ignored a stale pre-auth saved step, immediately rewrite
      // localStorage with the resolved step so the next load starts
      // clean — don't wait for the save-effect to flush.
      if (ignored) {
        saveOnboardingState({
          currentStep: resolved,
          connectedServices: savedState.connectedServices,
          calibrationAnswers: savedState.calibrationAnswers,
        })
      }

      if (savedState.connectedServices) {
        setConnectedServices(savedState.connectedServices)
      }
      if (savedState.calibrationAnswers) {
        setCalibrationAnswers(savedState.calibrationAnswers)
      }
      setDebugStatus('ready')
      setIsInitialized(true)
    }

    supabase.auth.getUser()
      .then(({ data: { user } }) => {
        if (DEV_MODE) {
          console.log('[onboarding] auth check', {
            authenticatedUserId: user?.id ?? null,
            hasSession: !!user,
          })
        }
        if (!user) {
          // No active session. localStorage is not an identity source;
          // we never read it for completion. Just show the wizard chrome
          // (the proxy will have redirected to /sign-in for protected
          // surfaces; this branch is mainly defensive).
          setDebugStatus('unauthenticated — showing onboarding flow')
          if (DEV_MODE) setDevDiagInfo({ authenticated: false, userId: '', onboardingCompleted: false, decision: 'show onboarding flow' })
          showOnboardingFlow()
          return
        }

        // Authenticated — DB is the sole source of truth for completion.
        // .maybeSingle() so a transient missing row (handle_new_user trigger
        // race) returns null instead of a 406, letting the wizard render.
        return supabase
          .from('user_profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            const profile = data as { onboarding_completed: boolean } | null
            const completed = profile?.onboarding_completed ?? false
            if (DEV_MODE) setDevDiagInfo({ authenticated: true, userId: user.id, onboardingCompleted: completed, decision: completed ? 'redirect → / (DB)' : 'show onboarding flow' })
            if (completed) {
              setDebugStatus('completed (db) — redirecting to home')
              router.replace('/')
            } else {
              showOnboardingFlow()
            }
          })
      })
      .catch(() => showOnboardingFlow())
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
    // Skip any pre-auth step in the natural sequence. After 'connect'
    // (the first auth step), STEPS[i+1] is 'importing' — a pre-auth
    // atmospheric pause from the old flow that no longer fits. We
    // advance to the next non-pre-auth step instead.
    let nextIndex = currentIndex + 1
    while (
      nextIndex < STEPS.length &&
      PRE_AUTH_STEPS.has(STEPS[nextIndex])
    ) {
      nextIndex += 1
    }
    if (nextIndex >= STEPS.length) return
    const nextStep = STEPS[nextIndex]
    setCurrentStep(nextStep)

    if (nextStep === 'building') {
      simulateBuild()
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

  const [sessionCheckError, setSessionCheckError] = useState('')
  const [isLoginMode, setIsLoginMode] = useState(false)

  // Single canonical "commit + exit" path. Called by both the auto-skip
  // useEffect inside CompleteStep AND by the visible "Enter LongPlay"
  // button. Blocks the redirect on a verified DB write — onboarding_completed
  // must read back as `true` from user_profiles before we leave the wizard.
  const handleComplete = async () => {
    if (DEV_MODE) {
      console.log('[onboarding] handleComplete: button clicked', {
        currentStep,
      })
    }

    setSessionCheckError('')

    const supabase = getSupabaseBrowserClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (DEV_MODE) {
      console.log('[onboarding] handleComplete: session check', {
        authenticatedUserId: user?.id ?? null,
      })
    }

    if (!user) {
      setSessionCheckError('Session not found. Please sign in again.')
      return
    }

    if (DEV_MODE) {
      console.log('[onboarding] handleComplete: save start', { userId: user.id })
    }

    // Primary: server action (cookie-bound; uses upsert internally).
    const saveResult = await saveOnboardingCompletion({
      archetype: 'The Midnight Archivist',
      connectedServices,
      calibrationAnswers,
    })

    if (DEV_MODE) {
      console.log('[onboarding] handleComplete: server-action result', saveResult)
    }

    // Fallback: browser-client upsert if the server action could not see
    // the session cookie (Replit cross-site iframe). Uses upsert so a
    // missing row is created — never silently no-ops like UPDATE.
    // MUST include display_name; column is NOT NULL and the upsert
    // payload bypasses the column DEFAULT on INSERT.
    if (!saveResult.success) {
      const fallbackDisplayName =
        (user.email ?? '').split('@')[0]?.trim() || 'Listener'
      const { data: fbRow, error: fbError } = await supabase
        .from('user_profiles')
        .upsert(
          {
            id: user.id,
            display_name: fallbackDisplayName,
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        )
        .select('id, display_name, onboarding_completed')
        .maybeSingle()

      if (DEV_MODE) {
        console.log('[onboarding] handleComplete: browser fallback upsert', {
          error: fbError ? { code: fbError.code, message: fbError.message } : null,
          row: fbRow,
        })
      }
    }

    // VERIFY: re-read user_profiles directly. Only redirect if the row
    // reads back as onboarding_completed === true.
    const { data: confirmRow, error: confirmError } = await supabase
      .from('user_profiles')
      .select('id, display_name, onboarding_completed')
      .eq('id', user.id)
      .maybeSingle()

    if (DEV_MODE) {
      console.log('[onboarding] handleComplete: post-save verify', {
        readError: confirmError ? { code: confirmError.code, message: confirmError.message } : null,
        row: confirmRow,
      })
    }

    const onboardingCompletedRead =
      (confirmRow as { onboarding_completed: boolean } | null)
        ?.onboarding_completed ?? false

    if (!onboardingCompletedRead) {
      const detail = confirmError?.message ?? saveResult.error ?? 'unknown error'
      setSessionCheckError(
        `Could not save your onboarding (${detail}). Please try again.`,
      )
      return
    }

    // CRITICAL: sync the BROWSER client's auth state with the server-set
    // session before navigating. Server actions and server-side redirects
    // (verifyCode, etc.) write auth cookies but do NOT trigger
    // onAuthStateChange on the browser client. AuthProvider's useEffect
    // only runs on initial mount, so without this refresh its cached
    // {user:null, isAuthenticated:false} state survives the whole flow —
    // every client component reading useAuth() then sees signed-out, even
    // though the cookie is valid. refreshSession() fetches a new session
    // from Supabase and FIRES onAuthStateChange, so AuthProvider's
    // subscription updates state and useAuth() returns the real user.
    const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession()

    if (DEV_MODE) {
      console.log('[onboarding] handleComplete: pre-redirect session sync', {
        hasSessionAfterRefresh: !!refreshData?.session,
        refreshedUserId: refreshData?.user?.id ?? null,
        refreshError: refreshError
          ? { message: refreshError.message, status: refreshError.status }
          : null,
      })
    }

    if (DEV_MODE) {
      console.log('[onboarding] handleComplete: redirect target', '/')
    }

    router.replace('/')
    // Re-render server components against the latest cookies — covers the
    // case where the proxy already saw the session but app/page.tsx was
    // computed against stale request state.
    router.refresh()
  }

  // OTP-verify path inside CompleteStep delegates to handleComplete now
  // that it owns the await-and-verify dance. Kept as a wrapper for the
  // existing prop shape; no separate persistence path.
  const handleAuthSuccess = handleComplete

  // Show loading while checking onboarding state
  if (!isInitialized) {
    return (
      <div className="grain min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto border border-tobacco/30 rounded-full animate-pulse mb-4" />
          {DEV_MODE && (
            <p className="text-[10px] text-tobacco/50 uppercase tracking-wider">
              {debugStatus}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grain min-h-screen bg-background flex flex-col overflow-hidden">

      {/* Login mode — bypass all onboarding steps */}
      {isLoginMode && (
        <LoginStep
          onBack={() => setIsLoginMode(false)}
          onContinueOnboarding={() => {
            setIsLoginMode(false)
            // Always land in the authenticated wizard. Never re-enter
            // the pre-auth steps from a post-login bounce.
            setCurrentStep(FIRST_AUTHENTICATED_STEP)
          }}
        />
      )}

      {!isLoginMode && (
        <>
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
        {currentStep === 'opening' && (
          <OpeningStep
            onContinue={handleContinue}
            onLogin={() => setIsLoginMode(true)}
          />
        )}
        
        {currentStep === 'connect' && (
          <ConnectStep onContinue={handleContinue} />
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
          <CompleteStep
            onFinish={handleComplete}
            onAuthSuccess={handleAuthSuccess}
            sessionCheckError={sessionCheckError}
          />
        )}
      </div>
      </>
      )}

      {/* Dev-mode diagnostic overlay — remove before launch */}
      {DEV_MODE && devDiagInfo && (
        <div className="fixed bottom-3 left-3 z-50 text-[9px] font-mono text-muted-foreground/25 leading-relaxed pointer-events-none select-none">
          <p>auth:{String(devDiagInfo.authenticated)} · uid:{devDiagInfo.userId ? devDiagInfo.userId.slice(0, 8) + '…' : '—'}</p>
          <p>completed:{String(devDiagInfo.onboardingCompleted)}</p>
          <p>→ {devDiagInfo.decision}</p>
        </div>
      )}
    </div>
  )
}

// ============================================
// OPENING - Cinematic Brand Thesis
// ============================================
function OpeningStep({ onContinue, onLogin }: { onContinue: () => void; onLogin: () => void }) {
  // In dev mode, show all phases immediately so the Begin button is always visible
  const [phase, setPhase] = useState(DEV_MODE ? 3 : 0)
  
  useEffect(() => {
    if (DEV_MODE) return // Skip animation in dev
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 2800),
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

          <div className="mt-8">
            <button
              onClick={onLogin}
              className="text-[11px] text-muted-foreground/50 hover:text-cream/60 transition-colors duration-500 uppercase tracking-[0.3em]"
            >
              Already a member? Log in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// CONNECT - Open Your Listening History (real)
// ============================================
// Reads listening_connections via listMyConnections(); shows Connect
// Spotify wired to initiateConnection (OAuth round-trip back to
// /onboarding via the state cookie's returnTo). Apple Music is
// scaffolded honestly as "Coming soon". A "Skip for now" link lets
// the listener proceed without any connection.
function ConnectStep({
  connectedServices: _legacyUnused,
  onContinue,
}: {
  services?: typeof STREAMING_SERVICES
  connectedServices?: string[]
  onConnect?: (id: string) => void
  onContinue: () => void
}) {
  // _legacyUnused is the old in-memory connectedServices list; we no
  // longer use it. Real connection state comes from the DB.
  void _legacyUnused
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState<
    Array<{ source_id: string; display_name: string | null; status: string }>
  >([])

  useEffect(() => {
    let mounted = true
    listMyConnections()
      .then((rows) => {
        if (!mounted) return
        setConnections(
          rows.map((r) => ({
            source_id: r.source_id,
            display_name: r.display_name,
            status: r.status,
          })),
        )
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const spotify = connections.find((c) => c.source_id === 'spotify' && c.status === 'active')

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
          Connecting helps LongPlay understand your listening.
          <br />
          You can always do this later.
        </p>

        <div className="space-y-3 mb-10">
          {/* Spotify — real connect via OAuth */}
          {spotify ? (
            <div className="w-full flex items-center justify-between p-4 border border-olive/50 bg-olive/5">
              <div className="flex flex-col items-start text-left">
                <span className="text-cream">Spotify</span>
                {spotify.display_name && (
                  <span className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {spotify.display_name}
                  </span>
                )}
              </div>
              <span className="text-xs text-olive uppercase tracking-wider">Connected</span>
            </div>
          ) : (
            <form action={initiateConnection}>
              <input type="hidden" name="source" value="spotify" />
              <input type="hidden" name="returnTo" value="/onboarding" />
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-between p-4 border border-border/20 hover:border-cream/30 hover:bg-card/20 transition-all duration-500 disabled:opacity-50"
              >
                <span className="text-cream">Spotify</span>
                <span className="text-xs text-muted-foreground">Connect</span>
              </button>
            </form>
          )}

          {/* Apple Music — honest scaffold state */}
          <div
            className="w-full flex items-center justify-between p-4 border border-border/20 opacity-50"
            aria-disabled="true"
          >
            <span className="text-cream">Apple Music</span>
            <span className="text-xs text-muted-foreground">Coming soon</span>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full py-4 border border-cream/30 text-cream hover:bg-cream/5 transition-all duration-500"
        >
          {spotify ? 'Continue' : 'Skip for now'}
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
// ── Auth error helper ──────────────────────────────────────────────────────
function friendlyAuthError(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('database error saving new user'))
    return 'Supabase could not create your account. Ask the developer to apply lib/schema-patch.sql.'
  if (msg.includes('rate limit') || msg.includes('too many'))
    return 'Too many attempts. Please wait a minute and try again.'
  if (msg.includes('invalid email'))
    return 'Please enter a valid email address.'
  if (msg.includes('user not found') || msg.includes('no user found'))
    return 'No account found for this email.'
  if ((msg.includes('token') || msg.includes('otp')) && (msg.includes('expired') || msg.includes('invalid')))
    return 'This code has expired or is incorrect. Request a new one below.'
  return message
}

type AuthPhase = 'email' | 'otp' | 'success'

function CompleteStep({ onFinish, onAuthSuccess, sessionCheckError = '' }: {
  onFinish: () => void
  onAuthSuccess: () => void
  sessionCheckError?: string
}) {
  const [phase, setPhase] = useState<AuthPhase>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [sendError, setSendError] = useState('')
  const [otpError, setOtpError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const skippedRef = useRef(false)

  // If the listener arrived here already signed in (canonical flow:
  // /sign-in → OTP → /onboarding → calibration → here), skip the
  // redundant second OTP entirely. Route through onFinish so the same
  // await-and-verify persistence path runs as when the button is clicked.
  useEffect(() => {
    if (skippedRef.current) return
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && !skippedRef.current) {
        skippedRef.current = true
        setPhase('success')
        onFinish()
      }
    })
  }, [onFinish])

  // Countdown ticker for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // Send an 8-digit OTP code to `targetEmail` — no magic link, no redirect
  const sendCode = async (targetEmail: string): Promise<boolean> => {
    setIsSending(true)
    setSendError('')
    const supabase = getSupabaseBrowserClient()

    console.log('[OTP FLOW]', { email: targetEmail, mode: 'otp-only' })

    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined,
      },
    })

    setIsSending(false)

    if (error) {
      setSendError(friendlyAuthError(error.message))
      return false
    }

    setResendCooldown(60)
    return true
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || isSending) return
    const ok = await sendCode(email)
    if (ok) setPhase('otp')
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 8 || isVerifying) return
    setIsVerifying(true)
    setOtpError('')

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })

    if (error) {
      setOtpError(friendlyAuthError(error.message))
      setIsVerifying(false)
      return
    }

    // Session is now established — upsert profile via server action
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await ensureUserProfile(user.id, user.email ?? '', user.user_metadata ?? {})
    }

    setPhase('success')
    // Call onAuthSuccess directly — it owns the DB completion write and
    // the router.replace('/') with a 1.4s delay so the success state is visible.
    onAuthSuccess()
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || isSending) return
    setOtp('')
    setOtpError('')
    await sendCode(email)
  }

  const handleChangeEmail = () => {
    setPhase('email')
    setOtp('')
    setOtpError('')
    setSendError('')
  }

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-16 text-center min-h-screen">
      <div className="animate-fade-in max-w-lg w-full">
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

        {sessionCheckError && (
          <p className="font-serif text-sm text-burgundy/80 italic mt-6 max-w-sm mx-auto">
            {sessionCheckError}
          </p>
        )}

        {/* ── Auth section ───────────────────────────────────────────────── */}
        <div className="mt-10 pt-8 border-t border-border/10 min-h-[160px]">

          {/* Phase: success */}
          {phase === 'success' && (
            <div className="animate-fade-in flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border border-olive/40 flex items-center justify-center">
                <svg className="w-4 h-4 text-olive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-sm text-olive">Signed in. Taking you home…</p>
            </div>
          )}

          {/* Phase: email entry */}
          {phase === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-4 animate-fade-in">
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                Save your identity to return from any device
              </p>

              <div className="flex gap-2 max-w-sm mx-auto">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  autoComplete="email"
                  disabled={isSending}
                  className={cn(
                    "flex-1 bg-transparent border border-border/30 px-4 py-2.5 text-sm text-cream",
                    "placeholder:text-muted-foreground/40 focus:outline-none focus:border-tobacco/50",
                    "transition-colors duration-300 disabled:opacity-50"
                  )}
                />
                <button
                  type="submit"
                  disabled={isSending || !email}
                  className={cn(
                    "px-5 py-2.5 text-sm border border-tobacco/40 text-tobacco",
                    "hover:bg-tobacco/10 transition-all duration-500",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  {isSending ? '…' : 'Send code'}
                </button>
              </div>

              {sendError && (
                <p className="text-[11px] text-red-400/80 animate-fade-in max-w-sm mx-auto">
                  {sendError}
                </p>
              )}

              <p className="text-[10px] text-muted-foreground/40">
                We'll email you an 8-digit verification code. No password needed.
              </p>
            </form>
          )}

          {/* Phase: OTP entry */}
          {phase === 'otp' && (
            <div className="space-y-5 animate-fade-in">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                  Enter the verification code sent to
                </p>
                <p className="text-sm text-tobacco">{email}</p>
              </div>

              <form onSubmit={handleVerifyCode} className="space-y-3 max-w-xs mx-auto">
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="00000000"
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={isVerifying}
                  maxLength={8}
                  className={cn(
                    "w-full bg-transparent border border-border/30 px-4 py-3",
                    "text-center text-2xl text-cream tracking-[0.6em] font-mono",
                    "placeholder:text-muted-foreground/20 placeholder:tracking-[0.6em]",
                    "focus:outline-none focus:border-tobacco/50 transition-colors duration-300",
                    "disabled:opacity-50",
                    otpError && "border-red-400/40"
                  )}
                />

                <button
                  type="submit"
                  disabled={isVerifying || otp.length < 8}
                  className={cn(
                    "w-full py-2.5 text-sm border border-tobacco/40 text-tobacco",
                    "hover:bg-tobacco/10 transition-all duration-500",
                    "disabled:opacity-40 disabled:cursor-not-allowed"
                  )}
                >
                  {isVerifying ? 'Verifying…' : 'Verify code'}
                </button>
              </form>

              {otpError && (
                <p className="text-[11px] text-red-400/80 animate-fade-in">
                  {otpError}
                </p>
              )}

              {/* Resend + change email */}
              <div className="flex items-center justify-center gap-4 text-[11px]">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || isSending}
                  className="text-tobacco hover:text-cream transition-colors disabled:opacity-40 disabled:cursor-default"
                >
                  {isSending
                    ? 'Sending…'
                    : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : 'Resend code'}
                </button>
                <span className="text-muted-foreground/30">·</span>
                <button
                  type="button"
                  onClick={handleChangeEmail}
                  className="text-muted-foreground/60 hover:text-cream transition-colors"
                >
                  Use different email
                </button>
              </div>

              {sendError && (
                <p className="text-[11px] text-red-400/60 animate-fade-in">
                  {sendError}
                </p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ============================================
// LOGIN - Returning-user fast path
// ============================================
// Shown instead of the full onboarding flow when the user clicks
// "Already a member? Log in". After OTP verify:
//   onboarding_completed = true  → router.replace('/')
//   onboarding_completed = false → onContinueOnboarding() (resumes at connect step)
function LoginStep({
  onBack,
  onContinueOnboarding,
}: {
  onBack: () => void
  onContinueOnboarding: () => void
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<AuthPhase>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [sendError, setSendError] = useState('')
  const [otpError, setOtpError] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [devDiag, setDevDiag] = useState('')
  const skippedRef = useRef(false)

  // Already signed in (e.g. user reached this surface through some other
  // route while a session exists). Bypass the OTP entry; route them based
  // on DB onboarding state, same as the post-verify path below.
  useEffect(() => {
    if (skippedRef.current) return
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || skippedRef.current) return
      skippedRef.current = true
      setPhase('success')
      const { data: profileRow } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .maybeSingle()
      const completed =
        (profileRow as { onboarding_completed: boolean } | null)
          ?.onboarding_completed ?? false
      setTimeout(() => {
        if (completed) router.replace('/')
        else onContinueOnboarding()
      }, 600)
    })
  }, [router, onContinueOnboarding])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  const sendCode = async (targetEmail: string): Promise<boolean> => {
    setIsSending(true)
    setSendError('')
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { shouldCreateUser: true, emailRedirectTo: undefined },
    })
    setIsSending(false)
    if (error) {
      setSendError(friendlyAuthError(error.message))
      return false
    }
    setResendCooldown(60)
    return true
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || isSending) return
    const ok = await sendCode(email)
    if (ok) setPhase('otp')
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 6 || isVerifying) return
    setIsVerifying(true)
    setOtpError('')

    const supabase = getSupabaseBrowserClient()
    const { data: otpData, error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })

    if (error) {
      setOtpError(friendlyAuthError(error.message))
      setIsVerifying(false)
      return
    }

    // Use the user returned directly by verifyOtp — avoids a race against
    // session hydration that causes false-negative "no session" errors.
    // If verifyOtp didn't embed a user (edge case), poll briefly before failing.
    let user = otpData?.user ?? null

    if (!user) {
      for (let attempt = 0; attempt < 6; attempt++) {
        await new Promise(r => setTimeout(r, 300))
        const { data: { user: polled } } = await supabase.auth.getUser()
        if (polled) { user = polled; break }
      }
    }

    if (!user) {
      setOtpError('Could not retrieve session. Please try again.')
      setIsVerifying(false)
      return
    }

    await ensureUserProfile(user.id, user.email ?? '', user.user_metadata ?? {})

    // Step 1 — try the server action (fast path when cookies are readable).
    // Only trust it when it positively confirms onboarding_completed = true.
    // A false/null result from the server side is always reverified below.
    let dbCheckSource: 'server-action' | 'browser-client' = 'server-action'
    let onboardingCompleted = false

    const serverStatus = await getOnboardingStatus()

    if (serverStatus.authenticated && serverStatus.onboardingCompleted) {
      // Server confirmed true — no further check needed.
      dbCheckSource = 'server-action'
      onboardingCompleted = true
    } else {
      // Server returned false or unauthenticated.
      // Always re-verify with the browser client using the exact user.id from
      // verifyOtp — this is immune to cross-site cookie timing and auth uid
      // mismatches between the server session and the verifyOtp response.
      dbCheckSource = 'browser-client'
      const { data: profileRow } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .maybeSingle()
      onboardingCompleted =
        (profileRow as { onboarding_completed: boolean } | null)
          ?.onboarding_completed ?? false
    }

    // Hard guard: if DB says completed, never call onContinueOnboarding.
    const finalDecision: 'home' | 'onboarding' = onboardingCompleted ? 'home' : 'onboarding'

    if (process.env.NODE_ENV === 'development') {
      setDevDiag(
        `dbSource:${dbCheckSource} completed:${String(onboardingCompleted)} → ${finalDecision}`
      )
    }

    setPhase('success')

    if (finalDecision === 'home') {
      // DB is the source of truth — no localStorage write.
      setTimeout(() => router.replace('/'), 1000)
    } else {
      setTimeout(() => onContinueOnboarding(), 1000)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || isSending) return
    setOtp('')
    setOtpError('')
    await sendCode(email)
  }

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-8 py-16 text-center min-h-screen">
      <div className="animate-fade-in max-w-lg w-full">

        <h2 className="font-serif text-4xl md:text-5xl text-cream mb-4">
          Welcome back
        </h2>

        <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-8" />

        <p className="text-muted-foreground leading-relaxed mb-12">
          Enter your email to receive a verification code.
        </p>

        {/* Success */}
        {phase === 'success' && (
          <div className="animate-fade-in flex flex-col items-center gap-3 min-h-[160px] justify-center">
            <div className="w-8 h-8 rounded-full border border-olive/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-olive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-sm text-olive">Signed in. Taking you home…</p>
            {process.env.NODE_ENV === 'development' && devDiag && (
              <p className="text-[10px] font-mono text-muted-foreground/40 mt-2 max-w-xs break-all">
                {devDiag}
              </p>
            )}
          </div>
        )}

        {/* Email entry */}
        {phase === 'email' && (
          <form onSubmit={handleSendCode} className="space-y-4 animate-fade-in">
            <div className="flex gap-2 max-w-sm mx-auto">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
                autoFocus
                disabled={isSending}
                className={cn(
                  "flex-1 bg-transparent border border-border/30 px-4 py-2.5 text-sm text-cream",
                  "placeholder:text-muted-foreground/40 focus:outline-none focus:border-tobacco/50",
                  "transition-colors duration-300 disabled:opacity-50"
                )}
              />
              <button
                type="submit"
                disabled={isSending || !email}
                className={cn(
                  "px-5 py-2.5 text-sm border border-tobacco/40 text-tobacco",
                  "hover:bg-tobacco/10 transition-all duration-500",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                {isSending ? '…' : 'Send code'}
              </button>
            </div>
            {sendError && (
              <p className="text-[11px] text-red-400/80 animate-fade-in max-w-sm mx-auto">
                {sendError}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/40">
              We'll email you an 8-digit verification code. No password needed.
            </p>
          </form>
        )}

        {/* OTP entry */}
        {phase === 'otp' && (
          <div className="space-y-5 animate-fade-in">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                Enter the verification code sent to
              </p>
              <p className="text-sm text-tobacco">{email}</p>
            </div>

            <form onSubmit={handleVerifyCode} className="space-y-3 max-w-xs mx-auto">
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="000000"
                required
                autoComplete="one-time-code"
                autoFocus
                disabled={isVerifying}
                maxLength={8}
                className={cn(
                  "w-full bg-transparent border border-border/30 px-4 py-3",
                  "text-center text-2xl text-cream tracking-[0.6em] font-mono",
                  "placeholder:text-muted-foreground/20 placeholder:tracking-[0.6em]",
                  "focus:outline-none focus:border-tobacco/50 transition-colors duration-300",
                  "disabled:opacity-50",
                  otpError && "border-red-400/40"
                )}
              />
              <button
                type="submit"
                disabled={isVerifying || otp.length < 6}
                className={cn(
                  "w-full py-2.5 text-sm border border-tobacco/40 text-tobacco",
                  "hover:bg-tobacco/10 transition-all duration-500",
                  "disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                {isVerifying ? 'Verifying…' : 'Verify code'}
              </button>
            </form>

            {otpError && (
              <p className="text-[11px] text-red-400/80 animate-fade-in">
                {otpError}
              </p>
            )}

            <div className="flex items-center justify-center gap-4 text-[11px]">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || isSending}
                className="text-tobacco hover:text-cream transition-colors disabled:opacity-40 disabled:cursor-default"
              >
                {isSending
                  ? 'Sending…'
                  : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend code'}
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={() => { setPhase('email'); setOtp(''); setOtpError('') }}
                className="text-muted-foreground/60 hover:text-cream transition-colors"
              >
                Use different email
              </button>
            </div>
          </div>
        )}

        {/* Back to opening */}
        {phase !== 'success' && (
          <div className="mt-12">
            <button
              onClick={onBack}
              className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors uppercase tracking-[0.3em]"
            >
              ← Back
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
