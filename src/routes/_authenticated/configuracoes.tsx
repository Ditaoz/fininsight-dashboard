import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Bot, CheckCircle2, AlertCircle } from "lucide-react";
import { getTelegramStatus, saveTelegramToken, disableTelegram } from "@/server/reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: Settings,
});

function Settings() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getTelegramStatus);
  const saveFn = useServerFn(saveTelegramToken);
  const disableFn = useServerFn(disableTelegram);

  const [token, setToken] = useState("");

  const { data: status, isLoading } = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => statusFn(),
  });

  const save = useMutation({
    mutationFn: (t: string) => saveFn({ data: { token: t } }),
    onSuccess: (res) => {
      toast.success(`Conectado como @${res?.username ?? "bot"}`);
      setToken("");
      queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha"),
  });

  const disable = useMutation({
    mutationFn: () => disableFn(),
    onSuccess: () => {
      toast.success("Bot desativado");
      queryClient.invalidateQueries({ queryKey: ["telegram-status"] });
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <header>
        <h1 className="font-display text-3xl tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Integrações e preferências da sua mesa.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <Bot className="h-5 w-5 text-accent" />
          <h2 className="font-display text-xl">Bot do Telegram</h2>
        </div>
          <p className="text-sm text-muted-foreground mb-6">
            Conecte um bot pessoal para receber PDFs encaminhados automaticamente.
          </p>

          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : status?.hasToken && status.enabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-mono">@{status.botUsername ?? "bot"} ativo</span>
              </div>
              {status.lastPolledAt && (
                <p className="text-xs text-muted-foreground font-mono">
                  Última verificação: {new Date(status.lastPolledAt).toLocaleString("pt-BR")}
                </p>
              )}
              {status.lastError && (
                <div className="flex items-start gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>{status.lastError}</span>
                </div>
              )}
              <Button variant="outline" onClick={() => disable.mutate()} disabled={disable.isPending}>
                Desativar bot
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/40 border border-border p-4 text-sm space-y-2">
                <p className="font-semibold">Como obter o token:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>No Telegram, abra <span className="font-mono text-foreground">@BotFather</span>.</li>
                  <li>Envie <span className="font-mono text-foreground">/newbot</span> e siga as instruções.</li>
                  <li>Copie o token (formato <span className="font-mono">123456:ABC-DEF...</span>) e cole abaixo.</li>
                </ol>
              </div>
              <Input
                placeholder="123456789:ABCdef..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono"
              />
              <Button onClick={() => save.mutate(token)} disabled={!token || save.isPending}>
                {save.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validando...
                  </>
                ) : (
                  "Conectar bot"
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Depois de conectar, mande <span className="font-mono text-foreground">/start</span> para o seu bot e encaminhe os PDFs dos relatórios.
                A coleta automática (cron) será ativada na próxima atualização.
              </p>
            </div>
          )}
      </section>
    </div>
  );
}

