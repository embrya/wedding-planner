import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.2/+esm";

export const supabaseUrl = "https://pjqfeqeyfwzbjqddutki.supabase.co";
export const supabasePublishableKey = "sb_publishable_9d602DoT6ikcVkWu8TLsyw_qJ3kU4AG";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storageKey: "marryday.auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

export function createSignupClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export function loginEmail(loginId) {
  return `${String(loginId || "").trim().toLowerCase()}@marryday.app`;
}
