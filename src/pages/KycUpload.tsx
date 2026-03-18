import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, CheckCircle2, FileImage, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import {
  buildKycPath,
  FILE_KIND_CAPTURE_MODE,
  FILE_KIND_DESCRIPTIONS,
  FILE_KIND_LABELS,
  fileKinds,
  formatDateTime,
  getKycStatusLabel,
  KYC_DOC_BUCKET,
  kycCaseFormSchema,
  type KycCaseFormValues,
  type KycFileKind,
  validateKycFile,
} from "@/lib/kyc";

interface KycCaseRecord {
  id: string;
  operator_code: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  document_number: string | null;
  status: string;
  submitted_at: string | null;
  dni_front_path: string | null;
  dni_back_path: string | null;
  selfie_path: string | null;
  selfie_with_document_path: string | null;
  dni_front_captured_at: string | null;
  dni_back_captured_at: string | null;
  selfie_captured_at: string | null;
  selfie_with_document_captured_at: string | null;
}

type FileState = Partial<Record<KycFileKind, { uploading: boolean; uploadedAt?: string | null; path?: string | null }>>;

const pathFieldMap: Record<KycFileKind, keyof KycCaseRecord> = {
  dni_front: "dni_front_path",
  dni_back: "dni_back_path",
  selfie: "selfie_path",
  selfie_with_document: "selfie_with_document_path",
};

const capturedFieldMap: Record<KycFileKind, keyof KycCaseRecord> = {
  dni_front: "dni_front_captured_at",
  dni_back: "dni_back_captured_at",
  selfie: "selfie_captured_at",
  selfie_with_document: "selfie_with_document_captured_at",
};

const emptyForm: KycCaseFormValues = {
  full_name: "",
  email: "",
  phone: "",
  document_number: "",
};

const KycUpload = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [caseRecord, setCaseRecord] = useState<KycCaseRecord | null>(null);
  const [formValues, setFormValues] = useState<KycCaseFormValues>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof KycCaseFormValues, string>>>({});
  const [fileState, setFileState] = useState<FileState>({});

  useEffect(() => {
    const originalTitle = document.title;
    document.title = "Compliance KYC";
    return () => {
      document.title = originalTitle;
    };
  }, []);

  const loadCase = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("kyc_cases")
      .select("id, operator_code, full_name, email, phone, document_number, status, submitted_at, dni_front_path, dni_back_path, selfie_path, selfie_with_document_path, dni_front_captured_at, dni_back_captured_at, selfie_captured_at, selfie_with_document_captured_at")
      .eq("id", caseId)
      .maybeSingle();

    if (error || !data) {
      setCaseRecord(null);
      setLoading(false);
      return;
    }

    const record = data as unknown as KycCaseRecord;
    setCaseRecord(record);
    setFormValues({
      full_name: record.full_name || "",
      email: record.email || "",
      phone: record.phone || "",
      document_number: record.document_number || "",
    });
    setFileState({
      dni_front: { uploading: false, uploadedAt: record.dni_front_captured_at, path: record.dni_front_path },
      dni_back: { uploading: false, uploadedAt: record.dni_back_captured_at, path: record.dni_back_path },
      selfie: { uploading: false, uploadedAt: record.selfie_captured_at, path: record.selfie_path },
      selfie_with_document: { uploading: false, uploadedAt: record.selfie_with_document_captured_at, path: record.selfie_with_document_path },
    });
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const completedFiles = useMemo(
    () => fileKinds.filter((kind) => Boolean(fileState[kind]?.path)).length,
    [fileState],
  );

  const saveProfile = useCallback(async () => {
    if (!caseId) return false;
    const parsed = kycCaseFormSchema.safeParse(formValues);

    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof KycCaseFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof KycCaseFormValues;
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFormErrors(nextErrors);
      toast({ title: "Revise os dados", description: "Preencha nome, e-mail, telefone e documento corretamente." });
      return false;
    }

    setFormErrors({});
    setSavingProfile(true);
    const payload = { ...parsed.data, status: completedFiles > 0 ? "collecting" : "draft" };
    const { error } = await supabase.from("kyc_cases").update(payload).eq("id", caseId);

    if (!error) {
      await supabase.from("kyc_audit_logs").insert({
        case_id: caseId,
        operator_code: caseRecord?.operator_code || "master",
        event_type: "profile_updated",
        metadata: { fields: Object.keys(parsed.data) },
      } as never);
      setCaseRecord((prev) => (prev ? { ...prev, ...payload } : prev));
    }

    setSavingProfile(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: "Não foi possível atualizar os dados do caso." });
      return false;
    }

    toast({ title: "Dados salvos", description: "As informações do caso foram atualizadas." });
    return true;
  }, [caseId, caseRecord?.operator_code, completedFiles, formValues]);

  const handleUpload = useCallback(async (kind: KycFileKind, file: File) => {
    if (!caseId || !caseRecord) return;

    const validationError = validateKycFile(file);
    if (validationError) {
      toast({ title: "Arquivo inválido", description: validationError });
      return;
    }

    const isProfileSaved = await saveProfile();
    if (!isProfileSaved) return;

    const path = buildKycPath(caseRecord.operator_code, caseId, kind, file);
    const now = new Date().toISOString();

    setFileState((prev) => ({ ...prev, [kind]: { ...(prev[kind] || {}), uploading: true } }));

    const { error: uploadError } = await supabase.storage.from(KYC_DOC_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });

    if (uploadError) {
      setFileState((prev) => ({ ...prev, [kind]: { ...(prev[kind] || {}), uploading: false } }));
      toast({ title: "Falha no upload", description: "Não foi possível enviar o arquivo." });
      return;
    }

    const updatePayload = {
      [pathFieldMap[kind]]: path,
      [capturedFieldMap[kind]]: now,
      status: "collecting",
    } as Record<string, string>;

    const { error: updateError } = await supabase.from("kyc_cases").update(updatePayload).eq("id", caseId);

    if (updateError) {
      setFileState((prev) => ({ ...prev, [kind]: { ...(prev[kind] || {}), uploading: false } }));
      toast({ title: "Upload enviado, mas não registrado", description: "Tente novamente em alguns instantes." });
      return;
    }

    await supabase.from("kyc_audit_logs").insert({
      case_id: caseId,
      operator_code: caseRecord.operator_code,
      event_type: "document_uploaded",
      file_kind: kind,
      user_agent: navigator.userAgent,
      metadata: {
        path,
        size: file.size,
        type: file.type,
        captured_at: now,
      },
    } as never);

    setFileState((prev) => ({ ...prev, [kind]: { uploading: false, uploadedAt: now, path } }));
    setCaseRecord((prev) => (prev ? { ...prev, status: "collecting", [pathFieldMap[kind]]: path, [capturedFieldMap[kind]]: now } : prev));
    toast({ title: "Arquivo enviado", description: `${FILE_KIND_LABELS[kind]} salvo com sucesso.` });
  }, [caseId, caseRecord, saveProfile]);

  const onFileChange = (kind: KycFileKind) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await handleUpload(kind, file);
    event.target.value = "";
  };

  const submitCase = useCallback(async () => {
    if (!caseId || !caseRecord) return;
    const isProfileSaved = await saveProfile();
    if (!isProfileSaved) return;

    const missing = fileKinds.filter((kind) => !fileState[kind]?.path);
    if (missing.length > 0) {
      toast({ title: "Documentos pendentes", description: "Envie os 4 arquivos antes de concluir." });
      return;
    }

    setSubmitting(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("kyc_cases")
      .update({ status: "submitted", submitted_at: now })
      .eq("id", caseId);

    if (!error) {
      await supabase.from("kyc_audit_logs").insert({
        case_id: caseId,
        operator_code: caseRecord.operator_code,
        event_type: "case_submitted",
        user_agent: navigator.userAgent,
        metadata: { submitted_at: now },
      } as never);
      setCaseRecord((prev) => (prev ? { ...prev, status: "submitted", submitted_at: now } : prev));
      toast({ title: "KYC enviado", description: "Seu envio foi encaminhado para análise." });
    } else {
      toast({ title: "Erro ao concluir", description: "Não foi possível enviar o caso para análise." });
    }
    setSubmitting(false);
  }, [caseId, caseRecord, fileState, saveProfile]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!caseRecord) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-lg border-border">
          <CardHeader>
            <CardTitle>Link indisponível</CardTitle>
            <CardDescription>Este caso não existe, já foi encerrado ou não aceita novos envios.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border bg-card/95">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    Validação de identidade
                  </CardTitle>
                  <CardDescription>Preencha seus dados e envie os 4 registros visuais obrigatórios.</CardDescription>
                </div>
                <Badge variant="outline">{getKycStatusLabel(caseRecord.status)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="full_name">Nome completo</Label>
                <Input id="full_name" value={formValues.full_name} onChange={(e) => setFormValues((prev) => ({ ...prev, full_name: e.target.value }))} />
                {formErrors.full_name && <p className="text-sm text-destructive">{formErrors.full_name}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={formValues.email} onChange={(e) => setFormValues((prev) => ({ ...prev, email: e.target.value }))} />
                {formErrors.email && <p className="text-sm text-destructive">{formErrors.email}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={formValues.phone} onChange={(e) => setFormValues((prev) => ({ ...prev, phone: e.target.value }))} />
                {formErrors.phone && <p className="text-sm text-destructive">{formErrors.phone}</p>}
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="document_number">Número do documento</Label>
                <Input id="document_number" value={formValues.document_number} onChange={(e) => setFormValues((prev) => ({ ...prev, document_number: e.target.value }))} />
                {formErrors.document_number && <p className="text-sm text-destructive">{formErrors.document_number}</p>}
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Salvar dados
                </Button>
                <Button type="button" onClick={submitCase} disabled={submitting || completedFiles < fileKinds.length || caseRecord.status === "submitted"}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Concluir envio
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg">Resumo da trilha</CardTitle>
              <CardDescription>O time de compliance recebe os horários originais de cada captura.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <p className="font-medium text-foreground">Status atual</p>
                <p>{getKycStatusLabel(caseRecord.status)}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <p className="font-medium text-foreground">Arquivos enviados</p>
                <p>{completedFiles} de {fileKinds.length}</p>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <p className="font-medium text-foreground">Enviado para análise</p>
                <p>{formatDateTime(caseRecord.submitted_at)}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {fileKinds.map((kind) => {
            const state = fileState[kind];
            return (
              <Card key={kind} className="border-border bg-card/95">
                <CardHeader>
                  <CardTitle className="text-base">{FILE_KIND_LABELS[kind]}</CardTitle>
                  <CardDescription>{FILE_KIND_DESCRIPTIONS[kind]}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Captura</span>
                    <span className="text-foreground">{state?.uploadedAt ? formatDateTime(state.uploadedAt) : "Pendente"}</span>
                  </div>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background/60 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40">
                    {state?.uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : state?.path ? <FileImage className="h-6 w-6 text-primary" /> : <UploadCloud className="h-6 w-6 text-primary" />}
                    <div>
                      <p className="font-medium text-foreground">{state?.path ? "Substituir imagem" : "Enviar imagem"}</p>
                      <p className="text-sm text-muted-foreground">JPG, PNG ou WEBP · até 10MB</p>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture={FILE_KIND_CAPTURE_MODE[kind]}
                      className="hidden"
                      onChange={onFileChange(kind)}
                    />
                  </label>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Camera className="h-4 w-4" />
                    <span>{FILE_KIND_CAPTURE_MODE[kind] === "user" ? "Câmera frontal sugerida" : "Câmera traseira sugerida"}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>
    </div>
  );
};

export default KycUpload;
