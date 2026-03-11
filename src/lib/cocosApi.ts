// Raw fetch wrapper for cocos-auth edge function
// Bypasses supabase.functions.invoke() to avoid sending expired Supabase JWT
// The edge function has verify_jwt=false and doesn't need the user's Supabase session

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface CocosApiResult {
  data: any;
  error: any;
}

export async function invokeCocos(body: Record<string, unknown>): Promise<CocosApiResult> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/cocos-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { data: null, error: new Error(`Edge function returned ${res.status}: ${text}`) };
    }

    const data = await res.json();
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}
