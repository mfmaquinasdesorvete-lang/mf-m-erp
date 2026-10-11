// Vendas → PDV: venda de balcão rápida. Bipa (ou digita) os produtos, escolhe como o cliente paga (dá para dividir:
// parte em dinheiro, parte no Pix…) e finaliza: pedido entregue, estoque da loja baixado, conta recebida e
// comprovante de 80 mm. Tudo numa função do banco (pdv_finalizar): se faltar estoque ou os valores não fecharem,
// nada é gravado. Link InfinitePay e "a prazo" deixam a conta em aberto (o link dá baixa sozinho quando pago).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote, CalendarClock, CheckCircle2, CreditCard, FileText, Link2, Minus, Plus, Printer, QrCode, ShoppingCart, Split, Trash2, UserRound,
} from "lucide-react";
import { Button, Card, Field, Modal, PageHeader } from "@/components/ui";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { ClienteBusca } from "@/components/ClienteBusca";
import { VendedorSelect } from "@/components/VendedorSelect";
import { LinkPagamentoModal, type CobrancaLink } from "@/components/financeiro/LinkPagamento";
import { useInvalidate, useRows } from "@/lib/data";
import { callFunction, supabase } from "@/lib/supabase";
import { brl, digitos, hoje, somarDias } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { useUnidade } from "@/lib/unidade";
import { useFormasPagamento } from "@/lib/formasPagamento";
import { comUnidade, pdfCupom } from "@/lib/pdf";
import { imprimirPdf } from "@/lib/imprimir";
import type { Cliente, Produto } from "@/lib/types";

type Meio = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "link" | "prazo";
type Linha = { produto_id: string; descricao: string; sku: string | null; quantidade: number; valor_unitario: number; tipo: string; numero_serie: string };
type Pagamento = { meio: Meio; valor: number; vencimento?: string };
type Resultado = {
  pedido_id: string; numero: number; total: number; cliente_id: string;
  contas: { id: string; meio: Meio; valor: number; pago: boolean; vencimento: string }[];
  troco: number; recebido: number; cupom: Parameters<typeof pdfCupom>[0];
};

const MEIOS: { meio: Meio; rotulo: string; icone: typeof Banknote; ajuda?: string }[] = [
  { meio: "dinheiro", rotulo: "Dinheiro", icone: Banknote },
  { meio: "pix", rotulo: "Pix", icone: QrCode, ajuda: "Pix recebido na hora (chave da loja ou maquininha)" },
  { meio: "cartao_credito", rotulo: "Crédito", icone: CreditCard },
  { meio: "cartao_debito", rotulo: "Débito", icone: CreditCard },
  { meio: "link", rotulo: "Link InfinitePay", icone: Link2, ajuda: "Gera o link/QR (Pix ou cartão): a conta dá baixa sozinha quando o cliente pagar" },
  { meio: "prazo", rotulo: "A prazo", icone: CalendarClock, ajuda: "Fica em contas a receber com o vencimento escolhido (precisa do cliente)" },
];
const rotuloMeio = (m: Meio) => MEIOS.find((x) => x.meio === m)?.rotulo ?? m;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => { const v = Number(String(s).replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };
const moeda = (n: number) => (n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

export default function Pdv() {
  const { pode, user_id } = usePerfil();
  const { data: cfg } = useConfig();
  const { padrao, unidades, nome: nomeUnidade } = useUnidade();
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: estoques = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade");
  const { data: vendedores = [] } = useRows<{ id: string; nome: string; user_id: string | null; ativo: boolean }>("vendedores", { order: "nome", ascending: true });
  const { data: formas = [] } = useFormasPagamento();
  const { data: links = [] } = useRows<CobrancaLink>("cobrancas_link");
  const invalidate = useInvalidate();

  const [unidadeId, setUnidadeId] = useState<string | null>(padrao);
  const [itens, setItens] = useState<Linha[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [vendedorId, setVendedorId] = useState<string | null>(null);
  const [descontoTxt, setDescontoTxt] = useState("");
  const [descontoPct, setDescontoPct] = useState(false);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [dividir, setDividir] = useState(false);
  const [recebidoTxt, setRecebidoTxt] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<Resultado | null>(null);
  const [linkConta, setLinkConta] = useState<string | null>(null);
  const [nfe, setNfe] = useState<"" | "emitindo" | "ok" | "erro">("");
  const busca = useRef<HTMLDivElement>(null);
  const pagar = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!unidadeId && padrao) setUnidadeId(padrao); }, [padrao]); // eslint-disable-line react-hooks/exhaustive-deps
  // vendedor padrão: o do usuário que está no balcão
  useEffect(() => {
    if (!vendedorId) { const v = vendedores.find((x) => x.user_id === user_id && x.ativo); if (v) setVendedorId(v.id); }
  }, [vendedores, user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const vendaveis = useMemo(() => produtos.filter((p) => p.ativo !== false && p.vendavel !== false), [produtos]);
  const saldo = (id: string) => {
    const e = estoques.find((x) => x.produto_id === id && x.unidade_id === unidadeId);
    return e ? Number(e.quantidade) : Number(produtos.find((p) => p.id === id)?.estoque_atual ?? 0);
  };
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const qtdItens = itens.reduce((t, i) => t + i.quantidade, 0);
  const subtotal = r2(itens.reduce((s, i) => s + r2(i.quantidade * i.valor_unitario), 0));
  const descontoValor = Math.min(subtotal, r2(descontoPct ? (subtotal * num(descontoTxt)) / 100 : num(descontoTxt)));
  const total = r2(subtotal - descontoValor);
  const somaPag = r2(pagamentos.reduce((s, p) => s + p.valor, 0));
  const falta = r2(total - somaPag);
  const pagDinheiro = r2(pagamentos.filter((p) => p.meio === "dinheiro").reduce((s, p) => s + p.valor, 0));
  const recebido = num(recebidoTxt);
  const troco = pagDinheiro > 0 && recebido > pagDinheiro ? r2(recebido - pagDinheiro) : 0;
  const temMaquina = itens.some((i) => i.tipo === "maquina");
  const pronto = itens.length > 0 && total > 0 && pagamentos.length > 0 && Math.abs(falta) < 0.01
    && !(pagamentos.some((p) => p.meio === "prazo") && !clienteId)
    && !(pagDinheiro > 0 && recebidoTxt && recebido < pagDinheiro);

  // um meio só: acompanha o total
  useEffect(() => {
    if (!dividir && pagamentos.length === 1 && pagamentos[0].valor !== total) setPagamentos([{ ...pagamentos[0], valor: total }]);
  }, [total, dividir]); // eslint-disable-line react-hooks/exhaustive-deps

  function adicionar(p: Produto) {
    setItens((lista) => {
      const i = lista.findIndex((x) => x.produto_id === p.id && !x.numero_serie);
      if (i >= 0 && p.tipo !== "maquina") return lista.map((x, k) => (k === i ? { ...x, quantidade: x.quantidade + 1 } : x));
      return [...lista, { produto_id: p.id, descricao: p.descricao, sku: p.sku, quantidade: 1, valor_unitario: Number(p.preco_venda) || 0, tipo: p.tipo, numero_serie: "" }];
    });
  }
  const mudar = (k: number, patch: Partial<Linha>) => setItens((l) => l.map((x, i) => (i === k ? { ...x, ...patch } : x)));
  const tirar = (k: number) => setItens((l) => l.filter((_, i) => i !== k));

  function escolherMeio(m: Meio) {
    if (!dividir) { setPagamentos([{ meio: m, valor: total, ...(m === "prazo" ? { vencimento: somarDias(30) } : {}) }]); return; }
    setPagamentos((l) => [...l, { meio: m, valor: Math.max(0, r2(total - l.reduce((s, p) => s + p.valor, 0))), ...(m === "prazo" ? { vencimento: somarDias(30) } : {}) }]);
  }
  const formaDe = (m: Meio) => {
    const ok = formas.filter((f) => f.ativo && f.uso !== "pagar");
    if (m === "cartao_credito") return ok.find((f) => f.meio === "cartao" && /cr[eé]dito/i.test(f.nome) && f.parcelas <= 1) ?? ok.find((f) => f.meio === "cartao");
    if (m === "cartao_debito") return ok.find((f) => f.meio === "cartao" && /d[eé]bito/i.test(f.nome));
    if (m === "dinheiro" || m === "pix") return ok.find((f) => f.meio === m);
    return undefined;
  };

  function novaVenda() {
    setItens([]); setClienteId(null); setDescontoTxt(""); setDescontoPct(false); setPagamentos([]); setDividir(false);
    setRecebidoTxt(""); setObs(""); setFeito(null); setNfe("");
    setTimeout(() => busca.current?.querySelector("input")?.focus(), 50);
  }

  async function finalizar() {
    if (!pronto || enviando) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("pdv_finalizar", {
        p: {
          cliente_id: clienteId, unidade_id: unidadeId, vendedor_id: vendedorId, desconto: descontoValor, observacoes: obs || null,
          itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario, numero_serie: i.numero_serie || null })),
          pagamentos: pagamentos.map((p) => ({ meio: p.meio, valor: r2(p.valor), vencimento: p.vencimento ?? null, forma_pagamento_id: formaDe(p.meio)?.id ?? null })),
        },
      });
      if (error) throw error;
      const r = data as Omit<Resultado, "troco" | "recebido" | "cupom">;
      const vend = vendedores.find((v) => v.id === vendedorId)?.nome ?? null;
      setFeito({
        ...r, troco, recebido,
        cupom: {
          numero: r.numero, data: new Date().toISOString(), vendedor: vend, unidade: unidades.length > 1 ? nomeUnidade(unidadeId) : null,
          cliente: cliente ? { nome: cliente.nome, doc: cliente.cpf_cnpj } : null,
          itens: itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario })),
          desconto: descontoValor, total: r.total,
          pagamentos: pagamentos.map((p) => ({ rotulo: rotuloMeio(p.meio), valor: p.valor, pendente: p.meio === "link" || p.meio === "prazo" })),
          recebido_dinheiro: troco ? recebido : null, troco: troco || null, observacoes: obs || null,
        },
      });
      invalidate("pedidos", "produtos", "estoque_unidade", "contas_receber", "clientes", "configuracoes");
      notify(`Venda #${r.numero} concluída`);
    } catch (e) {
      notifyError(e);
    } finally {
      setEnviando(false);
    }
  }

  // F2 finaliza, de qualquer lugar da tela
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "F2" && !feito) { e.preventDefault(); finalizar(); } };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  async function imprimir() {
    if (!feito || !cfg) return;
    try {
      const u = unidades.find((x) => x.id === unidadeId);
      imprimirPdf(await pdfCupom(feito.cupom, comUnidade(cfg, u)));
    } catch (e) { notifyError(e); }
  }
  async function emitirNfe() {
    if (!feito) return;
    setNfe("emitindo");
    try {
      await callFunction("nfe-emitir", { pedido_id: feito.pedido_id });
      setNfe("ok"); notify("NF-e enviada: acompanhe em Notas fiscais");
      invalidate("notas_fiscais", "pedidos");
    } catch (e) { setNfe("erro"); notifyError(e); }
  }

  const contaLink = feito?.contas.find((c) => c.id === linkConta);
  const nfeDados = cliente && digitos(cliente.cpf_cnpj).length >= 11 && cliente.logradouro && cliente.municipio && cliente.cep;

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader title="PDV · venda de balcão" subtitle="Bipe ou digite o produto, escolha como o cliente paga e finalize (F2)." />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* itens */}
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div ref={busca} className="min-w-0 flex-1">
              <ProdutoBusca produtos={vendaveis} onEscolher={adicionar} placeholder="Produto: nome, código ou código de barras (leitor)"
                detalhe={(p) => <span className="num">{brl(p.preco_venda)} · estoque {saldo(p.id).toLocaleString("pt-BR")} {p.unidade}</span>} />
            </div>
            {unidades.length > 1 && (
              <select className="input w-auto" value={unidadeId ?? ""} onChange={(e) => setUnidadeId(e.target.value)} aria-label="Loja (estoque e CNPJ)">
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            )}
          </div>

          {!itens.length ? (
            <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-slate-500">
              <ShoppingCart size={28} aria-hidden />
              <p className="text-sm">Bipe o código de barras ou digite o nome do produto.<br />Enter adiciona; bipar de novo soma 1 na quantidade.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Itens da venda">
              {itens.map((i, k) => {
                const tem = saldo(i.produto_id);
                return (
                  <li key={k} className="px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 font-semibold">{i.descricao}</div>
                        <div className="text-xs text-slate-500">
                          {i.sku && <span className="mr-2">{i.sku}</span>}
                          <span className={tem < i.quantidade ? "font-semibold text-amber-700" : ""}>estoque {tem.toLocaleString("pt-BR")}</span>
                        </div>
                      </div>
                      <div className="num shrink-0 text-right text-base font-bold">{brl(r2(i.quantidade * i.valor_unitario))}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1" role="group" aria-label={`Quantidade de ${i.descricao}`}>
                        <Button type="button" variant="secondary" className="!min-h-0 !px-2 !py-1.5" aria-label="Menos um" onClick={() => (i.quantidade > 1 ? mudar(k, { quantidade: i.quantidade - 1 }) : tirar(k))}><Minus size={14} aria-hidden /></Button>
                        <input className="input w-14 py-1.5 text-center" inputMode="decimal" value={String(i.quantidade).replace(".", ",")} aria-label="Quantidade"
                          onChange={(e) => { const q = num(e.target.value); if (q > 0) mudar(k, { quantidade: q }); }} />
                        <Button type="button" variant="secondary" className="!min-h-0 !px-2 !py-1.5" aria-label="Mais um" onClick={() => mudar(k, { quantidade: i.quantidade + 1 })}><Plus size={14} aria-hidden /></Button>
                      </div>
                      <span className="text-sm text-slate-500" aria-hidden>×</span>
                      <input className="input w-28 py-1.5 text-right" inputMode="decimal" disabled={!pode("editar_pedidos")} defaultValue={moeda(i.valor_unitario)} key={`${i.produto_id}-${i.valor_unitario}`}
                        onBlur={(e) => mudar(k, { valor_unitario: Math.max(0, num(e.target.value)) })} aria-label={`Preço unitário de ${i.descricao}`} />
                      {i.tipo === "maquina" && (
                        <input className="input min-w-0 flex-1 py-1.5 text-sm sm:max-w-[14rem]" placeholder="Nº de série (garantia)" value={i.numero_serie}
                          onChange={(e) => mudar(k, { numero_serie: e.target.value })} aria-label={`Número de série de ${i.descricao}`} />
                      )}
                      <Button type="button" variant="ghost" className="!min-h-0 ml-auto !px-2" aria-label={`Tirar ${i.descricao}`} onClick={() => tirar(k)}><Trash2 size={16} aria-hidden /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {temMaquina && !clienteId && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">Máquina na venda: identifique o cliente para registrar a garantia e as preventivas no nome dele.</p>
          )}
        </Card>

        {/* cliente, total e pagamento */}
        <div ref={pagar} className="space-y-4 lg:sticky lg:top-4">
          <Card className="space-y-3 p-4">
            <Field label="Cliente">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <ClienteBusca clientes={clientes} value={clienteId} onChange={(id) => setClienteId(id || null)} placeholder="Consumidor final (sem identificar)" />
                </div>
                {clienteId && <Button type="button" variant="ghost" aria-label="Voltar para consumidor final" onClick={() => setClienteId(null)}><UserRound size={16} aria-hidden /></Button>}
              </div>
            </Field>
            <Field label="Vendedor"><VendedorSelect value={vendedorId} onChange={(id) => setVendedorId(id)} /></Field>
          </Card>

          <Card className="p-4">
            <dl className="num space-y-1.5 text-sm">
              <div className="flex justify-between"><dt>Subtotal ({qtdItens.toLocaleString("pt-BR")} {qtdItens === 1 ? "item" : "itens"})</dt><dd>{brl(subtotal)}</dd></div>
              <div className="flex items-center justify-between gap-2">
                <dt>Desconto</dt>
                <dd className="flex items-center gap-1">
                  <input className="input w-24 py-1 text-right" inputMode="decimal" value={descontoTxt} placeholder="0" aria-label="Desconto"
                    disabled={!pode("editar_pedidos")} onChange={(e) => setDescontoTxt(e.target.value)} />
                  <button type="button" className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold" aria-pressed={descontoPct}
                    onClick={() => setDescontoPct(!descontoPct)}>{descontoPct ? "%" : "R$"}</button>
                </dd>
              </div>
              {descontoValor > 0 && <div className="flex justify-between text-xs text-slate-500"><dt>desconto aplicado</dt><dd>- {brl(descontoValor)}</dd></div>}
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2"><dt className="text-base font-bold">Total</dt><dd className="text-2xl font-extrabold">{brl(total)}</dd></div>
            </dl>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Pagamento</h2>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-modulo-texto hover:underline" aria-pressed={dividir}
                onClick={() => { setDividir(!dividir); setPagamentos([]); }}><Split size={14} aria-hidden /> {dividir ? "Um meio só" : "Dividir pagamento"}</button>
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Forma de pagamento">
              {MEIOS.map(({ meio, rotulo, icone: I, ajuda }) => {
                const ativo = pagamentos.some((p) => p.meio === meio);
                const bloqueado = meio === "prazo" && !clienteId;
                return (
                  <button key={meio} type="button" title={bloqueado ? "Escolha o cliente para vender a prazo" : ajuda} disabled={bloqueado || !itens.length}
                    aria-pressed={!dividir ? ativo : undefined}
                    onClick={() => escolherMeio(meio)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      ativo && !dividir ? "border-modulo bg-modulo/15 text-modulo-texto ring-2 ring-modulo" : "border-slate-200 hover:border-modulo"}`}>
                    <I size={18} aria-hidden /> {rotulo}
                  </button>
                );
              })}
            </div>

            {pagamentos.length > 0 && (
              <ul className="space-y-2">
                {pagamentos.map((p, k) => (
                  <li key={k} className="rounded-lg bg-slate-50 p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 font-semibold">{rotuloMeio(p.meio)}</span>
                      {dividir ? (
                        <>
                          <input className="input w-28 py-1 text-right" inputMode="decimal" defaultValue={moeda(p.valor)} key={`${k}-${p.valor}`} aria-label={`Valor em ${rotuloMeio(p.meio)}`}
                            onBlur={(e) => setPagamentos((l) => l.map((x, i) => (i === k ? { ...x, valor: Math.max(0, num(e.target.value)) } : x)))} />
                          <Button type="button" variant="ghost" className="!min-h-0 !px-1.5" aria-label={`Tirar ${rotuloMeio(p.meio)}`}
                            onClick={() => setPagamentos((l) => l.filter((_, i) => i !== k))}><Trash2 size={14} aria-hidden /></Button>
                        </>
                      ) : <span className="num font-bold">{brl(p.valor)}</span>}
                    </div>
                    {p.meio === "prazo" && (
                      <label className="mt-2 flex items-center justify-between gap-2 text-xs">Vencimento
                        <input type="date" className="input w-40 py-1" min={hoje()} value={p.vencimento ?? ""}
                          onChange={(e) => setPagamentos((l) => l.map((x, i) => (i === k ? { ...x, vencimento: e.target.value } : x)))} />
                      </label>
                    )}
                    {p.meio === "link" && <p className="mt-1 text-xs text-slate-500">Depois de finalizar, gere o link ou o QR para o cliente pagar.</p>}
                  </li>
                ))}
              </ul>
            )}
            {dividir && pagamentos.length > 0 && Math.abs(falta) >= 0.01 && (
              <p className={`text-sm font-semibold ${falta > 0 ? "text-amber-700" : "text-red-700"}`} role="status">
                {falta > 0 ? `Falta distribuir ${brl(falta)}: escolha outra forma` : `Passou ${brl(-falta)} do total`}
              </p>
            )}
            {pagDinheiro > 0 && (
              <div className="rounded-lg border border-slate-200 p-2.5 text-sm">
                <label className="flex items-center justify-between gap-2">Recebido em dinheiro
                  <input className="input w-28 py-1 text-right" inputMode="decimal" value={recebidoTxt} placeholder={moeda(pagDinheiro)} onChange={(e) => setRecebidoTxt(e.target.value)} />
                </label>
                {recebidoTxt && recebido < pagDinheiro && <p className="mt-1 text-xs font-semibold text-red-700">Menor que o valor em dinheiro ({brl(pagDinheiro)}).</p>}
                {troco > 0 && <p className="mt-1.5 flex justify-between text-base font-bold" role="status"><span>Troco</span><span className="num">{brl(troco)}</span></p>}
              </div>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-600">Observação no pedido</summary>
              <textarea className="input mt-2" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} aria-label="Observação" />
            </details>
            <Button type="button" className="w-full !py-3 text-base" disabled={!pronto || enviando} onClick={finalizar}>
              <CheckCircle2 size={18} aria-hidden /> {enviando ? "Finalizando…" : `Finalizar venda ${total > 0 ? brl(total) : ""}`}
              <kbd className="ml-1 hidden rounded bg-white/20 px-1.5 text-xs sm:inline">F2</kbd>
            </Button>
          </Card>
        </div>
      </div>

      <VendasDeHoje />

      {/* celular: total sempre à vista */}
      {itens.length > 0 && !feito && (
        <div className="fixed inset-x-0 bottom-16 z-20 flex items-center gap-3 border-t border-slate-200 bg-surface px-4 py-2.5 shadow-pop lg:hidden">
          <div className="flex-1"><div className="text-xs text-slate-500">{itens.length} {itens.length === 1 ? "item" : "itens"}</div><div className="num text-lg font-extrabold">{brl(total)}</div></div>
          <Button type="button" onClick={() => (pronto ? finalizar() : pagar.current?.scrollIntoView({ behavior: "smooth" }))} disabled={enviando}>
            {pronto ? "Finalizar" : "Cobrar"}
          </Button>
        </div>
      )}

      {feito && (
        <Modal open onClose={novaVenda} title={`Venda #${feito.numero} concluída`}>
          <div className="space-y-4">
            <div className="rounded-xl bg-emerald-50 p-4 text-center text-emerald-900">
              <CheckCircle2 className="mx-auto mb-1" size={28} aria-hidden />
              <div className="text-sm">Total</div>
              <div className="num text-3xl font-extrabold">{brl(feito.total)}</div>
              {feito.troco > 0 && <div className="mt-2 text-lg font-bold">Troco: {brl(feito.troco)}</div>}
            </div>
            <ul className="space-y-1 text-sm">
              {feito.contas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{rotuloMeio(c.meio)} · <b className="num">{brl(c.valor)}</b></span>
                  {c.pago ? <span className="text-emerald-700">recebido</span>
                    : c.meio === "link" ? <Button type="button" variant="secondary" onClick={() => setLinkConta(c.id)}><QrCode size={15} aria-hidden /> Gerar link / QR</Button>
                    : <span className="text-amber-700">a receber em {new Date(c.vencimento + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={imprimir}><Printer size={16} aria-hidden /> Comprovante (80 mm)</Button>
              {clienteId && pode("emitir_nfe") && (
                <Button type="button" variant="secondary" disabled={nfe === "emitindo" || nfe === "ok"} onClick={emitirNfe}
                  title={nfeDados ? "Emite a NF-e deste pedido" : "Complete CPF/CNPJ e endereço do cliente antes"}>
                  <FileText size={16} aria-hidden /> {nfe === "ok" ? "NF-e enviada" : nfe === "emitindo" ? "Emitindo…" : "Emitir NF-e"}
                </Button>
              )}
              <Button type="button" className="ml-auto" onClick={novaVenda}><Plus size={16} aria-hidden /> Nova venda</Button>
            </div>
            {cliente && !nfeDados && pode("emitir_nfe") && <p className="text-xs text-slate-500">Para a NF-e, o cadastro de {cliente.nome} precisa de CPF/CNPJ e endereço completo.</p>}
          </div>
        </Modal>
      )}
      {contaLink && feito && (
        <LinkPagamentoModal conta={{ id: contaLink.id, descricao: `Pedido #${feito.numero} - balcão`, valor: contaLink.valor, vencimento: contaLink.vencimento, status: "aberto",
          cliente: cliente ? { nome: cliente.nome, whatsapp: cliente.whatsapp } : null }}
          links={links.filter((l) => (l as CobrancaLink & { conta_receber_id?: string }).conta_receber_id === contaLink.id)}
          taxas={unidades.find((u) => u.id === unidadeId)?.infinitepay_taxas} onClose={() => setLinkConta(null)} />
      )}
    </div>
  );
}

/** Vendas de balcão de hoje: quantas, quanto e por forma de pagamento (fecha o caixa do dia). */
function VendasDeHoje() {
  const { data: pedidos = [] } = useRows<{ id: string; numero: number; origem: string; status: string; valor_total: number; created_at: string; cliente_id: string }>("pedidos", { order: "created_at", ascending: false });
  const { data: contas = [] } = useRows<{ pedido_id: string | null; forma_pagamento: string | null; valor: number; status: string; descricao: string }>("contas_receber");
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const dia = new Date().toLocaleDateString("sv-SE");
  const deHoje = pedidos.filter((p) => p.origem === "balcao" && p.status !== "cancelado" && new Date(p.created_at).toLocaleDateString("sv-SE") === dia);
  if (!deHoje.length) return null;
  const ids = new Set(deHoje.map((p) => p.id));
  const porForma = new Map<string, number>();
  for (const c of contas.filter((c) => c.pedido_id && ids.has(c.pedido_id) && c.status !== "cancelado")) {
    const f = c.status === "aberto" ? (/link/i.test(c.descricao) ? "Link (a pagar)" : "A prazo") : /cr[eé]dito/i.test(c.descricao) ? "Crédito" : /d[eé]bito/i.test(c.descricao) ? "Débito"
      : c.forma_pagamento === "dinheiro" ? "Dinheiro" : c.forma_pagamento === "pix" ? "Pix" : c.forma_pagamento === "cartao" ? "Cartão" : c.forma_pagamento ?? "Outro";
    porForma.set(f, r2((porForma.get(f) ?? 0) + Number(c.valor)));
  }
  const total = r2(deHoje.reduce((s, p) => s + Number(p.valor_total), 0));
  return (
    <Card className="mt-4 p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">Balcão hoje</h2>
        <span className="text-sm text-slate-600">{deHoje.length} {deHoje.length === 1 ? "venda" : "vendas"} · <b className="num">{brl(total)}</b></span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[...porForma].map(([f, v]) => <span key={f} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{f}: <span className="num">{brl(v)}</span></span>)}
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {deHoje.slice(0, 12).map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 truncate">#{p.numero} · {new Date(p.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {clientes.find((c) => c.id === p.cliente_id)?.nome ?? "—"}</span>
            <span className="num shrink-0 font-semibold">{brl(p.valor_total)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

