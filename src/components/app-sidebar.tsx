import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sidebar,
  SidebarContent,
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
  LayoutDashboard,
  Settings,
  TrendingUp,
  ChevronRight,
  Building2,
  Coins,
  Landmark,
  CircleDollarSign,
  History,
  FileText,
} from "lucide-react";
import { listAssets } from "@/server/assets.functions";

const KIND_ICON: Record<string, typeof Building2> = {
  stock: TrendingUp,
  fii: Building2,
  crypto: Coins,
  fixed_income: Landmark,
  other: CircleDollarSign,
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const listAssetsFn = useServerFn(listAssets);

  const { data: assets = [] } = useQuery({
    queryKey: ["sidebar-assets"],
    queryFn: () => listAssetsFn(),
    refetchInterval: 10_000,
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border-strong/40">
        <Link to="/" className="flex items-center gap-2 px-2 py-1.5">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-chart-2 grid place-items-center font-mono font-bold text-primary-foreground shrink-0">
            M
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-mono font-semibold text-sm tracking-tight truncate">
                MESA DE ANÁLISE
              </p>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest truncate">
                trading desk
              </p>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Geral</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/"}>
                  <Link to="/">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Painel do dia</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/relatorios"}>
                  <Link to="/relatorios">
                    <FileText className="h-4 w-4" />
                    <span>Todos os relatórios</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/configuracoes"}>
                  <Link to="/configuracoes">
                    <Settings className="h-4 w-4" />
                    <span>Configurações</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>
            Ativos {assets.length > 0 && <span className="ml-1 opacity-60">({assets.length})</span>}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {assets.length === 0 && !collapsed && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  Envie um relatório para começar.
                </p>
              )}
              {assets.map((a) => {
                const Icon = KIND_ICON[a.kind] ?? CircleDollarSign;
                const isActive = pathname.startsWith(`/ativo/${encodeURIComponent(a.key)}`);
                return (
                  <Collapsible key={a.key} defaultOpen={isActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton isActive={isActive} className="data-[state=open]:bg-sidebar-accent/50">
                          <Icon className="h-4 w-4" />
                          <span className="font-mono truncate">{a.asset_id ?? a.asset_name ?? a.key}</span>
                          <ChevronRight className="ml-auto h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === `/ativo/${encodeURIComponent(a.key)}`}
                            >
                              <Link
                                to="/ativo/$assetKey"
                                params={{ assetKey: a.key }}
                              >
                                <History className="h-3.5 w-3.5" />
                                <span>Histórico</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === `/ativo/${encodeURIComponent(a.key)}/relatorios`}
                            >
                              <Link
                                to="/ativo/$assetKey/relatorios"
                                params={{ assetKey: a.key }}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>Relatórios</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
