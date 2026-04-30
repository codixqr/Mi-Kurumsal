/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/legacy.html',
      },
    ];
  },
};

module.exports = nextConfig;
