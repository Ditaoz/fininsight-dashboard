import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LineChart } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message === "Invalid login credentials" ? "Email ou senha incorretos" : error.message);
      return;
    }
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground relative overflow-hidden">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-md bg-accent grid place-items-center">
            <LineChart className="h-5 w-5 text-accent-foreground" />
          </div>
          <span className="font-display text-xl">Mesa de Análise</span>
        </div>
        <div className="space-y-4 max-w-md relative z-10">
          <h1 className="font-display text-4xl leading-tight">
            Sua leitura do mercado, organizada e assinada por IA.
          </h1>
          <p className="text-sm text-sidebar-foreground/70 leading-relaxed">
            Receba relatórios em PDF, deixe a inteligência artificial extrair os pontos
            essenciais e tenha um panorama claro do dia.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50 font-mono">
          © {new Date().getFullYear()} · Acesso restrito
        </p>
        <div className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-md bg-primary grid place-items-center">
              <LineChart className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg">Mesa de Análise</span>
          </div>

          <div className="space-y-2">
            <h2 className="font-display text-2xl">Entrar</h2>
            <p className="text-sm text-muted-foreground">
              Acesse sua mesa pessoal de análise.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Acesso restrito. Cadastros estão desabilitados.
          </p>
        </form>
      </main>
    </div>
  );
}
