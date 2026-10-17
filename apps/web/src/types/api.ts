export type Eligibility = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';

export type HolderType = 'ORGANIZATION' | 'PERSON';
export type Flag = boolean | 'TRUE' | 'FALSE' | 'UNKNOWN' | null;

export type NumericTargetStatus = 'PASS_NUMERIC' | 'BELOW_TARGET' | 'UNKNOWN';

export type AssessmentStatus = 'SIMULATION_ONLY' | 'REQUIRES_VERIFICATION' | 'UNSUPPORTED_RULE';

export type ActionType = 'TRANSFER' | 'NEW_ISSUANCE';

export interface Holder {
  holder_ref: string;
  shares: number;
  eligibility: Eligibility;
  holder_type: HolderType | string;
  evidence_ref?: string | null;
  controller?: Flag;
  controller_affiliate?: Flag;
  director_commissioner?: Flag;
  treasury?: Flag;
  restricted?: Flag;
}

export interface Snapshot {
  id: string;
  as_of_date: string;
  total_shares: number;
  sid_count: number | null;
  holders: Holder[];
}

export interface Assessment {
  total_shares: number;
  eligible_shares: number | null;
  eligible_lower_bound?: number;
  eligible_upper_bound?: number;
  free_float_ratio: string | null;
  numeric_target_status: NumericTargetStatus;
  assessment_status: AssessmentStatus;
  rule_set_id: string;
  rule_version: string;
  rule_status: 'DRAFT' | string;
  target_ratio: string;
  warnings: string[];
  unresolved_constraints: string[];
  data_hash: string;
}

export interface Company {
  id: string;
  code: string;
  legal_name: string;
  board: string;
  demo: boolean;
  snapshot: Snapshot;
  assessment?: Assessment;
}

export interface RuleSet {
  id: string;
  name: string;
  version: string;
  status: string;
  target_ratio: string;
  description?: string;
}

export interface Allocation {
  holder_ref: string;
  shares: number;
  eligibility: Eligibility;
  holder_type: HolderType | string;
  evidence_ref?: string;
}

export interface ScenarioAction {
  action_type: ActionType;
  seller_ref?: string;
  allocations: Allocation[];
  price_idr_per_share?: string;
}

export interface DilutionItem {
  holder_ref: string;
  old_ratio: string;
  new_ratio: string;
  percentage_point_change: string;
}

export interface SimulationResult {
  scenario_id: string;
  result_hash: string;
  input_hash: string;
  engine_version: string;
  action: ScenarioAction;
  snapshot: Snapshot;
  assessment: Assessment;
  dilution_by_holder: DilutionItem[];
  cash_estimate_idr: string | null;
  company_id: string;
}

export interface ReportResult {
  id: string;
  markdown_content: string;
  watermark: 'SIMULATION_ONLY';
  sources: string[];
}

export interface ApiErrorPayload {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  field_errors?: Array<{ field: string; message: string }>;
  correlation_id?: string;
}
