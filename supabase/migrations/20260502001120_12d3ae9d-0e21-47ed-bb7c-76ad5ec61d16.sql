
-- Enums
CREATE TYPE public.report_source AS ENUM ('upload', 'telegram');
CREATE TYPE public.report_status AS ENUM ('pending', 'extracting', 'analyzing', 'ready', 'failed');
CREATE TYPE public.report_kind AS ENUM ('fixed_income', 'stock', 'fii', 'crypto', 'other');
CREATE TYPE public.recommendation AS ENUM ('buy', 'hold', 'sell', 'monitor');

-- Reports: cada PDF recebido
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.report_source NOT NULL DEFAULT 'upload',
  source_ref TEXT,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status public.report_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  extracted_text TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_received_at ON public.reports(received_at DESC);
CREATE INDEX idx_reports_status ON public.reports(status);

-- Analyses: uma ou mais análises por relatório (relatórios podem cobrir vários ativos)
CREATE TABLE public.analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  kind public.report_kind NOT NULL DEFAULT 'other',
  asset_id TEXT,
  asset_name TEXT,
  price NUMERIC,
  recommendation public.recommendation,
  strengths TEXT[] NOT NULL DEFAULT '{}',
  weaknesses TEXT[] NOT NULL DEFAULT '{}',
  risks TEXT[] NOT NULL DEFAULT '{}',
  ai_opinion TEXT,
  justification TEXT,
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyses_report_id ON public.analyses(report_id);
CREATE INDEX idx_analyses_asset_id ON public.analyses(asset_id);
CREATE INDEX idx_analyses_date ON public.analyses(analysis_date DESC);
CREATE INDEX idx_analyses_kind ON public.analyses(kind);

-- Daily summaries: panorama consolidado por data
CREATE TABLE public.daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL UNIQUE,
  overview TEXT NOT NULL,
  priorities JSONB NOT NULL DEFAULT '[]'::jsonb,
  alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment_by_class JSONB NOT NULL DEFAULT '{}'::jsonb,
  analyses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_summaries_date ON public.daily_summaries(summary_date DESC);

-- Telegram config: singleton (id = 1)
CREATE TABLE public.telegram_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bot_token TEXT,
  bot_username TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  update_offset BIGINT NOT NULL DEFAULT 0,
  last_polled_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_config (id) VALUES (1);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER daily_summaries_updated_at BEFORE UPDATE ON public.daily_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER telegram_config_updated_at BEFORE UPDATE ON public.telegram_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: app pessoal sem login. Todas operações passam pelo service role no servidor.
-- Permitimos leitura pública para o front consultar via cliente publishable.
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read reports" ON public.reports FOR SELECT USING (true);
CREATE POLICY "public read analyses" ON public.analyses FOR SELECT USING (true);
CREATE POLICY "public read daily_summaries" ON public.daily_summaries FOR SELECT USING (true);
-- telegram_config NÃO é legível publicamente (contém token). Acesso só via service role.

-- Storage bucket privado para PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;
