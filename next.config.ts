import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // A importação manda a lista já normalizada no navegador (até alguns milhares de linhas).
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
