import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Remove handlebars-loader config that's causing issues
  webpack: (config, { isServer }) => {
    // Fix for webpack fallback warnings
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }

    return config;
  },
};

export default nextConfig;
