import { useMemo } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LineChart,
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronRight,
  Building2,
  Building,
  Bitcoin,
  Banknote,
  CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type AnalysisRow = {
  asset_id: string | null;
  asset_name: string | null;
  kind: string;
};

const CATEGORIES: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "stock", label: "Ações", icon: Building2 },
  { key: "fii", label: "Fundos Imobiliários", icon: Building },
  { key: "crypto", label: "Cripto", icon: Bitcoin },
  { key: "fixed_income", label: "Renda Fixa", icon: Banknote },
  { key: "other", label: "Outros", icon: CircleDot },
];

export function AppSidebar({ userEmail }: { userEmail: string | null }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data } = useQuery({
    queryKey: ["sidebar-assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analyses")
        .select("asset_id,asset_name,kind")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AnalysisRow[];
    },
    refetchInterval: 10000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, { ticker: string; name: string }>>();
    for (const cat of CATEGORIES) map.set(cat.key, new Map());
    for (const a of data ?? []) {
      const key = a.asset_id ?? a.asset_name ?? "—";
      const cat = map.get(a.kind) ?? map.get("other")!;
      if (!cat.has(key)) {
        cat.set(key, {
          ticker: a.asset_id ?? a.asset_name ?? "—",
          name: a.asset_name ?? key,
        });
      }
    }
    return map;
  }, [data]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border/40">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="h-8 w-8 shrink-0 rounded-md bg-sidebar-primary grid place-items-center">
            <LineChart className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-display text-sm truncate">Mesa de Análise</span>
              <span className="text-[10px] text-sidebar-foreground/60 font-mono truncate">
                {userEmail ?? "—"}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Principal */}
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="Mesa de Análise">
                  <Link to="/">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Mesa de Análise</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Categorias com empresas */}
        <SidebarGroup>
          <SidebarGroupLabel>Carteira</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {CATEGORIES.map((cat) => {
                const items = Array.from(grouped.get(cat.key)?.values() ?? []).sort((a, b) =>
                  a.ticker.localeCompare(b.ticker),
                );
                if (items.length === 0 && cat.key === "other") return null;
                const Icon = cat.icon;
                const hasActive = items.some((i) => pathname === `/ativo/${encodeURIComponent(i.ticker)}`);
                return (
                  <Collapsible key={cat.key} defaultOpen={hasActive || items.length > 0} asChild>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={cat.label} className="group/collapsible">
                          <Icon className="h-4 w-4" />
                          <span className="flex-1">{cat.label}</span>
                          {items.length > 0 && (
                            <span className="text-[10px] font-mono text-sidebar-foreground/50 tabular-nums">
                              {items.length}
                            </span>
                          )}
                          <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {items.length === 0 ? (
                            <li className="px-2 py-1 text-[11px] text-sidebar-foreground/40">
                              vazio
                            </li>
                          ) : (
                            items.map((it) => (
                              <SidebarMenuSubItem key={it.ticker}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={pathname === `/ativo/${encodeURIComponent(it.ticker)}`}
                                >
                                  <Link
                                    to="/ativo/$assetKey"
                                    params={{ assetKey: it.ticker }}
                                    title={it.name}
                                  >
                                    <span className="font-mono text-xs">{it.ticker}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))
                          )}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Sistema */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/configuracoes"}
                  tooltip="Configurações"
                >
                  <Link to="/configuracoes">
                    <Settings className="h-4 w-4" />
                    <span>Configurações</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/40">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
