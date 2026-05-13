CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  budget BIGINT NOT NULL,
  budget_min BIGINT,
  budget_max BIGINT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  city TEXT NOT NULL,
  sector TEXT NOT NULL,
  investment_type TEXT NOT NULL,
  pipeline_stage TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  district TEXT,
  goal TEXT,
  contact_history TEXT,
  meeting_notes TEXT,
  follow_up_date DATE,
  documents TEXT[] NOT NULL DEFAULT '{}',
  investor_type TEXT NOT NULL DEFAULT 'Bireysel',
  contact_person TEXT,
  whatsapp_phone TEXT,
  target_cities TEXT,
  target_location_type TEXT,
  sub_sector TEXT,
  investment_timing TEXT,
  financing_status TEXT,
  priority TEXT NOT NULL DEFAULT 'Orta',
  lead_source TEXT,
  assigned_member_id INTEGER,
  last_meeting_date DATE,
  next_action TEXT,
  notes TEXT,
  last_activity_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  min_budget BIGINT NOT NULL,
  max_budget BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  min_sqm INTEGER NOT NULL,
  max_sqm INTEGER NOT NULL,
  target_locations TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_growth INTEGER NOT NULL DEFAULT 0,
  agreement_status TEXT,
  franchise_fee BIGINT,
  royalty_rate NUMERIC(5,2),
  contract_term_months INTEGER,
  initial_investment BIGINT,
  branch_count INTEGER,
  contact_person TEXT,
  contact_phone TEXT,
  business_plan TEXT,
  operation_plan TEXT,
  onboarding_steps TEXT[] NOT NULL DEFAULT '{}',
  kpi_targets TEXT,
  brand_notes TEXT,
  sub_sector TEXT,
  whatsapp_phone TEXT,
  email TEXT,
  website TEXT,
  brand_type TEXT,
  target_regions TEXT,
  location_type TEXT,
  storefront_need TEXT,
  chimney_need TEXT,
  tech_infrastructure TEXT,
  staff_need TEXT,
  ad_contribution_pct NUMERIC(6,2),
  avg_monthly_revenue BIGINT,
  profit_margin_pct NUMERIC(6,2),
  payback_months INTEGER,
  presentation_url TEXT,
  logo_url TEXT,
  contract_draft_url TEXT,
  documents TEXT[] NOT NULL DEFAULT '{}',
  gives_franchise BOOLEAN NOT NULL DEFAULT TRUE,
  has_royalty BOOLEAN NOT NULL DEFAULT TRUE,
  score_operation INTEGER,
  score_franchise_fit INTEGER,
  score_location_flex INTEGER,
  score_investor_interest INTEGER,
  score_profitability INTEGER,
  score_growth INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS investor_meetings (
  id SERIAL PRIMARY KEY,
  investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  meeting_type TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  met_by TEXT,
  met_by_member_id INTEGER,
  notes TEXT,
  next_action TEXT,
  reminder_date DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investor_brand_matches (
  id SERIAL PRIMARY KEY,
  investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  score NUMERIC(10,2),
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(investor_id, brand_id)
);

CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL,
  sqm INTEGER NOT NULL,
  rent BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  potential TEXT NOT NULL,
  recommended_brands TEXT[] NOT NULL DEFAULT '{}',
  address TEXT,
  traffic TEXT,
  owner TEXT,
  owner_phone TEXT,
  city TEXT,
  district TEXT,
  region TEXT,
  avenue_name TEXT,
  maps_link TEXT,
  segment TEXT,
  storefront_length NUMERIC(10,2),
  floor_info TEXT,
  chimney_status TEXT,
  infrastructure_status TEXT,
  revenue_rent_pct NUMERIC(6,2),
  dues BIGINT,
  deposit BIGINT,
  footfall_score INTEGER,
  competitor_brands TEXT,
  target_customer_profile TEXT,
  suitable_sectors TEXT,
  status TEXT NOT NULL DEFAULT 'Boş',
  brand_fit_score INTEGER,
  street_class TEXT,
  avm_segment TEXT,
  files TEXT[] NOT NULL DEFAULT '{}',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  attachment_name TEXT,
  attachment_data TEXT,
  attachment_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  owner_team TEXT NOT NULL,
  assignees TEXT[] NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'Orta',
  progress INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL,
  due_date DATE NOT NULL,
  description TEXT,
  checklist TEXT[] NOT NULL DEFAULT '{}',
  investor_id INTEGER REFERENCES investors(id) ON DELETE SET NULL,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  estimated_investment BIGINT,
  estimated_revenue BIGINT,
  owner_person TEXT,
  start_date DATE,
  close_date DATE,
  risk_level TEXT,
  pipeline_stage TEXT,
  files TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  note TEXT,
  contract_type TEXT,
  status TEXT NOT NULL DEFAULT 'Taslak',
  counterparty TEXT,
  start_date DATE,
  end_date DATE,
  sign_date DATE,
  renewal_date DATE,
  amount BIGINT,
  consulting_fee BIGINT,
  franchise_commission BIGINT,
  franchise_commission_pct NUMERIC(6,2),
  location_commission BIGINT,
  extra_income TEXT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  file_name TEXT,
  file_data TEXT,
  file_url TEXT,
  file_mime_type TEXT,
  docs_urls TEXT[] NOT NULL DEFAULT '{}',
  investor_id INTEGER REFERENCES investors(id) ON DELETE SET NULL,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  consultant_name TEXT,
  legal_person TEXT,
  finance_person TEXT,
  risk_level TEXT,
  risk_note TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_records (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  investor_id INTEGER REFERENCES investors(id) ON DELETE SET NULL,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  income_type TEXT NOT NULL DEFAULT 'Danışmanlık',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  description TEXT,
  payment_type TEXT NOT NULL DEFAULT 'Peşin',
  status TEXT NOT NULL DEFAULT 'Açık',
  consultant_commission_pct NUMERIC(6,2),
  company_share_pct NUMERIC(6,2),
  due_date DATE,
  paid_date DATE,
  payment_method TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_plans (
  id SERIAL PRIMARY KEY,
  finance_record_id INTEGER NOT NULL REFERENCES finance_records(id) ON DELETE CASCADE,
  taksit_no INTEGER NOT NULL DEFAULT 1,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'Bekliyor',
  payment_method TEXT,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_expenses (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  expense_type TEXT NOT NULL DEFAULT 'Operasyon',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'TRY',
  expense_date DATE NOT NULL,
  description TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id SERIAL PRIMARY KEY,
  module_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pnl_reports (
  id SERIAL PRIMARY KEY,
  month_name TEXT NOT NULL,
  year_value INTEGER NOT NULL,
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  expense NUMERIC(14,2) NOT NULL DEFAULT 0,
  profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  note TEXT,
  source_file TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brand_agreements (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  revision_note TEXT,
  effective_date DATE,
  file_name TEXT,
  file_url TEXT,
  mime_type TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pnl_detail_lines (
  id SERIAL PRIMARY KEY,
  pnl_report_id INTEGER NOT NULL REFERENCES pnl_reports(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ratio NUMERIC(10,4),
  source_file TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pnl_revenues (
  id SERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,
  branch TEXT NOT NULL DEFAULT 'Genel',
  revenue_type TEXT NOT NULL DEFAULT 'Satış',
  description TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'Manuel',
  month_name TEXT NOT NULL,
  year_value INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pnl_expenses (
  id SERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,
  branch TEXT NOT NULL DEFAULT 'Genel',
  category TEXT NOT NULL DEFAULT 'Diğer',
  sub_category TEXT,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  revenue_ratio NUMERIC(10,4),
  source TEXT NOT NULL DEFAULT 'Manuel',
  month_name TEXT NOT NULL,
  year_value INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pnl_personnel (
  id SERIAL PRIMARY KEY,
  entry_date DATE NOT NULL,
  branch TEXT NOT NULL DEFAULT 'Genel',
  person_name TEXT NOT NULL,
  position TEXT,
  salary NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(14,2) NOT NULL DEFAULT 0,
  deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'Manuel',
  month_name TEXT NOT NULL,
  year_value INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pnl_field_mappings (
  id SERIAL PRIMARY KEY,
  source_header TEXT NOT NULL,
  mapped_category TEXT NOT NULL,
  mapped_type TEXT NOT NULL DEFAULT 'expense',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(source_header)
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Açık',
  assignee_id INTEGER,
  assignee_name TEXT,
  priority TEXT NOT NULL DEFAULT 'Orta',
  due_date DATE,
  investor_id INTEGER REFERENCES investors(id) ON DELETE SET NULL,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  department TEXT,
  role_name TEXT NOT NULL DEFAULT 'Temsilci',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_logs (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  module_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  record_id INTEGER,
  summary TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_templates (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  event_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
