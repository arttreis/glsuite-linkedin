import { Temporal } from "temporal-polyfill";

/**
 * Calendário de dias úteis por fuso e praça (§4.1 e §4.3): tudo o que depende
 * de "dia útil", "janela" e "hora local" passa por aqui. Datas locais são
 * strings `AAAA-MM-DD`; instantes são `Date`.
 */

export type Janela = { inicio: string; fim: string; jitter_min: [number, number] };
export type Feriados = ReadonlySet<string>;

const zoned = (instante: Date, fuso: string) =>
  Temporal.Instant.fromEpochMilliseconds(instante.getTime()).toZonedDateTimeISO(fuso);

const horario = (texto: string) => Temporal.PlainTime.from(texto);

export function dataLocal(instante: Date, fuso: string): string {
  return zoned(instante, fuso).toPlainDate().toString();
}

/** O horário local (`HH:MM:SS`) de um instante, no fuso. */
export function horaLocal(instante: Date, fuso: string): string {
  return zoned(instante, fuso).toPlainTime().toString({ smallestUnit: "second" });
}

export function ehDiaUtil(data: string, feriados: Feriados): boolean {
  return Temporal.PlainDate.from(data).dayOfWeek <= 5 && !feriados.has(data);
}

/**
 * `dias` dias úteis depois de `data`, sem contar o próprio dia: aceite na
 * segunda + 2 dias úteis = quarta. Com 0, devolve o próprio dia se for útil ou
 * o próximo útil.
 */
export function somarDiasUteis(data: string, dias: number, feriados: Feriados): string {
  let atual = Temporal.PlainDate.from(data);
  if (dias <= 0) {
    while (!ehDiaUtil(atual.toString(), feriados)) atual = atual.add({ days: 1 });
    return atual.toString();
  }
  let restantes = dias;
  while (restantes > 0) {
    atual = atual.add({ days: 1 });
    if (ehDiaUtil(atual.toString(), feriados)) restantes -= 1;
  }
  return atual.toString();
}

/** `dias` dias úteis antes de `data`, sem contar o próprio dia. */
export function subtrairDiasUteis(data: string, dias: number, feriados: Feriados): string {
  let atual = Temporal.PlainDate.from(data);
  let restantes = dias;
  while (restantes > 0) {
    atual = atual.subtract({ days: 1 });
    if (ehDiaUtil(atual.toString(), feriados)) restantes -= 1;
  }
  return atual.toString();
}

export function somarDias(data: string, dias: number): string {
  return Temporal.PlainDate.from(data).add({ days: dias }).toString();
}

/** O instante de um horário local (`HH:MM`) numa data, no fuso. Respeita horário de verão. */
export function instanteLocal(data: string, hora: string, fuso: string): Date {
  const zdt = Temporal.PlainDate.from(data).toZonedDateTime({ timeZone: fuso, plainTime: horario(hora) });
  return new Date(zdt.epochMilliseconds);
}

/** Meia-noite local de hoje e de amanhã, para contar o que saiu "hoje" no fuso do perfil. */
export function limitesDoDia(instante: Date, fuso: string): { inicio: Date; fim: Date } {
  const data = zoned(instante, fuso).toPlainDate();
  const inicio = data.toZonedDateTime({ timeZone: fuso });
  const fim = data.add({ days: 1 }).toZonedDateTime({ timeZone: fuso });
  return { inicio: new Date(inicio.epochMilliseconds), fim: new Date(fim.epochMilliseconds) };
}

/** Dia útil, dentro de [início, fim) da janela, no fuso do perfil. */
export function dentroDaJanela(instante: Date, fuso: string, janela: Janela, feriados: Feriados): boolean {
  const zdt = zoned(instante, fuso);
  if (!ehDiaUtil(zdt.toPlainDate().toString(), feriados)) return false;
  const agora = zdt.toPlainTime();
  return (
    Temporal.PlainTime.compare(agora, horario(janela.inicio)) >= 0 &&
    Temporal.PlainTime.compare(agora, horario(janela.fim)) < 0
  );
}

/** O próprio instante se a janela está aberta; senão, a próxima abertura. */
export function proximaAbertura(instante: Date, fuso: string, janela: Janela, feriados: Feriados): Date {
  if (dentroDaJanela(instante, fuso, janela, feriados)) return instante;
  const zdt = zoned(instante, fuso);
  const hoje = zdt.toPlainDate().toString();
  if (ehDiaUtil(hoje, feriados) && Temporal.PlainTime.compare(zdt.toPlainTime(), horario(janela.inicio)) < 0) {
    return instanteLocal(hoje, janela.inicio, fuso);
  }
  return instanteLocal(somarDiasUteis(hoje, 1, feriados), janela.inicio, fuso);
}

/** Abertura da janela no dia útil seguinte ao de `instante` (reagendar para "amanhã"). */
export function aberturaDoProximoDiaUtil(instante: Date, fuso: string, janela: Janela, feriados: Feriados): Date {
  return instanteLocal(somarDiasUteis(dataLocal(instante, fuso), 1, feriados), janela.inicio, fuso);
}

/**
 * Soma horas úteis (só dentro da janela, em dia útil). É o prazo do SLA de
 * 4 horas úteis no fuso do perfil (§4.6).
 */
export function somarHorasUteis(inicio: Date, horas: number, fuso: string, janela: Janela, feriados: Feriados): Date {
  let restante = horas * 3_600_000;
  let cursor = proximaAbertura(inicio, fuso, janela, feriados);
  for (;;) {
    const data = dataLocal(cursor, fuso);
    const disponivel = instanteLocal(data, janela.fim, fuso).getTime() - cursor.getTime();
    if (restante <= disponivel) return new Date(cursor.getTime() + restante);
    restante -= disponivel;
    cursor = instanteLocal(somarDiasUteis(data, 1, feriados), janela.inicio, fuso);
  }
}

/**
 * Um dia útil depois, no mesmo horário local. Começa na próxima abertura da
 * janela (passagem num sábado conta da segunda): é o "24 horas" do aviso ao
 * admin na passagem de bastão (SDR-66), sem fim de semana nem feriado.
 */
export function somarUmDiaUtil(instante: Date, fuso: string, janela: Janela, feriados: Feriados): Date {
  const inicio = proximaAbertura(instante, fuso, janela, feriados);
  return instanteLocal(somarDiasUteis(dataLocal(inicio, fuso), 1, feriados), horaLocal(inicio, fuso), fuso);
}

/** Minutos de intervalo aleatório entre ações (jitter, §4.3). */
export function sortearIntervalo(janela: Janela, aleatorio: () => number): number {
  const [minimo, maximo] = janela.jitter_min;
  return minimo + aleatorio() * (maximo - minimo);
}
