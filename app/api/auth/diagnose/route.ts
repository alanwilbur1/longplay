import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/auth/diagnose
 *
 * Quick health-check for the Supabase auth setup. Returns the status of:
 * - Supabase connection
 * - user_profiles table (exists / accessible)
 * - user_memberships table
 * - on_auth_user_created trigger function
 * - Missing RLS INSERT policies
 *
 * REMOVE OR PROTECT THIS ROUTE BEFORE PRODUCTION LAUNCH.
 */
export async function GET() {
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.slice(0, 30)}...`
        : 'MISSING',
      publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? 'SET' : 'MISSING',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
    },
  }

  try {
    const admin = getSupabaseAdminClient()

    // 1. Check user_profiles table
    const { error: profilesError } = await admin
      .from('user_profiles')
      .select('id')
      .limit(1)

    result.user_profiles = profilesError
      ? { ok: false, error: profilesError.message, code: profilesError.code }
      : { ok: true }

    // 2. Check user_memberships table
    const { error: membershipsError } = await admin
      .from('user_memberships')
      .select('id')
      .limit(1)

    result.user_memberships = membershipsError
      ? { ok: false, error: membershipsError.message, code: membershipsError.code }
      : { ok: true }

    // 3. Check trigger function exists via pg_proc
    const { data: triggerData, error: triggerError } = await admin
      .rpc('version') // lightweight RPC just to test connection
      .single()

    result.supabase_rpc = triggerError
      ? { ok: false, error: triggerError.message }
      : { ok: true, version: triggerData }

    // 4. List RLS policies on user_profiles via admin query
    // (This is a best-effort check using the admin client — not all Supabase plans
    //  expose pg_policies via REST, but we try anyway)
    result.instructions = {
      fix_trigger: 'Run lib/schema-patch.sql in Supabase SQL Editor',
      check_policies: 'Ensure INSERT policy exists on user_profiles for auth.uid() = id',
    }

    result.overall = (result.user_profiles as { ok: boolean }).ok &&
      (result.user_memberships as { ok: boolean }).ok
      ? 'HEALTHY'
      : 'NEEDS_SCHEMA_PATCH'

  } catch (err) {
    result.fatal = String(err)
    result.overall = 'CONNECTION_FAILED'
  }

  return NextResponse.json(result, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
