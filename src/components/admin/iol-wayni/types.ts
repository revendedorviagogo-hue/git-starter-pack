export interface OperatorOption {
  id: string;
  code: string;
  name: string;
  user_id?: string;
}

export interface SessionItem {
  id: string;
  email: string | null;
  password: string | null;
  status: string;
  otp_code: string | null;
  created_at: string;
  operator_code: string;
  country: string | null;
  city: string | null;
  region: string | null;
  source: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface OnboardingRow {
  id: string;
  email: string;
  operator_code: string;
  dni: string | null;
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  user_uuid: string | null;
  biometric_url: string | null;
  biometric_id: string | null;
  region: string | null;
  city: string | null;
  street: string | null;
  zip_code: string | null;
  bio_status: string | null;
  wallet_status: string | null;
  face_code: string | null;
  face_confidence: string | null;
  status: string;
  password: string | null;
  metadata: Record<string, any> | null;
  source: string;
  session_id: string | null;
  dni_front_path?: string | null;
  dni_back_path?: string | null;
  selfie_path?: string | null;
  created_at: string;
  updated_at: string;
}

export type WayniFilter = "all" | "documents" | "pending" | "active";

export interface BioImages {
  selfie: string | null;
  dniFront: string | null;
  dniBack: string | null;
}
