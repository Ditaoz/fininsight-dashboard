import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAssetDetail, getReportSignedUrl } from "@/server/assets.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Minus, TrendingDown, Eye, FileText, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ativo/$assetKey/")({
  component: AssetHistoryPage,
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

function AssetHistoryPage() {
  const { assetKey } = Route.useParams();
  const detailFn = useServerFn(getAssetDetail);
  const signFn = useServerFn(getReportSignedUrl);
  const { data, isLoading } = useQuery({
    queryKey: ["asset", assetKey],
    queryFn: () => detailFn({ data: { key: assetKey } }),
  });

  async function openReport(path: string) {
    try {
      const { url } = await signFn({ data: { storagePath: path } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir PDF");
    }
  }

  if (isLoading) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }
  if (!data || data.analyses.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-muted-foreground">Nenhuma análise encontrada para esse ativo.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {KIND_LABEL[data.kind]}
          </p>
          <h1 className="font-mono text-3xl font-semibold tracking-tight mt-1">
            {data.asset_id ?? data.asset_name ?? assetKey}
          </h1>
          {data.asset_name && data.asset_id && (
            <p className="text-sm text-muted-foreground mt-0.5">{data.asset_name}</p>
          )}
        </div>
        <Link to="/ativo/$assetKey/relatorios" params={{ assetKey }}>
          <Button variant="outline" size="sm" className="gap-2">
            <FileText className="h-4 w-4" />
            Relatórios ({data.reports.length})
          </Button>
        </Link>
      </header>

      <section>
        <h2 className="font-mono text-sm uppercase tracking-widest text-muted-foreground mb-3">
          Histórico de análises ({data.analyses.length})
        </h2>
        <ol className="space-y-4 relative border-l border-border-strong/40 pl-6">
          {data.analyses.map((a) => {
            const meta = a.recommendation ? REC_META[a.recommendation] : null;
            const r = a.reports as { original_filename: string; storage_path: string; received_at: string } | null;
            return (
              <li key={a.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-mono text-muted-foreground">
                      {new Date(a.created_at).toLocaleString("pt-BR")}
                    </p>
                    {meta && (
                      <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${meta.className}`}>
                        <meta.Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </div>
                    )}
                  </div>
                  {a.ai_opinion && <p className="text-sm leading-relaxed mb-3">{a.ai_opinion}</p>}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {a.strengths?.length > 0 && (
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-success mb-1">Fortes</p>
                        <ul className="text-xs space-y-0.5 text-muted-foreground">
                          {a.strengths.map((s, i) => <li key={i}>+ {s}</li>)}
                        </ul>
                      </div>
                    )}
                    {a.weaknesses?.length > 0 && (
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-destructive mb-1">Fracos</p>
                        <ul className="text-xs space-y-0.5 text-muted-foreground">
                          {a.weaknesses.map((s, i) => <li key={i}>− {s}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  {r && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] truncate max-w-[60%]">
                        {r.original_filename}
                      </Badge>
                      <Button size="sm" variant="ghost" className="gap-1.5 h-7" onClick={() => openReport(r.storage_path)}>
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
