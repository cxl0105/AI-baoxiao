-- 0003: 多租户隔离 - 企业纳税号 + 企业基础信息 + 5 级角色

-- 1. 角色枚举扩展：加 gm(总经理) 和 manager(部门经理)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gm';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager';

-- 2. companies 表加企业基础信息字段（纳税号作租户键）
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_no text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS scale text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS credit_code text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_phone text;

-- 纳税号唯一索引（已存在的示例公司 tax_no 为 NULL，不影响唯一索引；NULL 不参与唯一约束）
CREATE UNIQUE INDEX IF NOT EXISTS companies_tax_no_idx ON companies(tax_no) WHERE tax_no IS NOT NULL;

-- 3. 给现有示例公司补一个占位纳税号（便于演示和后续数据归属）
UPDATE companies SET tax_no = '91110000000000000X', full_name = '示例公司', industry = '互联网/信息技术' WHERE tax_no IS NULL AND name = '示例公司';
