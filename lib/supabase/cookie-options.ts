/**
 * lib/supabase/cookie-options.ts
 *
 * Returns the correct Supabase auth cookie attributes for the current
 * deployment environment.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Replit workspace embeds the preview app in an iframe
 * (worf.replit.dev) inside the IDE page (replit.com). These are different
 * eTLD+1 domains, so every server-action POST from the iframe is treated as
 * a cross-site request by the browser.
 *
 * Browsers do NOT forward SameSite=Lax cookies with cross-site POST
 * requests. Next.js server actions are POST, so a Lax cookie is stripped
 * before it arrives → cookies() is empty → auth.getUser() returns null
 * in ~3 ms → "Not authenticated".
 *
 * SameSite=None; Secure bypasses this restriction. The fix is scoped to
 * Replit environments only; production (Vercel / longplay.club) keeps the
 * stricter SameSite=Lax policy.
 *
 * DETECTION
 * ─────────
 * REPL_ID is set in every Replit runtime (dev container and deployed Replit
 * app). It is absent on Vercel, Railway, bare servers, etc.
 */

const isReplitEnvironment = Boolean(process.env.REPL_ID)

export function getSupabaseCookieOptions() {
  return {
    path: '/',
    // Replit preview: SameSite=None so cross-site POST (server actions)
    //   includes the auth cookie.
    // Production / Vercel: SameSite=Lax (stricter, preferred default).
    sameSite: (isReplitEnvironment ? 'none' : 'lax') as 'none' | 'lax',
    // Secure is always true:
    //   - Replit dev proxy is HTTPS
    //   - All production targets are HTTPS
    //   - SameSite=None is only valid with Secure
    secure: true,
  }
}
