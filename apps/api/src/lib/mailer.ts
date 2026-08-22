import nodemailer from 'nodemailer'

interface MailConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

function getMailConfig(): MailConfig {
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || 'true').trim() !== 'false',
    user: (process.env.SMTP_USER || '').trim(),
    pass: (process.env.SMTP_PASS || '').trim(),
    from: (process.env.SMTP_FROM || '').trim() || (process.env.SMTP_USER || '').trim(),
  }
}

export function mailConfigured(): boolean {
  const c = getMailConfig()
  return !!(c.host && c.user && c.pass)
}

/**
 * 发送验证码邮件。
 * 注意：163 SMTP 会断空闲连接，这里每次调用都独立创建 transporter、
 * 发送后立即 close，绝不复用长连接，避免连接被服务端断开导致失败。
 */
export async function sendVerificationCodeEmail(to: string, code: string): Promise<void> {
  const cfg = getMailConfig()
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  })

  const html = `
  <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;color:#333;">
    <div style="background:#4f46e5;padding:20px;border-radius:12px 12px 0 0;">
      <div style="color:#fff;font-size:18px;font-weight:bold;">智报销 · 密码重置</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 12px 12px;">
      <p style="margin:0 0 16px;font-size:15px;">您正在申请重置智报销账户的登录密码，验证码如下：</p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;font-size:32px;font-weight:bold;letter-spacing:8px;color:#4f46e5;background:#eef2ff;padding:12px 28px;border-radius:8px;">${code}</span>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">验证码 10 分钟内有效，请勿泄露给他人。</p>
      <p style="margin:0;font-size:13px;color:#9ca3af;">如果这不是您本人的操作，请忽略本邮件。</p>
    </div>
  </div>`

  try {
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject: '【智报销】密码重置验证码',
      html,
    })
  } finally {
    transporter.close()
  }
}
