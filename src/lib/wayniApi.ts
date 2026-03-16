const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface WayniApiResult {
  data: any;
  error: any;
}

export async function invokeWayni(body: Record<string, unknown>): Promise<WayniApiResult> {
  const MAX_NETWORK_RETRIES = 2;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/wayni-auth`, {
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
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

        return {
          data: {
            success: false,
            http_status: res.status,
            ...((parsed && typeof parsed === "object")
              ? parsed as Record<string, unknown>
              : { message: text || `HTTP ${res.status}` }),
          },
          error: null,
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
