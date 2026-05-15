'use client'

/**
 * MomentComposer — Phase 3A minimal moment creation UI.
 *
 * Supports: Mark · Annotate · Reflect · Save
 * All moments default to visibility=private.
 * Requires authentication; shows sign-in prompt for anonymous users.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { createMoment, type MomentType } from '@/lib/actions/moments'

interface MomentComposerProps {
  albumId: string
  roomSlug?: string
  cycleId?: string
}

type Tab = 'mark' | 'annotate' | 'reflect' | 'save'

const TAB_CONFIG: Record<Tab, {
  label: string
  type: MomentType
  placeholder: string
  defaultContent: string
  needsContent: boolean
  rows: number
}> = {
  mark: {
    label: 'Mark',
    type: 'mark',
    placeholder: '',
    defaultContent: '✓',
    needsContent: false,
    rows: 0,
  },
  annotate: {
    label: 'Annotate',
    type: 'annotation',
    placeholder: 'What are you hearing? A moment, a texture, a feeling...',
    defaultContent: '',
    needsContent: true,
    rows: 3,
  },
  reflect: {
    label: 'Reflect',
    type: 'reflection',
    placeholder: 'A longer reflection on this album — what it surfaces, where it takes you...',
    defaultContent: '',
    needsContent: true,
    rows: 5,
  },
  save: {
    label: 'Save',
    type: 'save',
    placeholder: '',
    defaultContent: '⭐ saved',
    needsContent: false,
    rows: 0,
  },
}

const DEV_MODE = process.env.NODE_ENV === 'development'

export function MomentComposer({ albumId, cycleId }: MomentComposerProps) {
  const { isAuthenticated } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('annotate')
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const config = TAB_CONFIG[activeTab]

  const handleSubmit = () => {
    if (config.needsContent && !content.trim()) return
    setStatus('idle')
    setErrorMsg('')

    const localTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    startTransition(async () => {
      const result = await createMoment({
        type: config.type,
        albumId,
        content: config.needsContent ? content.trim() : config.defaultContent,
        cycleId: cycleId ?? null,
        visibility: 'private',
        createdLocalTime: localTime,
      })

      if (result.success) {
        setStatus('success')
        setContent('')
        setTimeout(() => setStatus('idle'), 3000)
      } else {
        setStatus('error')
        setErrorMsg(result.error ?? 'Something went wrong')
      }
    })
  }

  // Unauthenticated state
  if (!isAuthenticated) {
    return (
      <div className="py-6 px-6 border border-border/10 bg-card/10 text-center">
        <p className="text-sm text-muted-foreground/60 mb-3">
          Sign in to capture moments from this album.
        </p>
        <Link
          href="/onboarding"
          className="text-xs uppercase tracking-[0.3em] text-tobacco hover:text-cream transition-colors"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Type tabs */}
      <div className="flex gap-1 border-b border-border/10">
        {(Object.keys(TAB_CONFIG) as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab)
              setStatus('idle')
              setContent('')
            }}
            className={cn(
              'px-4 py-2 text-[11px] uppercase tracking-[0.3em] transition-colors duration-300',
              activeTab === tab
                ? 'text-tobacco border-b border-tobacco -mb-px'
                : 'text-muted-foreground/40 hover:text-muted-foreground/70'
            )}
          >
            {TAB_CONFIG[tab].label}
          </button>
        ))}
      </div>

      {/* Input area */}
      {config.needsContent ? (
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={config.placeholder}
          rows={config.rows}
          disabled={isPending}
          className={cn(
            'w-full bg-transparent border-0 border-b border-border/20 rounded-none resize-none',
            'text-cream placeholder:text-muted-foreground/30 font-serif text-lg leading-relaxed',
            'focus:outline-none focus:border-tobacco/40 transition-colors duration-300',
            'disabled:opacity-50 px-0 py-2'
          )}
        />
      ) : (
        <p className="text-sm text-muted-foreground/50 py-2">
          {activeTab === 'mark' && 'Mark this moment in the album. No text needed.'}
          {activeTab === 'save' && 'Save this album to your collection.'}
        </p>
      )}

      {/* Footer: visibility note + submit */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/30 uppercase tracking-[0.2em]">
          Private · visible only to you
        </p>

        {status === 'success' ? (
          <span className="text-[11px] text-olive tracking-wide">
            ✓ Saved
          </span>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isPending || (config.needsContent && !content.trim())}
            className={cn(
              'px-6 py-2 text-sm border border-tobacco/30 text-tobacco',
              'hover:bg-tobacco/10 transition-all duration-500',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {/* Dev-only error */}
      {DEV_MODE && status === 'error' && errorMsg && (
        <p className="text-[10px] text-red-400/70 font-mono">⚠ {errorMsg}</p>
      )}
    </div>
  )
}
