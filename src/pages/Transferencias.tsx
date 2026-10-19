// Transferências de mercadoria entre a matriz (SC) e a filial (SP):
// rascunho → enviada (sai do estoque da origem, emite NF-e) → recebida (entra no destino).
// Antes de emitir, a conferência fiscal (cBenef, custo, cadastro) para o que a SEFAZ rejeitaria.
// Com a NF-e autorizada, o destino dá a entrada ligada à nota: estoque + livro de entradas (CFOP de entrada e crédito do ICMS).
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, ArrowRight, BookCheck, ExternalLink, FilePen, FileText, PackageCheck, Plus, Send, Trash2, Truck, X } from "lucide-react";
import { Badge, Button, CelulaAbrir, Field, Modal, PageHeader, Section, Table } from "@/components/ui";
import { Colunas, Ranking } from "@/components/Charts";
import { CartaoPainel, type Cartao } from "@/components/painel/Painel";
import { useInvalidate, useRows } from "@/lib/data";
import { sincronizarItens } from "@/lib/itens";
import { brl, dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { usePerfil } from "@/lib/auth";
import { useUnidade, type Unidade } from "@/lib/unidade";
import { conferirProduto, conferirUnidade, type Pendencia } from "@/lib/compliance";
import type { Produto } from "@/lib/types";
import { confirmar } from "@/components/Dialogos";
import { Conferencia } from "@/components/EmitirNfe";
import { type ItemBase, itemDoCadastro, itensTransferencia, type RegraTributaria, type UnidadeFiscal } from "../../supabase/functions/_shared/nfe-impostos";
import { pendenciasTransferencia, resumoEntradaTransferencia } from "../../supabase/functions/_shared/nfe-transferencia";
import { explicarRejeicao } from "../../supabase/functions/_shared/nfe-conferencia";

type Item = { id?: string; produto_id: string; descricao: string; quantidade: number; custo_unitario: number; numero_serie?: string | null };
type Transf = {
  id: string; numero: number; origem_id: string; destino_id: string; status: string; observacoes: string | null;
  enviada_em: string | null; recebida_em: string | null; created_at: string; itens?: Item[];
};
type Nota = {
  id: string; transferencia_id: string | null; status: string; numero: string | null; chave: string | null; ambiente: string | null;
  danfe_url: string | null; mensagem: string | null; created_at: string; payload?: { items?: Record<string, any>[] } | null;
};
type Recebida = { id: string; chave: string; transferencia_id?: string | null; estoque_lancado: boolean; processamento: string | null; cfop_entrada?: string | null; icms_credito?: number | null };
type Saldo = { produto_id: string; unidade_id: string; quantidade: number };

/** Produto do cadastro no formato do cálculo da nota (o mesmo que a função usa). */
const itemDaTela = (p: Produto | undefined, i: Item): ItemBase =>
  itemDoCadastro(p ?? { id: i.produto_id, tipo: "peca" }, i.descricao, Number(i.quantidade), Number(i.custo_unitario) || Number(p?.preco_custo) || 0.01);

export default function Transferencias() {
  const { pode } = usePerfil();
  const { unidades, atual, nome } = useUnidade();
  const { data: lista = [], isLoading } = useRows<Transf>("transferencias", { select: "*, itens:transferencia_itens(*)" });
  const { data: notas = [] } = useRows<Nota>("notas_fiscais", { key: ["transf"], filtro: (q) => q.not("transferencia_id", "is", null) });
  const [aberta, setAberta] = useState<Partial<Transf> | null>(null);
  const podeEditar = pode("editar_producao") || pode("movimentar_estoque");

  const visiveis = atual ? lista.filter((t) => t.origem_id === atual || t.destino_id === atual) : lista;
  const nova = () => {
    const origem = atual ?? unidades.find((u) => u.matriz)?.id ?? unidades[0]?.id;
    setAberta({ origem_id: origem, destino_id: unidades.find((u) => u.id !== origem)?.id, status: "rascunho", itens: [] });
  };

  return (
    <div>
      <PageHeader title="Transferências SC ↔ SP" subtitle="Máquinas e peças que vão de uma unidade para a outra, com NF-e de transferência."
        actions={podeEditar && unidades.length > 1 && <Button onClick={nova}><Plus size={16} /> Nova transferência</Button>} />
      {unidades.length < 2 && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Cadastre a segunda unidade em Configurações → Unidades.</p>}
      {lista.length > 0 && <PainelTransf lista={visiveis} nome={nome} />}
      <Table empty={!isLoading && !visiveis.length}
        head={<><th className="th">Nº</th><th className="th">De → para</th><th className="th">Itens</th><th className="th">Situação</th><th className="th">NF-e</th><th className="th">Data</th><th className="th" /></>}>
        {visiveis.map((t) => {
          const nf = notas.filter((n) => !!n.transferencia_id && n.transferencia_id === t.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          return (
            <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberta({ ...t, itens: t.itens ?? [] })}>
              <td className="td font-bold text-fg">#{t.numero}</td>
              <td className="td"><span className="inline-flex items-center gap-1.5 font-semibold">{nome(t.origem_id)} <ArrowRight size={14} className="text-slate-400" /> {nome(t.destino_id)}</span></td>
              <td className="td text-slate-600">{(t.itens ?? []).map((i) => `${Number(i.quantidade)}× ${i.descricao}`).join(", ")}</td>
              <td className="td"><Badge value={t.status === "enviada" ? "em_transito" : t.status} /></td>
              <td className="td">{nf ? <Badge value={nf.status} /> : <span className="text-slate-400">—</span>}</td>
              <td className="td num">{dataBR(t.enviada_em ?? t.created_at)}</td>
              <CelulaAbrir texto="Ver / editar" />
            </tr>
          );
        })}
      </Table>
      {aberta && <TransfModal inicial={aberta} todasNotas={notas} onClose={() => setAberta(null)} podeEditar={podeEditar} />}
    </div>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const valorTransf = (t: Transf) => (t.itens ?? []).reduce((v, i) => v + Number(i.quantidade) * (Number(i.custo_unitario) || 0), 0);

/** Painel do topo: o que está no caminho, o que falta enviar, quanto foi transferido no mês e mês a mês por sentido. */
function PainelTransf({ lista, nome }: { lista: Transf[]; nome: (id: string | null | undefined) => string }) {
  const validas = lista.filter((t) => t.status !== "cancelada");
  const mes = hoje().slice(0, 7);
  const transito = validas.filter((t) => t.status === "enviada");
  const rascunhos = validas.filter((t) => t.status === "rascunho");
  const doMes = validas.filter((t) => t.status !== "rascunho" && (t.enviada_em ?? t.created_at).startsWith(mes));
  const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.parse(mes + "-15T12:00:00Z")); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return d.toISOString().slice(0, 7); });
  const sentidos = [...new Set(validas.map((t) => `${t.origem_id}>${t.destino_id}`))].slice(0, 2);
  const porItem = [...validas.filter((t) => t.status !== "rascunho").flatMap((t) => t.itens ?? [])
    .reduce((m, i) => m.set(i.descricao, (m.get(i.descricao) ?? 0) + Number(i.quantidade)), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  const cartoes: Cartao[] = [
    { id: "transito", rotulo: "Em trânsito", valor: transito.length, sub: transito.length ? `${brl(transito.reduce((v, t) => v + valorTransf(t), 0))} a caminho` : "nada na estrada", icone: Truck, cor: "var(--kpi-laranja)" },
    { id: "rascunho", rotulo: "Falta enviar", valor: rascunhos.length, sub: "rascunhos sem NF-e", icone: FilePen, cor: "var(--kpi-roxo)" },
    { id: "mes", rotulo: "Transferido no mês", valor: brl(doMes.reduce((v, t) => v + valorTransf(t), 0)), sub: `${doMes.length} ${doMes.length === 1 ? "transferência" : "transferências"} · pelo custo`, icone: ArrowLeftRight, cor: "var(--serie-1)" },
    { id: "recebidas", rotulo: "Recebidas", valor: validas.filter((t) => t.status === "recebida").length, sub: "entrada lançada no destino", icone: PackageCheck, cor: "var(--kpi-verde)" },
  ];
  return (
    <div className="mb-5 space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cartoes.map((c) => <CartaoPainel key={c.id} c={c} />)}</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Transferido mês a mês (pelo custo)" className="min-w-0 xl:col-span-3">
          <Colunas altura={220} vazio="Sem transferências nesses meses." dados={meses.map((m) => ({ rotulo: `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`,
            valores: sentidos.map((sx) => validas.filter((t) => t.status !== "rascunho" && `${t.origem_id}>${t.destino_id}` === sx && (t.enviada_em ?? t.created_at).startsWith(m)).reduce((v, t) => v + valorTransf(t), 0)) }))}
            series={sentidos.map((sx, i) => { const [a, b] = sx.split(">"); return { nome: `${nome(a)} → ${nome(b)}`, cor: i ? "var(--kpi-laranja)" : "var(--serie-1)" }; })} />
        </Section>
        <Section title="O que mais vai e volta" className="min-w-0 xl:col-span-2">
          <Ranking cor="var(--kpi-roxo)" formatar={(v) => `${v.toLocaleString("pt-BR")} un.`} vazio="Nenhum item enviado ainda."
            itens={porItem.map(([d, q]) => ({ rotulo: d, valor: q }))} />
        </Section>
      </div>
    </div>
  );
}

/** Rejeição da SEFAZ (ou a conferência do servidor) em português claro, com o que fazer. */
function MotivoRecusa({ mensagem }: { mensagem: string }) {
  // rejeição da SEFAZ (a nota foi enviada); o resto é a conferência do ERP, que já vem explicada
  const sefaz = /^(nf-e não autorizada|rejei|denegad)/i.test(mensagem.trim());
  const e = sefaz ? explicarRejeicao(mensagem.replace(/^NF-e não autorizada:\s*/i, "")) : null;
  return (
    <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      <p className="flex items-start gap-1.5 font-semibold"><AlertTriangle size={16} className="mt-0.5 shrink-0" />
        {e ? `A SEFAZ recusou a nota: ${e.titulo.toLowerCase()}${e.item ? ` (item ${e.item})` : ""}` : "A nota não foi enviada"}</p>
      <p className="mt-1">{e ? e.oQueFazer : mensagem}</p>
      {e && <p className="mt-1 text-xs text-red-700/80">Mensagem da SEFAZ: {e.original}</p>}
    </div>
  );
}

function TransfModal({ inicial, todasNotas, onClose, podeEditar }: { inicial: Partial<Transf>; todasNotas: Nota[]; onClose: () => void; podeEditar: boolean }) {
  const { unidades, nome } = useUnidade();
  const invalidar = useInvalidate();
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: saldos = [] } = useRows<Saldo>("estoque_unidade", { order: "produto_id" });
  const { data: regras = [] } = useRows<RegraTributaria>("regras_tributacao", { order: "prioridade", ascending: true });
  const [t, setT] = useState(inicial);
  const [itens, setItens] = useState<Item[]>(inicial.itens ?? []);
  const [ocupado, setOcupado] = useState(false);
  const [conferindo, setConferindo] = useState<Pendencia[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const rascunho = !t.id || t.status === "rascunho";
  const editavel = rascunho && podeEditar;
  const saldo = (produto: string, unidade?: string) => Number(saldos.find((s) => s.produto_id === produto && s.unidade_id === unidade)?.quantidade ?? 0);
  const total = useMemo(() => itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.custo_unitario), 0), [itens]);
  const notas = t.id ? todasNotas.filter((n) => n.transferencia_id === t.id) : [];
  const ultimaNota = [...notas].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const origem = unidades.find((u) => u.id === t.origem_id);
  const destino = unidades.find((u) => u.id === t.destino_id);
  const produto = (id: string) => produtos.find((p) => p.id === id);

  // nota autorizada em produção: a que vale para a entrada no destino
  const notaValida = notas.filter((n) => n.status === "autorizada" && n.ambiente !== "homologacao" && n.chave).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const { data: recebidas = [] } = useRows<Recebida>("nfe_recebidas", {
    key: ["transf", notaValida?.chave ?? "-"], filtro: (q) => q.eq("chave", notaValida?.chave ?? "-"),
  });
  const recebida = recebidas[0];
  const entradaFeita = !!recebida && recebida.transferencia_id === t.id;

  // prévia do que vai na nota (mesmo cálculo da função): CFOP e ICMS de cada item
  const previa = useMemo(() => {
    if (!origem || !destino?.uf || !itens.length) return [];
    try {
      return itensTransferencia(origem as unknown as UnidadeFiscal, destino.uf, itens.map((i) => itemDaTela(produto(i.produto_id), i)),
        { regras: regras.filter((r) => r.ativo !== false && (!r.unidade_id || r.unidade_id === origem.id)), unidade_id: origem.id }) as Record<string, any>[];
    } catch { return []; }
  }, [origem, destino, itens, regras, produtos]); // eslint-disable-line react-hooks/exhaustive-deps

  const entrada = useMemo(() => (notaValida?.payload?.items?.length && destino
    ? resumoEntradaTransferencia(notaValida.payload.items, destino, notaValida.payload.items.map((x) => produtos.find((p) => p.sku === x.codigo_produto)?.tipo))
    : null), [notaValida, destino, produtos]);

  function adicionar(id: string) {
    const p = produto(id);
    if (!p || itens.some((i) => i.produto_id === id)) return;
    setItens([...itens, { produto_id: p.id, descricao: p.descricao, quantidade: 1, custo_unitario: Number(p.preco_custo) || 0 }]);
  }

  async function salvar(): Promise<string | null> {
    if (t.origem_id === t.destino_id) { notify("Origem e destino precisam ser diferentes", "erro"); return null; }
    if (!itens.length) { notify("Adicione ao menos um item", "erro"); return null; }
    const dados = { origem_id: t.origem_id, destino_id: t.destino_id, observacoes: t.observacoes || null };
    const { data, error } = t.id
      ? await supabase.from("transferencias").update(dados).eq("id", t.id).select("id, numero").single()
      : await supabase.from("transferencias").insert(dados).select("id, numero").single();
    if (error) throw error;
    // atualiza o que continua, grava o que entrou e só no fim tira o que saiu (nada some se a internet cair)
    const ids = await sincronizarItens("transferencia_itens", "transferencia_id", data.id, itens, (i) => ({
      produto_id: i.produto_id, descricao: i.descricao, quantidade: Number(i.quantidade),
      custo_unitario: Number(i.custo_unitario) || 0, numero_serie: i.numero_serie || null,
    }), { chaveNatural: "produto_id" });
    setItens(itens.map((i, k) => ({ ...i, id: ids[k] || i.id })));
    setT({ ...t, id: data.id, numero: data.numero, status: t.status ?? "rascunho" });
    invalidar("transferencias");
    return data.id;
  }

  async function acao(fn: () => Promise<void>) {
    setOcupado(true);
    try { await fn(); } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const rpc = (nomeRpc: string, id: string, msg: string, status: string) => acao(async () => {
    const { error } = await supabase.rpc(nomeRpc, { p_transf: id });
    if (error) throw error;
    setT((x) => ({ ...x, status }));
    invalidar("transferencias", "produtos", "estoque_unidade");
    notify(msg);
  });

  /** Conferência antes de emitir: cadastro das unidades e dos produtos, cBenef, CST e custo. */
  function conferir(): Pendencia[] {
    const lista: Pendencia[] = [...conferirUnidade(origem as Unidade | undefined), ...conferirUnidade(destino as Unidade | undefined)];
    const vistos = new Set<string>();
    for (const i of itens) {
      const p = produto(i.produto_id);
      if (!p || vistos.has(p.id)) continue;
      vistos.add(p.id);
      lista.push(...conferirProduto(p, !!origem?.fabrica).filter((x) => !x.texto.includes("sem preço")));
    }
    if (origem) lista.push(...pendenciasTransferencia({ origem, itens: previa, custos: itens.map((i) => ({ descricao: i.descricao, custo: Number(i.custo_unitario) || Number(produto(i.produto_id)?.preco_custo) || 0 })) }));
    return lista;
  }

  const emitirNota = (conferido = false) => acao(async () => {
    if (!conferido) {
      const lista = conferir();
      if (lista.length) { setConferindo(lista); return; }
    }
    setConferindo(null);
    if (!(await confirmarSeTeste())) throw new Error("Emissão cancelada: ambiente de teste");
    setFalha(null);
    try {
      const r = await callFunction("nfe-emitir", { transferencia_id: t.id });
      notify(r?.ok === false ? "A nota voltou com erro: veja o que fazer na transferência" : "NF-e de transferência enviada para a SEFAZ");
    } catch (e) {
      setFalha((e as Error).message);
    } finally {
      invalidar("notas_fiscais");
    }
  });

  const darEntrada = () => acao(async () => {
    const { data, error } = await supabase.rpc("receber_transferencia_nfe", { p_transf: t.id });
    if (error) throw error;
    const r = (data ?? {}) as { estoque?: boolean; cfop_entrada?: string; icms_credito?: number; aviso?: string | null };
    if (t.status === "enviada") setT((x) => ({ ...x, status: "recebida" }));
    invalidar("transferencias", "produtos", "estoque_unidade", "nfe_recebidas");
    notify(r.aviso ?? `${r.estoque ? `Entrou no estoque de ${nome(t.destino_id)} e a` : "A"} nota foi para o livro de entradas (CFOP ${r.cfop_entrada ?? "—"}${Number(r.icms_credito) > 0 ? `, crédito de ICMS ${brl(Number(r.icms_credito))}` : ""}).`, r.aviso ? "erro" : undefined);
  });

  if (conferindo) return <Conferencia titulo={`transferência #${t.numero ?? ""}`} pendencias={conferindo} onVoltar={() => setConferindo(null)} onEmitir={() => emitirNota(true)} />;

  return (
    <Modal open wide onClose={onClose} title={t.id ? `Transferência #${t.numero}` : "Nova transferência"}>
      <div className="space-y-4">
        {t.id && <div className="flex flex-wrap items-center gap-2"><Badge value={t.status === "enviada" ? "em_transito" : t.status} />
          {ultimaNota && <span className="text-sm text-slate-500">NF-e {ultimaNota.numero ?? ""} <Badge value={ultimaNota.status} /></span>}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label="Sai de">
            <select className="input" value={t.origem_id ?? ""} disabled={!editavel} onChange={(e) => setT({ ...t, origem_id: e.target.value })}>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
          <ArrowRight className="mx-auto hidden text-slate-400 sm:block" />
          <Field label="Vai para">
            <select className="input" value={t.destino_id ?? ""} disabled={!editavel} onChange={(e) => setT({ ...t, destino_id: e.target.value })}>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
        </div>

        {editavel && (
          <Field label="Adicionar produto">
            <select className="input" value="" onChange={(e) => adicionar(e.target.value)}>
              <option value="">Escolha a máquina ou peça…</option>
              {produtos.filter((p) => p.ativo).map((p) => (
                <option key={p.id} value={p.id}>{p.descricao} — tem {saldo(p.id, t.origem_id)} em {nome(t.origem_id)}</option>
              ))}
            </select>
          </Field>
        )}

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {itens.map((i, k) => {
            const tem = saldo(i.produto_id, t.origem_id);
            const falta = rascunho && Number(i.quantidade) > tem;
            const n = previa[k];
            return (
              <li key={i.produto_id} className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[1fr_90px_120px_140px_auto] sm:items-center">
                <div className="col-span-2 sm:col-span-1">
                  <div className="font-semibold text-fg">{i.descricao}</div>
                  <div className={`text-xs ${falta ? "font-semibold text-red-600" : "text-slate-500"}`}>tem {tem} em {nome(t.origem_id)}{falta ? " · não dá para enviar" : ""}</div>
                  {n && <div className="text-xs text-slate-500">CFOP {n.cfop} · ICMS CST {n.icms_situacao_tributaria}{Number(n.icms_valor) > 0 ? ` ${brl(n.icms_valor)}` : ""}{n.codigo_beneficio_fiscal ? ` · cBenef ${n.codigo_beneficio_fiscal}` : ""}{Number(n.ipi_valor) > 0 ? ` · IPI ${brl(n.ipi_valor)}` : ""}</div>}
                </div>
                <Field label="Qtd"><input className="input" type="number" min={1} step="any" value={i.quantidade} disabled={!editavel}
                  onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, quantidade: Number(e.target.value) } : x)))} /></Field>
                <Field label="Custo un. (NF-e)"><input className="input" type="number" min={0} step="0.01" value={i.custo_unitario} disabled={!editavel}
                  onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, custo_unitario: Number(e.target.value) } : x)))} /></Field>
                <Field label="Nº de série"><input className="input" value={i.numero_serie ?? ""} disabled={!editavel}
                  onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, numero_serie: e.target.value } : x)))} /></Field>
                {editavel && <Button type="button" variant="ghost" className="!text-red-600 sm:mt-5" onClick={() => setItens(itens.filter((_, j) => j !== k))} aria-label="Remover"><Trash2 size={16} /></Button>}
              </li>
            );
          })}
          {!itens.length && <li className="p-6 text-center text-sm text-slate-500">Nenhum item ainda.</li>}
        </ul>
        <div className="text-right text-sm text-slate-600">Valor da nota (custo): <b className="num text-fg">{brl(total)}</b></div>
        {editavel && (
          <p className="text-xs text-slate-500">
            O custo vem do cadastro. No que foi comprado, vale a entrada mais recente; no que foi fabricado, a lei soma matéria-prima, material
            secundário, mão de obra e embalagem (LC 87/1996, art. 13, § 4º). O custo da ficha técnica tem só os materiais: confira com o contador.
          </p>
        )}

        <Field label="Observações (saem na nota)">
          <textarea className="input" rows={2} value={t.observacoes ?? ""} disabled={!editavel} onChange={(e) => setT({ ...t, observacoes: e.target.value })} />
        </Field>

        {falha ? <MotivoRecusa mensagem={falha} /> : ultimaNota?.mensagem && ultimaNota.status === "erro" && <MotivoRecusa mensagem={`NF-e não autorizada: ${ultimaNota.mensagem}`} />}

        {notaValida && destino && (
          <div className={`rounded-lg px-3 py-2 text-sm ${entradaFeita ? "bg-emerald-50 text-emerald-900" : "bg-sky-50 text-sky-900"}`}>
            {entradaFeita
              ? <>Entrada registrada no livro de entradas de {destino.nome}: CFOP {recebida?.cfop_entrada ?? entrada?.cfops ?? "—"}
                {Number(recebida?.icms_credito) > 0 ? `, crédito de ICMS ${brl(Number(recebida?.icms_credito))}` : ", sem crédito de ICMS (nota sem destaque)"}.</>
              : <>Entrada em {destino.nome}: CFOP {entrada?.cfops || "—"}{entrada && entrada.icms_credito > 0 ? ` · crédito de ICMS ${brl(entrada.icms_credito)}` : " · sem crédito de ICMS (nota sem destaque)"}
                {entrada && entrada.ipi_destacado > 0 ? ` · IPI destacado ${brl(entrada.ipi_destacado)} (crédito só se ${destino.nome} for equiparada a industrial: confirme com o contador)` : ""}.
                {recebida && !recebida.transferencia_id && " A nota já chegou nas NF-e recebidas (busca da SEFAZ): a entrada liga as duas pela chave, sem duplicar."}
                {recebida?.estoque_lancado && !recebida.transferencia_id && " Atenção: o estoque desta nota já foi lançado pelas NF-e recebidas; a entrada aqui não lança de novo."}</>}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {t.id && podeEditar && ["rascunho", "enviada"].includes(t.status ?? "") && (
            <Button type="button" variant="ghost" className="!text-red-600 mr-auto" disabled={ocupado}
              onClick={async () => (await confirmar("Cancelar a transferência? Se já saiu, volta para o estoque da origem.")) && rpc("cancelar_transferencia", t.id!, "Transferência cancelada", "cancelada")}>
              <X size={16} /> Cancelar
            </Button>
          )}
          {editavel && <Button type="button" variant="secondary" disabled={ocupado} onClick={() => acao(async () => { if (await salvar()) notify("Rascunho salvo"); })}>Salvar rascunho</Button>}
          {editavel && (
            <Button type="button" disabled={ocupado} onClick={() => acao(async () => {
              const id = await salvar();
              if (!id) return;
              const { error } = await supabase.rpc("enviar_transferencia", { p_transf: id });
              if (error) throw error;
              setT((x) => ({ ...x, id, status: "enviada" }));
              invalidar("transferencias", "produtos", "estoque_unidade");
              notify("Enviada: saiu do estoque de " + nome(t.origem_id) + ". Agora emita a NF-e.");
            })}><Send size={16} /> Enviar (baixa da origem)</Button>
          )}
          {t.status && ["enviada", "recebida"].includes(t.status) && podeEditar && (!ultimaNota || ["erro", "cancelada"].includes(ultimaNota.status)) && (
            <Button type="button" variant="secondary" disabled={ocupado} onClick={() => emitirNota()}><FileText size={16} /> Emitir NF-e de transferência</Button>
          )}
          {ultimaNota?.danfe_url && <a href={ultimaNota.danfe_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"><ExternalLink size={15} /> DANFE</a>}
          {podeEditar && notaValida && !entradaFeita && ["enviada", "recebida"].includes(t.status ?? "") && (
            <Button type="button" disabled={ocupado} onClick={darEntrada}>
              {t.status === "enviada" ? <><Truck size={16} /> Chegou em {nome(t.destino_id)}: dar entrada com a NF-e</> : <><BookCheck size={16} /> Registrar a nota no livro de entradas de {nome(t.destino_id)}</>}
            </Button>
          )}
          {t.status === "enviada" && podeEditar && !notaValida && (
            <Button type="button" variant="secondary" disabled={ocupado} onClick={async () => (await confirmar(
              `Esta transferência ainda não tem NF-e autorizada (em produção). Sem ela a entrada não vai para o livro de entradas de ${nome(t.destino_id)} e a mercadoria não deveria viajar. Receber só o estoque assim mesmo?`,
              { titulo: "Receber sem NF-e?", ok: "Receber só o estoque" })) && rpc("receber_transferencia", t.id!, "Recebida: entrou no estoque de " + nome(t.destino_id), "recebida")}>
              <Truck size={16} /> Chegou em {nome(t.destino_id)} (sem NF-e)
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
