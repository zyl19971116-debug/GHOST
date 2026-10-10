/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No `sharp` binary required in this environment.
  images: { unoptimized: true },
  // WalletConnect / RainbowKit pull browser-only deps; keep them out of the server bundle graph
  // where possible and let the client provider handle them.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    // wagmi / walletconnect optionally import these; they are not needed in a browser build.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

export default nextConfig;
