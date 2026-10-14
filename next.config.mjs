/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { "/moonkiller-assets/**": ["./game-exports/moonkiller/**/*"] },
  experimental: {
    proxyClientMaxBodySize: "34mb",
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

export default nextConfig;
