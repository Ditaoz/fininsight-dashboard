import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadAndAnalyzePdf,
  generateDailySummary,
  getReportSignedUrl,
} from "@/actions/reports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Sparkles,
  Loader2,
  AlertTriangle,
  ChevronRight,
  Download,
  ArrowUpRight,
  Plus,
  FileText,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

const KIND_LABEL: Record<string, string> = {
  fixed_income: "Renda Fixa",
  stock: "Ação",
  fii: "FII",
  crypto: "Cripto",
  other: "Outro",
};

const REC_META: Record<string, { label: string; className: string }> = {
  buy: { label: "Aportar", className: "bg-success/10 text-success border-success/30" },
  hold: { label: "Segurar", className: "bg-warning/15 text-warning-foreground border-warning/40" },
  sell: { label: "Vender", className: "bg-destructive/10 text-destructive border-destructive/30" },
  monitor: { label: "Monitorar", className: "bg-info/10 text-info border-info/30" },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type AnalysisRow = {
  id: string;
  asset_id: string | null;
  asset_name: string | null;
  kind: string;
  recommendation: string | null;
  ai_opinion: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  analysis_date: string;
  created_at: string;
  reports: { id: string; original_filename: string; received_at: string } | null;
};

function consolidateRecommendation(items: AnalysisRow[]): string | null {
  const counts: Record<string, number> = {};
  for (const i of items) {
    if (i.recommendation) counts[i.recommendation] = (counts[i.recommendation] ?? 0) + 1;
  }
  let top: string | null = null;
  let max = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > max) {
      top = k;
      max = v;
    }
  }
  return top;
}

function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const queryClient = useQueryClient();
  const uploadFn = useServerFn(uploadAndAnalyzePdf);
  const summaryFn = useServerFn(generateDailySummary);
  const signFn = useServerFn(getReportSignedUrl);

  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const { data: todayData, isLoading } = useQuery({
    queryKey: ["analyses", today],
    queryFn: async () => {
      const [analysesRes, summaryRes] = await Promise.all([
        supabase
          .from("analyses")
          .select("*, reports(id, original_filename, received_at, source)")
          .eq("analysis_date", today)
          .order("created_at", { ascending: false }),
        supabase.from("daily_summaries").select("*").eq("summary_date", today).maybeSingle(),
      ]);
      return {
        analyses: (analysesRes.data ?? []) as AnalysisRow[],
        summary: summaryRes.data ?? null,
      };
    },
    refetchInterval: 5000,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      return uploadFn({ data: { filename: file.name, base64, source: "upload" } });
    },
    onSuccess: (res) => {
      toast.success(`Análise pronta — ${res?.assetsCount ?? 0} ativo(s)`);
      queryClient.invalidateQueries({ queryKey: ["analyses", today] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-assets"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha na análise"),
  });

  const consolidate = useMutation({
    mutationFn: () => summaryFn({ data: {} }),
    onSuccess: () => {
      toast.success("Panorama atualizado");
      queryClient.invalidateQueries({ queryKey: ["analyses", today] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha"),
  });

  const download = useMutation({
    mutationFn: (reportId: string) => signFn({ data: { reportId } }),
    onSuccess: (res) => {
      if (res?.url) window.open(res.url, "_blank");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao baixar"),
  });

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      let uploadedCount = 0;
      
      for (const file of Array.from(files)) {
        if (file.type !== "application/pdf") {
          toast.error(`${file.name}: somente PDF`);
          continue;
        }
        toast.info(`Analisando ${file.name}…`);
        try {
          await upload.mutateAsync(file);
          uploadedCount++;
        } catch (e) {
          // err handled in mutation
        }
      }

      if (uploadedCount > 0) {
        toast.info("Gerando Panorama do Dia com base nos novos dados...");
        consolidate.mutate();
      }
    },
    [upload, consolidate],
  );

  const analyses = todayData?.analyses ?? [];
  const summary = todayData?.summary;

  const grouped = useMemo(() => {
    const filtered = filter === "all" ? analyses : analyses.filter((a) => a.kind === filter);
    const map = new Map<string, { key: string; ticker: string; name: string; kind: string; items: AnalysisRow[] }>();
    for (const a of filtered) {
      const key = a.asset_id ?? a.asset_name ?? "Sem identificação";
      const existing = map.get(key);
      if (existing) existing.items.push(a);
      else
        map.set(key, {
          key,
          ticker: a.asset_id ?? a.asset_name ?? "—",
          name: a.asset_name ?? KIND_LABEL[a.kind] ?? "Ativo",
          kind: a.kind,
          items: [a],
        });
    }
    const groups = Array.from(map.values());
    for (const g of groups) g.items.sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    groups.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return groups;
  }, [analyses, filter]);

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm grid place-items-center pointer-events-none">
          <div className="rounded-2xl border-2 border-dashed border-primary p-12 text-center bg-card">
            <Upload className="h-12 w-12 text-primary mx-auto mb-3" />
            <p className="text-lg font-display">Solte para analisar</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-12">
        {/* Title */}
        <header className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl tracking-tight">Mesa de Análise</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
              {" · "}
              {analyses.length} análise(s) · {grouped.length} ativo(s)
            </p>
          </div>
          <label>
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={upload.isPending}
            />
            <Button asChild size="sm" className="gap-1.5">
              <span className="cursor-pointer">
                {upload.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Adicionar PDF
              </span>
            </Button>
          </label>
        </header>

        {/* Empty hint */}
        {analyses.length === 0 && !isLoading && (
          <section className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h2 className="font-display text-lg">Solte um PDF em qualquer lugar</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Ou use o botão "Adicionar PDF". Suporta múltiplos arquivos.
            </p>
          </section>
        )}

        {/* Panorama */}
        {analyses.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Panorama do dia
              </h2>
              <Button
                onClick={() => consolidate.mutate()}
                disabled={consolidate.isPending}
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs"
              >
                {consolidate.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {summary ? "Atualizar" : "Gerar"}
              </Button>
            </div>

            {summary ? (
              <div className="rounded-xl border border-border bg-card p-6 space-y-5 shadow-sm">
                <p className="text-sm leading-relaxed">{summary.overview}</p>

                {Array.isArray(summary.priorities) && summary.priorities.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                      Prioridades
                    </p>
                    <ul className="space-y-1.5">
                      {(summary.priorities as Array<{ asset: string; action: string; reason: string }>).map(
                        (p, i) => (
                          <li key={i} className="text-sm flex gap-2">
                            <span className="text-accent mt-0.5">›</span>
                            <span>
                              <span className="font-mono font-medium">{p.asset}</span>
                              <Badge variant="outline" className="mx-2 text-[10px]">
                                {p.action}
                              </Badge>
                              <span className="text-muted-foreground">{p.reason}</span>
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

                {Array.isArray(summary.alerts) && summary.alerts.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-warning-foreground mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" />
                      Alertas
                    </p>
                    <ul className="space-y-1">
                      {(summary.alerts as Array<{ asset: string; alert: string }>).map((a, i) => (
                        <li key={i} className="text-sm">
                          <span className="font-mono font-medium">{a.asset}</span>{" "}
                          <span className="text-muted-foreground">— {a.alert}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Clique em "Gerar" para consolidar a leitura do dia.
              </p>
            )}
          </section>
        )}

        {/* Ativos */}
        {analyses.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Ativos analisados hoje
              </h2>
              <Tabs value={filter} onValueChange={setFilter}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs h-6">Todos</TabsTrigger>
                  <TabsTrigger value="stock" className="text-xs h-6">Ações</TabsTrigger>
                  <TabsTrigger value="fii" className="text-xs h-6">FIIs</TabsTrigger>
                  <TabsTrigger value="crypto" className="text-xs h-6">Cripto</TabsTrigger>
                  <TabsTrigger value="fixed_income" className="text-xs h-6">Renda Fixa</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto my-8" />
            ) : grouped.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/40 p-10 text-center text-muted-foreground text-sm">
                Nenhum ativo nesse filtro.
              </div>
            ) : (
              <div className="space-y-2">
                {grouped.map((g) => {
                  const consolidated = consolidateRecommendation(g.items);
                  const meta = consolidated ? REC_META[consolidated] : null;
                  return (
                    <Collapsible
                      key={g.key}
                      defaultOpen={grouped.length <= 3}
                      className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"
                    >
                      <CollapsibleTrigger className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/40 transition-colors text-left group">
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono font-semibold truncate">{g.ticker}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {g.name === g.ticker ? KIND_LABEL[g.kind] : g.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px]">
                            {KIND_LABEL[g.kind]}
                          </Badge>
                          {meta && (
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {g.items.length}
                          </span>
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <div className="border-t border-border divide-y divide-border">
                          {g.items.map((a) => (
                            <article key={a.id} className="px-5 py-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs text-muted-foreground font-mono">
                                    {new Date(a.created_at).toLocaleString("pt-BR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                  <p className="text-sm mt-0.5 truncate">
                                    {a.reports?.original_filename ?? "Relatório"}
                                  </p>
                                </div>
                                {a.recommendation && REC_META[a.recommendation] && (
                                  <span
                                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${REC_META[a.recommendation].className}`}
                                  >
                                    {REC_META[a.recommendation].label}
                                  </span>
                                )}
                              </div>

                              {a.ai_opinion && (
                                <p className="text-sm leading-relaxed">{a.ai_opinion}</p>
                              )}

                              {(a.strengths?.length || a.weaknesses?.length) ? (
                                <div className="grid sm:grid-cols-2 gap-3">
                                  {a.strengths && a.strengths.length > 0 && (
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-success mb-1">
                                        Fortes
                                      </p>
                                      <ul className="text-xs text-muted-foreground space-y-0.5">
                                        {a.strengths.slice(0, 4).map((s, i) => (
                                          <li key={i}>+ {s}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {a.weaknesses && a.weaknesses.length > 0 && (
                                    <div>
                                      <p className="text-[10px] uppercase tracking-wider text-destructive mb-1">
                                        Fracos
                                      </p>
                                      <ul className="text-xs text-muted-foreground space-y-0.5">
                                        {a.weaknesses.slice(0, 4).map((s, i) => (
                                          <li key={i}>− {s}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ) : null}

                              <div className="flex items-center gap-2 pt-1">
                                {a.reports?.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1.5 text-xs"
                                    onClick={() => download.mutate(a.reports!.id)}
                                    disabled={download.isPending}
                                  >
                                    <Download className="h-3 w-3" />
                                    PDF original
                                  </Button>
                                )}
                              </div>
                            </article>
                          ))}

                          <div className="px-5 py-3 bg-muted/30">
                            <Link
                              to="/ativo/$assetKey"
                              params={{ assetKey: g.key }}
                              className="text-xs text-accent inline-flex items-center gap-1 hover:underline"
                            >
                              Ver histórico completo
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {analyses.length === 0 && isLoading && (
          <div className="text-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
          </div>
        )}

        {analyses.length === 0 && !isLoading && (
          <div className="text-center py-4 text-xs text-muted-foreground flex items-center gap-2 justify-center">
            <FileText className="h-3.5 w-3.5" />
            Aguardando primeiro relatório do dia
          </div>
        )}
      </div>
    </div>
  );
}
