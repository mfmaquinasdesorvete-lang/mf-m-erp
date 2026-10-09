import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FreteVenda } from "@/components/FreteVenda";
import { CheckCircle2, ChevronRight, FileDown, FileText, MessageCircle, Pencil, Plus, Printer, RotateCcw, Truck, XCircle } from "lucide-react";
import { PdfViewer } from "@/components/PdfViewer";
import { pdfOrcamento } from "@/lib/pdf";
import { useConfig } from "@/lib/useConfig";
import { Badge, CelulaAbrir, Button, Field, Modal, PageHeader, Table, Tabs } from "@/components/ui";
import { ItensEditor, totalItens } from "@/components/ItensEditor";
import { limpar, useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, rotuloCliente, somarDias, whatsappLink } from "@/lib/format";
import { MEIOS_VENDA, useFormasPagamento } from "@/lib/formasPagamento";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import type { Cliente, Item, Pedido, Produto, Vendedor } from "@/lib/types";
import { usePerfil } from "@/lib/auth";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { Anexos } from "@/components/Anexos";
import { PropostaPainel } from "@/components/PropostaPainel";
import { useEtiquetas } from "@/components/etiquetas/EditorEtiquetas";
import { conferirPedido, type Pendencia } from "@/lib/compliance";
import { VendedorSelect } from "@/components/VendedorSelect";
import { MotivoAcao } from "@/components/MotivoAcao";
import { AuditoriaPedido } from "@/components/AuditoriaPedido";
import { ambienteNfe, confirmarSeTeste } from "@/lib/ambienteNfe";

const STATUS = ["todos", "orcamento", "aprovado", "faturado", "entregue", "cancelado"] as const;
const ROTULO_STATUS: Record<(typeof STATUS)[number], string> = {
  todos: "Todos", orcamento: "Orçamentos", aprovado: "Aprovados", faturado: "Faturados", entregue: "Entregues", cancelado: "Cancelados",
};
const FORMAS = [
  { value: "boleto", label: "Boleto" },
  { value: "pix", label: "Pix" },
  { value: "cartao", label: "Cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
];

const SELECT = "*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id,status,numero,serie,chave,ambiente)";

function exportarPedidos(lista: Pedido[]) {
  const ped = lista.map((p: any) => ({
    Número: p.numero, Data: celula(p.created_at), Situação: ROTULO_STATUS[p.status as (typeof STATUS)[number]] ?? p.status, Cliente: p.cliente?.nome ?? "",
    "CPF/CNPJ": p.cliente?.cpf_cnpj ?? "", Origem: p.origem, Vendedor: p.vendedor ?? "", Produtos: Number(p.valor_produtos ?? 0),
    Desconto: Number(p.desconto ?? 0), Frete: Number(p.frete ?? 0), Total: Number(p.valor_total ?? 0),
    Pagamento: FORMAS.find((f) => f.value === p.forma_pagamento)?.label ?? p.forma_pagamento, Parcelas: p.parcelas, Observações: p.observacoes ?? "",
  }));
  const itens = lista.flatMap((p: any) => (p.itens ?? []).map((i: Item) => ({
    Pedido: p.numero, Cliente: p.cliente?.nome ?? "", Item: i.descricao, Quantidade: Number(i.quantidade), Unitário: Number(i.valor_unitario),
    Total: Number(i.quantidade) * Number(i.valor_unitario), "Nº de série": i.numero_serie ?? "",
  })));
  baixarPlanilha("vendas", [{ nome: "Pedidos", linhas: ped }, { nome: "Itens", linhas: itens }]).catch(notifyError);
}

const novoPedido = (): Partial<Pedido> & { itens: Item[] } => ({
  origem: "whatsapp", status: "orcamento", forma_pagamento: "boleto", parcelas: 1, intervalo_dias: 30,
  modalidade_frete: 9, desconto: 0, frete: 0, itens: [],
});

export default function Pedidos() {
  const { pode } = usePerfil();
  const { filtrar } = useUnidade();
  const { data: pedidosTodos = [], isLoading } = useRows<Pedido>("pedidos", { select: SELECT });
  const pedidos = filtrar(pedidosTodos);
  const [filtro, setFiltro] = useState<(typeof STATUS)[number]>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<(Partial<Pedido> & { itens: Item[] }) | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const abrirId = (location.state as any)?.abrir;
    if (abrirId) {
      const p = pedidosTodos.find((x) => x.id === abrirId);
      if (!p) return;
      setAberto({ ...p, itens: p.itens ?? [] });
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if ((location.state as any)?.novo) {
      setAberto({ ...novoPedido(), ...((location.state as any).cliente_id ? { cliente_id: (location.state as any).cliente_id } : {}) });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, pedidosTodos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => pedidos.filter((p) =>
    (filtro === "todos" || p.status === filtro) &&
    (!busca || `${p.numero} ${p.cliente?.nome ?? ""}`.toLowerCase().includes(busca.toLowerCase())),
  ), [pedidos, filtro, busca]);

  return (
    <div>
      <PageHeader title="Vendas e orçamentos" subtitle="Do orçamento no WhatsApp à entrega, com frete e nota fiscal."
        actions={<>
          <Button variant="secondary" disabled={!lista.length} onClick={() => exportarPedidos(lista)}><FileDown size={16} /> Exportar</Button>
          {pode("editar_pedidos") && <Button onClick={() => setAberto(novoPedido())}><Plus size={16} /> Novo orçamento</Button>}
        </>} />

      <div className="mb-4 space-y-3">
        <input className="input max-w-md" placeholder="Buscar nº ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS.map((st) => {
            const n = st === "todos" ? pedidos.length : pedidos.filter((x) => x.status === st).length;
            return (
              <button key={st} type="button" onClick={() => setFiltro(st)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${filtro === st ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`}>
                {ROTULO_STATUS[st]} <span className="num ml-1 opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Celular: cartões */}
      <div className="space-y-2 md:hidden">
        {lista.map((p) => (
          <button key={p.id} onClick={() => setAberto({ ...p, itens: p.itens ?? [] })}
            className="w-full rounded-xl border border-slate-200 bg-surface p-4 text-left shadow-card active:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-fg">#{p.numero}<EtiquetaUnidade id={(p as any).unidade_id} />{p.origem === "loja" && <span className="ml-1.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-700">LOJA</span>} · {p.cliente?.nome}</span>
              <span className="flex flex-col items-end gap-1"><Badge value={p.status} />{p.status === "orcamento" && p.proposta_status && <Badge value={p.proposta_status} />}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm text-slate-500">
              <span>{dataBR(p.created_at)} · {(p.itens ?? []).length} item(ns)</span>
              <span className="num text-base font-bold text-fg">{brl(p.valor_total)}</span>
            </div>
            <div className="mt-2 flex items-center justify-end gap-0.5 text-sm font-semibold text-brand">Ver / editar <ChevronRight size={16} /></div>
          </button>
        ))}
        {!isLoading && !lista.length && <p className="py-8 text-center text-sm text-slate-500">Nenhum pedido encontrado.</p>}
      </div>

      <div className="hidden md:block">
      <Table
        empty={!isLoading && lista.length === 0}
        head={<><th className="th">Nº</th><th className="th">Data</th><th className="th">Cliente</th><th className="th">Status</th><th className="th">NF-e</th><th className="th text-right">Total</th><th className="th" /></>}
      >
        {lista.map((p) => (
          <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberto({ ...p, itens: p.itens ?? [] })}>
            <td className="td font-medium">#{p.numero}<EtiquetaUnidade id={(p as any).unidade_id} />{p.origem === "loja" && <span className="ml-1.5 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-700">LOJA</span>}</td>
            <td className="td">{dataBR(p.created_at)}</td>
            <td className="td">{p.cliente?.nome}</td>
            <td className="td"><Badge value={p.status} />{p.status === "orcamento" && p.proposta_status && <div className="mt-1"><Badge value={p.proposta_status} /></div>}</td>
            <td className="td"><Badge value={p.notas?.find((n) => n.status !== "erro")?.status ?? null} /></td>
            <td className="td text-right font-medium">{brl(p.valor_total)}</td>
            <CelulaAbrir texto="Ver / editar" />
          </tr>
        ))}
      </Table>
      </div>

      {aberto && <PedidoModal pedido={aberto} onClose={() => setAberto(null)} />}
    </div>
  );
}

function PedidoModal({ pedido: inicial, onClose }: { pedido: Partial<Pedido> & { itens: Item[] }; onClose: () => void }) {
  const { padrao, unidades } = useUnidade();
  const { data: ufsIcms = [] } = useRows<{ uf: string }>("icms_uf", { order: "uf", ascending: true });
  const [pendencias, setPendencias] = useState<Pendencia[] | null>(null);
  const etiquetas = useEtiquetas();
  const [p, setP] = useState({ ...inicial, unidade_id: (inicial as any).unidade_id ?? padrao });
  const [ocupado, setOcupado] = useState(false);
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto & { garantia_meses?: number | null }>("produtos", { order: "descricao", ascending: true });
  const { data: cfg } = useConfig();
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  // formas de pagamento cadastradas que a venda aceita (a já escolhida aparece mesmo se for inativada depois)
  const { data: formas = [] } = useFormasPagamento();
  const formasVenda = formas.filter((f) => MEIOS_VENDA.includes(f.meio) && f.uso !== "pagar" && (f.ativo || f.id === (p as any).forma_pagamento_id));
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [aba, setAba] = useState<"pedido" | "frete" | "auditoria">("pedido");
  const [acaoMotivo, setAcaoMotivo] = useState<"editar" | "reabrir" | null>(null);
  const invalidate = useInvalidate();
  const { pode, user_id } = usePerfil();
  const podeEditar = pode("editar_pedidos");
  const editavel = podeEditar && (!p.id || p.status === "orcamento");
  // pedido aprovado: vendedor, comissão, origem e observações mudam com motivo; itens e valores só reabrindo
  const ajustavel = podeEditar && !!p.id && ["aprovado", "faturado", "entregue"].includes(p.status ?? "");
  const livre = editavel || ajustavel;
  const [salvo, setSalvo] = useState(() => ({ vendedor_id: inicial.vendedor_id ?? null, comissao_percentual: inicial.comissao_percentual ?? null, origem: inicial.origem, observacoes: inicial.observacoes ?? null }));
  const alterado = ajustavel && (["vendedor_id", "comissao_percentual", "origem", "observacoes"] as const).some((k) => ((p as any)[k] ?? null) !== ((salvo as any)[k] ?? null));
  // orçamento novo já vem com quem está vendendo (se a pessoa tem cadastro de vendedor)
  const vendedorPadrao = useRef(false);
  useEffect(() => {
    if (vendedorPadrao.current || p.id || p.vendedor_id || !vendedores.length) return;
    vendedorPadrao.current = true;
    const meu = vendedores.find((v) => v.user_id === user_id && v.ativo);
    if (meu) setP((x) => ({ ...x, vendedor_id: meu.id, vendedor: meu.nome }));
  }, [vendedores, p.id, p.vendedor_id, user_id]);
  const cliente = clientes.find((c) => c.id === p.cliente_id);
  const subtotal = totalItens(p.itens);
  const total = Math.max(subtotal - Number(p.desconto || 0) + Number(p.frete || 0), 0);
  const set = (patch: Partial<Pedido>) => setP((x) => ({ ...x, ...patch }));

  async function executar(acao: () => Promise<unknown>, ok: string, fechar = true) {
    setOcupado(true);
    try {
      await acao();
      notify(ok);
      invalidate("pedidos", "produtos", "contas_receber", "notas_fiscais");
      if (fechar) onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  /** Grava o pedido e substitui os itens. Retorna o id. */
  async function gravar(): Promise<string> {
    if (!p.cliente_id) throw new Error("Selecione o cliente");
    if (!p.itens.length) throw new Error("Adicione ao menos um item");
    if (p.itens.some((i) => !(Number(i.quantidade) > 0))) throw new Error("Quantidade dos itens deve ser maior que zero");
    const parcelas = Number(p.parcelas);
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 24) throw new Error("Parcelas: de 1 a 24");
    if (Number(p.desconto || 0) < 0) throw new Error("O desconto não pode ser negativo");
    if (Number(p.desconto || 0) > subtotal) throw new Error(`O desconto (${brl(p.desconto)}) é maior que o valor dos itens (${brl(subtotal)})`);
    const { itens, cliente: _c, notas: _n, numero: _num, valor_produtos: _vp, valor_total: _vt, created_at: _ca,
      proposta_token: _pt, proposta_status: _ps, proposta_enviada_em: _pe, proposta_visualizada_em: _pv, proposta_respondida_em: _pr,
      proposta_validade: _pval, proposta_resposta_nome: _pn, ...cab } = p as any;
    const dados = limpar({
      ...cab,
      parcelas: Number(cab.parcelas), intervalo_dias: Number(cab.intervalo_dias),
      desconto: Number(cab.desconto || 0), frete: Number(cab.frete || 0), modalidade_frete: Number(cab.modalidade_frete),
    });
    const { data, error } = dados.id
      ? await supabase.from("pedidos").update(dados).eq("id", dados.id).select("id, numero").single()
      : await supabase.from("pedidos").insert(dados).select("id, numero").single();
    if (error) throw error;
    if (!p.id) setP((x) => ({ ...x, id: data.id, numero: data.numero, status: x.status ?? "orcamento" }));

    // Grava só o que mudou nos itens (o histórico do pedido mostra o que foi incluído, alterado e removido)
    const linha = (i: Item) => ({
      pedido_id: data.id, produto_id: i.produto_id, descricao: i.descricao,
      quantidade: i.quantidade, valor_unitario: i.valor_unitario, numero_serie: i.numero_serie || null,
      kit_escolha: i.kit_escolha?.length ? i.kit_escolha : null,
    });
    const { data: atuais, error: lerErr } = await supabase.from("pedido_itens").select("id").eq("pedido_id", data.id);
    if (lerErr) throw lerErr;
    const manter = new Set(itens.filter((i: Item) => i.id).map((i: Item) => i.id));
    const remover = (atuais ?? []).map((x: { id: string }) => x.id).filter((id: string) => !manter.has(id));
    if (remover.length) {
      const { error } = await supabase.from("pedido_itens").delete().in("id", remover);
      if (error) throw error;
    }
    for (const i of itens.filter((i: Item) => i.id && (atuais ?? []).some((x: { id: string }) => x.id === i.id))) {
      const { error } = await supabase.from("pedido_itens").update(linha(i)).eq("id", i.id!);
      if (error) throw error;
    }
    const novos = itens.filter((i: Item) => !i.id || !(atuais ?? []).some((x: { id: string }) => x.id === i.id));
    if (novos.length) {
      const { data: criados, error } = await supabase.from("pedido_itens").insert(novos.map(linha)).select("id");
      if (error) throw error;
      // os itens novos ganham o id (salvar de novo não duplica)
      let k = 0;
      const comId = itens.map((i: Item) => (!i.id || !(atuais ?? []).some((x: { id: string }) => x.id === i.id) ? { ...i, id: criados?.[k++]?.id } : i));
      setP((x) => ({ ...x, itens: comId }));
    }
    return data.id;
  }

  const salvar = (e: FormEvent) => { e.preventDefault(); executar(gravar, "Pedido salvo"); };

  const aprovar = () => executar(async () => {
    const id = await gravar();
    const { error } = await supabase.rpc("aprovar_pedido", { p_pedido: id });
    if (error) throw error;
    // NF-e automática: emite já, se o cadastro estiver ok (senão o aviso aparece e dá para emitir depois)
    if (cfg?.nfe_automatica) {
      const lista = conferirPedido({ cliente, unidade: unidades.find((u) => u.id === (p as any).unidade_id), produtos, itens: p.itens, aliquotasUf: ufsIcms.map((u) => u.uf) });
      if (lista.some((x) => x.nivel === "erro")) notify(`NF-e automática não enviada: ${lista.find((x) => x.nivel === "erro")!.texto}`, "erro");
      // em homologação a nota automática sairia só como teste: não emite sozinha
      else if ((await ambienteNfe().catch(() => "producao")) !== "producao") notify("NF-e automática não enviada: o ERP está em homologação (teste). Ajuste o FOCUS_NFE_ENV para producao.", "erro");
      else await callFunction("nfe-emitir", { pedido_id: id }).catch((e) => notify(`NF-e automática: ${(e as Error).message}`, "erro"));
    }
  }, cfg?.nfe_automatica ? "Venda aprovada: estoque baixado, parcelas geradas e NF-e enviada" : "Pedido aprovado: estoque baixado e parcelas geradas no financeiro");

  const cancelar = () => {
    if (!confirm("Cancelar este pedido? O estoque será devolvido e as parcelas em aberto canceladas.")) return;
    executar(async () => {
      const { error } = await supabase.rpc("cancelar_pedido", { p_pedido: p.id });
      if (error) throw error;
    }, "Pedido cancelado");
  };

  async function editarAprovado(motivo: string) {
    const dados = { vendedor_id: p.vendedor_id ?? "", comissao_percentual: p.comissao_percentual ?? "", origem: p.origem, observacoes: p.observacoes ?? "" };
    const { error } = await supabase.rpc("editar_pedido_aprovado", { p_pedido: p.id, p_dados: dados, p_motivo: motivo });
    if (error) throw error;
    setSalvo({ vendedor_id: p.vendedor_id ?? null, comissao_percentual: p.comissao_percentual ?? null, origem: p.origem, observacoes: p.observacoes ?? null });
    notify("Pedido alterado (comissões refeitas, se mudou o vendedor ou o %)");
    invalidate("pedidos", "comissoes", "auditoria");
  }

  async function reabrir(motivo: string) {
    const { error } = await supabase.rpc("reabrir_pedido", { p_pedido: p.id, p_motivo: motivo });
    if (error) throw error;
    const { data } = await supabase.from("pedidos").select(SELECT).eq("id", p.id!).single();
    if (data) setP({ ...(data as any), itens: (data as any).itens ?? [] });
    notify("Pedido reaberto: agora é orçamento. Altere e aprove de novo.");
    invalidate("pedidos", "produtos", "contas_receber", "comissoes", "auditoria", "expedicoes");
  }

  const entregar = () => executar(async () => {
    const { error } = await supabase.from("pedidos").update({ status: "entregue" }).eq("id", p.id!);
    if (error) throw error;
  }, "Pedido marcado como entregue");

  const emitirNfe = (conferido = false) => {
    if (!conferido) {
      // Compliance: confere cadastro antes de mandar para a SEFAZ (evita rejeição)
      const lista = conferirPedido({ cliente, unidade: unidades.find((u) => u.id === (p as any).unidade_id), produtos, itens: p.itens, aliquotasUf: ufsIcms.map((u) => u.uf) });
      if (lista.length) return setPendencias(lista);
    }
    setPendencias(null);
    executar(async () => {
      if (!(await confirmarSeTeste())) throw new Error("Emissão cancelada: ambiente de teste");
      await callFunction("nfe-emitir", { pedido_id: p.id });
    }, "NF-e enviada para a SEFAZ. Acompanhe em Notas fiscais.");
  };

  const mensagemWhats = () => {
    const linhas = p.itens.map((i) => `• ${i.quantidade}x ${i.descricao} — ${brl(i.quantidade * i.valor_unitario)}`);
    return [
      `Olá ${cliente?.nome.split(" ")[0] ?? ""}! Segue ${p.status === "orcamento" ? "o orçamento" : "o pedido"}${p.numero ? ` #${p.numero}` : ""} da *MF Máquinas*:`,
      "", ...linhas, "",
      Number(p.desconto) ? `Desconto: ${brl(p.desconto)}` : "",
      Number(p.frete) ? `Frete: ${brl(p.frete)}` : "",
      `*Total: ${brl(total)}*`,
      `Pagamento: ${FORMAS.find((f) => f.value === p.forma_pagamento)?.label}${Number(p.parcelas) > 1 ? ` em ${p.parcelas}x` : ""}`,
    ].filter((l) => l !== "").join("\n");
  };

  async function montarPdf(): Promise<Blob | null> {
    if (!cfg || !p.itens.length) return null;
    const garantias: Record<string, number> = {};
    for (const i of p.itens) {
      const prod = produtos.find((x) => x.id === i.produto_id);
      if (prod?.tipo === "maquina") garantias[i.produto_id] = prod.garantia_meses ?? cfg.garantia_meses_padrao;
    }
    return pdfOrcamento({
      numero: p.numero, status: p.status, cliente, itens: p.itens, desconto: Number(p.desconto || 0), frete: Number(p.frete || 0),
      forma_pagamento: p.forma_pagamento ?? "boleto", parcelas: Number(p.parcelas || 1), observacoes: p.observacoes,
      vendedor: vendedores.find((v) => v.id === p.vendedor_id)?.nome ?? p.vendedor, garantias, validade: p.proposta_validade,
    }, cfg);
  }
  async function gerarPdf() {
    if (!p.itens.length) return notify("Adicione itens antes de gerar o PDF", "erro");
    try { setPdf(await montarPdf()); } catch (e) { notifyError(e); }
  }
  async function pdfBase64() {
    const b = await montarPdf();
    if (!b) return null;
    const bytes = new Uint8Array(await b.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function recarregar() {
    invalidate("pedidos");
    const id = p.id ?? (await supabase.from("pedidos").select("id").eq("proposta_token", p.proposta_token ?? "").maybeSingle()).data?.id;
    if (!id) return;
    const { data } = await supabase.from("pedidos").select("*").eq("id", id).single();
    if (data) setP((x) => ({ ...x, ...data, itens: x.itens }));
  }

  const temNotaValida = p.notas?.some((n) => n.ambiente !== "homologacao" && (n.status === "autorizada" || n.status === "processando"));

  return (
    <Modal open onClose={onClose} title={p.id ? `Pedido #${p.numero}` : "Novo pedido"} wide>
      <form onSubmit={salvar} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {p.status && <Badge value={p.status} />}
          {p.id && <Tabs value={aba} onChange={setAba} options={[{ value: "pedido", label: "Pedido" }, { value: "frete", label: "Frete e envio" }, { value: "auditoria", label: "Auditoria" }]} />}
        </div>

        {aba === "frete" && p.id && (
          <FreteVenda pedido={{ ...(p as any), cliente, itens: p.itens }} onAlterado={(patch) => set(patch as Partial<Pedido>)} />
        )}

        {aba === "auditoria" && p.id && (
          <AuditoriaPedido pedido={{ ...(p as any), itens: p.itens }} produtos={produtos}
            baseComissao={vendedores.find((v) => v.id === p.vendedor_id)?.base ?? null} />
        )}

        {aba === "pedido" && ajustavel && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            Pedido {p.status}: vendedor, comissão, origem e observações podem ser alterados (pede o motivo, que fica na auditoria).
            {temNotaValida
              ? " Itens, valores e pagamento já estão na NF-e autorizada: para mudar, cancele a nota ou emita uma NF de devolução."
              : <> Para mudar itens, valores ou pagamento, use <b>Reabrir pedido</b>: o estoque volta, as parcelas em aberto são canceladas e o pedido vira orçamento de novo.</>}
          </div>
        )}

        {aba === "pedido" && (<>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Cliente" className="sm:col-span-2">
            <select className="input" value={p.cliente_id ?? ""} disabled={!editavel} onChange={(e) => set({ cliente_id: e.target.value })} required>
              <option value="">Selecione…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{rotuloCliente(c)}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2"><CampoUnidade value={(p as any).unidade_id} disabled={!editavel} onChange={(v) => set({ unidade_id: v } as Partial<Pedido>)} /></div>
          <Field label="Origem">
            <select className="input" value={p.origem} disabled={!livre} onChange={(e) => set({ origem: e.target.value })}>
              <option value="whatsapp">WhatsApp</option>
              <option value="telefone">Telefone</option>
              <option value="presencial">Presencial</option>
              <option value="representante">Representante</option>
              <option value="loja">Loja virtual</option>
            </select>
          </Field>
          <Field label="Vendedor / representante">
            <VendedorSelect value={p.vendedor_id} textoAntigo={p.vendedor} disabled={!livre}
              onChange={(id, nome) => set({ vendedor_id: id, vendedor: nome, comissao_percentual: null })} />
          </Field>
          {p.vendedor_id && (
            <Field label="Comissão (%)">
              <input className="input" inputMode="decimal" disabled={!livre} value={p.comissao_percentual ?? ""} placeholder={String(vendedores.find((v) => v.id === p.vendedor_id)?.percentual ?? "")}
                onChange={(e) => set({ comissao_percentual: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} />
            </Field>
          )}
        </div>

        <ItensEditor itens={p.itens} onChange={(itens) => set({ itens } as any)} disabled={!editavel} comSerie filtro={(x) => x.vendavel !== false} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="Pagamento" className="col-span-2">
            <select className="input" value={(p as any).forma_pagamento_id ?? `meio:${p.forma_pagamento}`} disabled={!editavel} onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("meio:")) return set({ forma_pagamento: v.slice(5), forma_pagamento_id: null } as any);
              const f = formasVenda.find((x) => x.id === v);
              if (f) set({ forma_pagamento_id: f.id, forma_pagamento: f.meio, parcelas: f.parcelas, intervalo_dias: f.intervalo_dias, primeiro_vencimento: somarDias(f.primeiro_em_dias) } as any);
            }}>
              {formasVenda.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              {(!(p as any).forma_pagamento_id || !formasVenda.length) && <option value={`meio:${p.forma_pagamento}`}>{FORMAS.find((f) => f.value === p.forma_pagamento)?.label ?? p.forma_pagamento}</option>}
              {!formasVenda.length && FORMAS.filter((f) => f.value !== p.forma_pagamento).map((f) => <option key={f.value} value={`meio:${f.value}`}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Parcelas">
            <input className="input" type="number" min={1} max={24} value={p.parcelas} disabled={!editavel} onChange={(e) => set({ parcelas: Number(e.target.value) })} />
          </Field>
          <Field label="1º vencimento">
            <input className="input" type="date" value={p.primeiro_vencimento ?? ""} disabled={!editavel} onChange={(e) => set({ primeiro_vencimento: e.target.value })} />
          </Field>
          <Field label="Desconto (R$)">
            <input className="input" type="number" step="0.01" min={0} value={p.desconto} disabled={!editavel} onChange={(e) => set({ desconto: Number(e.target.value) })} />
          </Field>
          <Field label="Frete (R$)">
            <input className="input" type="number" step="0.01" min={0} value={p.frete} disabled={!editavel} onChange={(e) => set({ frete: Number(e.target.value) })} />
          </Field>
          <Field label="Frete por conta" className="col-span-2">
            <select className="input" value={p.modalidade_frete} disabled={!editavel} onChange={(e) => set({ modalidade_frete: Number(e.target.value) })}>
              <option value={9}>Sem frete</option>
              <option value={0}>Emitente (MF Máquinas)</option>
              <option value={1}>Destinatário (cliente)</option>
            </select>
          </Field>
          <Field label="Observações" className="col-span-2 sm:col-span-4">
            <input className="input" value={p.observacoes ?? ""} disabled={!livre} onChange={(e) => set({ observacoes: e.target.value })} />
          </Field>
        </div>

        <div className="text-right text-sm text-slate-600">
          Subtotal {brl(subtotal)} · <span className="num text-xl font-bold text-fg">Total {brl(total)}</span>
        </div>

        {p.itens.length > 0 && (p.status === "orcamento" || !p.id || p.proposta_status) && (
          <PropostaPainel pedido={p} cliente={cliente} podeEditar={podeEditar} gravar={gravar} pdfBase64={pdfBase64} onAlterado={recarregar} />
        )}
        {p.id && <Anexos entidade="pedido" id={p.id} />}

        </>)}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {p.itens.length > 0 && (
            <Button type="button" variant="ghost" onClick={gerarPdf}><FileDown size={16} /> PDF {p.status && p.status !== "orcamento" ? "do pedido" : "do orçamento"}</Button>
          )}
          {cliente?.whatsapp && p.itens.length > 0 && (
            <a href={whatsappLink(cliente.whatsapp, mensagemWhats())} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-green-600 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50">
              <MessageCircle size={16} /> Enviar no WhatsApp
            </a>
          )}
          {podeEditar && p.id && p.status !== "cancelado" && !temNotaValida && (
            <Button type="button" variant="secondary" onClick={cancelar} disabled={ocupado}><XCircle size={16} /> Cancelar pedido</Button>
          )}
          {pode("emitir_nfe") && (p.status === "aprovado" || p.status === "entregue") && !temNotaValida && (
            <Button type="button" variant="secondary" onClick={() => emitirNfe()} disabled={ocupado}><FileText size={16} /> Emitir NF-e</Button>
          )}
          {p.id && ["aprovado", "faturado", "entregue"].includes(p.status ?? "") && (
            <Button type="button" variant="secondary" title="Conferir, editar e imprimir as etiquetas de transporte e de volume"
              onClick={() => etiquetas.abrir({ tipo: "pedido", pedido_id: p.id! })}><Printer size={16} /> Etiquetas</Button>
          )}
          {podeEditar && (p.status === "aprovado" || p.status === "faturado") && (
            <Button type="button" variant="secondary" onClick={entregar} disabled={ocupado}><Truck size={16} /> Marcar entregue</Button>
          )}
          {ajustavel && !temNotaValida && (
            <Button type="button" variant="secondary" onClick={() => setAcaoMotivo("reabrir")} disabled={ocupado}><RotateCcw size={16} /> Reabrir pedido</Button>
          )}
          {ajustavel && alterado && (
            <Button type="button" onClick={() => setAcaoMotivo("editar")} disabled={ocupado}><Pencil size={16} /> Salvar alterações</Button>
          )}
          {editavel && <Button disabled={ocupado} variant="secondary">Salvar orçamento</Button>}
          {editavel && (
            <Button type="button" onClick={aprovar} disabled={ocupado}><CheckCircle2 size={16} /> Aprovar venda</Button>
          )}
        </div>
      </form>
      {pendencias && (
        <Modal open onClose={() => setPendencias(null)} title="Conferência fiscal antes de emitir">
          <ul className="space-y-1.5 text-sm">
            {pendencias.map((x, i) => (
              <li key={i} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.nivel === "erro" ? "bg-red-500" : "bg-amber-500"}`} />{x.texto}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-600">
            {pendencias.some((x) => x.nivel === "erro") ? "Corrija os itens em vermelho (no cadastro do cliente, do produto ou da unidade) e tente de novo: a SEFAZ rejeitaria a nota." : "São só alertas. Confira e, se estiver certo, emita assim mesmo."}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendencias(null)}>Voltar</Button>
            {!pendencias.some((x) => x.nivel === "erro") && <Button type="button" onClick={() => emitirNfe(true)}>Emitir mesmo assim</Button>}
          </div>
        </Modal>
      )}
      {etiquetas.modal}
      {acaoMotivo === "editar" && (
        <MotivoAcao titulo={`Alterar pedido #${p.numero}`} rotulo="Salvar alterações" onConfirmar={editarAprovado} onClose={() => setAcaoMotivo(null)}>
          <p>O pedido já foi aprovado. A alteração fica na auditoria do pedido com o seu nome e o motivo.</p>
          {(p.vendedor_id ?? null) !== (salvo.vendedor_id ?? null) || (p.comissao_percentual ?? null) !== (salvo.comissao_percentual ?? null)
            ? <p>As comissões deste pedido que ainda não foram pagas são refeitas com o vendedor e o percentual novos.</p> : null}
        </MotivoAcao>
      )}
      {acaoMotivo === "reabrir" && (
        <MotivoAcao titulo={`Reabrir pedido #${p.numero}`} rotulo="Reabrir pedido" perigo onConfirmar={reabrir} onClose={() => setAcaoMotivo(null)}>
          <p>O pedido volta a ser orçamento para você mudar itens, valores e pagamento. Ao reabrir:</p>
          <ul className="list-disc pl-5">
            <li>o estoque que saiu volta;</li>
            <li>as parcelas em aberto no contas a receber são canceladas (novas são geradas ao aprovar de novo);</li>
            <li>as comissões ainda não pagas são canceladas.</li>
          </ul>
          <p>Não reabre se houver NF-e válida, parcela recebida ou comissão já paga.</p>
        </MotivoAcao>
      )}
      {pdf && (
        <PdfViewer blob={pdf} nome={`${p.status && p.status !== "orcamento" ? "pedido" : "orcamento"}-${p.numero ?? "rascunho"}-mf-maquinas.pdf`}
          titulo={p.numero ? `${p.status === "orcamento" ? "Orçamento" : "Pedido"} #${p.numero}` : "Orçamento (rascunho)"} onClose={() => setPdf(null)} />
      )}
    </Modal>
  );
}
