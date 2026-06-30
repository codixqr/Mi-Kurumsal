/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'pg-cloudflare'],
};

module.exports = nextConfig;
