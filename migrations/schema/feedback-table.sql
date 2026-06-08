-- ============================================
-- TABLE: feedback
-- Stores user-submitted feedback (bug reports / feature requests)
-- Inserted by api/submit-feedback.ts
-- ============================================

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'general', 'other')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON feedback(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_type_created_at
  ON feedback(type, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access on feedback
DROP POLICY IF EXISTS "Allow service role full access on feedback" ON feedback;
CREATE POLICY "Allow service role full access on feedback"
  ON feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
