const FUSO = "America/Sao_Paulo";
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" e, de uma semana para trás, a data. */
export function haQuantoTempo(em: Date, agora: Date): string {
  const passou = agora.getTime() - new Date(em).getTime();
  if (passou < MINUTO) return "agora";
  if (passou < HORA) return `há ${Math.floor(passou / MINUTO)} min`;
  if (passou < DIA) return `há ${Math.floor(passou / HORA)} h`;
  const dias = Math.floor(passou / DIA);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return new Date(em).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
}

/** O tempo corrido de algo em andamento, curto e exato: "8 s", "1 min 5 s", "3 min". */
export function tempoDecorrido(desde: Date, agora: Date): string {
  const segundos = Math.max(0, Math.floor((agora.getTime() - new Date(desde).getTime()) / 1000));
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`;
}
