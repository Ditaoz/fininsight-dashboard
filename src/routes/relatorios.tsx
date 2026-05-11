import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getReportSignedUrl } from "@/server/assets.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/relatorios")({
  component: AllReportsPage,
});

const STATUS: Record<string, { label: string; className: string }> = {
  ready: { label: "ok", className: "bg-success/15 text-success border-success/30" },
  failed: { label: "erro", className: "bg-destructive/15 text-destructive border-destructive/30" },
  analyzing: { label: "analisando", className: "bg-info/15 text-info border-info/30" },
  extracting: { label: "extraindo", className: "bg-info/15 text-info border-info/30" },
  pending: { label: "pendente", className: "bg-muted text-muted-foreground" },
};

function AllReportsPage() {
  const signFn = useServerFn(getReportSignedUrl);
  const { data, isLoading } = useQuery({
    queryKey: ["all-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id,original_filename,received_at,storage_path,source,status,error_message")
        .order("received_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 5000,
  });

  async function openReport(path: string) {
    try {
      const { url } = await signFn({ data: { storagePath: path } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir PDF");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">Todos os relatórios</h1>
        <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">
          {data?.length ?? 0} arquivo(s)
        </p>
      </header>

      {isLoading ? (
        <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum relatório enviado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((r) => {
            const s = STATUS[r.status] ?? STATUS.pending;
            return (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-mono truncate">{r.original_filename}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(r.received_at).toLocaleString("pt-BR")} · {r.source}
                    </p>
                    {r.error_message && (
                      <p className="text-[11px] text-destructive truncate">{r.error_message}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${s.className}`}>{s.label}</Badge>
                  <Button size="sm" variant="ghost" className="gap-1.5 h-7" onClick={() => openReport(r.storage_path)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
