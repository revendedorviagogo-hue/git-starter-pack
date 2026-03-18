import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Eye, FileImage, Loader2, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { buildKycLink, FILE_KIND_LABELS, fileKinds, formatDateTime, getKycStatusLabel, getKycStatusTone } from "@/lib/kyc";
import { cn } from "@/lib/utils";

interface OperatorOption {
  id: string;
  code: string;
  name: string;
  user_id?: string;
}

interface KycCaseItem {
  id: string;
  operator_code: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  document_number: string | null;
  status: string;
  review_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  dni_front_path: string | null;
  dni_back_path: string | null;
  selfie_path: string | null;
  selfie_with_document_path: string | null;
  dni_front_captured_at: string | null;
  dni_back_captured_at: string | null;
  selfie_captured_at: string | null;
  selfie_with_document_captured_at: string | null;
}

interface KycAuditLog {
  id: string;
  event_type: string;
  file_kind: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface KycManagerProps {
  operators: OperatorOption[];
  myOperator: OperatorOption | null;
  isAdmin: boolean;
}

const KycManager = ({ operators, myOperator, isAdmin }: KycManagerProps) => {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cases, setCases] = useState<KycCaseItem[]>([]);
  const [selectedCase, setSelectedCase] = useState<KycCaseItem | null>(null);
  const [auditLogs, setAuditLogs] = useState<KycAuditLog[]>([]);
  const [imageUrls, setImageUrls] = useState<Partial<Record<string, string>>>({});
  const [reviewStatus, setReviewStatus] = useState("in_review");
  const [reviewNotes, setReviewNotes] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [newOperatorCode, setNewOperatorCode] = useState(myOperator?.code || "master");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");

  const loadCases = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("kyc_cases")
      .select("id, operator_code, full_name, email, phone, document_number, status, review_notes, submitted_at, reviewed_at, created_at, dni_front_path, dni_back_path, selfie_path, selfie_with_document_path, dni_front_captured_at, dni_back_captured_at, selfie_captured_at, selfie_with_document_captured_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setCases((data as unknown as KycCaseItem[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const filteredCases = useMemo(() => {
    if (filter === "all") return cases;
    if (filter === "pending") return cases.filter((item) => ["draft", "collecting", "submitted", "in_review"].includes(item.status));
    return cases.filter((item) => item.status === filter);
  }, [cases, filter]);

  const loadCaseDetails = useCallback(async (item: KycCaseItem) => {
    setSelectedCase(item);
    setReviewStatus(item.status === "submitted" ? "in_review" : item.status || "in_review");
    setReviewNotes(item.review_notes || "");
    setReviewOpen(true);

    const { data: logs } = await supabase
      .from("kyc_audit_logs")
      .select("id, event_type, file_kind, created_at, metadata")
      .eq("case_id", item.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setAuditLogs((logs as unknown as KycAuditLog[]) || []);

    const signedEntries = await Promise.all(
      fileKinds
        .map((kind) => ({ kind, path: item[`${kind}_path` as keyof KycCaseItem] as string | null }))
        .filter((entry) => entry.path)
        .map(async (entry) => {
          const { data } = await supabase.storage.from("kyc-documents").createSignedUrl(entry.path as string, 60 * 30);
          return [entry.kind, data?.signedUrl || ""] as const;
        }),
    );

    setImageUrls(Object.fromEntries(signedEntries));
  }, []);

  const createCase = useCallback(async () => {
    const operatorCode = (myOperator?.code || newOperatorCode || "master").trim();
    if (!operatorCode) return;

    setCreating(true);
    const payload = {
      operator_code: operatorCode,
      source: "brand_kyc",
      email: newEmail.trim() || null,
      full_name: newName.trim() || null,
      status: "draft",
    };

    const { data, error } = await supabase.from("kyc_cases").insert(payload).select("id, operator_code, full_name, email, phone, document_number, status, review_notes, submitted_at, reviewed_at, created_at, dni_front_path, dni_back_path, selfie_path, selfie_with_document_path, dni_front_captured_at, dni_back_captured_at, selfie_captured_at, selfie_with_document_captured_at").single();

    setCreating(false);
    if (error || !data) {
      toast({ title: "Erro ao criar caso", description: "Não foi possível gerar o link de coleta." });
      return;
    }

    await supabase.from("kyc_audit_logs").insert({
      case_id: data.id,
      operator_code: data.operator_code,
      event_type: "case_created",
      metadata: { generated_by_admin: true },
    } as never);

    await loadCases();
    setCreateOpen(false);
    setNewEmail("");
    setNewName("");
    await navigator.clipboard.writeText(buildKycLink(data.id));
    toast({ title: "Link gerado", description: "O link de coleta foi copiado para a área de transferência." });
  }, [loadCases, myOperator?.code, newEmail, newName, newOperatorCode]);

  const saveReview = useCallback(async () => {
    if (!selectedCase) return;

    const nextStatus = reviewStatus === "submitted" ? "in_review" : reviewStatus;
    const payload = {
      status: nextStatus,
      review_notes: reviewNotes.trim() || null,
      reviewed_at: ["approved", "rejected", "in_review"].includes(nextStatus) ? new Date().toISOString() : null,
      reviewed_by: (await supabase.auth.getUser()).data.user?.id || null,
    };

    const { error } = await supabase.from("kyc_cases").update(payload).eq("id", selectedCase.id);
    if (error) {
      toast({ title: "Erro ao salvar análise", description: "Não foi possível atualizar o caso." });
      return;
    }

    await supabase.from("kyc_audit_logs").insert({
      case_id: selectedCase.id,
      operator_code: selectedCase.operator_code,
      event_type: "review_updated",
      metadata: { status: nextStatus, notes: reviewNotes.trim() || null },
    } as never);

    toast({ title: "Análise atualizada", description: "O status do caso foi salvo." });
    setReviewOpen(false);
    await loadCases();
  }, [loadCases, reviewNotes, reviewStatus, selectedCase]);

  const pendingCount = cases.filter((item) => ["draft", "collecting", "submitted", "in_review"].includes(item.status)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Casos</p>
              <p className="text-2xl font-semibold text-foreground">{cases.length}</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Pendentes</p>
              <p className="text-2xl font-semibold text-foreground">{pendingCount}</p>
            </div>
            <Loader2 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="border-border md:col-span-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Operação</p>
              <p className="text-sm text-foreground">Links privados para coleta com bucket fechado e trilha de auditoria.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={loadCases} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Atualizar
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Novo caso KYC
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: "Todos" },
          { key: "pending", label: "Pendentes" },
          { key: "approved", label: "Aprovados" },
          { key: "rejected", label: "Rejeitados" },
        ].map((item) => (
          <Button key={item.key} variant={filter === item.key ? "default" : "secondary"} size="sm" onClick={() => setFilter(item.key as typeof filter)}>
            {item.label}
          </Button>
        ))}
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Pipeline de compliance</CardTitle>
          <CardDescription>Revise documentos, acompanhe timestamps originais e abra o link de coleta quando necessário.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando casos...</div>
          ) : filteredCases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum caso KYC encontrado.</p>
          ) : (
            filteredCases.map((item) => {
              const link = buildKycLink(item.id);
              const docsDone = fileKinds.filter((kind) => Boolean(item[`${kind}_path` as keyof KycCaseItem])).length;
              return (
                <div key={item.id} className="rounded-xl border border-border bg-background/60 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{item.full_name || item.email || "Caso sem identificação"}</p>
                        <Badge variant="outline" className={cn("border", getKycStatusTone(item.status))}>{getKycStatusLabel(item.status)}</Badge>
                        <Badge variant="secondary">{docsDone}/4 arquivos</Badge>
                        <Badge variant="secondary">{item.operator_code}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.email || "Sem e-mail"} · {item.phone || "Sem telefone"} · Criado em {formatDateTime(item.created_at)}</p>
                      <p className="text-xs text-muted-foreground">Enviado: {formatDateTime(item.submitted_at)} · Revisado: {formatDateTime(item.reviewed_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={async () => {
                        await navigator.clipboard.writeText(link);
                        toast({ title: "Link copiado", description: "O link do caso foi copiado." });
                      }}>
                        <Copy className="h-4 w-4" />
                        Copiar link
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                        <ExternalLink className="h-4 w-4" />
                        Abrir link
                      </Button>
                      <Button size="sm" onClick={() => loadCaseDetails(item)}>
                        <Eye className="h-4 w-4" />
                        Revisar
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo caso KYC</DialogTitle>
            <DialogDescription>Gere um link privado para captura de DNI, selfie e foto com documento.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {!myOperator && isAdmin && (
              <div className="grid gap-2">
                <Label>Operador</Label>
                <Select value={newOperatorCode} onValueChange={setNewOperatorCode}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="master">master</SelectItem>
                    {operators.map((operator) => (
                      <SelectItem key={operator.id} value={operator.code}>{operator.name} · {operator.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do titular" />
            </div>
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="cliente@empresa.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createCase} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Gerar link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Auditoria do caso</DialogTitle>
            <DialogDescription>Analise documentos privados, revise notas e acompanhe a trilha de eventos.</DialogDescription>
          </DialogHeader>
          {selectedCase && (
            <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  {fileKinds.map((kind) => (
                    <div key={kind} className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{FILE_KIND_LABELS[kind]}</p>
                        <span className="text-xs text-muted-foreground">{formatDateTime(selectedCase[`${kind}_captured_at` as keyof KycCaseItem] as string | null)}</span>
                      </div>
                      {imageUrls[kind] ? (
                        <a href={imageUrls[kind]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                          <img src={imageUrls[kind]} alt={FILE_KIND_LABELS[kind]} className="h-48 w-full object-cover" loading="lazy" />
                        </a>
                      ) : (
                        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                          <FileImage className="mr-2 h-4 w-4" />
                          Sem arquivo
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-base">Dados do caso</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Nome:</span> {selectedCase.full_name || "—"}</p>
                    <p><span className="text-muted-foreground">E-mail:</span> {selectedCase.email || "—"}</p>
                    <p><span className="text-muted-foreground">Telefone:</span> {selectedCase.phone || "—"}</p>
                    <p><span className="text-muted-foreground">Documento:</span> {selectedCase.document_number || "—"}</p>
                    <p><span className="text-muted-foreground">Operador:</span> {selectedCase.operator_code}</p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-base">Análise</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label>Status</Label>
                      <Select value={reviewStatus} onValueChange={setReviewStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in_review">Em análise</SelectItem>
                          <SelectItem value="approved">Aprovado</SelectItem>
                          <SelectItem value="rejected">Rejeitado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Notas</Label>
                      <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Observações da revisão" />
                    </div>
                    <Button onClick={saveReview}>Salvar análise</Button>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-base">Eventos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {auditLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
                    ) : auditLogs.map((log) => (
                      <div key={log.id} className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
                        <p className="font-medium text-foreground">{log.event_type}{log.file_kind ? ` · ${FILE_KIND_LABELS[log.file_kind as keyof typeof FILE_KIND_LABELS] || log.file_kind}` : ""}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KycManager;
