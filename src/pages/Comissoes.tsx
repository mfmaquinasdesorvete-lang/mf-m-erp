// Comissões de vendedores e representantes: cadastro, comissões geradas pelas vendas
// (no faturamento ou no recebimento) e pagamento pelo contas a pagar.
import { useMemo, useState, type FormEvent } from "react";
import { FileDown, Pencil, Plus, Printer, Wallet } from "lucide-react";
import { Badge, Button, Card, Field, Modal, PageHeader, Table, Tabs } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje, somarDias } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { useConfig } from "@/lib/useConfig";
import { comUnidade, pdfComissoes } from "@/lib/pdf";
import { useUnidade } from "@/lib/unidade";
import type { Vendedor } from "@/lib/types";

type Comissao = {
  id: string; vendedor_id: string; pedido_id: string; descricao: string; base: number; percentual: number; valor: number;
  status: "a_pagar" | "paga" | "cancelada"; conta_pagar_id: string | null; pago_em: string | null; created_at: string;
  pedido?: { numero: number; cliente?: { nome: string } | null } | null;
};
const ROTULO: Record<string, string> = { a_pagar: "a pagar", paga: "paga", cancelada: "cancelada" };

export default function Comissoes() {
  const { pode, user_id } = usePerfil();
  const financeiro = pode("contas_pagar");
  const [aba, setAba] = useState<"comissoes" | "vendedores">("comissoes");
  return (
    <div>
      <PageHeader title="Comissões" subtitle="Vendedores e representantes: comissão gerada pelas vendas e paga pelo contas a pagar." />
      {financeiro && <Tabs value={aba} onChange={setAba} options={[{ value: "comissoes", label: "Comissões" }, { value: "vendedores", label: "Vendedores e representantes" }]} />}
      {aba === "vendedores" && financeiro ? <Vendedores /> : <ListaComissoes financeiro={financeiro} userId={user_id} />}
    </div>
  );
}

function ListaComissoes({ financeiro, userId }: { financeiro: boolean; userId?: string }) {
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const { data: lista = [], isLoading } = useRows<Comissao>("comissoes", { select: "*, pedido:pedidos(numero, cliente:clientes(nome))" });
  const [vend, setVend] = useState("");
  const [status, setStatus] = useState("a_pagar");
  const [mes, setMes] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pagar, setPagar] = useState(false);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const { data: cfg } = useConfig();
  const { atual, unidades } = useUnidade();
  const nome = (id: string) => vendedores.find((v) => v.id === id)?.nome ?? "—";

  const filtradas = useMemo(() => lista
    .filter((c) => (!vend || c.vendedor_id === vend) && (status === "todas" || c.status === status) && (!mes || c.created_at.startsWith(mes)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [lista, vend, status, mes]);
  const porVendedor = useMemo(() => {
    const m = new Map<string, { aPagar: number; pagas: number }>();
    for (const c of lista) {
      const x = m.get(c.vendedor_id) ?? { aPagar: 0, pagas: 0 };
      if (c.status === "a_pagar") x.aPagar += Number(c.valor);
      if (c.status === "paga") x.pagas += Number(c.valor);
      m.set(c.vendedor_id, x);
    }
    return [...m.entries()].sort((a, b) => b[1].aPagar - a[1].aPagar);
  }, [lista]);
  const selecionadas = filtradas.filter((c) => sel.has(c.id));
  const selecionavel = (c: Comissao) => financeiro && c.status === "a_pagar" && !c.conta_pagar_id;
  const minhas = !financeiro && vendedores.some((v) => v.user_id === userId);

  function exportar() {
    baixarPlanilha("comissoes", [{ nome: "Comissões", linhas: filtradas.map((c) => ({
      Data: celula(c.created_at), Vendedor: nome(c.vendedor_id), Pedido: c.pedido?.numero ?? "", Cliente: c.pedido?.cliente?.nome ?? "",
      Referência: c.descricao, Base: Number(c.base), "%": Number(c.percentual), Comissão: Number(c.valor), Situação: ROTULO[c.status],
      "Paga em": celula(c.pago_em), "No contas a pagar": c.conta_pagar_id ? "Sim" : "Não",
    })) }]).catch(notifyError);
  }
  async function imprimir() {
    if (!cfg) return;
    try {
      setPdf(await pdfComissoes({
        filtros: [vend ? nome(vend) : "todos os vendedores", status === "todas" ? "todas" : ROTULO[status], mes ? `mês ${mes.split("-").reverse().join("/")}` : "todo o período"].join(" · "),
        linhas: filtradas.map((c) => ({ data: c.created_at, vendedor: nome(c.vendedor_id), pedido: c.pedido?.numero ?? null, cliente: c.pedido?.cliente?.nome ?? "",
          descricao: c.descricao, base: Number(c.base), percentual: Number(c.percentual), valor: Number(c.valor), status: ROTULO[c.status] })),
      }, comUnidade(cfg, unidades.find((u) => u.id === atual))));
    } catch (e) { notifyError(e); }
  }

  return (
    <>
      {!financeiro && !minhas && <p className="mb-3 text-sm text-slate-500">Seu usuário não está ligado a um cadastro de vendedor. Peça ao financeiro para ligar em Comissões → Vendedores.</p>}
      {financeiro && porVendedor.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {porVendedor.slice(0, 8).map(([id, v]) => (
            <button key={id} type="button" className="text-left" onClick={() => { setVend(id); setStatus("a_pagar"); }}>
              <Card className="p-4 hover:border-brand">
                <div className="font-semibold text-fg">{nome(id)}</div>
                <div className="num mt-1 text-lg font-bold">{brl(v.aPagar)}</div>
                <div className="text-xs text-slate-500">a pagar · {brl(v.pagas)} já pago</div>
              </Card>
            </button>
          ))}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {financeiro && (
          <select className="input w-auto" value={vend} onChange={(e) => setVend(e.target.value)}>
            <option value="">Todos os vendedores</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        )}
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="a_pagar">A pagar</option><option value="paga">Pagas</option><option value="cancelada">Canceladas</option><option value="todas">Todas</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">Mês <input type="month" className="input w-auto" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês das comissões" /></label>
        <div className="flex-1" />
        <Button variant="secondary" onClick={imprimir}><Printer size={16} /> Imprimir</Button>
        <Button variant="secondary" onClick={exportar} disabled={!filtradas.length}><FileDown size={16} /> Exportar</Button>
        {financeiro && <Button onClick={() => setPagar(true)} disabled={!selecionadas.length || new Set(selecionadas.map((c) => c.vendedor_id)).size > 1}>
          <Wallet size={16} /> Pagar {selecionadas.length ? brl(selecionadas.reduce((s, c) => s + Number(c.valor), 0)) : ""}
        </Button>}
      </div>
      {financeiro && selecionadas.length > 0 && new Set(selecionadas.map((c) => c.vendedor_id)).size > 1 && (
        <p className="mb-2 text-sm text-amber-700">Escolha comissões de um vendedor por vez para gerar o pagamento.</p>
      )}
      <Table empty={!isLoading && !filtradas.length}
        head={<>
          {financeiro && <th className="th w-8"><input type="checkbox" className="h-4 w-4" aria-label="Marcar todas"
            checked={filtradas.some(selecionavel) && filtradas.filter(selecionavel).every((c) => sel.has(c.id))}
            onChange={(e) => setSel(e.target.checked ? new Set(filtradas.filter(selecionavel).map((c) => c.id)) : new Set())} /></th>}
          <th className="th">Data</th><th className="th">Vendedor</th><th className="th">Pedido</th><th className="th text-right">Base</th>
          <th className="th text-right">%</th><th className="th text-right">Comissão</th><th className="th">Situação</th>
        </>}>
        {filtradas.map((c) => (
          <tr key={c.id}>
            {financeiro && <td className="td">{selecionavel(c) && <input type="checkbox" className="h-4 w-4" checked={sel.has(c.id)}
              onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />}</td>}
            <td className="td">{dataBR(c.created_at)}</td>
            <td className="td">{nome(c.vendedor_id)}</td>
            <td className="td">#{c.pedido?.numero} · {c.pedido?.cliente?.nome}<div className="text-xs text-slate-500">{c.descricao}</div></td>
            <td className="td num text-right">{brl(c.base)}</td>
            <td className="td num text-right">{Number(c.percentual).toLocaleString("pt-BR")}%</td>
            <td className="td num text-right font-semibold">{brl(c.valor)}</td>
            <td className="td"><Badge value={c.status === "a_pagar" ? (c.conta_pagar_id ? "pendente" : "aberto") : c.status === "paga" ? "pago" : "cancelado"} />
              {c.status === "a_pagar" && c.conta_pagar_id && <div className="text-xs text-slate-500">no contas a pagar</div>}
              {c.pago_em && <div className="text-xs text-slate-500">paga em {dataBR(c.pago_em)}</div>}</td>
          </tr>
        ))}
      </Table>
      {pagar && <PagarModal comissoes={selecionadas} nome={nome(selecionadas[0]?.vendedor_id)} onClose={(ok) => { setPagar(false); if (ok) setSel(new Set()); }} />}
      {pdf && <PdfViewer blob={pdf} nome="comissoes.pdf" titulo="Comissões" onClose={() => setPdf(null)} />}
    </>
  );
}

function PagarModal({ comissoes, nome, onClose }: { comissoes: Comissao[]; nome: string; onClose: (ok: boolean) => void }) {
  const [venc, setVenc] = useState(somarDias(5));
  const [ocupado, setOcupado] = useState(false);
  const invalidar = useInvalidate();
  const total = comissoes.reduce((s, c) => s + Number(c.valor), 0);
  async function gerar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    const { error } = await supabase.rpc("gerar_pagamento_comissoes", { p_ids: comissoes.map((c) => c.id), p_vencimento: venc || hoje() });
    setOcupado(false);
    if (error) return notifyError(error);
    notify("Lançado no contas a pagar. Ao dar baixa lá, as comissões ficam pagas.");
    invalidar("comissoes", "contas_pagar");
    onClose(true);
  }
  return (
    <Modal open onClose={() => onClose(false)} title={`Pagar comissões · ${nome}`}>
      <form onSubmit={gerar} className="space-y-3">
        <p className="text-[15px]">{comissoes.length} comissão(ões), total <b className="num">{brl(total)}</b>. Vai virar uma conta no <b>contas a pagar</b> (categoria comissões).</p>
        <Field label="Vencimento"><input type="date" className="input" value={venc} onChange={(e) => setVenc(e.target.value)} required /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button disabled={ocupado}>{ocupado ? "Gerando…" : "Gerar conta a pagar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* --------------------------- Cadastro de vendedores --------------------------- */

function Vendedores() {
  const { data: vendedores = [], isLoading } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const { data: usuarios = [] } = useRows<{ user_id: string; nome: string; papel: string }>("usuarios_erp", { order: "nome", ascending: true });
  const [editando, setEditando] = useState<Partial<Vendedor> | null>(null);
  const invalidar = useInvalidate();
  const set = (k: keyof Vendedor) => (e: { target: { value: string } }) => setEditando((v) => ({ ...v, [k]: e.target.value }));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = editando!;
    const row = { nome: v.nome, tipo: v.tipo ?? "vendedor", user_id: v.user_id || null, percentual: Number(String(v.percentual ?? 0).replace(",", ".")),
      base: v.base ?? "recebimento", descontar_frete: v.descontar_frete ?? true, cpf_cnpj: v.cpf_cnpj || null, email: v.email || null,
      whatsapp: v.whatsapp || null, pix: v.pix || null, ativo: v.ativo ?? true };
    const { error } = v.id ? await supabase.from("vendedores").update(row).eq("id", v.id) : await supabase.from("vendedores").insert(row);
    if (error) return notifyError(error);
    notify("Salvo");
    invalidar("vendedores");
    setEditando(null);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-slate-600">
          No pedido, escolha o vendedor: a comissão sai sozinha. <b>No recebimento</b>: cada parcela paga gera a comissão dela.
          <b> No faturamento</b>: a comissão sai inteira quando o pedido é aprovado. Pedido cancelado cancela a comissão que ainda não foi paga.
        </p>
        <Button onClick={() => setEditando({ tipo: "vendedor", percentual: 3, base: "recebimento", descontar_frete: true, ativo: true })}><Plus size={16} /> Novo</Button>
      </div>
      <Table empty={!isLoading && !vendedores.length}
        head={<><th className="th">Nome</th><th className="th">Tipo</th><th className="th text-right">Comissão</th><th className="th">Quando</th><th className="th">Login no ERP</th><th className="th" /></>}>
        {vendedores.map((v) => (
          <tr key={v.id} className={v.ativo ? "" : "opacity-60"}>
            <td className="td font-semibold">{v.nome}<div className="text-xs font-normal text-slate-500">{[v.whatsapp, v.email].filter(Boolean).join(" · ")}</div></td>
            <td className="td">{v.tipo === "representante" ? "Representante" : "Vendedor"}</td>
            <td className="td num text-right">{Number(v.percentual).toLocaleString("pt-BR")}%</td>
            <td className="td">{v.base === "faturamento" ? "no faturamento" : "no recebimento"}{v.descontar_frete ? " · sem frete" : ""}</td>
            <td className="td">{usuarios.find((u) => u.user_id === v.user_id)?.nome ?? "—"}</td>
            <td className="td text-right"><Button variant="secondary" onClick={() => setEditando(v)}><Pencil size={15} /> Editar</Button></td>
          </tr>
        ))}
      </Table>
      {editando && (
        <Modal open onClose={() => setEditando(null)} title={editando.id ? "Editar vendedor" : "Novo vendedor ou representante"}>
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Nome" className="sm:col-span-2"><input className="input" value={editando.nome ?? ""} onChange={set("nome")} required /></Field>
            <Field label="Tipo"><select className="input" value={editando.tipo} onChange={set("tipo")}><option value="vendedor">Vendedor</option><option value="representante">Representante</option></select></Field>
            <Field label="Comissão (%)"><input className="input" inputMode="decimal" value={editando.percentual ?? ""} onChange={set("percentual")} required /></Field>
            <Field label="Comissão sai" className="sm:col-span-2">
              <select className="input" value={editando.base} onChange={set("base")}><option value="recebimento">Quando o cliente paga (parcela a parcela)</option><option value="faturamento">Quando o pedido é aprovado</option></select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
              <input type="checkbox" className="h-5 w-5" checked={editando.descontar_frete ?? true} onChange={(e) => setEditando({ ...editando, descontar_frete: e.target.checked })} /> Não pagar comissão sobre o frete
            </label>
            <Field label="Login no ERP (vê as próprias comissões)" className="sm:col-span-2">
              <select className="input" value={editando.user_id ?? ""} onChange={set("user_id")}>
                <option value="">—</option>{usuarios.map((u) => <option key={u.user_id} value={u.user_id}>{u.nome}</option>)}
              </select>
            </Field>
            <Field label="CPF/CNPJ" className="sm:col-span-2"><input className="input" value={editando.cpf_cnpj ?? ""} onChange={set("cpf_cnpj")} /></Field>
            <Field label="WhatsApp" className="sm:col-span-2"><input className="input" value={editando.whatsapp ?? ""} onChange={set("whatsapp")} /></Field>
            <Field label="E-mail" className="sm:col-span-2"><input className="input" type="email" value={editando.email ?? ""} onChange={set("email")} /></Field>
            <Field label="Pix para pagamento" className="sm:col-span-3"><input className="input" value={editando.pix ?? ""} onChange={set("pix")} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={editando.ativo ?? true} onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })} /> Ativo</label>
            <div className="flex justify-end gap-2 sm:col-span-4">
              <Button type="button" variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button>Salvar</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
