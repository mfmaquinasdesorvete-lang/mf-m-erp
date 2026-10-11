// Pedido de cotação que o fornecedor abre pelo link (/cotacao/<código>), sem login: informa preço, prazo e
// disponibilidade de cada item e as condições (pagamento, frete, validade). Pode corrigir enquanto a cotação
// estiver aberta, ou avisar que não vai cotar.
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import { brl, dataBR } from "@/lib/format";
import logo from "@/assets/logo.webp";
import { corFundoLegivel } from "@/lib/tema";

type Item = { id: string; descricao: string; quantidade: number; unidade: string | null; observacao: string | null; codigo_fabricante: string | null; marca: string | null;
  modelo: string | null; seu_codigo: string | null; preco_unitario: number | null; prazo_dias: number | null; disponivel: boolean; obs_resposta: string | null };
type Cot = {
  numero: number; titulo: string | null; status: string; situacao: string; prazo_resposta: string | null; entrega_desejada: string | null; observacoes: string | null;
  fornecedor: string; itens: Item[]; condicao_pagamento: string | null; prazo_entrega_dias: number | null; frete: number | null; frete_tipo: string | null;
  validade: string | null; obs_fornecedor: string | null; respondido_por: string | null; respondido_em: string | null;
  empresa: { nome: string; razao_social: string | null; cnpj: string | null; whatsapp: string | null; telefone: string | null; email: string | null; municipio: string | null; uf: string | null };
  cor: string;
};
type Linha = { preco: string; prazo: string; disponivel: boolean; obs: string };
const paraNumero = (s: string) => { const t = s.trim().replace(/\./g, "").replace(",", "."); return t && Number.isFinite(Number(t)) ? Number(t) : null; };
const moeda = (n: number | null) => (n == null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

export default function CotacaoPublica() {
  const token = useLocation().pathname.split("/")[2] ?? "";
  const { data: c, isLoading, refetch } = useQuery({
    queryKey: ["cotacao-publica", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cotacao_publica", { p_token: token });
      if (error) throw error;
      return data as Cot | null;
    },
    retry: false,
  });
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [dados, setDados] = useState({ respondido_por: "", condicao_pagamento: "", prazo_entrega_dias: "", frete: "", frete_tipo: "CIF", validade: "", observacoes: "" });
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<"" | "respondida" | "recusou">("");
  const [recusar, setRecusar] = useState(false);
  const [motivo, setMotivo] = useState("");

  // página pública: sempre no tema claro
  useEffect(() => {
    const raiz = document.documentElement, antes = raiz.dataset.theme;
    raiz.dataset.theme = "light";
    return () => { if (antes) raiz.dataset.theme = antes; };
  }, []);
  // preenche com a resposta anterior (para corrigir)
  useEffect(() => {
    if (!c) return;
    setLinhas(Object.fromEntries(c.itens.map((i) => [i.id, { preco: moeda(i.preco_unitario), prazo: i.prazo_dias == null ? "" : String(i.prazo_dias), disponivel: i.disponivel, obs: i.obs_resposta ?? "" }])));
    setDados({
      respondido_por: c.respondido_por ?? "", condicao_pagamento: c.condicao_pagamento ?? "", prazo_entrega_dias: c.prazo_entrega_dias == null ? "" : String(c.prazo_entrega_dias),
      frete: c.frete == null ? "" : moeda(c.frete), frete_tipo: c.frete_tipo ?? "CIF", validade: c.validade ?? "", observacoes: c.obs_fornecedor ?? "",
    });
  }, [c]);

  if (isLoading) return <Tela><p className="py-24 text-center text-slate-500">Carregando a cotação…</p></Tela>;
  if (!c) return <Tela><p className="py-24 text-center text-slate-600">Cotação não encontrada. Confira o link ou fale com o comprador.</p></Tela>;

  const aberta = c.status === "enviada";
  const cor = corFundoLegivel(c.cor);
  const total = c.itens.reduce((s, i) => { const l = linhas[i.id]; const p = l?.disponivel ? paraNumero(l.preco) : null; return s + (p ?? 0) * Number(i.quantidade); }, 0);
  const muda = (id: string, patch: Partial<Linha>) => setLinhas((x) => ({ ...x, [id]: { ...x[id], ...patch } }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const itens = c!.itens.map((i) => {
        const l = linhas[i.id]; const p = l?.disponivel ? paraNumero(l.preco) : null;
        return { item_id: i.id, preco_unitario: p == null ? null : p.toFixed(4).replace(/0{1,2}$/, ""), prazo_dias: l?.prazo.trim() || null, disponivel: !!l?.disponivel && p != null, observacao: l?.obs || null };
      });
      const frete = paraNumero(dados.frete);
      const { error } = await supabase.rpc("cotacao_responder", { p_token: token, p_itens: itens,
        p_dados: { ...dados, frete: frete == null ? null : frete.toFixed(2), prazo_entrega_dias: dados.prazo_entrega_dias.trim() || null, validade: dados.validade || null } });
      if (error) throw error;
      setFeito("respondida"); refetch();
    } catch (err) { notifyError(err); } finally { setEnviando(false); }
  }
  async function naoCotar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const { error } = await supabase.rpc("cotacao_recusar", { p_token: token, p_nome: dados.respondido_por, p_motivo: motivo || null });
      if (error) throw error;
      setFeito("recusou"); refetch();
    } catch (err) { notifyError(err); } finally { setEnviando(false); }
  }

  return (
    <Tela cor={cor} empresa={c.empresa.nome}>
      <div className="mb-4">
        <h1 className="text-xl font-bold">Cotação nº {c.numero}{c.titulo ? ` · ${c.titulo}` : ""}</h1>
        <p className="text-sm text-slate-600">Para <b>{c.fornecedor}</b>
          {c.prazo_resposta && <> · responder até <b>{dataBR(c.prazo_resposta)}</b></>}
          {c.entrega_desejada && <> · entrega desejada {dataBR(c.entrega_desejada)}</>}
        </p>
        {c.observacoes && <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">{c.observacoes}</p>}
      </div>

      {(feito || c.situacao === "respondida" || c.situacao === "recusou") && (
        <div className={`mb-4 flex items-start gap-2 rounded-xl p-3 text-sm ${(feito || c.situacao) === "recusou" ? "bg-slate-100 text-slate-800" : "bg-emerald-50 text-emerald-900"}`} role="status">
          {(feito || c.situacao) === "recusou" ? <XCircle size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
          <span>{(feito || c.situacao) === "recusou" ? "Registramos que vocês não vão cotar desta vez. Obrigado pelo retorno!"
            : <>Recebemos a sua resposta{c.respondido_por ? ` (${c.respondido_por})` : ""}. Obrigado!{aberta && " Se precisar, corrija abaixo e envie de novo."}</>}</span>
        </div>
      )}
      {!aberta && <p className="mb-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Esta cotação já foi encerrada. Para outra proposta, fale com o comprador.</p>}

      <form onSubmit={enviar} className="space-y-4">
        <ul className="space-y-2">
          {c.itens.map((i) => {
            const l = linhas[i.id] ?? { preco: "", prazo: "", disponivel: true, obs: "" };
            const p = paraNumero(l.preco);
            return (
              <li key={i.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{i.descricao}</div>
                    <div className="text-xs text-slate-500">{[i.codigo_fabricante && `cód. fabricante ${i.codigo_fabricante}`, i.marca, i.modelo, i.seu_codigo && `seu código ${i.seu_codigo}`].filter(Boolean).join(" · ")}</div>
                    {i.observacao && <div className="text-xs text-amber-800">{i.observacao}</div>}
                  </div>
                  <div className="text-sm font-semibold">{Number(i.quantidade).toLocaleString("pt-BR")} {i.unidade ?? "un"}</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_7rem_auto_1fr] sm:items-end">
                  <label className="text-xs font-semibold text-slate-600">Preço unitário (R$)
                    <input className="input mt-1 text-right" inputMode="decimal" disabled={!aberta || !l.disponivel} value={l.preco} placeholder="0,00" onChange={(e) => muda(i.id, { preco: e.target.value })} />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Prazo (dias)
                    <input className="input mt-1" inputMode="numeric" disabled={!aberta || !l.disponivel} value={l.prazo} placeholder="ex.: 5" onChange={(e) => muda(i.id, { prazo: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                  </label>
                  <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1 sm:pb-2">
                    <input type="checkbox" className="h-4 w-4" disabled={!aberta} checked={!l.disponivel} onChange={(e) => muda(i.id, { disponivel: !e.target.checked })} /> Não temos
                  </label>
                  <label className="col-span-2 text-xs font-semibold text-slate-600 sm:col-span-1">Observação
                    <input className="input mt-1" disabled={!aberta} value={l.obs} maxLength={300} placeholder="marca, similar…" onChange={(e) => muda(i.id, { obs: e.target.value })} />
                  </label>
                </div>
                {l.disponivel && p != null && <div className="mt-1 text-right text-xs text-slate-600">Total do item: <b>{brl(p * Number(i.quantidade))}</b></div>}
              </li>
            );
          })}
        </ul>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold">Condições</h2><span className="text-sm">Total dos itens: <b>{brl(total)}</b></span></div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-600">Condição de pagamento
              <input className="input mt-1" disabled={!aberta} value={dados.condicao_pagamento} maxLength={200} placeholder="ex.: 28 dias, boleto" onChange={(e) => setDados({ ...dados, condicao_pagamento: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-slate-600">Prazo de entrega (dias)
              <input className="input mt-1" inputMode="numeric" disabled={!aberta} value={dados.prazo_entrega_dias} onChange={(e) => setDados({ ...dados, prazo_entrega_dias: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
            </label>
            <label className="text-xs font-semibold text-slate-600">Proposta válida até
              <input type="date" className="input mt-1" disabled={!aberta} value={dados.validade} onChange={(e) => setDados({ ...dados, validade: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-slate-600">Frete (R$)
              <input className="input mt-1 text-right" inputMode="decimal" disabled={!aberta} value={dados.frete} placeholder="0,00" onChange={(e) => setDados({ ...dados, frete: e.target.value })} />
            </label>
            <fieldset className="text-xs font-semibold text-slate-600">
              <legend>Tipo de frete</legend>
              <div className="mt-2 flex gap-4 text-sm font-normal">
                {(["CIF", "FOB"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5"><input type="radio" name="frete_tipo" disabled={!aberta} checked={dados.frete_tipo === t} onChange={() => setDados({ ...dados, frete_tipo: t })} />
                    {t === "CIF" ? "CIF (por sua conta)" : "FOB (por nossa conta)"}</label>
                ))}
              </div>
            </fieldset>
            <label className="text-xs font-semibold text-slate-600">Seu nome *
              <input className="input mt-1" disabled={!aberta} required value={dados.respondido_por} maxLength={120} autoComplete="name" onChange={(e) => setDados({ ...dados, respondido_por: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-slate-600 sm:col-span-3">Observações
              <textarea className="input mt-1" rows={2} disabled={!aberta} value={dados.observacoes} maxLength={1000} onChange={(e) => setDados({ ...dados, observacoes: e.target.value })} />
            </label>
          </div>
        </div>

        {aberta && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={enviando} className="rounded-xl px-6 py-3 font-bold text-white shadow-sm disabled:opacity-60" style={{ background: cor }}>
              {enviando ? "Enviando…" : c.situacao === "respondida" ? "Enviar correção" : "Enviar preços"}
            </button>
            <button type="button" className="text-sm font-semibold text-slate-600 underline" onClick={() => setRecusar(!recusar)}>Não vamos cotar</button>
          </div>
        )}
      </form>

      {aberta && recusar && (
        <form onSubmit={naoCotar} className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <label className="block text-xs font-semibold text-slate-600">Seu nome *
            <input className="input mt-1" required value={dados.respondido_por} maxLength={120} onChange={(e) => setDados({ ...dados, respondido_por: e.target.value })} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">Motivo (opcional)
            <input className="input mt-1" value={motivo} maxLength={300} placeholder="ex.: não trabalhamos com estes itens" onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <button type="submit" disabled={enviando} className="rounded-lg bg-slate-700 px-4 py-2 font-semibold text-white">Confirmar que não vamos cotar</button>
        </form>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-500">
        {c.empresa.razao_social ?? c.empresa.nome}{c.empresa.cnpj ? ` · CNPJ ${c.empresa.cnpj}` : ""}{c.empresa.municipio ? ` · ${c.empresa.municipio}/${c.empresa.uf ?? ""}` : ""}
        {c.empresa.whatsapp ? ` · WhatsApp ${c.empresa.whatsapp}` : ""}{c.empresa.email ? ` · ${c.empresa.email}` : ""}
      </footer>
    </Tela>
  );
}

function Tela({ children, cor = corFundoLegivel(null), empresa }: { children: React.ReactNode; cor?: string; empresa?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="text-white" style={{ background: cor }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <img src={logo} alt="" className="h-9 w-9 rounded-lg bg-white/10" />
          <div className="font-bold">{empresa ?? "Cotação"}</div>
          <div className="ml-auto text-sm opacity-90">Pedido de cotação</div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  );
}
