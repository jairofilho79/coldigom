-- Phase 2 debug batch tag for Raw ChordPro review (disposable)
ALTER TABLE raw_chordpros ADD COLUMN debug_batch TEXT;
CREATE INDEX IF NOT EXISTS idx_raw_chordpros_debug_batch ON raw_chordpros(debug_batch);
