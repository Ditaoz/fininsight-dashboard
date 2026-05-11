import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractPdfText } from "./pdf.server";
import { analyzeReportText, consolidateDailySummary } from "./ai.server";

const BUCKET = "reports";

// ---- Upload + processar PDF (base64) ---------------------------------------

export const uploadAndAnalyzePdf = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      filename: z.string().min(1).max(255),
      base64: z.string().min(10),
      source: z.enum(["upload", "telegram"]).default("upload"),
      sourceRef: z.string().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${data.filename}`;

    // 1) salva o PDF no storage
    const upload = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error) throw new Error(`Falha ao salvar PDF: ${upload.error.message}`);

    // 2) cria report
    const insertReport = await supabaseAdmin
      .from("reports")
      .insert({
        source: data.source,
        source_ref: data.sourceRef ?? null,
        original_filename: data.filename,
        storage_path: storagePath,
        status: "extracting",
      })
      .select()
      .single();
    if (insertReport.error) throw new Error(insertReport.error.message);
    const reportId = insertReport.data.id as string;

    try {
      // 3) extrai texto
      const text = await extractPdfText(bytes);
      await supabaseAdmin
        .from("reports")
        .update({ extracted_text: text, status: "analyzing" })
        .eq("id", reportId);

      // 4) IA
      const result = await analyzeReportText({ text, filename: data.filename });

      // 5) salva análises
      if (result.assets.length > 0) {
        const rows = result.assets.map((a) => ({
          report_id: reportId,
          kind: a.kind,
          asset_id: a.asset_id,
          asset_name: a.asset_name,
          price: a.price,
          recommendation: a.recommendation,
          strengths: a.strengths,
          weaknesses: a.weaknesses,
          risks: a.risks,
          ai_opinion: a.ai_opinion,
          justification: a.justification,
          structured_data: a.structured_data as never,
        }));
        const ins = await supabaseAdmin.from("analyses").insert(rows);
        if (ins.error) throw new Error(ins.error.message);
      }

      await supabaseAdmin.from("reports").update({ status: "ready" }).eq("id", reportId);
      return { reportId, assetsCount: result.assets.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      await supabaseAdmin
        .from("reports")
        .update({ status: "failed", error_message: message })
        .eq("id", reportId);
      throw err;
    }
  });

// ---- Panorama do dia --------------------------------------------------------

export const generateDailySummary = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    const date = data.date ?? new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await supabaseAdmin
      .from("analyses")
      .select("asset_id,asset_name,kind,recommendation,strengths,weaknesses,risks,ai_opinion")
      .eq("analysis_date", date);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      throw new Error("Nenhuma análise para essa data ainda.");
    }

    const summary = await consolidateDailySummary(
      rows.map((r) => ({
        asset_id: r.asset_id,
        asset_name: r.asset_name,
        kind: r.kind,
        recommendation: r.recommendation,
        strengths: r.strengths ?? [],
        weaknesses: r.weaknesses ?? [],
        risks: r.risks ?? [],
        ai_opinion: r.ai_opinion ?? "",
      })),
    );

    const upsert = await supabaseAdmin
      .from("daily_summaries")
      .upsert(
        {
          summary_date: date,
          overview: summary.overview,
          priorities: summary.priorities,
          alerts: summary.alerts,
          sentiment_by_class: summary.sentiment_by_class,
          analyses_count: rows.length,
        },
        { onConflict: "summary_date" },
      )
      .select()
      .single();
    if (upsert.error) throw new Error(upsert.error.message);
    return upsert.data;
  });

// ---- Telegram config --------------------------------------------------------

export const getTelegramStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("telegram_config")
    .select("enabled,bot_username,last_polled_at,last_error,bot_token")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return {
    enabled: data.enabled,
    botUsername: data.bot_username,
    lastPolledAt: data.last_polled_at,
    lastError: data.last_error,
    hasToken: !!data.bot_token,
  };
});

export const saveTelegramToken = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(20).max(200).regex(/^\d+:[A-Za-z0-9_-]+$/, "Token inválido"),
    }).parse,
  )
  .handler(async ({ data }) => {
    // valida com getMe
    const resp = await fetch(`https://api.telegram.org/bot${data.token}/getMe`);
    const json = (await resp.json()) as { ok: boolean; result?: { username?: string }; description?: string };
    if (!json.ok) throw new Error(`Token rejeitado pelo Telegram: ${json.description ?? "?"}`);
    const username = json.result?.username ?? null;

    const { error } = await supabaseAdmin
      .from("telegram_config")
      .update({
        bot_token: data.token,
        bot_username: username,
        enabled: true,
        last_error: null,
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { username };
  });

export const disableTelegram = createServerFn({ method: "POST" }).handler(async () => {
  const { error } = await supabaseAdmin
    .from("telegram_config")
    .update({ enabled: false })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  return { ok: true };
});
