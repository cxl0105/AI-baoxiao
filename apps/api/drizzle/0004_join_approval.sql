-- 0004: 注册审批 - users 表加 status 字段
-- status: pending(待审批) | active(正常) | disabled(禁用)
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 给已有用户补默认 active（默认值已覆盖，这里兜底）
UPDATE users SET status = 'active' WHERE status IS NULL OR status = '';
