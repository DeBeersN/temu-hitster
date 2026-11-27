import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Fall back to a harmless placeholder so the client doesn't throw at import time
// during build when env isn't set. Real calls will fail clearly until you add
// NEXT_PUBLIC_SUPABASE_* to .env.local.
export const supabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-anon-key",
  { realtime: { params: { eventsPerSecond: 10 } } },
);
