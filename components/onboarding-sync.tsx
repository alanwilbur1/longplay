'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/components/auth-provider'
import { saveOnboardingCompletion } from '@/lib/actions/onboarding'
import { getOnboardingState } from '@/lib/onboarding-state'

const SYNC_KEY = 'longplay_onboarding_synced'

export function OnboardingSync() {
  const { user, isLoading } = useAuth()
  const hasSynced = useRef(false)

  useEffect(() => {
    if (isLoading || !user || hasSynced.current) return

    const alreadySynced = sessionStorage.getItem(SYNC_KEY) === user.id
    if (alreadySynced) return

    const state = getOnboardingState()
    if (!state?.completed) return

    hasSynced.current = true

    saveOnboardingCompletion({
      archetype: state.archetype ?? undefined,
      primaryRoomSlug: state.primaryRoom ?? undefined,
      connectedServices: state.connectedServices ?? [],
      calibrationAnswers: state.calibrationAnswers ?? {},
    }).then(result => {
      if (result.success || result.skipped) {
        sessionStorage.setItem(SYNC_KEY, user.id)
      }
    }).catch(err => {
      console.warn('[OnboardingSync] sync failed silently:', err)
      hasSynced.current = false
    })
  }, [user, isLoading])

  return null
}
