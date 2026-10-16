/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Behind a reverse proxy / tunnel the public hostname differs from the
  // container's own host, so Next's Server Action origin check must be told the
  // production domain is trusted — otherwise Server Action POSTs are rejected
  // with a 403 ("x-forwarded-host does not match origin host"). Includes
  // localhost for local dev / direct container access.
  experimental: {
    serverActions: {
      allowedOrigins: ['hoard.timhufnagel.org', 'localhost:3000'],
    },
  },
  images: {
    // Serve posters/covers straight from the provider CDNs instead of through
    // Next's /_next/image optimizer. The optimizer is the attack surface for
    // the Next 14 image advisories (AVIF RCE GHSA-2xp9-vwfh-vxw4, remotePatterns
    // DoS GHSA-9g9p-9gw9-jx7f, unbounded disk cache GHSA-3x4c-7xq6-9pq8), and
    // with the wildcard remotePatterns below it would accept any URL. The CDNs
    // already return thumbnail-sized images, so nothing is lost on the Pi.
    unoptimized: true,
    // Posters/covers come from many third-party CDNs (TMDB, OpenLibrary,
    // AniList, IGDB, Last.fm). Allow remote https/http hosts broadly so
    // next/image never hard-fails on a new provider domain.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

export default nextConfig;
