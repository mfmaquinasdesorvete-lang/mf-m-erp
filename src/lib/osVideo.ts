// OS por vídeo chamada: o cliente comprou a peça e não sabe trocar, então a MF agenda uma hora técnica por vídeo.
// A mão de obra é horas × valor da hora técnica (Configurações → taxa do diagnóstico por vídeo), fora da garantia.

export type Atendimento = "oficina" | "video";

/** Condição de entrada padrão quando a máquina não vem à MF */
export const CONDICAO_REMOTA = "Atendimento remoto por vídeo chamada (a máquina não veio à MF)";
/** Equipamento quando ainda não se sabe qual máquina do cliente recebe a peça */
export const EQUIPAMENTO_A_CONFIRMAR = "Máquina do cliente (a confirmar na vídeo chamada)";

/** Mão de obra da vídeo chamada: horas × valor da hora (0 na garantia), em centavos redondos */
export function valorVideo(horas: number | null | undefined, valorHora: number, emGarantia = false) {
  if (emGarantia) return 0;
  const h = Math.max(0, Number(horas) || 0);
  return Math.round(h * valorHora * 100) / 100;
}

const dois = (n: number) => String(n).padStart(2, "0");
/** Data/hora gravada (ISO) → valor do campo datetime-local, no horário do aparelho */
export function paraCampoHora(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}
/** Campo datetime-local → ISO para gravar (vazio = sem agendamento) */
export function deCampoHora(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** "20/10 às 14:30" */
export function quandoAgendado(iso: string | null | undefined) {
  const v = paraCampoHora(iso);
  return v ? `${v.slice(8, 10)}/${v.slice(5, 7)} às ${v.slice(11, 16)}` : "";
}

type ItemPedido = { produto_id?: string | null; descricao: string; numero_serie?: string | null };

/**
 * OS aberta pelo pedido: se o pedido tem máquina, é atendimento na oficina com a máquina preenchida; se só tem peças,
 * é vídeo chamada para instalar a peça (1 hora técnica), e a peça vai no defeito, não no equipamento.
 */
export type OsDoPedido = {
  cliente_id: string; pedido_id: string; unidade_id: string | null; atendimento: Atendimento; produto_id: string | null;
  equipamento: string; numero_serie: string | null; defeito_relatado: string; horas_tecnicas?: number; condicao_entrada?: string;
};
export function osDoPedido(p: { id: string; numero: number; cliente_id: string; unidade_id?: string | null; itens: ItemPedido[] }, ehMaquina: (produtoId?: string | null) => boolean): OsDoPedido {
  const maquina = p.itens.find((i) => ehMaquina(i.produto_id));
  const base = { cliente_id: p.cliente_id, pedido_id: p.id, unidade_id: p.unidade_id ?? null };
  if (maquina) {
    return { ...base, atendimento: "oficina" as Atendimento, produto_id: maquina.produto_id ?? null, equipamento: maquina.descricao,
      numero_serie: maquina.numero_serie ?? null, defeito_relatado: `Aberta pelo pedido de venda #${p.numero}: ` };
  }
  const pecas = p.itens.map((i) => i.descricao).filter(Boolean).join(", ");
  return { ...base, atendimento: "video" as Atendimento, horas_tecnicas: 1, equipamento: "", produto_id: null, numero_serie: null,
    condicao_entrada: CONDICAO_REMOTA,
    defeito_relatado: `Instalação ${p.itens.length > 1 ? "das peças" : "da peça"} ${pecas} (pedido de venda #${p.numero}). O cliente não sabe instalar: hora técnica por vídeo chamada.` };
}

/**
 * Termo da vídeo chamada mandado ao cliente pelo WhatsApp: o que é, o valor, que o Pix vem antes do agendamento e
 * que ele responde ACEITO (fica registrado na OS como o aceite). Com o Pix copia e cola quando a unidade tem chave.
 */
export function termoVideo(o: { numero?: number | null; horas?: number | null; valorHora: number; emGarantia?: boolean; nome?: string; pix?: string | null; outraEmpresa?: string | null; valor?: number | null }) {
  const horas = Number(o.horas) || 1;
  const soHoras = valorVideo(horas, o.valorHora, o.emGarantia);
  // o valor da OS (mão de obra) manda: pode ter serviço somado às horas
  const valor = o.emGarantia ? 0 : o.valor != null && Number.isFinite(o.valor) ? o.valor : soHoras;
  const h = String(horas).replace(".", ",");
  return [
    `Olá${o.nome ? ` ${o.nome}` : ""}! Para a *assistência técnica por vídeo chamada* (OS #${o.numero ?? ""}):`,
    `• Um técnico da MF Máquinas orienta a instalação/conserto por vídeo; a máquina não precisa vir até nós.`,
    o.emGarantia ? "• Atendimento coberto pela garantia: sem custo." : `• Valor: ${brl(valor)} (${h} h técnica × ${brl(o.valorHora)}${valor > soHoras ? " + serviço" : ""}).`,
    o.emGarantia ? "" : "• O pagamento é por Pix *antes* do agendamento; com o Pix confirmado, marcamos o dia e a hora.",
    "• Se precisar de peça ou de mais tempo, avisamos o valor antes.",
    o.outraEmpresa ? `• A MF Máquinas é uma empresa diferente da ${o.outraEmpresa} e responde só pelo serviço e pelas peças desta OS.` : "",
    "",
    "Se concorda, responda *ACEITO*.",
    o.pix && !o.emGarantia ? `\n*Pix copia e cola* (${brl(valor)}):\n${o.pix}` : "",
  ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n");
}

/** Os 3 passos da vídeo chamada: aceite do termo → Pix pago (ou garantia) → agendada */
export function passoVideo(o: { aceito?: boolean; pago?: boolean; agendado?: boolean; emGarantia?: boolean }) {
  if (!o.aceito) return 1;
  if (!o.pago && !o.emGarantia) return 2;
  if (!o.agendado) return 3;
  return 4;
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
