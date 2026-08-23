# AI 智能报销系统（智报销）

一站式智能报销管理平台 —— SaaS 多租户解决方案。支持 AI OCR 发票识别、多级审批工作流、费用标准校验、预算控制、电子表格报销单（差旅补贴）等完整报销业务闭环。

- 线上地址：<https://www.aibaoxiao.top>
- 仓库：<https://github.com/cxl0105/AI-baoxiao>

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14（App Router）、React 18、TypeScript、Tailwind CSS、zustand、react-hook-form、zod、@tanstack/react-query、recharts |
| 后端 | Hono、@hono/node-server、@hono/zod-validator、bcryptjs、jsonwebtoken、drizzle-orm |
| 数据库 | PostgreSQL 16（Drizzle ORM） |
| 缓存/队列 | Redis、@upstash/queue（预留） |
| OCR | 火山引擎 MediaKit（AKLT 凭证，见 `apps/api/.env`） |
| 部署 | PM2（`ecosystem.config.js`）+ Nginx 反向代理 + Let's Encrypt（certbot 自动续期） |
| 构建 | npm workspaces + turbo |

---

## 项目结构

```
apps/
  web/                  # Next.js 前端（@apps/web）
    src/app/dashboard/  # 工作台、报销单、审批、成员、发票池、预算、分析、设置
    src/lib/            # api.ts（axios 封装）、auth.ts（zustand）、reimbursements.ts 等
  api/                  # Hono 后端（@apps/api）
    src/routes/         # auth / user / reimbursement / stats / approval-records / ocr / analytics / budgets / invoices / settings / docs
    src/db/             # schema.ts（Drizzle）、index.ts（Pool）、seed.ts
    drizzle/            # 手写建表 SQL
packages/               # 共享包（预留）
```

### 数据库表（8 张）

`companies`（租户）· `users` · `reimbursements` · `reimbursement_items` · `invoices` · `approval_steps` · `budgets` · `company_settings`

---

## 核心功能

- **AI 发票识别**：OCR 扫描/拖拽导入 + 手动录入两种方式；识别结果可校正并自动同步费用明细
- **员工报销流程闭环**：
  - 日常报销：发票录入后直接提交（仅报销发票金额）
  - 出差报销：电子表格报销单（含补贴自动计算 + 多级签字），签字后递交进入审批流
  - 提交时弹出「出差 / 日常」选择，引导对应流程
- **多级审批流**：部门负责人 → 财务审核 → 总经理终审，支持撤销、驳回、加签、转办
- **费用标准校验**：按职级 + 出差类型校验超标（单笔/日限额），超标触发升级审批路由
- **预算控制**：部门预算 / 项目预算 / 预算占用率实时预警
- **统计分析**：KPI、月度趋势、部门统计、费用类别分布、TOP 员工排行、异常大额报销预警
- **成员管理**：增删改查、角色权限（admin/finance/employee）、待审批注册申请
- **SaaS 多租户隔离**：`company_id` 作租户键，全路由数据隔离
- **忘记密码**：邮箱验证码自助重置 + 管理员后台重置

---

## 演示账号（密码均为 `123456`）

| 角色 | 手机号 | 邮箱 |
|---|---|---|
| 系统管理员 | 13800000001 | admin@example.com |
| 财务专员 | 13800000002 | finance@example.com |
| 普通员工 | 13800000003 | employee@example.com |
| 演示用户 | 13800000004 | demo@example.com |

---

## 部署

### 环境变量

参考 `.env.example`，关键项：

```
DATABASE_URL=postgresql://aibaoxiao:<密码>@localhost:5432/reimbursement
REDIS_URL=...               # 预留
JWT_SECRET=...              # JWT 签名密钥
NEXT_PUBLIC_API_URL=https://www.aibaoxiao.top/api/v1   # 前端 API 基址（为空/disabled 时启用 Mock 模式）
# OCR: 火山引擎 MediaKit AKLT 凭证（见 apps/api/.env）
```

### 构建 & 启动（PM2）

```bash
# 后端（tsx 直跑源码）
pm2 start ecosystem.api.config.js

# 前端（每次改代码后必须重建）
cd apps/web
NEXT_PUBLIC_API_URL=https://www.aibaoxiao.top/api/v1 npx next build
pm2 restart ai-baoxiao-web
```

### 数据库初始化

```bash
psql "$DATABASE_URL" -f apps/api/drizzle/*.sql   # 建表
npx tsx apps/api/src/db/seed.ts                  # 演示账号 + 示例数据
```

### Nginx 反向代理

- `/api/` → `http://127.0.0.1:4000`（Hono API）
- `/` → `http://127.0.0.1:8080`（Next.js）
- `/sub/` → `/var/www/sub/`（订阅服务，default_server 保留）

---

## 版本记录（Changelog）

### v1.0.0（当前）

**后端接真数据库 & 全链路打通**

- `5116bae` AI 智能报销系统初始版本
- `5047464` 后端接入 PostgreSQL 真数据库（Drizzle ORM），用户/报销单/明细/发票/审批流真实读写
- `a86d19d` 前端列表/详情接入真 API
- `eb26961` 修复 axios 拦截器从 auth-storage 读取 token（401 问题）
- `3ac44b8` 工作台 + 待审批 + 成员管理接入真 API，新增 stats 统计接口
- `ce748f8` 报销 SaaS 完整化：预算/公司设置表 + 4 个后端路由，analytics/budgets/invoices/settings 接真 API，OCR 发票落库
- `3637040` 忘记密码双通道：邮箱验证码自助重置 + 管理员后台重置
- `7ba4f9b` 多租户 SaaS 隔离：企业纳税号作租户键，5 级角色权限，全路由 companyId 隔离
- `c29f5f8` 部署配置：切换 Next.js 监听 127.0.0.1:3000，为 Caddy HTTPS 反代做准备
- `02fc3ad` 审批记录页接真 API（我发起/我参与双视角），修复 members 页 loadMembers 作用域 TDZ bug
- `6dce802` 回填历史报销单 company_id（多租户改造漏迁移历史数据）
- `15d0cda` 员工报销流程闭环：新建页提交时弹出差/日常选择，电子表格签字递交调真 API 进入报销单列表
- `3ac7c86` 列表页展示审批流：后端列表接口补 approver + approvalFlow，前端当前审批人列加审批进度条
- `4e9d18f` 修复登录态竞态：logout 先清本地态再调后端，login 前清旧 token，修复快捷登录残留 mock 态

### 早期版本

- `03a5431` 增强报销系统并适配 Vercel 部署
- `574ff1d` Concierge AI 智能助手
- `cc9a001` / `c468def` / `755af07` Vercel 部署配置修复
- `fb58825` 手机号登录注册 + 逐条智能审核引擎（8 维度）
- `4600711` 发票附件预览弹窗 + 真实发票全链路打通
- `3dd997c` 整合 expensify-common 通用工具（数字/货币/税额）

---

## 已知注意事项

- 多租户改造后，历史数据需回填 `company_id`（见 commit `6dce802`）
- 前端 `MOCK_MODE`：`NEXT_PUBLIC_API_URL` 为空或 `disabled` 时走纯前端 Mock，用于演示/内测
- OCR 真实识别依赖火山引擎 MediaKit 凭证，未配置时自动降级为本地 Mock 识别
- 发票图片大图多张上传受 localStorage 5–10MB 上限约束（base64 持久化场景）
