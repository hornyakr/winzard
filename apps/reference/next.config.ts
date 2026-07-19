import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: '/random-number',
        destination: '/lucky/number',
        permanent: true,
      },
      {
        source: '/lucky/:minimum/:maximum',
        destination: '/lucky/number/range/:minimum/:maximum',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
