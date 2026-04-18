import type { NextConfig } from 'next';

/**
 * Next.js Configuration for StarBrickVII
 * 
 * Configured for static export to deploy on GitHub Pages.
 */
const nextConfig: NextConfig = {
  // Enable static export for GitHub Pages deployment
  output: 'export',
  
  // Disable image optimization for static export compatibility
  images: {
    unoptimized: true,
  },
  
  // Use trailing slashes for GitHub Pages compatibility
  trailingSlash: true,
  
  // Strict mode for better development experience
  reactStrictMode: true,
  
  // Enable typed routes
  typedRoutes: true,
};

export default nextConfig;
