// Cotação rápida de frete (o cliente liga: "quanto fica a borrachinha para tal CEP?"): CEP + produtos → todas as
// transportadoras ligadas ao ERP de uma vez (Melhor Envio, Braspress, Rodonaves), da mais barata, com o custo e o preço
// para o cliente pelas regras de frete. Copia a mensagem ou manda pelo WhatsApp. As últimas consultas ficam embaixo.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCopy, History, MessageCircle, Minus, Plus, Search, Truck, X } from "lucide-react";
import { Button, Field } from "@/components/ui";
import { useRows, ler } from "@/lib/data";
import { brl, dataHoraBR, pl, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { mensagemCotacao, type OpcaoFrete } from "../../../supabase/functions/_shared/frete-cotar";

type ProdutoBusca = { id: string; descricao: string; sku: string | null; preco_venda: number | null; peso_kg: number | null; embalagem_id: string | null; altura_cm: number | null };
type Item = { produto_id: string; descricao: string; quantidade: number };
type Resultado = { consulta_id: string; cep: string; cidade: string | null; uf: string | null; opcoes: OpcaoFrete[]; avisos: string[]; peso_kg: number; valor_produtos: number; sob_consulta: boolean };
type ClienteBusca = { id: string; nome: string; nome_fantasia: string | null; whatsapp: string | null; telefone: string | null; cep: string | null };
type Consulta = { id: string; criado_em: string; cep: string; cidade: string | null; uf: string | null; itens: Item[]; opcoes: OpcaoFrete[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CotacaoRapida() {
  const { data: produtos = [] } = useRows<ProdutoBusca>("produtos", {
    select: "id, descricao, sku, preco_venda, peso_kg, embalagem_id, altura_cm", order: "descricao", ascending: true, key: ["frete-rapido"], filtro: (q) => q.eq("ativo", true),
  });
  const [cep, setCep] = useState("");
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [cliente, setCliente] = useState<ClienteBusca | null>(null);
  const [buscaCli, setBuscaCli] = useState("");
  const [cotando, setCotando] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);

  const achados = useMemo(() => {
    const t = semAcento(busca.trim());
    if (t.length < 2) return [];
    return produtos.filter((p) => semAcento(`${p.descricao} ${p.sku ?? ""}`).includes(t)).slice(0, 8);
  }, [busca, produtos]);
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", "frete-rapido", buscaCli.trim()], enabled: buscaCli.trim().length >= 3,
    queryFn: async () => ((await ler(supabase.from("clientes").select("id, nome, nome_fantasia, whatsapp, telefone, cep")
      .or(`nome.ilike.%${buscaCli.trim().replace(/[%,()]/g, "")}%,nome_fantasia.ilike.%${buscaCli.trim().replace(/[%,()]/g, "")}%`).limit(6))) ?? []) as ClienteBusca[],
  });
  const { data: historico = [], refetch } = useQuery({
    queryKey: ["frete_consultas", "equipe"],
    queryFn: async () => ((await ler(supabase.from("frete_consultas").select("id, criado_em, cep, cidade, uf, itens, opcoes").eq("origem", "equipe").order("criado_em", { ascending: false }).limit(8))) ?? []) as Consulta[],
  });

  const semCadastro = (p: ProdutoBusca) => !(Number(p.peso_kg) > 0) || (!p.embalagem_id && !(Number(p.altura_cm) > 0));
  function adicionar(p: ProdutoBusca) {
    setItens((xs) => xs.some((x) => x.produto_id === p.id) ? xs.map((x) => x.produto_id === p.id ? { ...x, quantidade: x.quantidade + 1 } : x) : [...xs, { produto_id: p.id, descricao: p.descricao, quantidade: 1 }]);
    setBusca("");
    setR(null);
  }
  const mudarQtd = (id: string, d: number) => { setItens((xs) => xs.map((x) => x.produto_id === id ? { ...x, quantidade: Math.max(1, Math.min(99, x.quantidade + d)) } : x)); setR(null); };

  async function cotar(ev?: FormEvent) {
    ev?.preventDefault();
    if (cep.replace(/\D/g, "").length !== 8) return notify("Informe o CEP com 8 números", "erro");
    if (!itens.length) return notify("Escolha pelo menos um produto", "erro");
    setCotando(true);
    try {
      const res = await callFunction<Resultado>("frete-cotar", { cep, itens: itens.map(({ produto_id, quantidade }) => ({ produto_id, quantidade })), cliente_id: cliente?.id ?? null });
      setR(res);
      refetch();
    } catch (err) { notifyError(err); } finally { setCotando(false); }
  }
  function repetir(c: Consulta) { setCep(c.cep); setItens(c.itens); setR(null); }

  const mensagem = r ? mensagemCotacao({ cep: r.cep, cidade: r.cidade ? `${r.cidade}/${r.uf ?? ""}` : null, itens, opcoes: r.opcoes.filter((o) => o.id !== "retirada") }) : "";
  const zap = cliente?.whatsapp || cliente?.telefone || null;

  return (
    <div className="space-y-4">
      <form onSubmit={cotar} className="grid gap-3 md:grid-cols-[10rem_1fr]">
        <Field label="CEP de destino" obrigatorio>
          <input className="input" inputMode="numeric" autoFocus value={cep} onChange={(e) => { setCep(e.target.value); setR(null); }} placeholder="00000-000" maxLength={9} aria-label="CEP de destino" />
        </Field>
        <Field label="Produto (nome ou código)">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input pl-9" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: borracha da porta" aria-label="Buscar produto" />
            {achados.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-campo border border-slate-200 bg-surface shadow-pop">
                {achados.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => adicionar(p)} className="linha-clicavel flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
                      <span className="min-w-0 flex-1 truncate">{p.descricao}{p.sku ? <span className="text-slate-400"> · {p.sku}</span> : null}</span>
                      {semCadastro(p) && <span className="shrink-0 rounded bg-amber-50 px-1.5 text-2xs font-semibold text-amber-800">sem peso/medidas</span>}
                      {p.preco_venda ? <span className="num shrink-0 text-xs text-slate-500">{brl(p.preco_venda)}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        {itens.length > 0 && (
          <ul className="space-y-1.5 md:col-span-2">
            {itens.map((i) => (
              <li key={i.produto_id} className="flex items-center gap-2 rounded-campo bg-slate-50 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.descricao}</span>
                <button type="button" className="botao-icone p-1" onClick={() => mudarQtd(i.produto_id, -1)} aria-label={`Menos ${i.descricao}`}><Minus size={14} /></button>
                <span className="num w-6 text-center font-semibold">{i.quantidade}</span>
                <button type="button" className="botao-icone p-1" onClick={() => mudarQtd(i.produto_id, 1)} aria-label={`Mais ${i.descricao}`}><Plus size={14} /></button>
                <button type="button" className="botao-icone-perigo p-1" onClick={() => { setItens((xs) => xs.filter((x) => x.produto_id !== i.produto_id)); setR(null); }} aria-label={`Tirar ${i.descricao}`}><X size={14} /></button>
              </li>
            ))}
          </ul>
        )}

        <Field label="Cliente (opcional: para a Braspress e o WhatsApp)" className="md:col-span-2">
          {cliente ? (
            <div className="flex items-center gap-2 rounded-campo bg-slate-50 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{cliente.nome_fantasia || cliente.nome}</span>
              <button type="button" className="botao-icone p-1" onClick={() => { setCliente(null); setR(null); }} aria-label="Tirar o cliente"><X size={14} /></button>
            </div>
          ) : (
            <div className="relative">
              <input className="input" type="search" value={buscaCli} onChange={(e) => setBuscaCli(e.target.value)} placeholder="Digite 3 letras do nome" aria-label="Buscar cliente" />
              {clientes.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-campo border border-slate-200 bg-surface shadow-pop">
                  {clientes.map((c) => (
                    <li key={c.id}><button type="button" className="linha-clicavel w-full px-3 py-2 text-left text-sm"
                      onClick={() => { setCliente(c); setBuscaCli(""); if (!cep && c.cep) setCep(c.cep); setR(null); }}>{c.nome_fantasia || c.nome}</button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>

        <div className="md:col-span-2">
          <Button type="submit" disabled={cotando} carregando={cotando}><Truck size={16} /> {cotando ? "Cotando nas transportadoras…" : "Cotar frete"}</Button>
        </div>
      </form>

      {r && (
        <section className="space-y-3 rounded-cartao border border-slate-200 p-3">
          <div className="flex flex-wrap items-baseline gap-2 text-sm">
            <b className="text-fg">CEP {r.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}{r.cidade ? ` · ${r.cidade}/${r.uf ?? ""}` : ""}</b>
            <span className="text-slate-500">{r.peso_kg} kg · produtos {brl(r.valor_produtos)}</span>
          </div>
          {r.opcoes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Transportadora</th><th>Prazo</th><th className="text-right">Custo MF</th><th className="text-right">Cliente paga</th></tr></thead>
                <tbody>
                  {r.opcoes.map((o, i) => (
                    <tr key={o.id} className={`border-t border-slate-100 ${i === 0 && o.id !== "retirada" ? "font-semibold" : ""}`}>
                      <td className="py-1.5">{o.transportadora}{o.servico ? <span className="text-slate-500"> · {o.servico}</span> : null}</td>
                      <td>{o.prazo != null ? `${o.prazo} ${pl(o.prazo, "dia útil", "dias úteis")}` : "—"}</td>
                      <td className="num text-right">{o.id === "retirada" ? "—" : brl(o.valor)}</td>
                      <td className="num text-right">{o.gratis ? "grátis" : brl(o.valor_cliente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {r.sob_consulta && <p className="text-sm text-amber-800">Nenhuma transportadora cotou: veja os avisos abaixo ou cote pelo WhatsApp da transportadora.</p>}
          {r.avisos.length > 0 && <ul className="space-y-0.5 text-xs text-amber-800">{r.avisos.map((a) => <li key={a}>• {a}</li>)}</ul>}
          {!r.sob_consulta && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(mensagem).then(() => notify("Mensagem copiada"), () => notify(mensagem))}><ClipboardCopy size={14} /> Copiar mensagem</Button>
              <a href={whatsappLink(zap, mensagem)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-botao bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700">
                <MessageCircle size={15} aria-hidden /> {zap ? "Mandar no WhatsApp do cliente" : "Mandar no WhatsApp"}
              </a>
            </div>
          )}
        </section>
      )}

      {historico.length > 0 && (
        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-rotulo text-slate-500"><History size={13} aria-hidden /> Últimas cotações</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {historico.map((c) => {
              const melhor = (c.opcoes ?? []).find((o) => o.id !== "retirada");
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="text-xs text-slate-500">{dataHoraBR(c.criado_em)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}{c.cidade ? ` ${c.cidade}/${c.uf ?? ""}` : ""} · {(c.itens ?? []).map((i) => `${i.quantidade}× ${i.descricao}`).join(", ")}</span>
                  {melhor && <span className="num text-xs font-semibold">{melhor.transportadora} {brl(melhor.valor_cliente)}</span>}
                  <button type="button" className="link-acao text-xs" onClick={() => repetir(c)}>Repetir</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
