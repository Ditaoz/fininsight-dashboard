import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AssetGroup = {
  key: string; // identifier used in URL (asset_id or normalized name)
  asset_id: string | null;
  asset_name: string | null;
  kind: string;
  count: number;
  last_recommendation: string | null;
  last_seen: string;
};

function normalizeKey(asset_id: string | null, asset_name: string | null) {
  return (asset_id ?? asset_name ?? "desconhecido")
    .toString()
    .trim()
    .toUpperCase();
}

export const listAssets = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("analyses")
    .select("asset_id,asset_name,kind,recommendation,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const map = new Map<string, AssetGroup>();
  for (const row of data ?? []) {
    const key = normalizeKey(row.asset_id, row.asset_name);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        key,
        asset_id: row.asset_id,
        asset_name: row.asset_name,
        kind: row.kind,
        count: 1,
        last_recommendation: row.recommendation,
        last_seen: row.created_at,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.asset_id ?? a.asset_name ?? "").localeCompare(b.asset_id ?? b.asset_name ?? ""),
  );
});

export const getAssetDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ key: z.string().min(1).max(200) }).parse)
  .handler(async ({ data }) => {
    const target = data.key.toUpperCase();
    const { data: rows, error } = await supabaseAdmin
      .from("analyses")
      .select("*, reports(id,original_filename,received_at,storage_path,source)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const matches = (rows ?? []).filter(
      (r) => normalizeKey(r.asset_id, r.asset_name) === target,
    );

    const reportsMap = new Map<string, { id: string; original_filename: string; received_at: string; storage_path: string; source: string }>();
    for (const m of matches) {
      const r = m.reports as { id: string; original_filename: string; received_at: string; storage_path: string; source: string } | null;
      if (r && !reportsMap.has(r.id)) reportsMap.set(r.id, r);
    }

    return {
      key: target,
      asset_id: matches[0]?.asset_id ?? null,
      asset_name: matches[0]?.asset_name ?? null,
      kind: matches[0]?.kind ?? "other",
      analyses: matches,
      reports: Array.from(reportsMap.values()),
    };
  });

export const getReportSignedUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ storagePath: z.string().min(1) }).parse)
  .handler(async ({ data }) => {
    const { data: signed, error } = await supabaseAdmin.storage
      .from("reports")
      .createSignedUrl(data.storagePath, 60 * 5);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
