import { liberado, type ExigenciaDeModulo, type Modulo } from "@/domain/modulos";

/**
 * As abas de Configurações (§4.12), cada uma com o módulo que a libera
 * (§4.14). Fora do componente das abas para a página de `/settings`, que roda
 * no servidor, também usar.
 */
const ABAS: { href: string; rotulo: string; modulo?: ExigenciaDeModulo }[] = [
  { href: "/settings/company", rotulo: "Empresa", modulo: "linkedin" },
  { href: "/settings/sdr", rotulo: "SDR", modulo: "linkedin" },
  { href: "/settings/linkedin", rotulo: "LinkedIn", modulo: "linkedin" },
  { href: "/settings/whatsapp", rotulo: "WhatsApp", modulo: "whatsapp" },
  { href: "/settings/telegram", rotulo: "Telegram", modulo: "telegram" },
  { href: "/settings/team", rotulo: "Equipe" },
  { href: "/settings/plan", rotulo: "Plano" },
];

export function abasDaOrganizacao(modulos: readonly Modulo[]): { href: string; rotulo: string }[] {
  return ABAS.filter((aba) => liberado(modulos, aba.modulo)).map(({ href, rotulo }) => ({ href, rotulo }));
}
