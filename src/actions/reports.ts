import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BUCKET = "reports";

// ---- Schemas ----------------------------------------------------------------

const uploadSchema = z.object({
  filename: z.string().min(1).max(255),
  base64: z.string().min(10),
  source: z.enum(["upload", "telegram"]).default("upload"),
  sourceRef: z.string().nullable().optional(),
});

const summarySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const tokenSchema = z.object({
  token: z
    .string()
    .min(20)
    .max(200)
    .regex(/^\d+:[A-Za-z0-9_-]+$/, "Token inválido"),
});

const signedUrlSchema = z.object({
  reportId: z.string().uuid(),
});

const assetHistorySchema = z.object({
  assetKey: z.string().min(1).max(120),
});

// ---- Upload + processar PDF (base64) ---------------------------------------

export const uploadAndAnalyzePdf = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractPdfText } = await import("../server/pdf.server");
    const { analyzeReportText } = await import("../server/ai.server");

    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const safeName = data.filename
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(-120);
    const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

    const upload = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upload.error) throw new Error(`Falha ao salvar PDF: ${upload.error.message}`);

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
      const text = await extractPdfText(bytes);
      await supabaseAdmin
        .from("reports")
        .update({ extracted_text: text, status: "analyzing" })
        .eq("id", reportId);

      const result = await analyzeReportText({ text, filename: data.filename });

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
  .inputValidator((input: unknown) => summarySchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { consolidateDailySummary } = await import("../server/ai.server");

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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("telegram_config")
    .select("enabled,bot_username,last_polled_at,last_error,bot_token")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return {
    enabled: !!data?.enabled,
    botUsername: data?.bot_username ?? null,
    lastPolledAt: data?.last_polled_at ?? null,
    lastError: data?.last_error ?? null,
    hasToken: !!data?.bot_token,
  };
});

export const saveTelegramToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const resp = await fetch(`https://api.telegram.org/bot${data.token}/getMe`);
    const json = (await resp.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!json.ok) {
      throw new Error(`Token rejeitado pelo Telegram: ${json.description ?? "desconhecido"}`);
    }
    const username = json.result?.username ?? "bot";

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
    return { username, ok: true };
  });

export const disableTelegram = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("telegram_config")
    .update({ enabled: false })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  return { ok: true };
});

// ---- Signed URL para download do PDF original ------------------------------

export const getReportSignedUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signedUrlSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: report, error } = await supabaseAdmin
      .from("reports")
      .select("storage_path,original_filename")
      .eq("id", data.reportId)
      .single();
    if (error || !report) throw new Error("Relatório não encontrado");

    const signed = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(report.storage_path, 300, {
        download: report.original_filename,
      });
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, filename: report.original_filename };
  });

// ---- Histórico completo de um ativo ----------------------------------------

export const getAssetHistory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => assetHistorySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // assetKey pode ser asset_id (ex "PETR4") ou asset_name (fallback)
    const { data: byId, error: errId } = await supabaseAdmin
      .from("analyses")
      .select("*, reports(id, original_filename, received_at, source)")
      .eq("asset_id", data.assetKey)
      .order("analysis_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (errId) throw new Error(errId.message);

    let rows = byId ?? [];
    if (rows.length === 0) {
      const { data: byName, error: errName } = await supabaseAdmin
        .from("analyses")
        .select("*, reports(id, original_filename, received_at, source)")
        .eq("asset_name", data.assetKey)
        .order("analysis_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (errName) throw new Error(errName.message);
      rows = byName ?? [];
    }

    return { analyses: rows };
  });
