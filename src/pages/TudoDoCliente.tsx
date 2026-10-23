// Tudo do cliente: busca pelo CNPJ, CPF ou nome, a pessoa confirma qual é ("Ver tudo") e a tela junta, numa página só,
// o cadastro e tudo o que existe dele no ERP: vendas e propostas, notas (emitidas e NFS-e; as da My Frost ficam só na Retaguarda),
// contas a receber, recibos, extrato dos bancos (pelo nome ou pelo documento mascarado), OS, máquinas e CT-e.
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, FileText, Landmark, Printer, Receipt, Search, ShoppingCart, Truck, UserRound, Wrench, IceCreamCone } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { FichaCliente } from "@/components/FichaCliente";
import { PdfViewer } from "@/components/PdfViewer";
import { notifyError } from "@/lib/notify";
import { useConfig } from "@/lib/useConfig";
import { pdfTudoCliente } from "@/lib/pdf";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, docFormat, pl } from "@/lib/format";
import { digitos, docDaBusca, extratoDoCliente, termoExtrato } from "@/lib/tudoCliente";
import type { Cliente } from "@/lib/types";

type Achado = { tipo: "cliente" | "fornecedor"; id: string; nome: string; fantasia: string | null; doc: string | null; cidade: string | null; cliente?: Cliente };
type Linha = { id: string; data: string | null; titulo: string; detalhe?: string; valor?: number | null; selo?: string; para?: string };

async function buscar(termo: string): Promise<Achado[]> {
  const doc = docDaBusca(termo);
  const t = termo.trim().replace(/[%,()]/g, " ");
  const filtroCli = doc ? `cpf_cnpj.ilike.%${doc}%,cpf_cnpj.ilike.%${docFormat(doc)}%` : `nome.ilike.%${t}%,nome_fantasia.ilike.%${t}%`;
  const filtroForn = doc ? `cnpj.ilike.%${doc}%,cnpj.ilike.%${docFormat(doc)}%` : `nome.ilike.%${t}%,nome_fantasia.ilike.%${t}%`;
  const [cli, forn] = await Promise.all([
    supabase.from("clientes").select("*").or(filtroCli).limit(20),
    supabase.from("fornecedores").select("id, nome, nome_fantasia, cnpj, municipio, uf").or(filtroForn).limit(10),
  ]);
  if (cli.error) throw cli.error;
  return [
    ...((cli.data ?? []) as Cliente[]).map((c) => ({ tipo: "cliente" as const, id: c.id, nome: c.nome, fantasia: c.nome_fantasia ?? null, doc: c.cpf_cnpj ?? null,
      cidade: [c.municipio, c.uf].filter(Boolean).join("/") || null, cliente: c })),
    ...((forn.data ?? []) as { id: string; nome: string; nome_fantasia: string | null; cnpj: string | null; municipio: string | null; uf: string | null }[])
      .map((f) => ({ tipo: "fornecedor" as const, id: f.id, nome: f.nome, fantasia: f.nome_fantasia, doc: f.cnpj, cidade: [f.municipio, f.uf].filter(Boolean).join("/") || null })),
  ];
}

/** Tudo de uma vez; cada consulta que falhar (tabela sem acesso) só fica vazia. */
async function tudo(a: Achado) {
  const doc = digitos(a.doc);
  const termo = termoExtrato(a.nome);
  const lista = async <T,>(p: PromiseLike<{ data: unknown; error: unknown }>) => { const r = await p; return (r.error ? [] : (r.data ?? [])) as T[]; };
  const porCliente = a.tipo === "cliente";
  const [pedidos, notas, nfse, receber, recibos, os, maquinas, propostas, extrato, ctes, recebidas, pagar] = await Promise.all([
    porCliente ? lista<any>(supabase.from("pedidos").select("id, numero, status, valor_total, created_at, aprovado_em, origem").eq("cliente_id", a.id).is("excluida_em", null).order("created_at", { ascending: false })) : [],
    lista<any>(supabase.from("notas_fiscais").select("id, numero, serie, status, valor_total, created_at, ambiente, finalidade, danfe_url, destinatario_doc, cliente_id, pedido_id")
      .or(porCliente ? `cliente_id.eq.${a.id}${doc ? `,destinatario_doc.eq.${doc}` : ""}` : `fornecedor_id.eq.${a.id}`).is("excluida_em", null).order("created_at", { ascending: false })),
    porCliente ? lista<any>(supabase.from("nfse").select("id, numero, status, valor_servicos, data_emissao, created_at").eq("cliente_id", a.id)) : [],
    porCliente ? lista<any>(supabase.from("contas_receber").select("id, descricao, valor, valor_pago, vencimento, status, data_pagamento").eq("cliente_id", a.id).order("vencimento", { ascending: false })) : [],
    lista<any>(supabase.from("recibos").select("id, numero, tipo, valor, data_pagamento, referente, pagador_nome, recebedor_nome, cancelado_em")
      .or(`pagador_nome.ilike.%${a.nome.replace(/[%,()]/g, " ")}%,recebedor_nome.ilike.%${a.nome.replace(/[%,()]/g, " ")}%`)),
    porCliente ? lista<any>(supabase.from("ordens_servico").select("id, numero, status, equipamento, defeito_relatado, valor_total, data_entrada").eq("cliente_id", a.id).is("excluida_em", null)) : [],
    porCliente ? lista<any>(supabase.from("equipamentos").select("id, descricao, numero_serie, data_venda, garantia_ate").eq("cliente_id", a.id)) : [],
    porCliente ? lista<any>(supabase.from("propostas_tiny").select("id, empresa, numero, data, situacao, total").eq("cliente_id", a.id).order("data", { ascending: false })) : [],
    // extrato: pré-filtro no banco (nome ou um pedaço do documento) e a confirmação aqui
    lista<any>(supabase.from("extrato_lancamentos").select("id, data, valor, descricao, status, conta_bancaria_id")
      .or([termo && `descricao.ilike.%${termo}%`, doc.length >= 11 && `descricao.ilike.%${doc.slice(3, 9)}%`].filter(Boolean).join(",") || "id.is.null")
      .order("data", { ascending: false }).limit(500)),
    doc ? lista<any>(supabase.from("ctes").select("id, numero, emissao, valor, emitente_nome, destinatario_nome, situacao").or(`destinatario_cnpj.eq.${doc},tomador_cnpj.eq.${doc},remetente_cnpj.eq.${doc}`)) : [],
    a.tipo === "fornecedor" ? lista<any>(supabase.from("nfe_recebidas").select("id, chave, valor_total, data_emissao, situacao").eq("fornecedor_id", a.id).order("data_emissao", { ascending: false })) : [],
    a.tipo === "fornecedor" ? lista<any>(supabase.from("contas_pagar").select("id, descricao, valor, valor_pago, vencimento, status").eq("fornecedor_id", a.id).order("vencimento", { ascending: false })) : [],
  ]);
  // notas emitidas a partir dos pedidos (ligadas pelo pedido, sem o cliente na nota)
  const ids = (pedidos as any[]).map((p) => p.id);
  const daNota = new Set((notas as any[]).map((n) => n.id));
  const dosPedidos = ids.length ? (await lista<any>(supabase.from("notas_fiscais").select("id, numero, serie, status, valor_total, created_at, ambiente, finalidade, danfe_url, pedido_id")
    .in("pedido_id", ids).is("excluida_em", null))).filter((n) => !daNota.has(n.id)) : [];
  return {
    pedidos, notas: [...(notas as any[]), ...dosPedidos], nfse, receber, recibos, os, maquinas, propostas, ctes, recebidas, pagar,
    extrato: (extrato as any[]).filter((l) => extratoDoCliente(l.descricao, a.nome, doc) || (a.fantasia && extratoDoCliente(l.descricao, a.fantasia, null))),
  };
}

export default function TudoDoCliente() {
  const [termo, setTermo] = useState("");
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<Achado | null>(null);
  const [ficha, setFicha] = useState(false);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [gerando, setGerando] = useState(false);
  const { data: cfg } = useConfig();
  const achados = useQuery({ queryKey: ["tudo-cliente-busca", busca], queryFn: () => buscar(busca), enabled: busca.trim().length >= 3 });
  const dados = useQuery({ queryKey: ["tudo-cliente", escolhido?.tipo, escolhido?.id], queryFn: () => tudo(escolhido!), enabled: !!escolhido });

  async function imprimir() {
    if (!escolhido || !dados.data || !cfg) return;
    setGerando(true);
    try {
      const c = escolhido.cliente;
      const end = (x: { logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null; cep?: string | null }) =>
        [[x.logradouro, x.numero].filter(Boolean).join(", "), x.complemento, x.bairro, [x.municipio, x.uf].filter(Boolean).join("/"), x.cep && `CEP ${x.cep}`].filter(Boolean).join(" · ");
      const cadastro: [string, string][] = c ? [
        ["Nome / razão social", c.nome], ["Nome fantasia", c.nome_fantasia ?? ""], ["CPF / CNPJ", c.cpf_cnpj ? docFormat(c.cpf_cnpj) : ""],
        ["Inscrição estadual", c.inscricao_estadual ?? ""], ["Endereço", end(c)],
        ...(c.enderecos_extras ?? []).map((e, i): [string, string] => [e.etiqueta || `Endereço ${i + 2}`, end(e)]),
        ["Telefone", [c.telefone, c.telefone_adicional].filter(Boolean).join(" / ")], ["WhatsApp", c.whatsapp ?? ""],
        ["E-mail", [c.email, c.email_nfe].filter(Boolean).join(" / ")], ["Site / redes", [c.website, c.instagram].filter(Boolean).join(" · ")],
        ["Compra da máquina", c.compra_maquina_em ?? ""], ["Observações", c.observacoes ?? ""],
      ] : [["Nome", escolhido.nome], ["CNPJ", escolhido.doc ? docFormat(escolhido.doc) : ""], ["Cidade", escolhido.cidade ?? ""]];
      const r = resumoDe(dados.data);
      setPdf(await pdfTudoCliente({
        nome: escolhido.nome, sub: [escolhido.fantasia, escolhido.doc && docFormat(escolhido.doc), escolhido.cidade].filter(Boolean).join(" · "),
        cadastro, resumo: r.cartoes, blocos: blocosDe(dados.data).map((b) => ({ titulo: b.titulo, linhas: b.linhas.map((l) => ({ data: l.data, titulo: l.titulo, detalhe: [l.selo, l.detalhe].filter(Boolean).join(" · "), valor: l.valor })) })),
      }, cfg));
    } catch (e) { notifyError(e); } finally { setGerando(false); }
  }

  function enviar(e: FormEvent) { e.preventDefault(); setEscolhido(null); setBusca(termo.trim()); }

  return (
    <div className="space-y-4">
      {/* Hero: a proposta da página e a busca no centro (antes era só um campo solto e a tela parecia vazia) */}
      <section aria-labelledby="tudo-titulo"
        className="relative overflow-hidden rounded-painel border border-modulo/25 p-5 shadow-card sm:p-7"
        style={{ background: "linear-gradient(135deg, color-mix(in srgb, rgb(var(--modulo)) 16%, rgb(var(--surface))) 0%, rgb(var(--surface)) 65%)" }}>
        <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-modulo opacity-20 blur-3xl" aria-hidden />
        <div className="relative max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-rotulo text-modulo-texto">Cadastros · Tudo do cliente</p>
          <h1 id="tudo-titulo" className="mt-1 text-2xl font-bold text-fg sm:text-3xl">Tudo de um cliente numa página só</h1>
          {!escolhido && (
            <p className="mt-2 text-sm text-slate-600 sm:text-base">
              Digite o CNPJ, o CPF ou o nome, confirme quem é e veja o cadastro e todo o histórico com a MF: vendas, notas,
              contas, extrato dos bancos, OS, máquinas e fretes. Dá para imprimir tudo na Ficha 360°.
            </p>
          )}
          <form onSubmit={enviar} className="mt-4 flex flex-wrap items-center gap-2" role="search">
            <label className="flex min-w-0 flex-1 basis-64 items-center gap-2 rounded-campo border border-slate-300 bg-campo px-3 shadow-sm focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/20">
              <Search size={18} className="shrink-0 text-slate-400" aria-hidden />
              <input className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:outline-none" value={termo} onChange={(e) => setTermo(e.target.value)}
                placeholder="CNPJ, CPF ou nome do cliente" aria-label="CNPJ, CPF ou nome" autoFocus />
            </label>
            <Button type="submit" className="h-12" disabled={termo.trim().length < 3}><Search size={16} aria-hidden /> Buscar</Button>
          </form>
          {!escolhido && !busca && (
            <>
              <ol className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
                {["Busque pelo CNPJ, CPF ou nome", "Confirme quem é na lista", "Veja tudo e imprima a Ficha 360°"].map((t, i) => (
                  <li key={t} className="flex items-center gap-2 text-slate-600">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-modulo text-xs font-bold text-white">{i + 1}</span>{t}
                  </li>
                ))}
              </ol>
              <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="O que aparece">
                {([[ShoppingCart, "Vendas e propostas"], [Receipt, "Notas fiscais"], [Landmark, "Contas e extrato"], [Wrench, "Assistência"], [IceCreamCone, "Máquinas"], [Truck, "Fretes"]] as const).map(([I, t]) => (
                  <li key={t} className="inline-flex items-center gap-1.5 rounded-chip border border-slate-200 bg-surface px-2.5 py-1 text-xs font-semibold text-slate-600"><I size={13} aria-hidden />{t}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
      <Card className={busca && !escolhido ? "p-4" : "hidden"}>
        {busca && !escolhido && (
          <div className="mt-3">
            {achados.isLoading ? <p className="text-sm text-slate-500">Buscando…</p>
              : !achados.data?.length ? <p className="text-sm text-slate-500">Nada com "{busca}" nos clientes e fornecedores.</p> : (
              <ul className="space-y-2">
                {achados.data.map((a) => (
                  <li key={`${a.tipo}-${a.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-modulo/10 text-modulo-texto">{a.tipo === "cliente" ? <UserRound size={18} /> : <Building2 size={18} />}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-fg">{a.nome}</b>
                      <span className="block truncate text-xs text-slate-500">{[a.tipo === "cliente" ? "Cliente" : "Fornecedor", a.fantasia, a.doc && docFormat(a.doc), a.cidade].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Button onClick={() => setEscolhido(a)}><Check size={16} /> Ver tudo</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {escolhido && (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-modulo text-white">{escolhido.tipo === "cliente" ? <UserRound size={22} /> : <Building2 size={22} />}</span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-fg">{escolhido.nome}</h2>
              <p className="text-sm text-slate-500">{[escolhido.fantasia, escolhido.doc && docFormat(escolhido.doc), escolhido.cidade].filter(Boolean).join(" · ")}</p>
            </div>
            <Button onClick={imprimir} disabled={!dados.data || gerando}><Printer size={16} /> {gerando ? "Gerando…" : "Imprimir tudo (PDF)"}</Button>
            {escolhido.cliente && <Button variant="secondary" onClick={() => setFicha(true)}>Ficha 360°</Button>}
            <Button variant="ghost" onClick={() => { setEscolhido(null); }}>Trocar</Button>
          </Card>
          {dados.isLoading ? <p className="text-sm text-slate-500">Juntando tudo…</p> : dados.data && <Resultado d={dados.data} />}
        </>
      )}
      {pdf && escolhido && <PdfViewer blob={pdf} nome={`ficha-360-${escolhido.nome.split(" ")[0].toLowerCase()}.pdf`} titulo="Ficha 360° do cliente" onClose={() => setPdf(null)} />}
      {ficha && escolhido?.cliente && <FichaCliente cliente={escolhido.cliente} onClose={() => setFicha(false)} />}
    </div>
  );
}

type Dados = Awaited<ReturnType<typeof tudo>>;

function resumoDe(d: Dados) {
  const vendido = d.pedidos.filter((p: any) => !["orcamento", "cancelado"].includes(p.status)).reduce((s: number, p: any) => s + Number(p.valor_total ?? 0), 0);
  const notasOk = d.notas.filter((n: any) => n.status === "autorizada" && n.ambiente !== "homologacao");
  const faturado = notasOk.reduce((s: number, n: any) => s + Number(n.valor_total ?? 0), 0);
  const recebidoBanco = d.extrato.filter((l: any) => Number(l.valor) > 0).reduce((s: number, l: any) => s + Number(l.valor), 0);
  const aReceber = d.receber.filter((c: any) => c.status !== "pago" && c.status !== "cancelado").reduce((s: number, c: any) => s + Number(c.valor) - Number(c.valor_pago ?? 0), 0);
  const total = Object.values(d).reduce((s, l) => s + (l as unknown[]).length, 0);
  const cartoes: [string, string, string][] = [
    ["Vendido (pedidos)", brl(vendido), `${d.pedidos.length} ${pl(d.pedidos.length, "pedido", "pedidos")}`],
    ["Notas emitidas", brl(faturado), `${notasOk.length} ${pl(notasOk.length, "nota", "notas")}`],
    ["Entrou no banco", brl(recebidoBanco), `${d.extrato.length} ${pl(d.extrato.length, "lançamento", "lançamentos")} no extrato`],
    ["A receber", brl(aReceber), `${total} ${pl(total, "registro", "registros")} no total`],
  ];
  return { cartoes };
}

function blocosDe(d: Dados): { titulo: string; icone: typeof Search; para?: string; linhas: Linha[] }[] {
  return [
    { titulo: "Vendas e orçamentos", icone: ShoppingCart, para: "/pedidos", linhas: d.pedidos.map((p: any) => ({ id: p.id, data: p.aprovado_em ?? p.created_at, titulo: `Pedido #${p.numero}`, selo: p.status, valor: p.valor_total, detalhe: p.origem })) },
    { titulo: "Propostas do Tiny", icone: FileText, linhas: d.propostas.map((p: any) => ({ id: p.id, data: p.data, titulo: `Proposta ${p.numero ?? ""} · ${p.empresa ?? ""}`, selo: p.situacao, valor: p.total })) },
    { titulo: "Notas fiscais emitidas", icone: Receipt, para: "/notas", linhas: [
      ...d.notas.map((n: any) => ({ id: n.id, data: n.created_at, titulo: `NF ${n.numero ?? "—"}${n.serie ? `/${n.serie}` : ""}`, selo: n.ambiente === "homologacao" ? "teste" : n.status, valor: n.valor_total, detalhe: n.finalidade })),
      ...d.nfse.map((n: any) => ({ id: n.id, data: n.data_emissao ?? n.created_at, titulo: `NFS-e ${n.numero ?? "—"}`, selo: n.status, valor: n.valor_servicos })),
    ] },
    { titulo: "Notas recebidas (fornecedor)", icone: Receipt, linhas: d.recebidas.map((n: any) => ({ id: n.id, data: n.data_emissao, titulo: `NF ${String(n.chave ?? "").slice(25, 34).replace(/^0+/, "") || "—"}`, selo: n.situacao, valor: n.valor_total })) },
    { titulo: "Contas a receber", icone: Landmark, para: "/financeiro", linhas: d.receber.map((c: any) => ({ id: c.id, data: c.data_pagamento ?? c.vencimento, titulo: c.descricao, selo: c.status, valor: c.valor })) },
    { titulo: "Contas a pagar", icone: Landmark, para: "/financeiro", linhas: d.pagar.map((c: any) => ({ id: c.id, data: c.vencimento, titulo: c.descricao, selo: c.status, valor: c.valor })) },
    { titulo: "Extrato dos bancos", icone: Landmark, linhas: d.extrato.map((l: any) => ({ id: l.id, data: l.data, titulo: l.descricao, selo: l.status === "conciliado" ? "conciliado" : "para conciliar", valor: l.valor })) },
    { titulo: "Recibos", icone: Receipt, linhas: d.recibos.map((r: any) => ({ id: r.id, data: r.data_pagamento, titulo: `Recibo nº ${r.numero} · ${r.referente}`, selo: r.cancelado_em ? "cancelado" : r.tipo, valor: r.valor })) },
    { titulo: "Assistência (OS)", icone: Wrench, para: "/assistencia", linhas: [
      ...d.os.map((o: any) => ({ id: o.id, data: o.data_entrada, titulo: `OS #${o.numero} · ${o.equipamento ?? ""}`, selo: o.status, valor: o.valor_total, detalhe: o.defeito_relatado })),
    ] },
    { titulo: "Máquinas", icone: IceCreamCone, linhas: d.maquinas.map((m: any) => ({ id: m.id, data: m.data_venda, titulo: m.descricao, detalhe: [m.numero_serie && `série ${m.numero_serie}`, m.garantia_ate && `garantia até ${dataBR(m.garantia_ate)}`].filter(Boolean).join(" · ") })) },
    { titulo: "Fretes (CT-e)", icone: Truck, linhas: d.ctes.map((c: any) => ({ id: c.id, data: c.emissao, titulo: `CT-e ${c.numero} · ${c.emitente_nome ?? ""}`, selo: c.situacao, valor: c.valor })) },
  ];
}

function Resultado({ d }: { d: Dados }) {
  const { cartoes } = resumoDe(d);
  const blocos = blocosDe(d);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map(([rotulo, valor, sub]) => <Numero key={rotulo} rotulo={rotulo} valor={valor} sub={sub} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {blocos.filter((b) => b.linhas.length).map((b) => <Bloco key={b.titulo} {...b} />)}
      </div>
      {blocos.every((b) => !b.linhas.length) && <Card className="p-6 text-center text-sm text-slate-500">Só o cadastro: nenhuma venda, nota, conta, extrato, OS ou máquina deste cliente.</Card>}
    </div>
  );
}

function Numero({ rotulo, valor, sub }: { rotulo: string; valor: ReactNode; sub: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs font-semibold text-slate-500">{rotulo}</p>
      <p className="num text-xl font-bold text-fg">{valor}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </Card>
  );
}

function Bloco({ titulo, icone: Icone, para, linhas }: { titulo: string; icone: typeof Search; para?: string; linhas: Linha[] }) {
  const ordenadas = [...linhas].sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icone size={18} className="text-modulo-texto" aria-hidden />
        <h3 className="flex-1 font-bold text-fg">{titulo} <span className="text-sm font-normal text-slate-500">· {linhas.length}</span></h3>
        {para && <Link to={para} className="link-acao text-xs">abrir a lista</Link>}
      </div>
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
        {ordenadas.map((l) => (
          <li key={l.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 text-sm">
            <span className="num w-20 text-xs text-slate-500">{l.data ? dataBR(String(l.data).slice(0, 10)) : "—"}</span>
            <span className="min-w-0">
              <span className="block truncate text-fg" title={l.titulo}>{l.titulo}</span>
              {(l.selo || l.detalhe) && <span className="block truncate text-xs text-slate-500">{[l.selo, l.detalhe].filter(Boolean).join(" · ")}</span>}
            </span>
            <span className={`num text-right font-semibold ${Number(l.valor) < 0 ? "text-red-600" : "text-fg"}`}>{l.valor != null ? brl(Number(l.valor)) : ""}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
