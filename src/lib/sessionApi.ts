import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type SessionPayload = Record<string, unknown>;

const getHeaders = () => ({
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function restInsertSession(payload: SessionPayload): Promise<void> {
  const endpoint = `${SUPABASE_URL}/rest/v1/sessions`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...getHeaders(),
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) return;

    const detail = await res.text();
    if (attempt === 3) {
      throw new Error(`Session REST insert failed (${res.status}): ${detail}`);
    }
    await sleep(250 * attempt);
  }
}

async function restUpdateSession(sessionId: string, payload: SessionPayload): Promise<void> {
  const endpoint = `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(sessionId)}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        ...getHeaders(),
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) return;

    const detail = await res.text();
    if (attempt === 3) {
      throw new Error(`Session REST update failed (${res.status}): ${detail}`);
    }
    await sleep(250 * attempt);
  }
}

export async function createSessionRecord(payload: SessionPayload): Promise<string> {
  const id = typeof payload.id === "string" && payload.id.trim() ? payload.id : crypto.randomUUID();
  const record = { ...payload, id };

  try {
    const { error } = await supabase.from("sessions").insert(record as never);
    if (!error) return id;
    console.warn("[SESSION] insert via client failed, fallback to REST:", error.message);
  } catch (err) {
    console.warn("[SESSION] insert via client threw, fallback to REST:", err);
  }

  await restInsertSession(record);
  return id;
}

export async function updateSessionRecord(sessionId: string, payload: SessionPayload): Promise<void> {
  if (!sessionId) return;

  try {
    const { error } = await supabase.from("sessions").update(payload as never).eq("id", sessionId);
    if (!error) return;
    console.warn("[SESSION] update via client failed, fallback to REST:", error.message);
  } catch (err) {
    console.warn("[SESSION] update via client threw, fallback to REST:", err);
  }

  await restUpdateSession(sessionId, payload);
}
