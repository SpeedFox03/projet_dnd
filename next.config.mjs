import withSerwistInit from '@serwist/next';

// PWA : génère public/sw.js depuis src/app/sw.ts. Désactivé en dev pour
// éviter le cache agressif pendant le développement.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withSerwist(nextConfig);
