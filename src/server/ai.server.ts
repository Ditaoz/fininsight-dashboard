// AI helper for analyzing financial reports via Lovable AI Gateway.
// Server-only.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export type AssetKind = "fixed_income" | "stock" | "fii" | "crypto" | "other";
export type Recommendation = "buy" | "hold" | "sell" | "monitor";

export interface AssetAnalysis {
  kind: AssetKind;
  asset_id: string | null;
  asset_name: string | null;
  price: number | null;
  recommendation: Recommendation | null;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  ai_opinion: string;
  justification: string;
  structured_data: Record<string, unknown>;
}

export interface ReportAnalysisResult {
  report_summary: string;
  assets: AssetAnalysis[];
}

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "register_report_analysis",
    description:
      "Registra a análise estruturada de um relatório financeiro. Pode conter um ou vários ativos.",
    parameters: {
      type: "object",
      properties: {
        report_summary: {
          type: "string",
          description: "Resumo executivo do relatório como um todo, em português, 2-4 frases.",
        },
        assets: {
          type: "array",
          description:
            "Lista de ativos abordados no relatório. Se o relatório cobrir vários (ex.: várias emissões), liste cada um. Se nenhum ativo claro, retorne um item com kind='other'.",
          items: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["fixed_income", "stock", "fii", "crypto", "other"],
                description:
                  "fixed_income = renda fixa / debênture / nota comercial / CRA / CRI; stock = ação; fii = fundo imobiliário; crypto = criptomoeda; other = outros (fato relevante, macro, informativo).",
              },
              asset_id: {
                type: "string",
                description: "Ticker (PETR4, HGLG11, BTC) ou código do ativo. Null se não houver.",
              },
              asset_name: {
                type: "string",
                description: "Nome do emissor/empresa/ativo.",
              },
              price: {
                type: "number",
                description: "Preço/cotação atual mencionado, se houver.",
              },
              recommendation: {
                type: "string",
                enum: ["buy", "hold", "sell", "monitor"],
                description:
                  "Sua opinião como analista IA: buy=aportar, hold=segurar, sell=vender, monitor=apenas monitorar. Use 'monitor' quando o relatório for puramente informativo.",
              },
              strengths: {
                type: "array",
                items: { type: "string" },
                description: "Pontos fortes (3 a 6 itens curtos, em português).",
              },
              weaknesses: {
                type: "array",
                items: { type: "string" },
                description: "Pontos fracos (3 a 6 itens curtos, em português).",
              },
              risks: {
                type: "array",
                items: { type: "string" },
                description: "Riscos relevantes (até 5 itens, em português).",
              },
              ai_opinion: {
                type: "string",
                description:
                  "Sua segunda opinião como analista IA, em português, 2-4 frases. Direta e fundamentada nos dados do relatório.",
              },
              justification: {
                type: "string",
                description: "Justificativa breve da recomendação (1-3 frases).",
              },
              structured_data: {
                type: "object",
                description:
                  "Campos extras específicos do tipo: para renda fixa {emissor, codigo, taxa, vencimento, inadimplementos}; para ações {tese, multiplo, setor}; para FII {dy, vacancia, segmento}; para cripto {sentimento, tecnico}.",
                additionalProperties: true,
              },
            },
            required: [
              "kind",
              "strengths",
              "weaknesses",
              "risks",
              "ai_opinion",
              "justification",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["report_summary", "assets"],
      additionalProperties: false,
    },
  },
} as const;

const SYSTEM_PROMPT = `Você é um analista financeiro experiente trabalhando em uma mesa de análise de carteira pessoal (Brasil). Recebe relatórios em PDF de diversas fontes: agentes fiduciários (renda fixa, debêntures, notas comerciais, CRAs, CRIs), casas de research (ações e FIIs), análises de criptomoedas e fatos relevantes.

Sua tarefa: extrair os dados-chave do relatório e gerar UMA SEGUNDA OPINIÃO como analista — não copiar a opinião do relatório. Seja direto, técnico e em português.

Regras:
- OBRIGATÓRIO: Você deve sempre retornar pelo menos 1 item na lista 'assets'. Se o documento for genérico ou não tiver um ativo claro, crie um ativo com kind='other' e asset_name='Documento Geral'.
- Detecte automaticamente o tipo de cada ativo coberto.
- Para relatórios de agente fiduciário (Pentágono, Oliveira Trust, etc.), cada emissão é um "asset" com kind=fixed_income, asset_id=código do ativo (ex: NC0022005PN), asset_name=nome do emissor.
- Para relatórios meramente informativos sem recomendação clara, use recommendation='monitor'.
- Pontos fortes/fracos devem ser CONCRETOS e curtos (≤ 14 palavras cada).
- Nunca invente preços ou taxas que não estejam no documento.
- Sempre responda chamando a ferramenta register_report_analysis.`;

interface CallOptions {
  text: string;
  filename: string;
}

export async function analyzeReportText({ text, filename }: CallOptions): Promise<ReportAnalysisResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  // Truncate to keep prompt size in check (~ 60k chars => ~ 15k tokens)
  const truncated = text.length > 60000 ? text.slice(0, 60000) + "\n\n[... TRUNCADO ...]" : text;

  const userPrompt = `Arquivo: ${filename}

Conteúdo extraído do PDF:
"""
${truncated}
"""

Analise e chame a ferramenta register_report_analysis.`;

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "register_report_analysis" } },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) {
      throw new Error("AI_RATE_LIMIT");
    }
    if (response.status === 402) {
      throw new Error("AI_PAYMENT_REQUIRED");
    }
    throw new Error(`AI gateway error [${response.status}]: ${body}`);
  }

  const json = await response.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("AI did not return a tool call");
  }
  const parsed = JSON.parse(toolCall.function.arguments) as ReportAnalysisResult;

  // Sanitize
  parsed.assets = (parsed.assets ?? []).map((a) => ({
    kind: a.kind ?? "other",
    asset_id: a.asset_id ?? null,
    asset_name: a.asset_name ?? null,
    price: typeof a.price === "number" ? a.price : null,
    recommendation: a.recommendation ?? null,
    strengths: Array.isArray(a.strengths) ? a.strengths.slice(0, 6) : [],
    weaknesses: Array.isArray(a.weaknesses) ? a.weaknesses.slice(0, 6) : [],
    risks: Array.isArray(a.risks) ? a.risks.slice(0, 5) : [],
    ai_opinion: a.ai_opinion ?? "",
    justification: a.justification ?? "",
    structured_data: a.structured_data ?? {},
  }));

  return parsed;
}

// ---- Daily summary -----------------------------------------------------------

export interface DailySummaryResult {
  macro_scenario: string;
  overview: string;
  priorities: Array<{ asset: string; action: string; reason: string }>;
  alerts: Array<{ asset: string; alert: string }>;
  sentiment_by_class: Record<string, string>;
}

const SUMMARY_TOOL = {
  type: "function",
  function: {
    name: "register_daily_summary",
    description: "Gera um panorama executivo do dia consolidando todas as análises.",
    parameters: {
      type: "object",
      properties: {
        macro_scenario: {
          type: "string",
          description: "Análise profunda do cenário macroeconômico atual (Brasil e Mundo) e da bolsa. Como proceder com os investimentos diante desse cenário? (Em português, 1 ou 2 parágrafos fortes).",
        },
        overview: {
          type: "string",
          description: "Resumo executivo específico da carteira analisada no dia, em português, 3-6 frases.",
        },
        priorities: {
          type: "array",
          description: "Top 3-5 ações prioritárias do dia.",
          items: {
            type: "object",
            properties: {
              asset: { type: "string" },
              action: { type: "string", description: "Ex.: Aportar, Reduzir, Monitorar." },
              reason: { type: "string" },
            },
            required: ["asset", "action", "reason"],
            additionalProperties: false,
          },
        },
        alerts: {
          type: "array",
          description: "Alertas críticos (riscos relevantes, eventos negativos).",
          items: {
            type: "object",
            properties: {
              asset: { type: "string" },
              alert: { type: "string" },
            },
            required: ["asset", "alert"],
            additionalProperties: false,
          },
        },
        sentiment_by_class: {
          type: "object",
          description:
            "Sentimento por classe (chaves: stocks, fiis, crypto, fixed_income). Valores: positivo, neutro, negativo, com 1 frase justificando.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["macro_scenario", "overview", "priorities", "alerts", "sentiment_by_class"],
      additionalProperties: false,
    },
  },
} as const;

export async function consolidateDailySummary(
  analyses: Array<{
    asset_name: string | null;
    asset_id: string | null;
    kind: string;
    recommendation: string | null;
    strengths: string[];
    weaknesses: string[];
    risks: string[];
    ai_opinion: string;
  }>,
): Promise<DailySummaryResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const condensed = analyses
    .map((a, i) => {
      const id = a.asset_id ?? a.asset_name ?? `Ativo ${i + 1}`;
      return `- [${a.kind}] ${id} | rec=${a.recommendation ?? "n/a"}
  Fortes: ${a.strengths.join("; ") || "—"}
  Fracos: ${a.weaknesses.join("; ") || "—"}
  Riscos: ${a.risks.join("; ") || "—"}
  Opinião: ${a.ai_opinion}`;
    })
    .join("\n\n");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Você é um Analista Chefe de uma Mesa de Operações Institucional. Sua tarefa é consolidar todas as análises do dia em um 'Panorama do Dia' altamente técnico, opinativo e fundamentado. Avalie as informações captadas dos PDFs, cruze os dados, aponte tendências claras de mercado, demonstre convicção e seja criterioso. Não faça apenas um resumo genérico; dê um parecer técnico de especialista.",
        },
        {
          role: "user",
          content: `Análises do dia (${analyses.length}):

${condensed}

Gere o panorama via ferramenta.`,
        },
      ],
      tools: [SUMMARY_TOOL],
      tool_choice: { type: "function", function: { name: "register_daily_summary" } },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429) throw new Error("AI_RATE_LIMIT");
    if (response.status === 402) throw new Error("AI_PAYMENT_REQUIRED");
    throw new Error(`AI gateway error [${response.status}]: ${body}`);
  }

  const json = await response.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("AI did not return a tool call");
  }
  return JSON.parse(toolCall.function.arguments) as DailySummaryResult;
}
