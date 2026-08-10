import { Hono } from 'hono'

const docs = new Hono()

docs.get('/', async (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 报销系统 - API 文档</title>
  <script src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css">
  <style>body { margin: 0; }</style>
</head>
<body>
  <h2 style="text-align:center;padding:20px 0 0;">AI 智能报销系统 API v1.0</h2>
  <p style="text-align:center;color:#666;margin:8px 0 24px;">接口文档 · 开发环境</p>
  <elements-api
    apiDescriptionUrl="/docs/openapi.json"
    router="hash"
    layout="sidebar"
  />
</body>
</html>
  `)
})

docs.get('/openapi.json', async (c) => {
  return c.json({
    openapi: '3.1.0',
    info: {
      title: 'AI 智能报销系统 API',
      version: '1.0.0',
      description: 'SaaS 多租户报销平台接口文档',
    },
    servers: [
      { url: 'http://localhost:4000/api/v1', description: '本地开发' },
    ],
    paths: {
      '/health': {
        get: {
          summary: '健康检查',
          responses: { '200': { description: '服务正常' } },
        },
      },
      '/auth/login': {
        post: {
          summary: '用户登录',
          tags: ['认证'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', example: 'demo@example.com' },
                    password: { type: 'string', example: '123456' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: '登录成功' } },
        },
      },
      '/auth/register': {
        post: {
          summary: '用户注册',
          tags: ['认证'],
          responses: { '201': { description: '注册成功' } },
        },
      },
      '/auth/me': {
        get: {
          summary: '获取当前用户信息',
          tags: ['认证'],
          responses: { '200': { description: '成功' } },
        },
      },
      '/reimbursements': {
        get: {
          summary: '获取报销单列表',
          tags: ['报销管理'],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { '200': { description: '成功' } },
        },
        post: {
          summary: '创建报销单',
          tags: ['报销管理'],
          responses: { '201': { description: '创建成功' } },
        },
      },
      '/reimbursements/{id}': {
        get: {
          summary: '获取报销单详情',
          tags: ['报销管理'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: '成功' } },
        },
      },
      '/reimbursements/ai/ocr': {
        post: {
          summary: 'AI 票据识别 (OCR)',
          tags: ['AI 服务'],
          description: '上传票据图片，AI 自动识别发票信息',
          responses: { '200': { description: '识别成功' } },
        },
      },
    },
    tags: [
      { name: '认证', description: '用户认证相关接口' },
      { name: '报销管理', description: '报销单 CRUD 与审批流程' },
      { name: 'AI 服务', description: 'OCR 识别、智能分类等 AI 能力' },
    ],
  })
})

export const apiReference = docs
