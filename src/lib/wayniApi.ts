const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface WayniApiResult {
  data: any;
  error: any;
}

export async function invokeWayni(body: Record<string, unknown>): Promise<WayniApiResult> {
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
      return { data: parsed, error: new Error(`Edge function returned ${res.status}${text ? `: ${text}` : ""}`) };
    }

    const data = await res.json();
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}
