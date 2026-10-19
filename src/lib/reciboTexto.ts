// Texto curto do "Referente a" na lista de recibos: as descrições que vêm do extrato repetem o nome de quem recebeu,
// trazem o documento mascarado (***9**) e o código da transação (Ref. e34df…). Só para mostrar; o recibo não muda.

const LETRAS: Record<string, string> = { a: "[aáàâã]", e: "[eéê]", i: "[ií]", o: "[oóôõ]", u: "[uúü]", c: "[cç]" };

/** Procura o nome com ou sem acento, sem mudar o resto do texto. */
function reNome(nome: string) {
  const base = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const corpo = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[aeiouc]/g, (l) => LETRAS[l]).replace(/\s+/g, "\\s+");
  return new RegExp(corpo, "gi");
}

export function referenteCurto(texto: string | null | undefined, nomes: (string | null | undefined)[] = [], tipo: "pagamento" | "recebimento" = "pagamento"): string {
  const original = String(texto ?? "").trim();
  let t = original;
  t = t.replace(/\bRef\.?\s*[:#]?\s*[\w-]{6,}/gi, " ");      // código da transação
  t = t.replace(/\*{2,}[\d*.\-/]*/g, " ");                   // CPF/CNPJ mascarado
  t = t.replace(/transfer[êe]ncia enviada pelo pix/gi, "Pix enviado").replace(/transfer[êe]ncia recebida pelo pix/gi, "Pix recebido");
  for (const n of nomes) {
    const nome = String(n ?? "").trim();
    if (nome.length >= 4) t = t.replace(reNome(nome), " ");
  }
  // separadores que sobraram ("Pix  ·  -  - Enviado") e pedaços repetidos
  const partes = t.split(/\s+[-–]\s+|\s*·\s*|\s+[-–]$|^[-–]\s+/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p && !/^[-–·]+$/.test(p));
  const unicas: string[] = [];
  for (const p of partes) if (!unicas.some((u) => u.toLowerCase() === p.toLowerCase())) unicas.push(p);
  let r = unicas.join(" · ");
  r = r.replace(/^Pix · Enviado\b/i, "Pix enviado").replace(/^Pix enviado · Pix enviado/i, "Pix enviado");
  if (/^pix$/i.test(r)) r = tipo === "pagamento" ? "Pix enviado" : "Pix recebido";
  return r || original;
}
