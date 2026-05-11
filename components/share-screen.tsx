'use client'

import { ArtifactGallery } from '@/components/shareable-artifacts'

export function ShareScreen() {
  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-24">
      {/* Header */}
      <section className="px-6 pt-16 pb-12 md:px-12 lg:px-24">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.25em] text-tobacco mb-4">
            Your identity, shareable
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-cream mb-6 leading-tight">
            Identity Artifacts
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Beautiful, collectible representations of your listening identity. 
            Share them, save them, or simply appreciate them.
          </p>
        </div>
      </section>

      {/* Artifact Gallery */}
      <section className="px-6 py-12 md:px-12 lg:px-24">
        <ArtifactGallery />
      </section>
    </div>
  )
}
