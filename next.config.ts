import type { NextConfig } from 'next';

/**
 * Next.js Configuration for StarBrickVII
 * 
 * Note: This project is designed to support static export (output: 'export')
 * for deployment on static hosting services. However, during development,
 * we use the default configuration for hot-reload support.
 * 
 * To build for static deployment:
 * 1. Set output: 'export' in this config
 * 2. Run `npm run build`
 * 3. Deploy the `out` directory
 */
const nextConfig: NextConfig = {
  // Enable static export for deployment on GitHub Pages or other static hosts
  // Uncomment the following line for production static builds:
  // output: 'export',
  
  // Disable image optimization for static export compatibility
  images: {
    unoptimized: true,
  },
  
  // Ensure trailing slashes for static hosting compatibility
  trailingSlash: false,
  
  // Strict mode for better development experience
  reactStrictMode: true,
  
  // Enable typed routes
  typedRoutes: true,
};

export default nextConfig;
