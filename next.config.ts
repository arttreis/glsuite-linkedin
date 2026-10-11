import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // A importação manda a lista já normalizada no navegador (até alguns milhares de linhas).
      bodySizeLimit: "4mb",
    },
  },
  // Slugs de URL em inglês: as rotas em português que já circularam
  // (links de e-mail, favoritos) levam para a rota nova. 307 mantém o POST do sair.
  async redirects() {
    return [
      { source: "/comecar", destination: "/onboarding", permanent: false },
      { source: "/comecar/analise", destination: "/onboarding/analysis", permanent: false },
      { source: "/comecar/abordagem", destination: "/onboarding/approach", permanent: false },
      { source: "/comecar/:passo", destination: "/onboarding/:passo", permanent: false },
      { source: "/campanhas", destination: "/campaigns", permanent: false },
      { source: "/campanhas/nova", destination: "/campaigns/new", permanent: false },
      { source: "/campanhas/:caminho*", destination: "/campaigns/:caminho*", permanent: false },
      { source: "/configuracoes/organizacao", destination: "/settings/organization", permanent: false },
      { source: "/configuracoes", destination: "/settings", permanent: false },
      { source: "/auth/sair", destination: "/auth/logout", permanent: false },
      { source: "/inbox", destination: "/chats", permanent: false },
      { source: "/inbox/conversa/:conversa", destination: "/chats/thread/:conversa", permanent: false },
      { source: "/inbox/:lead", destination: "/chats/:lead", permanent: false },
    ];
  },
};

export default nextConfig;
