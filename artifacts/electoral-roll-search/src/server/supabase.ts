import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function getSupabaseAdmin() {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

export function isSupabaseEnabled() {
  return getSupabaseAdmin() !== null;
}
