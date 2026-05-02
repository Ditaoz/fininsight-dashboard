# Dashboard de Análise de Relatórios Financeiros

App pessoal (sem login) que recebe PDFs de relatórios — manualmente arrastando no app **ou** automaticamente via Telegram — extrai os dados, gera análise com IA e monta um panorama consolidado do dia.

## O que o app faz

1. **Captura** PDFs de duas formas:
   - Drop zone no dashboard (arrastar e soltar).
   - Bot pessoal no Telegram que recebe os PDFs encaminhados e o app puxa sozinho.
2. **Identifica o tipo de relatório** automaticamente (renda fixa / agente fiduciário, research de ações, FII, cripto, fato relevante, etc.) e extrai os campos certos para cada caso.
3. **Analisa** com IA: gera resumo, pontos fortes, pontos fracos, riscos e uma sugestão própria (Aportar / Segurar / Vender / Apenas monitorar) com justificativa.
4. **Consolida** todos os relatórios do dia em um panorama executivo da carteira.

## Tipos de relatório suportados (auto-detectados pela IA)

- **Renda fixa / Agente fiduciário** (como o PDF da Pentágono que você mandou): emissor, código do ativo, taxa, vencimento, pagamentos do ano, inadimplementos, eventos relevantes, garantias, parecer de saúde da emissão.
- **Ações**: ticker, preço, tese, múltiplos, recomendação da casa (se houver), pontos fortes/fracos.
- **FIIs**: ticker, cota, dividend yield, vacância, segmento, recomendação.
- **Cripto**: ativo, preço, sentimento, on-chain/técnico, recomendação.
- **Outros / fato relevante**: o app salva o resumo e categoriza como "informativo" sem forçar uma sugestão.

A IA decide qual molde aplicar a partir do conteúdo do PDF.

## Telas

- **/ (Dashboard)** — drop zone, cards dos relatórios processados hoje, panorama consolidado, status do bot do Telegram.
- **/historico** — tabela filtrável por ticker/emissor, tipo e data, com timeline de recomendações.
- **/ativo/$id** — página de detalhe de um ativo: todas as análises passadas, evolução das recomendações, link para baixar os PDFs originais.
- **/configuracoes** — onde você cola o token do bot do Telegram e habilita a coleta automática.

## Integração com Telegram (automática)

Como bots do Telegram **não conseguem ler mensagens enviadas por outros bots**, o fluxo automático funciona assim:

```text
Bot original (Pentágono etc.) ──► seu chat no Telegram
                                     │
                            você encaminha o PDF
                                     ▼
                          Seu bot pessoal (BotFather)
                                     │
                          App puxa via getUpdates a cada minuto
                                     ▼
                              Extração + IA + Banco
```

**O que você faz uma vez:**
1. Cria um bot novo no `@BotFather` no Telegram, copia o token.
2. Cola o token na tela de Configurações do app.
3. Manda `/start` para o seu bot.

**O que você faz no dia a dia:**
- Quando o bot original te enviar o PDF, você toca em "encaminhar" e escolhe o seu bot. Pronto — em até ~1 min o app processa e mostra a análise.

> Dica: dá para criar um grupo no Telegram com você + os bots de research + seu bot pessoal, o que reduz o reencaminhamento. Te explico isso na hora de configurar.

## Como cada PDF é processado

```text
PDF (upload OU Telegram) ──► Storage privado (guarda original)
                          └► Extração de texto (pdf-parse no servidor)
                             └► IA (Lovable AI / Gemini) com tool calling:
                                • detecta tipo (renda fixa, ação, FII, cripto, outro)
                                • extrai campos relevantes do tipo
                                • lista pontos fortes, fracos, riscos
                                • gera sugestão própria + justificativa
                             └► Salva análise estruturada no banco
```

O **Panorama Consolidado** pega todas as análises do dia e pede à IA um resumo executivo: o que merece aporte prioritário, o que está em alerta, sentimento por classe de ativo.

## Dados guardados

- **reports** — arquivo original, fonte (upload/telegram), data, status, texto extraído.
- **analyses** — tipo do relatório, identificador do ativo (ticker/código), campos estruturados (JSON flexível por tipo), pontos fortes, fracos, sugestão, justificativa, vínculo com o report.
- **daily_summaries** — panorama consolidado por data.
- **telegram_config** — token do bot e offset de polling.
- **Storage bucket privado** — PDFs originais (URL assinada para download).

## Visual

Dark mode estilo terminal de trading: tipografia clara, cards com bordas suaves, badges coloridos para sugestão (verde aportar, amarelo segurar, vermelho vender, cinza monitorar), ícones por tipo de ativo. Componentes shadcn/ui sobre Tailwind.

## Detalhes técnicos

- **Stack**: TanStack Start + Tailwind + shadcn/ui.
- **Backend**: Lovable Cloud (Supabase) — banco + Storage privado.
- **Extração de PDF**: `pdf-parse` em `createServerFn`. Para PDFs escaneados a gente avalia OCR depois; o PDF de exemplo tem texto selecionável.
- **IA**: Lovable AI Gateway com `google/gemini-3-flash-preview`, usando *tool calling* para JSON estruturado. Dois prompts: um detector+extrator, outro consolidador. Sem chave de API para você configurar.
- **Telegram**: conector oficial via gateway do Lovable. Polling a cada minuto via cron de servidor (sem webhooks, que não são suportados pelo conector).
- **Sem login** — app pessoal. O token do bot fica protegido no banco.

## O que entra na primeira versão

- Dashboard, drop zone, processamento por IA, histórico, página de ativo, panorama consolidado, integração Telegram via bot pessoal com polling automático.

## O que fica para depois

- OCR para PDFs escaneados.
- Alertas push / email quando uma sugestão crítica chegar.
- Multiusuário com login.
- Gráficos avançados de evolução por ativo.
