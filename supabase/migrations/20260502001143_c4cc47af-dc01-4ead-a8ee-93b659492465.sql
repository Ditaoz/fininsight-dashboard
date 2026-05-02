
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Bloquear leitura pública do token do Telegram (acesso só via service role no servidor)
CREATE POLICY "no public read telegram_config" ON public.telegram_config
  FOR SELECT USING (false);
