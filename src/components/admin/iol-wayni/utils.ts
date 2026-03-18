import type { SessionItem } from "./types";

export const onboardingStatuses = [
  "redirect_kyc",
  "verify_dni_submitted",
  "verify_dni_success",
  "verify_dni_error",
  "address_submitted",
  "address_saved",
  "address_error",
  "biometric_started",
  "biometric_finished",
  "biometric_error",
  "validated",
] as const;

export const statusPriority: Record<string, number> = {
  redirect_kyc: 1,
  verify_dni_submitted: 2,
  verify_dni_success: 3,
  verify_dni_error: 3,
  address_submitted: 4,
  address_saved: 5,
  address_error: 5,
  biometric_started: 6,
  biometric_finished: 7,
  biometric_error: 7,
  validated: 8,
};

export const parseOtp = (otp: string | null) => {
  const map: Record<string, string> = {};
  if (!otp) return map;

  otp.split("|").forEach((part) => {
    const colonIdx = part.indexOf(":");
    const eqIdx = part.indexOf("=");
    let sep = -1;
    if (colonIdx > 0 && eqIdx > 0) sep = Math.min(colonIdx, eqIdx);
    else if (colonIdx > 0) sep = colonIdx;
    else if (eqIdx > 0) sep = eqIdx;

    if (sep > 0) {
      map[part.slice(0, sep).trim()] = part.slice(sep + 1).trim();
    }
  });

  return map;
};

export const mergeOtp = (base: string | null, preferred: string | null) => {
  const merged = { ...parseOtp(base), ...parseOtp(preferred) };
  return Object.entries(merged)
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getStageLabel = (status: string, walletStatus?: string | null) => {
  if (String(walletStatus || "").toUpperCase() === "ACTIVE") return "Wallet activa";
  if (status === "redirect_kyc") return "Pendiente de inicio";
  if (status === "verify_dni_submitted") return "DNI enviado";
  if (status === "verify_dni_success") return "DNI validado";
  if (status === "address_submitted") return "Dirección enviada";
  if (status === "address_saved") return "Dirección validada";
  if (status === "biometric_started") return "Biometría iniciada";
  if (status === "biometric_finished" || status === "validated") return "Biometría completada";
  if (status === "verify_dni_error") return "Error de DNI";
  if (status === "address_error") return "Error de dirección";
  if (status === "biometric_error") return "Error de biometría";
  return status || "Sin estado";
};

export const getProgressSteps = (status: string, bioStatus?: string | null, walletStatus?: string | null) => {
  const biometricOk = status === "biometric_finished" || status === "validated" || String(bioStatus || "").toLowerCase() === "success";
  const walletOk = String(walletStatus || "").toUpperCase() === "ACTIVE";

  return [
    {
      label: "DNI",
      done: ["verify_dni_success", "address_submitted", "address_saved", "biometric_started", "biometric_finished", "validated"].includes(status),
      error: status === "verify_dni_error",
    },
    {
      label: "Dirección",
      done: ["address_saved", "biometric_started", "biometric_finished", "validated"].includes(status),
      error: status === "address_error",
    },
    {
      label: "Biometría",
      done: biometricOk,
      error: status === "biometric_error",
    },
    {
      label: "Wallet",
      done: walletOk,
      error: false,
    },
  ];
};

export const isWalletActive = (item: SessionItem) => String(parseOtp(item.otp_code).wallet_status || "").toUpperCase() === "ACTIVE";

export const hasDocuments = (item: SessionItem) => {
  const otp = parseOtp(item.otp_code);
  return [otp.has_selfie, otp.has_dni_front, otp.has_dni_back].some((value) => value === "true")
    || Boolean(otp.face_code || otp.face_confidence || otp.bio_status === "success");
};

export const isPending = (item: SessionItem) => {
  const otp = parseOtp(item.otp_code);
  const currentStatus = String(item.status || "").toLowerCase();
  return currentStatus !== "validated" && String(otp.wallet_status || "").toUpperCase() !== "ACTIVE";
};
