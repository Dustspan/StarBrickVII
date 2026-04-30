import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: '/StarBrickVII',
  reactStrictMode: true,
};

export default nextConfig;
