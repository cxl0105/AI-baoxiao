import { Hono } from 'hono'

const user = new Hono()

user.get('/', async (c) => {
  return c.json({
    code: 'SUCCESS',
    data: {
      list: [
        {
          id: '1',
          name: '张三',
          email: 'zhangsan@example.com',
          role: 'admin',
          department: '技术部',
          status: 'active',
          createdAt: '2024-01-15T09:00:00Z',
        },
        {
          id: '2',
          name: '李四',
          email: 'lisi@example.com',
          role: 'finance',
          department: '财务部',
          status: 'active',
          createdAt: '2024-02-01T10:00:00Z',
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 2 },
    },
  })
})

user.get('/:id', async (c) => {
  const { id } = c.req.param()
  return c.json({
    code: 'SUCCESS',
    data: {
      id,
      name: id === '1' ? '张三' : '用户',
      email: 'user@example.com',
      phone: '138****8888',
      role: 'user',
      department: '技术部',
      position: '高级工程师',
      employeeNo: 'EMP00' + id,
    },
  })
})

export const userRoutes = user
