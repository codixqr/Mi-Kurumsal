/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'pg-cloudflare'],
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
