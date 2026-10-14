// PDV (erp.myfrost.ai/pdv): venda de balcão rápida, em tela própria (sem o menu do ERP) e só com as peças de
// reposição (o catálogo). Bipa (ou digita) os produtos, escolhe como o cliente paga (dá para dividir:
// parte em dinheiro, parte no Pix…) e finaliza: pedido entregue, estoque da loja baixado, conta recebida e
// comprovante de 80 mm. Tudo numa função do banco (pdv_finalizar): se faltar estoque ou os valores não fecharem,
// nada é gravado. Link InfinitePay e "a prazo" deixam a conta em aberto (o link dá baixa sozinho quando pago).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Banknote, CalendarClock, Camera, CheckCircle2, CreditCard, FileText, ImageOff, Link2, Maximize2, Minus, Plus, Printer, QrCode, ScanBarcode, ShieldCheck,
  ShoppingCart, Split, Trash2, UserPlus, UserRound,
} from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { ModuloContext } from "@/lib/modulo";
import logo from "@/assets/logo.webp";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { ClienteBusca } from "@/components/ClienteBusca";
import { ClienteRapido } from "@/components/clientes/ClienteRapido";
import { ajusteTexto, precoNaTabela, type PrecoFixo, type TabelaPreco } from "@/lib/tabelasPreco";
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
import { enviarFotoProduto, urlFotoProduto } from "@/lib/catalogo";
import { formaPdv, maximoDesconto, pctTexto, rotuloRegra, type RegraDesconto } from "@/lib/descontos";
import { AprovarDesconto, type DescontoAprovado } from "@/components/vendas/AprovarDesconto";

type Meio = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "link" | "prazo";
type Linha = {
  chave: string; produto_id: string; descricao: string; sku: string | null; quantidade: number; valor_unitario: number; tipo: string;
  numero_serie: string; foto: string | null;
};
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
// "1.234,56", "38,5", "38.50" (ponto como decimal) e "1.500" (ponto de milhar)
const num = (s: string) => {
  const t = String(s).trim();
  const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, ""));
  return Number.isFinite(v) ? v : 0;
};
let seq = 0;
const moeda = (n: number) => (n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

export default function Pdv() {
  const { pode, user_id, nome: nomeUsuario } = usePerfil();
  const { data: cfg } = useConfig();
  const { padrao, unidades, nome: nomeUnidade } = useUnidade();
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: cadastrados = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  // cliente cadastrado na hora (balcão): entra na lista já, sem esperar a lista recarregar
  const [novos, setNovos] = useState<Cliente[]>([]);
  const clientes = useMemo(() => [...novos.filter((n) => !cadastrados.some((c) => c.id === n.id)), ...cadastrados], [novos, cadastrados]);
  const [cadastrar, setCadastrar] = useState<string | null>(null);
  const { data: estoques = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade");
  const { data: vendedores = [] } = useRows<{ id: string; nome: string; user_id: string | null; ativo: boolean }>("vendedores", { order: "nome", ascending: true });
  const { data: formas = [] } = useFormasPagamento();
  const { data: links = [] } = useRows<CobrancaLink>("cobrancas_link");
  const { data: tabelas = [] } = useRows<TabelaPreco>("tabelas_preco", { order: "nome", ascending: true });
  const { data: precosFixos = [] } = useRows<PrecoFixo>("tabela_preco_itens");
  const invalidate = useInvalidate();

  const [unidadeId, setUnidadeId] = useState<string | null>(padrao);
  const [itens, setItens] = useState<Linha[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [tabelaId, setTabelaId] = useState<string | null>(null);
  const tabela = tabelas.find((t) => t.id === tabelaId) ?? null;
  const precoPdv = (p: Produto, t = tabela) => precoNaTabela(t, p, precosFixos).preco;
  // trocar a tabela (Revenda, Marketplace…) reprecifica o carrinho
  function usarTabela(id: string | null) {
    const t = tabelas.find((x) => x.id === id) ?? null;
    setTabelaId(id);
    setItens((l) => l.map((i) => { const p = produtos.find((x) => x.id === i.produto_id); return p ? { ...i, valor_unitario: precoPdv(p, t) } : i; }));
  }
  function escolherCliente(id: string | null, c?: Cliente) {
    setClienteId(id);
    const t = ((c ?? clientes.find((x) => x.id === id)) as any)?.tabela_preco_id as string | null | undefined;
    if (t && t !== tabelaId && tabelas.some((x) => x.id === t && x.ativo)) usarTabela(t);
  }
  const [vendedorId, setVendedorId] = useState<string | null>(null);
  const [descontoTxt, setDescontoTxt] = useState("");
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [dividir, setDividir] = useState(false);
  const [recebidoTxt, setRecebidoTxt] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<Resultado | null>(null);
  const [linkConta, setLinkConta] = useState<string | null>(null);
  const [nfe, setNfe] = useState<"" | "emitindo" | "ok" | "erro">("");
  // preço sendo digitado (por linha): o total acompanha a cada tecla; ao sair do campo volta formatado
  const [precoTxt, setPrecoTxt] = useState<Record<string, string>>({});
  const [enviandoFoto, setEnviandoFoto] = useState<string | null>(null);
  // desconto acima do máximo da regra (Configurações → Descontos): só com a senha de um administrador
  const { data: regrasDesc = [] } = useRows<RegraDesconto>("regras_desconto", { order: "canal", ascending: true });
  const [aprovado, setAprovado] = useState<DescontoAprovado | null>(null);
  const [pedirAprovacao, setPedirAprovacao] = useState(false);
  const busca = useRef<HTMLDivElement>(null);
  const pagar = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!unidadeId && padrao) setUnidadeId(padrao); }, [padrao]); // eslint-disable-line react-hooks/exhaustive-deps
  // vendedor padrão: o do usuário que está no balcão
  useEffect(() => {
    if (!vendedorId) { const v = vendedores.find((x) => x.user_id === user_id && x.ativo); if (v) setVendedorId(v.id); }
  }, [vendedores, user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // só o catálogo: peças de reposição e acessórios que vendem (máquinas e componentes de produção ficam de fora)
  const vendaveis = useMemo(() => produtos.filter((p) => p.ativo !== false && p.vendavel !== false && (p.tipo === "peca" || p.tipo === "acessorio")), [produtos]);

  // tela própria: cor da área de vendas e título da aba
  useEffect(() => {
    const raiz = document.documentElement, antes = raiz.dataset.modulo, titulo = document.title;
    raiz.dataset.modulo = "vendas"; document.title = "PDV · ERP Line";
    return () => { raiz.dataset.modulo = antes ?? ""; document.title = titulo; };
  }, []);
  const saldo = (id: string) => {
    const e = estoques.find((x) => x.produto_id === id && x.unidade_id === unidadeId);
    return e ? Number(e.quantidade) : Number(produtos.find((p) => p.id === id)?.estoque_atual ?? 0);
  };
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const qtdItens = itens.reduce((t, i) => t + i.quantidade, 0);
  const subtotal = r2(itens.reduce((s, i) => s + r2(i.quantidade * i.valor_unitario), 0));
  // desconto em % sobre o subtotal
  const descontoValor = r2((subtotal * Math.min(100, Math.max(0, Number(descontoTxt.replace(",", ".")) || 0))) / 100);
  const total = r2(subtotal - descontoValor);
  const somaPag = r2(pagamentos.reduce((s, p) => s + p.valor, 0));
  const falta = r2(total - somaPag);
  const pagDinheiro = r2(pagamentos.filter((p) => p.meio === "dinheiro").reduce((s, p) => s + p.valor, 0));
  const recebido = num(recebidoTxt);
  const troco = pagDinheiro > 0 && recebido > pagDinheiro ? r2(recebido - pagDinheiro) : 0;
  const temMaquina = itens.some((i) => i.tipo === "maquina");
  const semPreco = itens.filter((i) => !(i.valor_unitario > 0));
  const formaVenda = formaPdv(pagamentos);
  const pctDesconto = subtotal > 0 ? r2((descontoValor / subtotal) * 100) : 0;
  const limite = maximoDesconto(regrasDesc, "balcao", formaVenda);
  const acimaDoMaximo = !!limite && pctDesconto > limite.max + 0.005;
  const precisaAprovar = acimaDoMaximo && !(aprovado && aprovado.percentual + 0.005 >= pctDesconto);
  const pronto = itens.length > 0 && total > 0 && pagamentos.length > 0 && Math.abs(falta) < 0.01 && !semPreco.length && !precisaAprovar
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
      return [...lista, { chave: `l${++seq}`, produto_id: p.id, descricao: p.descricao, sku: p.sku, quantidade: 1, valor_unitario: precoPdv(p) || 0, tipo: p.tipo,
        numero_serie: "", foto: (p as Produto & { foto_caminho?: string | null }).foto_caminho ?? null }];
    });
  }
  const mudar = (k: number, patch: Partial<Linha>) => setItens((l) => l.map((x, i) => (i === k ? { ...x, ...patch } : x)));
  const tirar = (k: number) => setItens((l) => l.filter((_, i) => i !== k));

  /** Peça sem foto: tira (celular) ou escolhe a foto e ela fica no cadastro do produto. */
  async function porFoto(produtoId: string, arquivo?: File) {
    if (!arquivo) return;
    setEnviandoFoto(produtoId);
    try {
      const caminho = await enviarFotoProduto(arquivo);
      const { error } = await supabase.from("produtos").update({ foto_caminho: caminho }).eq("id", produtoId);
      if (error) throw error;
      setItens((l) => l.map((x) => (x.produto_id === produtoId ? { ...x, foto: caminho } : x)));
      invalidate("produtos");
      notify("Foto salva no cadastro da peça");
    } catch (e) { notifyError(e); } finally { setEnviandoFoto(null); }
  }

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
    setItens([]); setClienteId(null); setTabelaId(null); setDescontoTxt(""); setPagamentos([]); setDividir(false); setAprovado(null); setPrecoTxt({});
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
      invalidate("pedidos", "produtos", "estoque_unidade", "contas_receber", "clientes", "configuracoes", "aprovacoes_desconto");
      setAprovado(null);
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
    <ModuloContext.Provider value={{ id: "vendas", titulo: "PDV", icone: ScanBarcode }}>
    <div className="min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-ink px-3 py-2 text-white shadow-pop sm:px-5">
        <img src={logo} alt="" className="h-9 w-9 rounded-xl ring-1 ring-white/10" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold leading-tight">PDV · venda de balcão</div>
          <div className="truncate text-xs text-nav-texto">{nomeUsuario}{unidades.length > 1 && unidadeId ? ` · ${nomeUnidade(unidadeId)}` : ""}</div>
        </div>
        {unidades.length > 1 && (
          <select className="input hidden w-auto border-white/20 bg-ink-soft py-1.5 text-sm text-white sm:block" value={unidadeId ?? ""} onChange={(e) => setUnidadeId(e.target.value)} aria-label="Loja (estoque e CNPJ)">
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <button type="button" className="hidden rounded-lg p-2 text-nav-texto hover:bg-white/10 hover:text-white sm:block" title="Tela cheia" aria-label="Tela cheia"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {})}>
          <Maximize2 size={18} aria-hidden />
        </button>
        <Link to="/" className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-semibold text-nav-texto hover:bg-white/10 hover:text-white">
          <ArrowLeft size={16} aria-hidden /> <span className="hidden sm:inline">Voltar ao ERP</span><span className="sm:hidden">ERP</span>
        </Link>
      </header>
      <main className="fundo-modulo mx-auto max-w-[1500px] px-3 pb-28 pt-4 sm:px-5 lg:pb-6">

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* itens */}
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div ref={busca} className="min-w-0 flex-1">
              <ProdutoBusca produtos={vendaveis} onEscolher={adicionar} placeholder="Peça: nome, código ou código de barras (leitor)"
                foto={(p) => urlFotoProduto((p as Produto & { foto_caminho?: string | null }).foto_caminho) || null}
                detalhe={(p) => <span className="num">{brl(precoPdv(p))} · estoque {saldo(p.id).toLocaleString("pt-BR")} {p.unidade}</span>} />
            </div>
            {unidades.length > 1 && (
              <select className="input w-auto sm:hidden" value={unidadeId ?? ""} onChange={(e) => setUnidadeId(e.target.value)} aria-label="Loja (estoque e CNPJ)">
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
                  <li key={i.chave} className="px-3 py-2.5">
                    <div className="flex items-start gap-3">
                      {i.foto ? (
                        <img src={urlFotoProduto(i.foto)} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-white object-contain" />
                      ) : pode("editar_produtos") ? (
                        <label className={`flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] font-semibold text-slate-500 hover:border-brand hover:text-brand ${enviandoFoto === i.produto_id ? "pointer-events-none opacity-60" : ""}`}
                          title="Pôr foto da peça (fica no cadastro do produto)">
                          <Camera size={18} aria-hidden /> {enviandoFoto === i.produto_id ? "Enviando" : "Pôr foto"}
                          <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={`Foto de ${i.descricao}`}
                            onChange={(e) => { porFoto(i.produto_id, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-300" aria-hidden><ImageOff size={18} /></span>
                      )}
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
                      <span className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden>R$</span>
                        <input className={`input w-32 py-1.5 pl-9 text-right ${i.valor_unitario > 0 ? "" : "border-amber-500 ring-1 ring-amber-400"}`} inputMode="decimal"
                          disabled={!pode("editar_pedidos")} placeholder="0,00" value={precoTxt[i.chave] ?? moeda(i.valor_unitario)} aria-label={`Preço unitário de ${i.descricao}`}
                          onChange={(e) => {
                            const t = e.target.value.replace(/[^\d,.]/g, "").slice(0, 12);
                            setPrecoTxt((m) => ({ ...m, [i.chave]: t }));
                            mudar(k, { valor_unitario: Math.max(0, r2(num(t))) });
                          }}
                          onBlur={() => setPrecoTxt((m) => { const n = { ...m }; delete n[i.chave]; return n; })}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }} />
                      </span>
                      {i.tipo === "maquina" && (
                        <input className="input min-w-0 flex-1 py-1.5 text-sm sm:max-w-[14rem]" placeholder="Nº de série (garantia)" value={i.numero_serie}
                          onChange={(e) => mudar(k, { numero_serie: e.target.value })} aria-label={`Número de série de ${i.descricao}`} />
                      )}
                      <Button type="button" variant="ghost" className="!min-h-0 ml-auto !px-2" aria-label={`Tirar ${i.descricao}`} onClick={() => tirar(k)}><Trash2 size={16} aria-hidden /></Button>
                    </div>
                    {!(i.valor_unitario > 0) && <p className="mt-1.5 text-xs font-semibold text-amber-700">Sem preço no cadastro: digite o valor de venda.</p>}
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
                  <ClienteBusca clientes={clientes} value={clienteId} onChange={(id) => escolherCliente(id || null)} placeholder="Consumidor final (sem identificar)"
                    onNovo={(t) => setCadastrar(t)} />
                </div>
                {clienteId
                  ? <Button type="button" variant="ghost" title="Voltar para consumidor final" aria-label="Voltar para consumidor final" onClick={(e) => { e.preventDefault(); setClienteId(null); }}><UserRound size={16} aria-hidden /></Button>
                  : <Button type="button" variant="secondary" title="Cadastrar cliente na hora" aria-label="Cadastrar cliente na hora" onClick={(e) => { e.preventDefault(); setCadastrar(""); }}><UserPlus size={16} aria-hidden /><span className="hidden sm:inline">Novo</span></Button>}
              </div>
            </Field>
            <Field label="Vendedor"><VendedorSelect value={vendedorId} onChange={(id) => setVendedorId(id)} /></Field>
            {tabelas.some((t) => t.ativo) && (
              <Field label="Tabela de preço">
                <select className="input" value={tabelaId ?? ""} onChange={(e) => usarTabela(e.target.value || null)}>
                  <option value="">Preço de venda</option>
                  {tabelas.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome} ({ajusteTexto(t.ajuste_percentual)})</option>)}
                </select>
              </Field>
            )}
          </Card>

          <Card className="p-4">
            <dl className="num space-y-1.5 text-sm">
              <div className="flex justify-between"><dt>Subtotal ({qtdItens.toLocaleString("pt-BR")} {qtdItens === 1 ? "item" : "itens"})</dt><dd>{brl(subtotal)}</dd></div>
              <div className="flex items-center justify-between gap-2">
                <dt>Desconto</dt>
                <dd className="relative">
                  <input className="input w-24 py-1 pr-7 text-right" inputMode="decimal" value={descontoTxt} placeholder="0" aria-label="Desconto em %"
                    disabled={!pode("editar_pedidos")} onChange={(e) => setDescontoTxt(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6))} />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden>%</span>
                </dd>
              </div>
              {descontoValor > 0 && <div className="flex justify-between text-xs text-slate-500"><dt>desconto aplicado</dt><dd>- {brl(descontoValor)}</dd></div>}
              {acimaDoMaximo && limite && (precisaAprovar ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                  <p>Desconto de <b>{pctTexto(pctDesconto)}</b> passa do máximo de <b>{pctTexto(limite.max)}</b> ({rotuloRegra("balcao", formaVenda)}).</p>
                  <Button type="button" variant="secondary" className="mt-2 w-full !min-h-0 !py-1.5" onClick={() => setPedirAprovacao(true)}>
                    <ShieldCheck size={15} aria-hidden /> Aprovar com a senha do administrador
                  </Button>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck size={14} aria-hidden /> Desconto aprovado por {aprovado?.aprovado_por} (até {pctTexto(aprovado?.percentual ?? 0)})</p>
              ))}
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
            {itens.length > 0 && (semPreco.length > 0 || precisaAprovar) && (
              <p className="text-xs font-semibold text-amber-700" role="status">
                {semPreco.length > 0 ? `Falta o preço de ${semPreco.length === 1 ? "1 item" : `${semPreco.length} itens`}.` : "O desconto precisa da aprovação do administrador."}
              </p>
            )}
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
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-slate-200 bg-surface px-4 py-2.5 shadow-pop lg:hidden">
          <div className="flex-1"><div className="text-xs text-slate-500">{itens.length} {itens.length === 1 ? "item" : "itens"}</div><div className="num text-lg font-extrabold">{brl(total)}</div></div>
          <Button type="button" onClick={() => (pronto ? finalizar() : pagar.current?.scrollIntoView({ behavior: "smooth" }))} disabled={enviando}>
            {pronto ? "Finalizar" : "Cobrar"}
          </Button>
        </div>
      )}

      {pedirAprovacao && limite && (
        <AprovarDesconto percentual={pctDesconto} maximo={limite.max} contexto="pdv" canal="balcao" forma={formaVenda}
          onClose={() => setPedirAprovacao(false)}
          onAprovado={(r) => { setAprovado(r); setPedirAprovacao(false); notify(`Desconto aprovado por ${r.aprovado_por}`); }} />
      )}
      {cadastrar !== null && (
        <ClienteRapido inicial={cadastrar} clientes={clientes} onClose={() => setCadastrar(null)}
          onCriado={(c) => { setNovos((l) => [c, ...l.filter((x) => x.id !== c.id)]); escolherCliente(c.id, c); setCadastrar(null); invalidate("clientes"); }} />
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
      </main>
    </div>
    </ModuloContext.Provider>
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

