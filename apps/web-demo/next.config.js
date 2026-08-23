/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' }
    ]
  },
  experimental: {
    serverActions: {
      // 允许 Vercel 部署域名和本地开发域名
      allowedOrigins: ['localhost:3000', '*.vercel.app']
    }
  }
}

module.exports = nextConfig
