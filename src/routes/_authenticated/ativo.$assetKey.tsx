import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { getAssetHistory, getReportSignedUrl } from "@/server/reports.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/ativo/$assetKey")({
  component: AssetDetail,
});

const REC_LABEL: Record<string, string> = {
  buy: "Aportar",
  hold: "Segurar",
  sell: "Vender",
  monitor: "Monitorar",
};

function AssetDetail() {
  const { assetKey } = Route.useParams();
  const historyFn = useServerFn(getAssetHistory);
  const signFn = useServerFn(getReportSignedUrl);

  const { data, isLoading } = useQuery({
    queryKey: ["asset-history", assetKey],
    queryFn: () => historyFn({ data: { assetKey } }),
  });

  const download = useMutation({
    mutationFn: (reportId: string) => signFn({ data: { reportId } }),
    onSuccess: (res) => {
      if (res?.url) window.open(res.url, "_blank");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao baixar"),
  });

  const analyses = data?.analyses ?? [];
  const headerName = analyses[0]?.asset_name ?? assetKey;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight font-mono">{assetKey}</h1>
            <p className="text-xs text-muted-foreground">{headerName}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
        ) : analyses.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">Nenhuma análise para este ativo.</p>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {analyses.length} análise(s) no histórico
            </p>
            <ol className="relative border-l border-border pl-6 space-y-6">
              {analyses.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <article className="rounded-lg border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {new Date(a.analysis_date).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-sm mt-0.5 truncate max-w-md">
                          {a.reports?.original_filename ?? "Relatório"}
                        </p>
                      </div>
                      {a.recommendation && (
                        <Badge variant="outline">{REC_LABEL[a.recommendation]}</Badge>
                      )}
                    </div>

                    {a.ai_opinion && (
                      <p className="text-sm leading-relaxed mb-3">{a.ai_opinion}</p>
                    )}

                    <div className="grid sm:grid-cols-2 gap-3 mb-3">
                      {a.strengths?.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-success mb-1">
                            Pontos fortes
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {a.strengths.map((s: string, i: number) => (
                              <li key={i}>+ {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {a.weaknesses?.length > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-destructive mb-1">
                            Pontos fracos
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {a.weaknesses.map((s: string, i: number) => (
                              <li key={i}>− {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {a.reports?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-xs"
                        onClick={() => download.mutate(a.reports.id)}
                        disabled={download.isPending}
                      >
                        {download.isPending && download.variables === a.reports.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Baixar PDF original
                      </Button>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          </div>
        )}

        {analyses.length === 0 && !isLoading && (
          <FileText className="h-10 w-10 mx-auto opacity-20" />
        )}
      </main>
    </div>
  );
}
