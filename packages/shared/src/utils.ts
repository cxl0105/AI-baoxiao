export function formatCurrency(amount: number, currency = 'CNY'): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
  }).format(amount)
}

export function formatDate(date: string | Date, fmt = 'YYYY-MM-DD'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')

  return fmt
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'YYYY-MM-DD HH:mm')
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function getStatusText(status: string): string {
  const map: Record<string, string> = {
    draft: '草稿',
    processing: 'AI处理中',
    pending: '审批中',
    approved: '已通过',
    rejected: '已驳回',
    paid: '已付款',
  }
  return map[status] || status
}

export function getTypeText(type: string): string {
  const map: Record<string, string> = {
    travel: '差旅报销',
    daily: '日常费用',
    purchase: '采购报销',
    payment: '付款申请',
  }
  return map[type] || type
}

export function generateId(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
