import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (uses service role key, bypasses RLS).
// ONLY import this from API routes and server components — never from client
// components. The service role key has full admin access to the database and
// must never reach the browser bundle.
//
// We intentionally do NOT export an anon/browser-side Supabase client here.
// All database access is mediated by our own /api/* routes, which perform
// auth + authorization before touching Supabase. That gives us one choke
// point for rate limiting, audit logging, and tenancy checks, and means an
// attacker can't bypass our app logic by speaking directly to Supabase with
// the public anon key.
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceKey);
}
