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
  const MAX_NETWORK_RETRIES = 2;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
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
        let parsed: unknown = null;

        const tryParse = (raw: string) => {
          try {
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        };

        // 1) Direct JSON
        parsed = tryParse(text);

        // 2) Wrapped error strings like: "Error, {...json...}"
        if (!parsed && text) {
          const firstBrace = text.indexOf("{");
          const lastBrace = text.lastIndexOf("}");
          if (firstBrace >= 0 && lastBrace > firstBrace) {
            parsed = tryParse(text.slice(firstBrace, lastBrace + 1));
          }
        }

        return {
          data: parsed,
          error: new Error(`Edge function returned ${res.status}${text ? `: ${text}` : ""}`),
        };
      }

      const data = await res.json();
      return { data, error: null };
    } catch (e) {
      lastError = e;
      const isNetworkError = e instanceof Error && (
        e.message.includes("Failed to fetch") ||
        e.message.includes("NetworkError") ||
        e.message.includes("network")
      );

      if (!isNetworkError || attempt >= MAX_NETWORK_RETRIES) {
        return { data: null, error: e };
      }

      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }

  return { data: null, error: lastError };
}
