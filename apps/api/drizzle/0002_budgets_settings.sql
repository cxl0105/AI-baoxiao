-- 0002: 预算表 + 公司设置表 + 报销单项目编码字段

CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id),
  kind text NOT NULL DEFAULT 'department',  -- department | project
  name text NOT NULL,          -- 部门名 或 项目名
  code text,                   -- 项目编码（project 用，department 可空）
  amount numeric(12,2) NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'monthly',   -- monthly | quarterly | yearly
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budgets_company_idx ON budgets(company_id);

CREATE TABLE IF NOT EXISTS company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id),
  company jsonb NOT NULL DEFAULT '{}',
  policy jsonb NOT NULL DEFAULT '{}',
  ocr jsonb NOT NULL DEFAULT '{}',
  ui jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reimbursements ADD COLUMN IF NOT EXISTS project_code text;
