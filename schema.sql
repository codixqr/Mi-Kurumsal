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
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
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
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  note TEXT NOT NULL,
  contract_type TEXT,
  status TEXT,
  counterparty TEXT,
  start_date DATE,
  end_date DATE,
  amount BIGINT,
  currency TEXT NOT NULL DEFAULT 'TRY',
  file_name TEXT,
  file_data TEXT,
  file_url TEXT,
  file_mime_type TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
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

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Açık',
  assignee_id INTEGER,
  assignee_name TEXT,
  priority TEXT NOT NULL DEFAULT 'Orta',
  due_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
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
