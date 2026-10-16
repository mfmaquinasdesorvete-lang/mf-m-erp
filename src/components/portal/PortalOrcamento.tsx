// Novo orçamento do representante: cliente da carteira (ou novo), produtos com o preço da tabela permitida,
// forma de pagamento e desconto dentro da regra. Grava como orçamento; a empresa aprova pelo fluxo normal.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Minus, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { Button, Card, Field } from "@/components/ui";
import { brl } from "@/lib/format";
import {
  adicionarItem, calcularOrcamento, lerQuantidade, pctBR, rotuloDisponibilidade,
  type ClientePortal, type FormaPortal, type ItemOrcamento, type ProdutoPortal,
} from "@/lib/portal";
import { notifyError } from "@/lib/notify";
import { confirmar } from "@/components/Dialogos";
import { ClienteNovoModal } from "./ClienteNovo";
import { rpcPortal, useAtualizarPortal, usePortal } from "./dados";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Atraso curto na busca (não consulta o banco a cada letra). */
function useAtrasado<T>(valor: T, ms = 300) {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

export function PortalOrcamento() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const atualizar = useAtualizarPortal();
  const { data: clientes = [] } = usePortal<ClientePortal[]>("portal_clientes");
  const { data: formas = [] } = usePortal<FormaPortal[]>("portal_formas_pagamento");
  const [clienteId, setClienteId] = useState<string>(params.get("cliente") ?? "");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [novoCliente, setNovoCliente] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const busca = useAtrasado(buscaProduto.trim());
  const [itens, setItens] = useState<ItemOrcamento[]>([]);
  const [qtdTexto, setQtdTexto] = useState<Record<string, string>>({});
  const [formaId, setFormaId] = useState("");
  const [descontoTxt, setDescontoTxt] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ id: string; numero: number; total: number } | null>(null);

  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const forma = formas.find((f) => f.id === formaId) ?? null;
  useEffect(() => { if (!formaId && formas.length) setFormaId(formas[0].id); }, [formas, formaId]);
  const { data: produtos = [], isFetching: buscando } = usePortal<ProdutoPortal[]>("portal_produtos", { p_busca: busca, p_cliente: clienteId || null }, !!clienteId && busca.length >= 2);

  const maximo = Number(forma?.desconto_max ?? 0);
  // forma sem desconto liberado: o campo fica travado, então limpa o que veio de outra forma
  useEffect(() => { if (maximo <= 0) setDescontoTxt(""); }, [maximo]);
  const descontoPct = descontoTxt.trim() ? Number(descontoTxt.replace(",", ".")) : 0;
  const conta = calcularOrcamento(itens, descontoPct, maximo);
  const erro = !cliente ? "Escolha o cliente." : !forma ? "Escolha a forma de pagamento." : conta.erro;

  const clientesVistos = useMemo(() => {
    const t = semAcento(buscaCliente.trim());
    return clientes.filter((c) => !t || semAcento(`${c.nome} ${c.nome_fantasia ?? ""} ${c.municipio ?? ""}`).includes(t)).slice(0, 30);
  }, [clientes, buscaCliente]);

  async function trocarCliente(id: string) {
    if (id === clienteId) return;
    // o preço depende da tabela do cliente: trocar o cliente recomeça os produtos
    if (itens.length && !(await confirmar("Trocar o cliente? Os produtos escolhidos saem (o preço pode mudar com a tabela do cliente)."))) return;
    setItens([]); setQtdTexto({}); setClienteId(id); setBuscaCliente("");
  }

  function mudarQtd(id: string, txt: string) {
    setQtdTexto((x) => ({ ...x, [id]: txt }));
    const q = lerQuantidade(txt);
    setItens((l) => l.map((i) => (i.produto_id === id ? { ...i, quantidade: q ?? 0 } : i)));
  }
  function somar(id: string, d: number) {
    setItens((l) => l.map((i) => (i.produto_id === id ? { ...i, quantidade: Math.max(1, Math.round((i.quantidade + d) * 1000) / 1000) } : i)));
    setQtdTexto(({ [id]: _x, ...resto }) => resto);
  }

  async function enviar() {
    if (erro || !cliente || !forma) return;
    setEnviando(true);
    try {
      const r = await rpcPortal<{ id: string; numero: number; total: number }>("portal_salvar_orcamento", {
        p: {
          cliente_id: cliente.id, forma_pagamento_id: forma.id, desconto_pct: conta.pct, observacoes: obs.trim() || null,
          itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
        },
      });
      setEnviado(r);
      atualizar();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }

  if (enviado) return (
    <Card className="space-y-3 p-6 text-center">
      <CheckCircle2 size={40} className="mx-auto text-emerald-600" aria-hidden />
      <h1 className="text-lg font-bold text-fg">Orçamento #{enviado.numero} enviado</h1>
      <p className="text-sm text-slate-600">Total {brl(enviado.total)}. A empresa vai conferir e aprovar. Você acompanha em Meus pedidos.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={() => navigate(`/portal/pedidos/${enviado.id}`)}>Ver o pedido</Button>
        <Button onClick={() => { setEnviado(null); setItens([]); setQtdTexto({}); setObs(""); setDescontoTxt(""); }}>Novo orçamento</Button>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <h1 className="text-xl font-bold text-fg">Novo orçamento</h1>

      {/* 1. Cliente */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-bold text-fg">1. Cliente</h2>
        {cliente ? (
          <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-3">
            <span className="min-w-0">
              <span className="block font-semibold text-fg">{cliente.nome}</span>
              <span className="block text-xs text-slate-600">{[cliente.municipio, cliente.uf].filter(Boolean).join("/")}{cliente.conferir ? " · em conferência pela empresa" : ""}</span>
            </span>
            <Button type="button" variant="ghost" onClick={() => setClienteId("")}>Trocar</Button>
          </div>
        ) : (
          <>
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="input pl-9" type="search" placeholder="Buscar na sua carteira" aria-label="Buscar cliente" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
            </label>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {clientesVistos.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => trocarCliente(c.id)} className="w-full px-3 py-2.5 text-left hover:bg-slate-50">
                    <span className="block text-sm font-semibold text-fg">{c.nome}</span>
                    <span className="block text-xs text-slate-500">{[c.municipio, c.uf].filter(Boolean).join("/")}</span>
                  </button>
                </li>
              ))}
              {!clientesVistos.length && <li className="px-3 py-4 text-center text-sm text-slate-500">Nenhum cliente encontrado na sua carteira.</li>}
            </ul>
            <Button type="button" variant="secondary" className="w-full" onClick={() => setNovoCliente(true)}><UserPlus size={16} aria-hidden /> Cadastrar cliente novo</Button>
          </>
        )}
      </Card>

      {/* 2. Produtos */}
      <Card className={`space-y-3 p-4 ${cliente ? "" : "opacity-60"}`}>
        <h2 className="text-sm font-bold text-fg">2. Produtos</h2>
        {!cliente ? <p className="text-sm text-slate-500">Escolha o cliente primeiro: o preço segue a tabela dele.</p> : (
          <>
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="input pl-9" type="search" placeholder="Buscar produto (nome, código, modelo)" aria-label="Buscar produto" value={buscaProduto} onChange={(e) => setBuscaProduto(e.target.value)} />
            </label>
            {busca.length >= 2 && (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200" aria-busy={buscando}>
                {produtos.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{p.descricao}</span>
                      <span className="block text-xs text-slate-500">{[p.sku, p.modelo, p.marca].filter(Boolean).join(" · ")}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs">
                        <span className="num font-bold text-fg">{brl(p.preco)}</span>
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${p.disponibilidade === "disponivel" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{rotuloDisponibilidade(p.disponibilidade)}</span>
                      </span>
                    </span>
                    <Button type="button" variant="secondary" className="shrink-0 !px-3" aria-label={`Adicionar ${p.descricao}`}
                      onClick={() => { setItens((l) => adicionarItem(l, p)); setQtdTexto(({ [p.id]: _x, ...r }) => r); }}><Plus size={16} aria-hidden /></Button>
                  </li>
                ))}
                {!buscando && !produtos.length && <li className="px-3 py-4 text-center text-sm text-slate-500">Nenhum produto com "{busca}".</li>}
                {buscando && !produtos.length && <li className="px-3 py-4 text-center text-sm text-slate-500">Buscando…</li>}
              </ul>
            )}
            {itens.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {itens.map((i) => (
                  <li key={i.produto_id} className="space-y-2 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-fg">{i.descricao}</span>
                      <button type="button" className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={`Tirar ${i.descricao}`}
                        onClick={() => setItens((l) => l.filter((x) => x.produto_id !== i.produto_id))}><Trash2 size={16} aria-hidden /></button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1">
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200" aria-label="Menos" onClick={() => somar(i.produto_id, -1)}><Minus size={15} aria-hidden /></button>
                        <input className="input h-9 w-20 text-center" inputMode="decimal" aria-label={`Quantidade de ${i.descricao}`}
                          value={qtdTexto[i.produto_id] ?? String(i.quantidade).replace(".", ",")} onChange={(e) => mudarQtd(i.produto_id, e.target.value)} />
                        <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200" aria-label="Mais" onClick={() => somar(i.produto_id, 1)}><Plus size={15} aria-hidden /></button>
                      </span>
                      <span className="text-right">
                        <span className="num block text-xs text-slate-500">{brl(i.preco)} cada</span>
                        <span className="num block font-bold text-fg">{brl(Math.round(i.quantidade * i.preco * 100) / 100)}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      {/* 3. Pagamento */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-bold text-fg">3. Pagamento e observação</h2>
        <Field label="Forma de pagamento">
          <select className="input" value={formaId} onChange={(e) => setFormaId(e.target.value)}>
            {!formas.length && <option value="">Nenhuma forma liberada</option>}
            {formas.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.parcelas > 1 ? ` (${f.parcelas}x)` : ""}</option>)}
          </select>
        </Field>
        <Field label={maximo > 0 ? `Desconto (%) · até ${pctBR(maximo)}` : "Desconto (%)"}>
          <input className="input" inputMode="decimal" value={descontoTxt} disabled={maximo <= 0} placeholder={maximo > 0 ? "0" : "sem desconto liberado"}
            onChange={(e) => setDescontoTxt(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6))} />
          {maximo <= 0 && <span className="mt-1 block text-xs text-slate-500">Para esta forma não há desconto liberado. Fale com a empresa.</span>}
        </Field>
        <Field label="Observação">
          <textarea className="input min-h-[80px]" maxLength={2000} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Prazo, entrega, contato…" />
        </Field>
      </Card>

      {/* Totais: fixo embaixo no celular */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-30 border-t border-slate-200 bg-surface/95 px-4 py-3 backdrop-blur md:static md:rounded-xl md:border md:shadow-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="min-w-0 text-sm">
            <span className="block text-slate-600">{itens.length} {itens.length === 1 ? "item" : "itens"}{conta.desconto > 0 ? ` · desconto ${brl(conta.desconto)}` : ""}</span>
            <span className="num block text-lg font-bold text-fg">{brl(conta.total)}</span>
            {erro && (itens.length > 0 || !!cliente) && <span className="block text-xs text-red-700" role="alert">{erro}</span>}
          </span>
          <Button type="button" className="shrink-0" disabled={!!erro || enviando} onClick={enviar}>{enviando ? "Enviando…" : "Enviar orçamento"}</Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">O preço é o da tabela liberada para você (ou para o cliente) e é conferido de novo ao enviar. A empresa aprova o orçamento pelo fluxo normal.</p>
      {!clientes.length && <p className="text-sm text-slate-500">Sua carteira ainda está vazia: <Link className="font-semibold text-brand" to="/portal/clientes">veja Meus clientes</Link> ou cadastre um cliente novo.</p>}

      {novoCliente && <ClienteNovoModal onClose={() => setNovoCliente(false)} onCriado={(id) => { setNovoCliente(false); setItens([]); setQtdTexto({}); setClienteId(id); }} />}
    </div>
  );
}
