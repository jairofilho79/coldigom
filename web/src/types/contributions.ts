export interface ContributionFile {
  id: string;
  contribution_id: string;
  original_name: string;
  declared_type: string;
  detected_type: string | null;
  size: number;
  sha256: string;
  r2_key: string;
  scan_status: 'pendente' | 'limpa' | 'suspeita' | 'infectada' | 'erro' | 'sem_arquivo';
  scan_detail: string | null;
  created_at: string;
}

export interface PlanTaskItem {
  id: string;
  operation: string;
  depends_on?: string[];
  params: Record<string, unknown>;
}

export interface CanonicalPlanJson {
  summary: string;
  todos: string[];
  tasks: PlanTaskItem[];
}

export interface CollaborationPlan {
  id: string;
  contribution_id: string;
  version: number;
  model_name: string;
  summary: string;
  todos: string[];
  plan_json: CanonicalPlanJson;
  plan_hash: string;
  status: 'pending_approval' | 'applied' | 'rejected' | 'failed';
  decided_at?: string | null;
  decided_by?: string | null;
  created_at: string;
}

export type ContributionLinkItem = string | { url: string; host: string; safe_browsing?: string };

export interface AdminContribution {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  kind: string;
  subkind: string | null;
  target_source: string | null;
  target_praise_id: string | null;
  target_material_id: string | null;
  title: string;
  body: string;
  fields: Record<string, unknown> | null;
  links: ContributionLinkItem[] | null;
  device: Record<string, unknown> | null;
  app_route: string | null;
  app_version: string | null;
  status: 'pendente' | 'em_analise' | 'aceita' | 'recusada' | 'aplicada';
  scan_status: string;
  scan_report: Record<string, unknown> | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
  files: ContributionFile[];
  plan?: CollaborationPlan | null;
}

export interface ContributionListParams {
  status?: string;
  kind?: string;
  praise?: string;
  page?: number;
}
