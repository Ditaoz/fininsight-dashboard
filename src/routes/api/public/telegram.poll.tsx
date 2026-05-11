import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractPdfText } from "@/server/pdf.server";
import { analyzeReportText } from "@/server/ai.server";

const BUCKET = "reports";
const TELEGRAM_API = "https://api.telegram.org";

interface TgDocument {
  file_id: string;
  file_name?: string;
  mime_type?: string;
}
interface TgMessage {
  message_id: number;
  date: number;
  chat: { id: number; title?: string };
  document?: TgDocument;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  channel_post?: TgMessage;
}

async function processOnePdf(opts: {
  bytes: Uint8Array;
  filename: string;
  sourceRef: string;
}) {
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${opts.filename}`;
  const up = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, opts.bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (up.error) throw new Error(up.error.message);

  const ins = await supabaseAdmin
    .from("reports")
    .insert({
      source: "telegram",
      source_ref: opts.sourceRef,
      original_filename: opts.filename,
      storage_path: storagePath,
      status: "extracting",
    })
    .select()
    .single();
  if (ins.error) throw new Error(ins.error.message);
  const reportId = ins.data.id as string;

  try {
    const text = await extractPdfText(opts.bytes);
    await supabaseAdmin
      .from("reports")
      .update({ extracted_text: text, status: "analyzing" })
      .eq("id", reportId);

    const result = await analyzeReportText({ text, filename: opts.filename });
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
      const insA = await supabaseAdmin.from("analyses").insert(rows);
      if (insA.error) throw new Error(insA.error.message);
    }
    await supabaseAdmin.from("reports").update({ status: "ready" }).eq("id", reportId);
    return { reportId, assets: result.assets.length };
  } catch (err) {
    await supabaseAdmin
      .from("reports")
      .update({ status: "failed", error_message: err instanceof Error ? err.message : "erro" })
      .eq("id", reportId);
    throw err;
  }
}

async function handle() {
  const { data: cfg, error: cfgErr } = await supabaseAdmin
    .from("telegram_config")
    .select("bot_token,enabled,update_offset")
    .eq("id", 1)
    .single();
  if (cfgErr) throw new Error(cfgErr.message);
  if (!cfg.enabled || !cfg.bot_token) {
    return { skipped: true, reason: "telegram disabled or no token" };
  }

  const updatesUrl = `${TELEGRAM_API}/bot${cfg.bot_token}/getUpdates?timeout=0&offset=${cfg.update_offset ?? 0}&allowed_updates=${encodeURIComponent(JSON.stringify(["message", "channel_post"]))}`;
  const res = await fetch(updatesUrl);
  const json = (await res.json()) as { ok: boolean; result?: TgUpdate[]; description?: string };
  if (!json.ok) {
    await supabaseAdmin
      .from("telegram_config")
      .update({ last_error: json.description ?? "getUpdates failed", last_polled_at: new Date().toISOString() })
      .eq("id", 1);
    return { error: json.description };
  }

  const updates = json.result ?? [];
  let processed = 0;
  let failed = 0;
  let lastUpdateId = cfg.update_offset ?? 0;

  for (const u of updates) {
    lastUpdateId = u.update_id + 1;
    const msg = u.message ?? u.channel_post;
    const doc = msg?.document;
    if (!doc) continue;
    const filename = doc.file_name ?? `${doc.file_id}.pdf`;
    const isPdf =
      (doc.mime_type ?? "").toLowerCase().includes("pdf") ||
      filename.toLowerCase().endsWith(".pdf");
    if (!isPdf) continue;

    try {
      // Get file path
      const fileRes = await fetch(`${TELEGRAM_API}/bot${cfg.bot_token}/getFile?file_id=${doc.file_id}`);
      const fileJson = (await fileRes.json()) as { ok: boolean; result?: { file_path: string } };
      if (!fileJson.ok || !fileJson.result?.file_path) {
        failed++;
        continue;
      }
      const dl = await fetch(`${TELEGRAM_API}/file/bot${cfg.bot_token}/${fileJson.result.file_path}`);
      const buf = new Uint8Array(await dl.arrayBuffer());
      await processOnePdf({
        bytes: buf,
        filename,
        sourceRef: `tg:${msg!.chat.id}:${msg!.message_id}`,
      });
      processed++;
    } catch (err) {
      console.error("[telegram-poll]", err);
      failed++;
    }
  }

  await supabaseAdmin
    .from("telegram_config")
    .update({
      update_offset: lastUpdateId,
      last_polled_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", 1);

  return { processed, failed, updates: updates.length };
}

export const Route = createFileRoute("/api/public/telegram/poll")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await handle();
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "erro";
          return Response.json({ error: message }, { status: 500 });
        }
      },
      POST: async () => {
        try {
          const result = await handle();
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "erro";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
