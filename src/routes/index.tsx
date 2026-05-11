import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadAndAnalyzePdf,
  generateDailySummary,
  getTelegramStatus,
} from "@/server/reports.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Sparkles, Settings as SettingsIcon, Loader2, AlertTriangle, TrendingUp, Minus, TrendingDown, Eye } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const KIND_LABEL: Record<string, string> = {
  fixed_income: "Renda Fixa",
  stock: "Ação",
  fii: "FII",
  crypto: "Cripto",
  other: "Outro",
};

const REC_META: Record<string, { label: string; className: string; Icon: typeof TrendingUp }> = {
  buy: { label: "Aportar", className: "bg-success/15 text-success border-success/30", Icon: TrendingUp },
  hold: { label: "Segurar", className: "bg-warning/15 text-warning border-warning/30", Icon: Minus },
  sell: { label: "Vender", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: TrendingDown },
  monitor: { label: "Monitorar", className: "bg-info/15 text-info border-info/30", Icon: Eye },
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

function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const queryClient = useQueryClient();
  const uploadFn = useServerFn(uploadAndAnalyzePdf);
  const summaryFn = useServerFn(generateDailySummary);
  const telegramStatusFn = useServerFn(getTelegramStatus);

  const [dragOver, setDragOver] = useState(false);

  const { data: telegram } = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => telegramStatusFn(),
  });

  const { data: todayData, isLoading } = useQuery({
    queryKey: ["analyses", today],
    queryFn: async () => {
      const [analysesRes, summaryRes] = await Promise.all([
        supabase
          .from("analyses")
          .select("*, reports(original_filename, source, received_at)")
          .eq("analysis_date", today)
          .order("created_at", { ascending: false }),
        supabase.from("daily_summaries").select("*").eq("summary_date", today).maybeSingle(),
      ]);
      return {
        analyses: analysesRes.data ?? [],
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
      toast.success(`Análise pronta — ${res.assetsCount} ativo(s)`);
      queryClient.invalidateQueries({ queryKey: ["analyses", today] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha na análise"),
  });

  const consolidate = useMutation({
    mutationFn: () => summaryFn({ data: {} }),
    onSuccess: () => {
      toast.success("Panorama do dia atualizado");
      queryClient.invalidateQueries({ queryKey: ["analyses", today] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha"),
  });

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (file.type !== "application/pdf") {
          toast.error(`${file.name}: somente PDF`);
          continue;
        }
        toast.info(`Processando ${file.name}...`);
        await upload.mutateAsync(file);
      }
    },
    [upload],
  );

  const analyses = todayData?.analyses ?? [];
  const summary = todayData?.summary;

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">Painel do dia</h1>
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              {telegram?.enabled && (
                <span className="ml-3 inline-flex items-center gap-1.5 text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                  telegram on
                </span>
              )}
            </p>
          </div>
        </div>
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Drop zone */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`relative rounded-xl border-2 border-dashed transition-all p-10 text-center ${
            dragOver
              ? "border-primary bg-primary/5 glow-amber"
              : "border-border-strong bg-surface/40 hover:bg-surface/60"
          }`}
        >
          <Upload className="h-10 w-10 mx-auto text-primary mb-3" />
          <h2 className="font-mono text-lg font-semibold">Solte os PDFs aqui</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Relatórios de ações, FIIs, cripto ou renda fixa. Múltiplos arquivos suportados.
          </p>
          <label className="mt-4 inline-flex">
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={upload.isPending}
            />
            <Button asChild>
              <span className="cursor-pointer">
                {upload.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  "Selecionar arquivos"
                )}
              </span>
            </Button>
          </label>
        </section>

        {/* Panorama */}
        <section className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                Panorama do dia
              </h2>
              <p className="font-mono text-2xl mt-1">
                {analyses.length} <span className="text-muted-foreground text-base">análise(s)</span>
              </p>
            </div>
            <Button
              onClick={() => consolidate.mutate()}
              disabled={consolidate.isPending || analyses.length === 0}
              variant="secondary"
              className="gap-2"
            >
              {consolidate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Gerar panorama
            </Button>
          </div>

          {summary ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed">{summary.overview}</p>
              {Array.isArray(summary.priorities) && summary.priorities.length > 0 && (
                <div>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">
                    Prioridades
                  </h3>
                  <ul className="space-y-2">
                    {(summary.priorities as Array<{ asset: string; action: string; reason: string }>).map(
                      (p, i) => (
                        <li key={i} className="text-sm flex gap-3">
                          <span className="font-mono text-primary">›</span>
                          <span>
                            <span className="font-mono font-semibold">{p.asset}</span>{" "}
                            <Badge variant="outline" className="ml-1 mr-2">
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
                  <h3 className="font-mono text-xs uppercase tracking-widest text-warning mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Alertas
                  </h3>
                  <ul className="space-y-1.5">
                    {(summary.alerts as Array<{ asset: string; alert: string }>).map((a, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-mono font-semibold">{a.asset}</span>{" "}
                        <span className="text-muted-foreground">— {a.alert}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {analyses.length === 0
                ? "Envie ao menos um relatório para gerar o panorama."
                : "Clique em \"Gerar panorama\" para consolidar as análises do dia."}
            </p>
          )}
        </section>

        {/* Lista de análises */}
        <section>
          <h2 className="font-mono text-sm uppercase tracking-widest text-muted-foreground mb-4">
            Relatórios processados hoje
          </h2>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            </div>
          ) : analyses.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface/30 p-10 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto opacity-30 mb-3" />
              Nenhum relatório ainda hoje.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {analyses.map((a) => {
                const meta = a.recommendation ? REC_META[a.recommendation] : null;
                return (
                  <article
                    key={a.id}
                    className="rounded-xl border border-border bg-card p-5 hover:border-border-strong transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="font-mono text-lg font-semibold truncate">
                          {a.asset_id ?? a.asset_name ?? "Ativo"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.asset_name ?? KIND_LABEL[a.kind]}
                        </p>
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {KIND_LABEL[a.kind]}
                      </Badge>
                    </div>

                    {meta && (
                      <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold mb-3 ${meta.className}`}>
                        <meta.Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </div>
                    )}

                    {a.ai_opinion && (
                      <p className="text-sm leading-relaxed mb-3">{a.ai_opinion}</p>
                    )}

                    {a.strengths?.length > 0 && (
                      <div className="mb-2">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-success mb-1">
                          Fortes
                        </p>
                        <ul className="text-xs space-y-0.5 text-muted-foreground">
                          {a.strengths.slice(0, 3).map((s, i) => (
                            <li key={i}>+ {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {a.weaknesses?.length > 0 && (
                      <div className="mb-2">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-destructive mb-1">
                          Fracos
                        </p>
                        <ul className="text-xs space-y-0.5 text-muted-foreground">
                          {a.weaknesses.slice(0, 3).map((s, i) => (
                            <li key={i}>− {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="mt-3 pt-3 border-t border-border text-[10px] font-mono text-muted-foreground/70 truncate">
                      {a.reports?.original_filename}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
