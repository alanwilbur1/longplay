'use client'

import { useEffect, useRef, useState } from 'react'

interface CodeEntryProps {
  /** Length of the OTP. Defaults to 8 (LongPlay's Supabase setting). */
  length?: number
  /** Hidden form input name. The server action reads form.get('code'). */
  name?: string
  /** Form id this component should submit when the code is complete. */
  formId: string
  /** Auto-focus the first cell on mount. */
  autoFocus?: boolean
}

/**
 * Cinematic 8-cell OTP input.
 *
 * - Each cell holds one digit.
 * - Typing a digit auto-advances.
 * - Backspace on an empty cell steps back.
 * - Pasting any 6–10 digit string distributes across the cells and
 *   auto-submits if it fills them all.
 * - The combined value is written into a single hidden input the server
 *   action reads.
 *
 * Intentional choices:
 * - No visible "Verify" button label noise — the form has its own submit
 *   button below. This component is purely the input.
 * - No browser autofill behavior leaks ("one-time-code" autocomplete is
 *   set so iOS / Android still pull from SMS/email).
 */
export function CodeEntry({
  length = 8,
  name = 'code',
  formId,
  autoFocus = true,
}: CodeEntryProps) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(''))
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const combined = digits.join('')

  useEffect(() => {
    if (autoFocus) {
      refs.current[0]?.focus()
    }
  }, [autoFocus])

  function setDigit(index: number, value: string) {
    setDigits((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function handleChange(index: number, raw: string) {
    const onlyDigits = raw.replace(/\D/g, '')

    if (onlyDigits.length === 0) {
      setDigit(index, '')
      return
    }

    if (onlyDigits.length === 1) {
      setDigit(index, onlyDigits)
      const nextEl = refs.current[index + 1]
      if (nextEl) nextEl.focus()
      else maybeSubmit([...digits.slice(0, index), onlyDigits, ...digits.slice(index + 1)])
      return
    }

    // Pasted/typed multi-char input — distribute from current cell.
    distribute(index, onlyDigits)
  }

  function distribute(startIndex: number, value: string) {
    setDigits((prev) => {
      const next = [...prev]
      let cursor = startIndex
      for (const ch of value) {
        if (cursor >= length) break
        next[cursor] = ch
        cursor += 1
      }
      // Focus the next empty cell or the last cell.
      const focusIndex = Math.min(cursor, length - 1)
      requestAnimationFrame(() => refs.current[focusIndex]?.focus())
      maybeSubmit(next)
      return next
    })
  }

  function maybeSubmit(d: string[]) {
    if (d.every((x) => x !== '')) {
      const form = document.getElementById(formId) as HTMLFormElement | null
      form?.requestSubmit()
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      event.preventDefault()
      const prevEl = refs.current[index - 1]
      prevEl?.focus()
      setDigit(index - 1, '')
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      refs.current[index - 1]?.focus()
      return
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault()
      refs.current[index + 1]?.focus()
      return
    }
  }

  function handlePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '')
    if (pasted.length > 0) {
      event.preventDefault()
      distribute(index, pasted)
    }
  }

  return (
    <div>
      <div
        className="flex items-center justify-center gap-2 md:gap-3"
        role="group"
        aria-label="Verification code"
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`Digit ${i + 1}`}
            className={[
              'w-10 h-14 md:w-11 md:h-16',
              'text-center font-serif text-2xl md:text-3xl text-cream',
              'bg-transparent border-b border-cream/20',
              'focus:outline-none focus:border-tobacco transition-colors duration-500',
              'caret-tobacco',
            ].join(' ')}
          />
        ))}
      </div>
      <input type="hidden" name={name} value={combined} />
    </div>
  )
}
