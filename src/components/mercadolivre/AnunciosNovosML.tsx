// Mercado Livre → Produtos: anúncios novos para os produtos da loja que ainda não estão lá. "Preparar" monta uma
// proposta por produto (categoria, título, atributos e o preço que deixa o valor da loja depois da tarifa e do frete
// grátis) e o Mercado Livre confere; aqui dá para mudar o preço, escolher e publicar. Nada vai ao ar sem "Publicar".
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Send, Wand2 } from "lucide-react";
import { Button, Card, Section, Table } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate } from "@/lib/data";
import { brl, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { linkAnuncio } from "@/lib/mlAnuncios";
import { lerValor } from "@/lib/auditoriaBusca";
import { explicarML, liquido } from "../../../supabase/functions/_shared/ml-novos";
import { Link } from "react-router-dom";

type Proposta = {
  id: string; produto_id: string; categoria_nome: string | null; titulo: string | null; preco_loja: number | null; custo: number | null;
  preco_sugerido: number | null; preco: number | null; tarifa_pct: number | null; frete_gratis: number | null; estoque: number | null;
  faltando: string[]; avisos: string[]; situacao: "proposta" | "publicando" | "publicada" | "erro"; erro: string | null; ml_item_id: string | null;
};

const pronta = (p: Proposta) => (p.situacao === "proposta" || p.situacao === "erro") && !p.faltando.length && !!p.preco && !(p.situacao === "erro" && !p.preco_sugerido);

export function AnunciosNovosML({ podeMudar, semAnuncio }: { podeMudar: boolean; semAnuncio: number }) {
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["ml_anuncios", "propostas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ml_propostas")
        .select("id, produto_id, categoria_nome, titulo, preco_loja, custo, preco_sugerido, preco, tarifa_pct, frete_gratis, estoque, faltando, avisos, situacao, erro, ml_item_id")
        .order("situacao").order("titulo");
      if (error) throw error;
      return (data ?? []) as Proposta[];
    },
  });
  const lista = q.data ?? [];
  const abertas = useMemo(() => lista.filter((p) => p.situacao !== "publicada"), [lista]);
  const publicadas = lista.filter((p) => p.situacao === "publicada");
  // o título de hoje no Mercado Livre (o da proposta pode ser o antigo, antes de tirar "My Frost")
  const titulos = useQuery({
    queryKey: ["ml_anuncios", "titulos_publicados", publicadas.length],
    enabled: publicadas.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("ml_anuncios").select("ml_item_id, titulo").in("ml_item_id", publicadas.map((p) => p.ml_item_id!).filter(Boolean));
      return new Map(((data ?? []) as { ml_item_id: string; titulo: string | null }[]).map((a) => [a.ml_item_id, a.titulo]));
    },
  });
  const prontas = abertas.filter(pronta);
  const escolhidas = prontas.filter((p) => marcadas.has(p.id));

  async function preparar() {
    setOcupado("preparar");
    try {
      let total = 0;
      for (let volta = 0; volta < 6; volta++) {
        const r = await callFunction<{ resultado?: { preparados: number; prontos: number; com_pendencia: number; erros: number; faltam: number } }>("mercadolivre", { acao: "preparar_anuncios" });
        const res = r?.resultado;
        total += res?.preparados ?? 0;
        invalidar("ml_anuncios");
        if (!res?.faltam) break;
      }
      notify(`${total} ${pl(total, "proposta preparada", "propostas preparadas")}. Confira os preços e escolha o que publicar.`);
    } catch (e) { notifyError(e); } finally { setOcupado(null); invalidar("ml_anuncios"); }
  }

  async function salvarPreco(p: Proposta) {
    const v = lerValor(precos[p.id]);
    if (v == null || !(v > 0)) return notify("Preço inválido: use, por exemplo, 45,90.", "erro");
    if (Math.abs(v - Number(p.preco)) < 0.005) return;
    const { error } = await supabase.rpc("ml_proposta_preco", { p_id: p.id, p_preco: v });
    if (error) return notifyError(error);
    setPrecos((x) => { const n = { ...x }; delete n[p.id]; return n; });
    invalidar("ml_anuncios");
  }

  async function publicar() {
    if (!escolhidas.length) return;
    const soma = escolhidas.reduce((s, p) => s + Number(p.preco), 0);
    if (!(await confirmar(`Publicar ${escolhidas.length} ${pl(escolhidas.length, "anúncio", "anúncios")} no Mercado Livre (Clássico, ativos)? Soma dos preços: ${brl(soma)}.`,
      { titulo: "Publicar anúncios", ok: "Publicar" }))) return;
    setOcupado("publicar");
    try {
      const r = await callFunction<{ resultado?: { publicados: number; erros: number; pulados: number } }>("mercadolivre", { acao: "publicar_anuncios", propostas: escolhidas.map((p) => p.id) });
      const res = r?.resultado;
      notify(`${res?.publicados ?? 0} ${pl(res?.publicados ?? 0, "anúncio publicado", "anúncios publicados")}${res?.erros ? `, ${res.erros} com erro (veja na lista)` : ""}.`, res?.erros ? "erro" : undefined);
      setMarcadas(new Set());
    } catch (e) { notifyError(e); } finally { setOcupado(null); invalidar("ml_anuncios"); }
  }

  const marcar = (id: string) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todas = prontas.length > 0 && prontas.every((p) => marcadas.has(p.id));

  return (
    <Section title="Anúncios novos" actions={
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={!!ocupado || (!semAnuncio && !abertas.length)} onClick={preparar}
          title="Monta a proposta de anúncio (categoria, atributos e preço) para cada produto da loja sem anúncio; não publica nada">
          {ocupado === "preparar" ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} {abertas.length ? "Preparar de novo" : `Preparar ${semAnuncio} ${pl(semAnuncio, "anúncio", "anúncios")}`}
        </Button>
        {podeMudar && (
          <Button type="button" disabled={!!ocupado || !escolhidas.length} onClick={publicar}>
            {ocupado === "publicar" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Publicar {escolhidas.length || ""}
          </Button>
        )}
      </div>
    }>
      <p className="mb-3 text-sm text-slate-600">
        Preço sugerido: o que deixa para a MF o mesmo valor da loja depois da tarifa do Mercado Livre (Clássico) e, a partir de R$ 79, do frete grátis.
        Terminado em ,90. Você pode mudar antes de publicar.
      </p>
      {q.error ? <Card className="p-4 text-sm text-red-700">Não deu para ler as propostas: {(q.error as Error).message}</Card> : !abertas.length ? (
        <p className="text-sm text-slate-500">{publicadas.length ? "Todas as propostas já foram publicadas." : "Nenhuma proposta ainda: clique em Preparar."}</p>
      ) : (
        <Table head={<>
          {podeMudar && <th className="th"><input type="checkbox" className="h-4 w-4" aria-label="Marcar todas as prontas" checked={todas} onChange={() => setMarcadas(todas ? new Set() : new Set(prontas.map((p) => p.id)))} /></th>}
          <th className="th">Anúncio</th><th className="th text-right">Loja</th><th className="th text-right">Preço no ML</th>
          <th className="th text-right">Tarifa e frete</th><th className="th text-right">A MF recebe</th><th className="th">Situação</th>
        </>}>
          {abertas.map((p) => {
            const preco = (precos[p.id] !== undefined ? lerValor(precos[p.id]) : Number(p.preco)) || 0;
            const pct = Number(p.tarifa_pct) || 0, frete = Number(p.frete_gratis) || 0;
            const recebe = preco ? liquido(preco, pct, frete) : 0;
            const margem = p.custo ? recebe - Number(p.custo) : null;
            const ok = pronta(p);
            return (
              <tr key={p.id}>
                {podeMudar && <td className="td"><input type="checkbox" className="h-4 w-4" disabled={!ok} aria-label={`Marcar ${p.titulo ?? ""}`} checked={marcadas.has(p.id)} onChange={() => marcar(p.id)} /></td>}
                <td className="td">
                  <span className="block max-w-[22rem] font-semibold text-fg">{p.titulo}</span>
                  <span className="block text-xs text-slate-500">{p.categoria_nome ?? "sem categoria"}{p.estoque != null ? ` · ${p.estoque} ${pl(p.estoque, "disponível", "disponíveis")}` : ""}</span>
                </td>
                <td className="td num text-right">{brl(p.preco_loja)}</td>
                <td className="td text-right">
                  {podeMudar && p.preco != null ? (
                    <input className="input num w-28 text-right" inputMode="decimal" aria-label="Preço no Mercado Livre"
                      value={precos[p.id] ?? String(Number(p.preco).toFixed(2)).replace(".", ",")}
                      onChange={(e) => setPrecos((x) => ({ ...x, [p.id]: e.target.value }))} onBlur={() => salvarPreco(p)} />
                  ) : <span className="num">{brl(p.preco)}</span>}
                  {p.preco_sugerido != null && Math.abs(preco - Number(p.preco_sugerido)) > 0.005 && <span className="block text-xs text-slate-500">sugerido {brl(p.preco_sugerido)}</span>}
                </td>
                <td className="td num text-right text-xs text-slate-600">
                  {pct ? `${pct.toLocaleString("pt-BR")}%` : "—"}{preco < 79 ? " + fixa" : frete ? ` + frete ${brl(frete)}` : ""}
                </td>
                <td className="td num text-right">
                  <span className={recebe + 0.005 < Number(p.preco_loja) ? "font-semibold text-amber-700" : "font-semibold text-fg"}>{preco ? brl(recebe) : "—"}</span>
                  {margem != null && <span className={`block text-xs ${margem < 0 ? "text-red-700" : "text-slate-500"}`}>{margem < 0 ? "abaixo do custo" : `${brl(margem)} sobre o custo`}</span>}
                </td>
                <td className="td text-xs">
                  {p.situacao === "publicando" ? <span className="inline-flex items-center gap-1 text-slate-600"><Loader2 size={12} className="animate-spin" /> publicando</span>
                    : ok ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 size={13} /> pronto</span>
                      : <span className="inline-flex items-center gap-1 font-semibold text-amber-800"><AlertTriangle size={13} /> falta</span>}
                  {p.faltando.map(explicarML).filter(Boolean).map((f) => <span key={f} className="block max-w-[18rem] text-amber-800">{f}</span>)}
                  {p.erro && <span className="block max-w-[18rem] text-red-700">{explicarML(p.erro) ?? p.erro}</span>}
                  {p.avisos.map(explicarML).filter(Boolean).map((a) => <span key={a} className="block max-w-[18rem] text-slate-500">{a}</span>)}
                  {!ok && p.situacao !== "publicando" && (
                    <Link to={`/estoque?editar=${p.produto_id}`} className="link-modulo mt-1 inline-block">Abrir o cadastro</Link>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
      {publicadas.length > 0 && (
        <details className="mt-3 text-sm text-slate-600">
          <summary className="cursor-pointer font-semibold text-fg">{publicadas.length} {pl(publicadas.length, "anúncio publicado", "anúncios publicados")} por aqui</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {publicadas.map((p) => (
              <li key={p.id}>
                <a className="link-modulo" href={linkAnuncio(p.ml_item_id!)} target="_blank" rel="noreferrer">
                  {titulos.data?.get(p.ml_item_id!) ?? p.titulo} <ExternalLink size={11} className="inline" aria-label="abre no Mercado Livre" />
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}
