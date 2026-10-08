export const brl = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBR = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = v.length === 10 ? new Date(v + "T12:00:00") : new Date(v);
  return d.toLocaleDateString("pt-BR");
};

export const hoje = () => new Date().toISOString().slice(0, 10);

export const somarDias = (dias: number, base = new Date()) =>
  new Date(base.getTime() + dias * 864e5).toISOString().slice(0, 10);

export const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function docFormat(v: string | null | undefined) {
  const d = digitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v ?? "";
}

/** Link wa.me com mensagem pronta. Números sem DDI recebem +55. */
export function whatsappLink(numero: string | null | undefined, mensagem: string) {
  let n = digitos(numero);
  if (n && n.length <= 11) n = "55" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}`;
}

/** Conta em aberto com vencimento passado é exibida como vencida. */
export const situacaoConta = (status: string, vencimento: string) =>
  status === "aberto" && vencimento < hoje() ? "vencido" : status;

/** Rótulo nas listas de escolha: código, nome fantasia e razão social. */
export function rotuloCliente(c: { codigo?: number | null; nome: string; nome_fantasia?: string | null }) {
  const f = c.nome_fantasia?.trim();
  return `${c.codigo ? c.codigo + " · " : ""}${f && f.toLowerCase() !== c.nome.toLowerCase() ? `${f} (${c.nome})` : c.nome}`;
}
