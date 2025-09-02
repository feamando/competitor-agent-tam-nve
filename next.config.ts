import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',  // Add this line for static export
  trailingSlash: true,  // Required for static export
  eslint: {
    ignoreDuringBuilds: true,  // Disable ESLint during builds
  },
  images: {
    unoptimized: true,  // Required for static export
  },
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

    // Fix handlebars require.extensions warning
    config.module.rules.push({
      test: /\.hbs$/,
      loader: 'handlebars-loader',
    });

    // Ignore handlebars require.extensions warning
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules\/handlebars\/lib\/index\.js/,
        message: /require\.extensions is not supported by webpack/,
      },
    ];

    return config;
  },
};

export default nextConfig;
