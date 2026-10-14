/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    proxyClientMaxBodySize: "34mb",
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

export default nextConfig;
