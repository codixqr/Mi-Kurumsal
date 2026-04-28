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
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Açık',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
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
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
