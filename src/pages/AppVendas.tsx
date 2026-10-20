// App de vendas no celular (erp.myfrost.ai/app/vendas): tela própria, sem o menu do ERP, para quem vende na rua ou
// pelo WhatsApp. Quanto vendeu no mês, orçamentos esperando resposta, achar o cliente e chamar, preço e estoque de cada
// unidade e abrir um pedido (o pedido abre na tela de Vendas do ERP, que já funciona no celular). Regras em lib/appVendas.
import { SeloCidade } from "@/components/SeloCidade";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight, ArrowUpRight, ChevronRight, FileText, Home, LayoutGrid, MessageCircle, MoreHorizontal, Package, Phone, Plus, Search, ShoppingBag, Users,
} from "lucide-react";
import { InstalarApp } from "@/components/InstalarApp";
import { useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { urlFotoProduto } from "@/lib/catalogo";
import { CHAVE_APP_VENDAS, combina, numeroWhatsApp, resumoVendas, ROTULO_STATUS_APP, type PedidoApp } from "@/lib/appVendas";
import type { Cliente, Produto, Vendedor } from "@/lib/types";

type Aba = "inicio" | "clientes" | "estoque" | "pedidos" | "mais";
type Pedido = PedidoApp & { cliente_id: string; cliente?: { nome: string; nome_fantasia?: string | null; municipio?: string | null; uf?: string | null } | null };

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const nomeCliente = (c?: { nome: string; nome_fantasia?: string | null } | null) => c ? c.nome_fantasia?.trim() || c.nome : "Cliente";
const COR_STATUS: Record<string, string> = {
  orcamento: "bg-[#fbbf24]/15 text-[#fcd34d]", aprovado: "bg-[#22d3ee]/15 text-[#67e8f9]", faturado: "bg-[#a855f7]/20 text-[#d8b4fe]",
  entregue: "bg-[#10b981]/15 text-[#6ee7b7]", cancelado: "bg-white/10 text-[#8b93a7]",
};

export default function AppVendas() {
  const eu = usePerfil();
  const navigate = useNavigate();
  const { unidades, codigo, filtrar } = useUnidade();
  const [aba, setAba] = useState<Aba>("inicio");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("orcamento");
  const [sempre, setSempre] = useState(ler(CHAVE_APP_VENDAS) !== "0");
  const dia = hoje();

  const { data: pedidosTodos = [] } = useRows<Pedido>("pedidos", {
    select: "id, numero, status, valor_total, created_at, aprovado_em, cliente_id, vendedor_id, unidade_id, cliente:clientes(nome, nome_fantasia, municipio, uf)", key: ["app-vendas"] });
  const { data: clientes = [] } = useRows<Cliente>("clientes", { select: "id, nome, nome_fantasia, cpf_cnpj, whatsapp, telefone, municipio, uf", order: "nome", ascending: true, key: ["app-vendas"] });
  const { data: produtos = [] } = useRows<Produto>("produtos", { select: "id, descricao, sku, preco_venda, estoque_atual, ativo, vendavel, kit, foto_caminho, codigo_barras, unificado_em", order: "descricao", ascending: true, key: ["app-vendas"] });
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id", ascending: true });
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });

  const pedidos = filtrar(pedidosTodos);
  // quem é vendedor vê só as vendas dele; os outros (gerente, administrador) veem as da empresa
  const meuVendedor = vendedores.find((v) => v.user_id && v.user_id === eu.user_id && v.ativo);
  const r = useMemo(() => resumoVendas(pedidos, dia, meuVendedor?.id), [pedidos, dia, meuVendedor?.id]);
  const meus = meuVendedor ? pedidos.filter((p) => p.vendedor_id === meuVendedor.id) : pedidos;

  const novoPedido = (cliente_id?: string) => navigate("/pedidos", { state: { novo: true, ...(cliente_id ? { cliente_id } : {}) } });
  const abrirPedido = (id: string) => navigate("/pedidos", { state: { abrir: id } });
  const ir = (a: Aba) => { setAba(a); setBusca(""); window.scrollTo({ top: 0 }); };

  const achados = aba === "clientes" && busca.trim().length >= 2
    ? clientes.filter((c) => combina(`${c.nome} ${c.nome_fantasia ?? ""} ${c.cpf_cnpj ?? ""} ${c.municipio ?? ""} ${c.telefone ?? ""} ${c.whatsapp ?? ""}`, busca)).slice(0, 40) : [];
  const itens = aba === "estoque" && busca.trim().length >= 2
    ? produtos.filter((p) => p.ativo && !p.unificado_em && p.vendavel !== false && combina(`${p.descricao} ${p.sku ?? ""} ${p.codigo_barras ?? ""}`, busca)).slice(0, 40) : [];
  const saldoEm = (produtoId: string, unidadeId: string) => Number(saldos.find((s) => s.produto_id === produtoId && s.unidade_id === unidadeId)?.quantidade ?? 0);
  const listaPedidos = meus.filter((p) => p.status === filtroStatus).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 60);
  const primeiro = (eu.nome || "").split(" ")[0];

  const LinhaPedido = ({ p }: { p: Pedido }) => (
    <li>
      <button type="button" onClick={() => abrirPedido(p.id)} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#111521] p-3.5 text-left active:bg-white/5">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <b className="num text-sm text-[#8b93a7]">#{p.numero}</b>
            <span className={`rounded-md px-1.5 py-0.5 text-2xs font-bold ${COR_STATUS[p.status] ?? "bg-white/10"}`}>{ROTULO_STATUS_APP[p.status] ?? p.status}</span>
          </span>
          <span className="mt-0.5 block truncate font-semibold">{nomeCliente(p.cliente)}<SeloCidade cliente={p.cliente} escuro /></span>
          <span className="block text-xs text-[#8b93a7]">{dataBR(p.created_at)}</span>
        </span>
        <span className="num shrink-0 text-lg font-bold">{brl(p.valor_total)}</span>
        <ChevronRight size={18} className="shrink-0 text-[#8b93a7]" aria-hidden />
      </button>
    </li>
  );

  return (
    <div className="min-h-screen bg-[#07090f] pb-28 text-[#e9ecf2]" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-md px-4">
        <header className="flex items-center gap-3 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#10b981] to-[#22d3ee] font-bold text-[#07090f]">MF</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#8b93a7]">Olá{primeiro ? `, ${primeiro}` : ""}</p>
            <p className="truncate font-bold tracking-wide">Vendas MF</p>
          </div>
          <button type="button" onClick={() => novoPedido()} className="flex items-center gap-1.5 rounded-full bg-[#10b981] px-4 py-2 text-sm font-bold text-[#04130d]">
            <Plus size={17} /> Pedido
          </button>
        </header>

        {aba === "inicio" && (
          <>
            <section className="rounded-3xl border border-[#10b981]/25 bg-gradient-to-br from-[#0b1f1a] via-[#111827] to-[#0e1a2b] p-5 shadow-[0_0_40px_-12px_rgba(16,185,129,.45)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8b93a7]">{meuVendedor ? "Minhas vendas no mês" : "Vendas no mês"}</p>
              <p className="num mt-1 text-4xl font-bold">{brl(r.valor)}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-[#b8bfcd]">
                <span>{r.qtd} {pl(r.qtd, "venda", "vendas")}{r.qtd ? ` · ticket ${brl(r.ticket)}` : ""}</span>
                {r.variacao != null && (
                  <span className={`inline-flex items-center font-bold ${r.variacao >= 0 ? "text-[#34d399]" : "text-[#fb7185]"}`}>
                    {r.variacao >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{Math.abs(r.variacao)}% vs mês passado
                  </span>
                )}
              </p>
            </section>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => { setFiltroStatus("orcamento"); ir("pedidos"); }} className="rounded-2xl border border-[#fbbf24]/30 bg-[#fbbf24]/10 p-3 text-left">
                <p className="flex items-center gap-1 text-xs font-semibold text-[#fcd34d]"><FileText size={14} /> Orçamentos abertos</p>
                <p className="num mt-1 text-2xl font-bold">{r.orcamentos}</p>
                <p className="text-xs text-[#b8bfcd]">{brl(r.valorOrcamentos)} esperando resposta</p>
              </button>
              <button type="button" onClick={() => { setFiltroStatus("aprovado"); ir("pedidos"); }} className="rounded-2xl border border-[#22d3ee]/30 bg-[#22d3ee]/10 p-3 text-left">
                <p className="flex items-center gap-1 text-xs font-semibold text-[#67e8f9]"><ShoppingBag size={14} /> Aprovados</p>
                <p className="num mt-1 text-2xl font-bold">{r.aprovados}</p>
                <p className="text-xs text-[#b8bfcd]">{brl(r.valorAprovados)} para faturar</p>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {([["clientes", "Achar cliente", Users], ["estoque", "Preço e estoque", Package], ["pedidos", "Meus pedidos", ShoppingBag]] as const).map(([a, rot, Icone]) => (
                <button key={a} type="button" onClick={() => ir(a)} className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-[#111521] py-4 text-xs font-semibold">
                  <Icone size={22} className="text-[#34d399]" />{rot}
                </button>
              ))}
            </div>

            <h2 className="mb-2 mt-6 text-sm font-semibold text-[#8b93a7]">Últimos pedidos</h2>
            <ul className="space-y-2">{r.recentes.map((p) => <LinhaPedido key={p.id} p={p as Pedido} />)}</ul>
            {!r.recentes.length && <p className="rounded-2xl border border-white/10 p-6 text-center text-[#8b93a7]">Nenhum pedido ainda. Toque em <b>+ Pedido</b> para começar.</p>}
          </>
        )}

        {(aba === "clientes" || aba === "estoque") && (
          <label className="relative mb-3 block">
            <span className="sr-only">{aba === "clientes" ? "Procurar cliente" : "Procurar produto"}</span>
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b93a7]" aria-hidden />
            <input key={aba} autoFocus type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder={aba === "clientes" ? "Nome, cidade, CNPJ ou telefone" : "Produto, SKU ou código de barras"}
              className="w-full rounded-2xl border border-white/15 bg-[#111521] py-3.5 pl-11 pr-4 text-base text-[#e9ecf2] placeholder:text-[#6b7385] focus:border-[#34d399] focus:outline-none" />
          </label>
        )}

        {aba === "clientes" && (
          <>
            {busca.trim().length < 2 && <p className="p-4 text-center text-sm text-[#8b93a7]">Digite pelo menos 2 letras. {clientes.length.toLocaleString("pt-BR")} clientes no ERP.</p>}
            <ul className="space-y-2">
              {achados.map((c) => {
                const wa = numeroWhatsApp(c.whatsapp || c.telefone);
                const fone = (c.telefone || c.whatsapp || "").replace(/\D/g, "");
                return (
                  <li key={c.id} className="rounded-2xl border border-white/10 bg-[#111521] p-3.5">
                    <p className="font-semibold">{nomeCliente(c)}</p>
                    <p className="text-xs text-[#8b93a7]">{[c.municipio && `${c.municipio}${c.uf ? `/${c.uf}` : ""}`, c.nome_fantasia?.trim() && c.nome].filter(Boolean).join(" · ") || "—"}</p>
                    <div className="mt-2.5 grid grid-cols-3 gap-2 text-sm font-semibold">
                      {wa ? <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 rounded-xl bg-[#10b981]/15 py-2.5 text-[#6ee7b7]"><MessageCircle size={16} /> WhatsApp</a>
                        : <span className="flex items-center justify-center rounded-xl border border-white/10 py-2.5 text-xs text-[#6b7385]">sem WhatsApp</span>}
                      {fone.length >= 10 ? <a href={`tel:${fone}`} className="flex items-center justify-center gap-1 rounded-xl border border-white/15 py-2.5"><Phone size={16} /> Ligar</a>
                        : <span className="flex items-center justify-center rounded-xl border border-white/10 py-2.5 text-xs text-[#6b7385]">sem telefone</span>}
                      <button type="button" onClick={() => novoPedido(c.id)} className="flex items-center justify-center gap-1 rounded-xl bg-[#10b981] py-2.5 font-bold text-[#04130d]"><Plus size={16} /> Pedido</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {busca.trim().length >= 2 && !achados.length && <p className="p-4 text-center text-sm text-[#8b93a7]">Nenhum cliente com “{busca}”.</p>}
          </>
        )}

        {aba === "estoque" && (
          <>
            {busca.trim().length < 2 && <p className="p-4 text-center text-sm text-[#8b93a7]">Digite pelo menos 2 letras do produto ou o SKU.</p>}
            <ul className="space-y-2">
              {itens.map((p) => {
                const foto = urlFotoProduto(p.foto_caminho);
                return (
                  <li key={p.id} className="flex gap-3 rounded-2xl border border-white/10 bg-[#111521] p-3">
                    {foto ? <img src={foto} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain" />
                      : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white/5 text-[#6b7385]"><Package size={22} /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug">{p.descricao}</p>
                      {p.sku && <p className="text-xs text-[#8b93a7]">{p.sku}</p>}
                      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="num text-lg font-bold text-[#6ee7b7]">{brl(p.preco_venda)}</span>
                        <span className="flex flex-wrap gap-1.5 text-xs">
                          {unidades.length > 1 && !p.kit ? unidades.filter((u) => u.ativo).map((u) => {
                            const q = saldoEm(p.id, u.id);
                            return <span key={u.id} className={`rounded-md px-1.5 py-0.5 font-bold ${q > 0 ? "bg-[#10b981]/15 text-[#6ee7b7]" : "bg-[#fb7185]/15 text-[#fda4af]"}`}>{codigo(u.id)} {q.toLocaleString("pt-BR")}</span>;
                          }) : <span className={`rounded-md px-1.5 py-0.5 font-bold ${Number(p.estoque_atual) > 0 ? "bg-[#10b981]/15 text-[#6ee7b7]" : "bg-[#fb7185]/15 text-[#fda4af]"}`}>{p.kit ? "kit" : `estoque ${Number(p.estoque_atual).toLocaleString("pt-BR")}`}</span>}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {busca.trim().length >= 2 && !itens.length && <p className="p-4 text-center text-sm text-[#8b93a7]">Nenhum produto com “{busca}”.</p>}
          </>
        )}

        {aba === "pedidos" && (
          <>
            <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Situação">
              {(["orcamento", "aprovado", "faturado", "entregue"] as const).map((s) => {
                const n = meus.filter((p) => p.status === s).length;
                return (
                  <button key={s} type="button" role="tab" aria-selected={filtroStatus === s} onClick={() => setFiltroStatus(s)}
                    className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${filtroStatus === s ? "bg-[#e9ecf2] text-[#07090f]" : "border border-white/15 text-[#b8bfcd]"}`}>
                    {ROTULO_STATUS_APP[s]} <span className="num opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
            <ul className="space-y-2">{listaPedidos.map((p) => <LinhaPedido key={p.id} p={p} />)}</ul>
            {!listaPedidos.length && <p className="rounded-2xl border border-white/10 p-6 text-center text-[#8b93a7]">Nenhum pedido nesta situação.</p>}
          </>
        )}

        {aba === "mais" && (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-4 text-sm">
              <span>Abrir sempre aqui pelo celular</span>
              <input type="checkbox" className="h-5 w-5 accent-[#10b981]" checked={sempre}
                onChange={(e) => { setSempre(e.target.checked); gravar(CHAVE_APP_VENDAS, e.target.checked ? "1" : "0"); }} />
            </label>
            <InstalarApp />
            <button type="button" onClick={() => navigate("/pedidos")} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm text-[#b8bfcd]">
              <LayoutGrid size={18} /> <span className="flex-1">Abrir o ERP completo</span> <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* barra de baixo */}
      <nav aria-label="App de vendas" className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#0b0e16]/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {([["inicio", "Início", Home], ["clientes", "Clientes", Users], ["estoque", "Estoque", Package], ["pedidos", "Pedidos", ShoppingBag], ["mais", "Mais", MoreHorizontal]] as const).map(([id, rot, Icone]) => (
            <button key={id} type="button" onClick={() => ir(id)} aria-current={aba === id ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs ${aba === id ? "text-[#34d399]" : "text-[#8b93a7]"}`}>
              <Icone size={21} />{rot}
              {id === "pedidos" && r.orcamentos > 0 && <span className="absolute right-[18%] top-1 rounded-full bg-[#fbbf24] px-1.5 text-2xs font-bold text-[#07090f]">{r.orcamentos}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
