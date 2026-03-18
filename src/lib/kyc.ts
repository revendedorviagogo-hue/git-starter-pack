import { z } from "zod";

export const KYC_DOC_BUCKET = "kyc-documents";
export const MAX_KYC_FILE_SIZE = 10 * 1024 * 1024;
export const ACCEPTED_KYC_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const fileKinds = ["dni_front", "dni_back", "selfie", "selfie_with_document"] as const;
export type KycFileKind = (typeof fileKinds)[number];

export const FILE_KIND_LABELS: Record<KycFileKind, string> = {
  dni_front: "DNI frente",
  dni_back: "DNI verso",
  selfie: "Selfie do rosto",
  selfie_with_document: "Selfie com documento",
};

export const FILE_KIND_DESCRIPTIONS: Record<KycFileKind, string> = {
  dni_front: "Fotografe a frente do documento com boa luz e bordas visíveis.",
  dni_back: "Envie o verso do documento sem cortes nem reflexos.",
  selfie: "Faça uma selfie nítida, sem óculos escuros e com o rosto centralizado.",
  selfie_with_document: "Tire uma foto segurando o documento ao lado do rosto.",
};

export const FILE_KIND_CAPTURE_MODE: Record<KycFileKind, "user" | "environment"> = {
  dni_front: "environment",
  dni_back: "environment",
  selfie: "user",
  selfie_with_document: "user",
};

export const KYC_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  collecting: "Coletando",
  submitted: "Enviado",
  in_review: "Em análise",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

export const kycCaseFormSchema = z.object({
  full_name: z.string().trim().min(3, "Informe o nome completo").max(120, "Nome muito longo"),
  email: z.string().trim().email("Informe um e-mail válido").max(255, "E-mail muito longo"),
  phone: z.string().trim().min(6, "Informe um telefone válido").max(40, "Telefone muito longo"),
  document_number: z.string().trim().min(5, "Informe um documento válido").max(32, "Documento muito longo"),
});

export type KycCaseFormValues = z.infer<typeof kycCaseFormSchema>;

export function getKycStatusLabel(status: string | null | undefined) {
  if (!status) return "Sem status";
  return KYC_STATUS_LABELS[status] || status;
}

export function getKycStatusTone(status: string | null | undefined) {
  switch (status) {
    case "approved":
      return "bg-primary/10 text-primary border-primary/20";
    case "rejected":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "submitted":
    case "in_review":
      return "bg-accent/10 text-accent-foreground border-accent/20";
    case "collecting":
    case "draft":
    default:
      return "bg-secondary text-secondary-foreground border-border";
  }
}

export function buildKycPath(operatorCode: string, caseId: string, kind: KycFileKind, file: File) {
  const safeOperator = operatorCode.replace(/[^a-zA-Z0-9_-]/g, "") || "master";
  const extension = getFileExtension(file.name, file.type);
  return `${safeOperator}/${caseId}/${kind}-${Date.now()}.${extension}`;
}

export function buildKycLink(caseId: string) {
  return `${window.location.origin}/kyc/${caseId}`;
}

export function getFileExtension(fileName: string, mimeType?: string) {
  const raw = fileName.split(".").pop()?.toLowerCase();
  if (raw && raw.length <= 5) return raw;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function validateKycFile(file: File) {
  if (!ACCEPTED_KYC_TYPES.includes(file.type as (typeof ACCEPTED_KYC_TYPES)[number])) {
    return "Envie imagem JPG, PNG ou WEBP.";
  }

  if (file.size > MAX_KYC_FILE_SIZE) {
    return "Cada arquivo deve ter no máximo 10MB.";
  }

  return null;
}
