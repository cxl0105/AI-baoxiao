-- AI 报销系统 初始建表 SQL（与 src/db/schema.ts 保持一致）

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'finance', 'employee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reimbursement_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'paid', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  name text NOT NULL,
  phone text UNIQUE,
  email text,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

CREATE TABLE IF NOT EXISTS reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  user_id uuid NOT NULL REFERENCES users(id),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  type text NOT NULL DEFAULT 'daily',
  department text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status reimbursement_status NOT NULL DEFAULT 'draft',
  description text,
  start_date text,
  end_date text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reimb_user_idx ON reimbursements(user_id);
CREATE INDEX IF NOT EXISTS reimb_status_idx ON reimbursements(status);

CREATE TABLE IF NOT EXISTS reimbursement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reimbursement_id uuid NOT NULL REFERENCES reimbursements(id) ON DELETE CASCADE,
  category text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  date text,
  invoice_no text
);
CREATE INDEX IF NOT EXISTS items_reimb_idx ON reimbursement_items(reimbursement_id);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reimbursement_id uuid REFERENCES reimbursements(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_url text,
  mime_type text,
  size integer,
  ocr_data jsonb,
  amount numeric(12,2),
  invoice_no text,
  invoice_code text,
  verify_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_reimb_idx ON invoices(reimbursement_id);

CREATE TABLE IF NOT EXISTS approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reimbursement_id uuid NOT NULL REFERENCES reimbursements(id) ON DELETE CASCADE,
  step_index integer NOT NULL DEFAULT 0,
  actor text NOT NULL,
  role text,
  action text NOT NULL DEFAULT 'pending',
  comment text,
  time timestamptz
);
CREATE INDEX IF NOT EXISTS approval_reimb_idx ON approval_steps(reimbursement_id);
