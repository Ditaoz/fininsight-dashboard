import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAssetDetail, getReportSignedUrl } from "@/server/assets.functions";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Download, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/ativo/$assetKey/relatorios")({
  component: AssetReportsPage,
});

function AssetReportsPage() {
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
  if (!data) return null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <Link to="/ativo/$assetKey" params={{ assetKey }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Voltar ao histórico
          </Link>
          <h1 className="font-mono text-2xl font-semibold tracking-tight mt-1">
            Relatórios — {data.asset_id ?? data.asset_name ?? assetKey}
          </h1>
        </div>
      </header>

      {data.reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum relatório vinculado.</p>
      ) : (
        <ul className="space-y-2">
          {data.reports
            .slice()
            .sort((a, b) => +new Date(b.received_at) - +new Date(a.received_at))
            .map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-mono truncate">{r.original_filename}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(r.received_at).toLocaleString("pt-BR")} · {r.source}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openReport(r.storage_path)}>
                  <Download className="h-3.5 w-3.5" />
                  Baixar
                </Button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
