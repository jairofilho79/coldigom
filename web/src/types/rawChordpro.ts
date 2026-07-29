export interface RawChordproSummary {
  id: string;
  source_pdf_material_id: string;
  praise_id: string | null;
  praise_name: string | null;
  kind_label: string | null;
  source_filename: string;
  title: string | null;
  subtitle: string | null;
  validated: boolean;
  debug_batch: string | null;
  pdf_r2_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface RawChordproDetail extends RawChordproSummary {
  content: string;
}
