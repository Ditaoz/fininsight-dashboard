## O que está acontecendo

**1. Bug no Telegram:** O token está correto (validei o `getMe` direto: `@DiiitosBot`, ok). O erro real visto no replay é:

> "Cannot read properties of undefined (reading 'username')"

Causa: a server function `saveTelegramToken` em `src/server/reports.functions.ts` usa o padrão `.inputValidator(z.object({...}).parse)` (passando `.parse` como referência). Em alguns runtimes do TanStack Start isso retorna `undefined` ao concluir, mesmo quando o `update` no banco funciona. O frontend então faz `res.username` e quebra.

**Correção:** trocar `.parse` por `(input) => schema.parse(input)` (padrão recomendado pela documentação do `createServerFn`) em todas as 4 server functions afetadas, e tornar o `onSuccess` do client tolerante a `res?.username`.

**2. Layout:** hoje tudo é uma lista plana de cards do dia. O usuário quer:
- Visual mais limpo / minimalista.
- Uma seção "Mesa de Análise" com **agrupamento por ativo** (ex: Petrobras → todos os PDFs e análises daquela empresa, ordenados por data).

---

## Plano de implementação

### Parte 1 — Corrigir o cadastro do bot do Telegram

Arquivo: `src/server/reports.functions.ts`
- Substituir `z.object({...}).parse` por `(input) => z.object({...}).parse(input)` nas 4 funções (`uploadAndAnalyzePdf`, `generateDailySummary`, `saveTelegramToken`, e validador da `disableTelegram` se aplicável).
- Garantir que `saveTelegramToken` retorne explicitamente `{ username: username ?? "bot" }` (nunca `null`).

Arquivo: `src/routes/configuracoes.tsx`
- `onSuccess: (res) => toast.success(\`Conectado como @${res?.username ?? "bot"}\`)` (defensivo).
- Mostrar mensagem amigável quando o token é rejeitado (já existe `onError`, manter).

Verificação: depois do fix, conectar o bot `@DiiitosBot` deve marcar a linha `telegram_config` com `enabled=true` e `bot_username='DiiitosBot'`.

### Parte 2 — Redesign "Mesa de Análise" agrupada por ativo

**Layout novo (clean, minimalista):**

```text
┌─────────────────────────────────────────────────────────┐
│  Mesa de Análise                            [+ Upload]  │
│  sábado, 02 de maio • 12 análises • 5 ativos            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Panorama do dia  ─────────────  [Gerar / Atualizar]    │
│  texto resumido + prioridades + alertas                 │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Ativos                            [Todos][Ações][FIIs] │
│                                                         │
│  ▸ PETR4 · Petrobras           Aportar · 3 relatórios   │
│  ▸ FATN11 · Fator Renda Fixa   Monitorar · 1 relatório  │
│  ▾ MXRF11 · Maxi Renda          Segurar · 2 relatórios  │
│      ├ 02/05 — Relatório mensal abril                   │
│      │   Pontos fortes / fracos / opinião IA            │
│      │   [Baixar PDF original]                          │
│      └ 28/04 — Comunicado de fato relevante             │
│          ...                                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Mudanças concretas:**

1. **Drop zone enxuta:** vira um botão pequeno no header (`+ Adicionar PDF`) que abre file picker; arrasto continua funcionando em qualquer área da página (overlay aparece só durante o drag). Reduz o peso visual.

2. **Painel "Panorama do dia"** mantém-se como hoje, mas com tipografia mais leve (sem caixa-alta/mono pesado), borda sutil, sem `glow-amber`.

3. **Lista agrupada por ativo** (substitui o grid de cards):
   - Agrupar `analyses` do dia por `asset_id` (ou `asset_name` quando `asset_id` é nulo).
   - Cada grupo é um `<Collapsible>` (já temos em `components/ui/collapsible.tsx`):
     - Header: ticker, nome, badge de recomendação consolidada (a mais frequente do grupo), contagem de relatórios.
     - Conteúdo expandido: lista vertical das análises ordenadas por `analysis_date DESC, created_at DESC`, cada item com data, nome do PDF, opinião da IA, fortes/fracos resumidos e botão **"Baixar PDF original"** (signed URL via nova server fn).
   - Filtro por tipo (Todos / Ações / FIIs / Cripto / Renda Fixa) usando `Tabs`.

4. **Visualizar todos os relatórios de um ativo (histórico completo, não só hoje):**
   - Adicionar página `src/routes/ativo.$assetId.tsx` (TanStack file-route) com timeline completa daquele ticker. Acessada clicando no header do grupo.
   - Server fn `getAssetHistory({ assetId })` retornando todas as análises + reports daquele ativo ordenadas por data desc.

5. **Server fn nova: `getReportSignedUrl({ reportId })`** — gera signed URL (5 min) do PDF no bucket privado `reports`, usada pelo botão de download.

6. **Polimento visual ("clean e bonito"):**
   - Remover acentos visuais pesados (`font-mono` em todo lugar, `glow-amber`, badges em caixa-alta). Manter mono apenas em tickers/preços.
   - Usar tipografia padrão `Inter`, hierarquia por peso/tamanho.
   - Espaçamentos maiores entre seções (`space-y-10`).
   - Cards com borda 1px sutil, sem sombra colorida.
   - Header sticky mais fino.

### Parte 3 — Banco de dados

Sem mudanças de schema. As tabelas atuais já têm `asset_id`, `analysis_date`, `report_id` — basta agrupar no frontend.

(Opcional, fora deste plano: índice composto `(asset_id, analysis_date DESC)` se a base crescer.)

### Detalhes técnicos

- Agrupamento feito em memória após query: `select * from analyses where analysis_date = today` + join com `reports` (já feito hoje); `Map<assetKey, Analysis[]>`.
- Recomendação consolidada do grupo: maior contagem entre `buy/hold/sell/monitor`; empate → última recebida.
- Signed URL: `supabaseAdmin.storage.from('reports').createSignedUrl(path, 300)`.
- Rota nova `/ativo/$assetId` precisa ser criada **antes** de ser referenciada em `<Link>` (TanStack é type-safe).
- Manter o cron/polling do Telegram fora de escopo (é a próxima task da lista anterior).

### Resultado esperado

- Token do `@DiiitosBot` é aceito e salvo (status verde em Configurações).
- Página inicial vira "Mesa de Análise" limpa, com Panorama no topo e ativos agrupados (cada empresa em seu próprio bloco expansível, com histórico do dia + acesso ao histórico completo).
- Cada ativo agrega seus PDFs e análises por data; download do original disponível em cada item.