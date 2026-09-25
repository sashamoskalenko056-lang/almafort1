CREATE TABLE public.vision_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL,
  predicted_sku text,
  features text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vision_feedback TO authenticated;
GRANT ALL ON public.vision_feedback TO service_role;
ALTER TABLE public.vision_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff reads vision feedback" ON public.vision_feedback FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE INDEX vision_feedback_created_idx ON public.vision_feedback (created_at DESC);