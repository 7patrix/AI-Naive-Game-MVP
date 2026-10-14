/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: { "/moonkiller-assets/**": ["./game-exports/moonkiller/**/*"] },
  experimental: {
    cpus: 2,
    proxyClientMaxBodySize: "34mb",
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

export default nextConfig;
