// Notas fiscais → Emitir NF-e. Duas formas:
//   Nota direta: escolhe empresa, cliente, operação e itens e emite, sem pedido.
//   De um pedido: os pedidos aprovados que ainda não têm nota.
// Antes de enviar, a mesma conferência do cadastro (cliente, produtos, unidade).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileText, Send } from "lucide-react";
import { Button, Field, Modal, Table, Tabs } from "./ui";
import { ItensEditor, totalItens } from "./ItensEditor";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade, EtiquetaUnidade, CampoUnidade } from "@/lib/unidade";
import { brl, dataBR, rotuloCliente } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction } from "@/lib/supabase";
import { AVISO_TESTE, confirmarSeTeste } from "@/lib/ambienteNfe";
import { conferirPedido, type Pendencia } from "@/lib/compliance";
import type { Cliente, Item, Pedido, Produto } from "@/lib/types";
import { OPERACOES_NOTA, operacaoNota } from "../../supabase/functions/_shared/nfe-operacoes";

const COM_NOTA = ["autorizada", "processando", "contingencia"];

export function EmitirNfeModal({ onClose }: { onClose: () => void }) {
  const [forma, setForma] = useState<"direta" | "pedido">("direta");
  return forma === "direta" ? <NotaDireta onClose={onClose} trocar={() => setForma("pedido")} /> : <DoPedido onClose={onClose} trocar={() => setForma("direta")} />;
}

function Escolha({ forma, trocar }: { forma: "direta" | "pedido"; trocar: () => void }) {
  return <Tabs value={forma} onChange={(v) => v !== forma && trocar()} options={[{ value: "direta", label: "Nota direta" }, { value: "pedido", label: "De um pedido aprovado" }]} />;
}

function AvisoAmbiente({ ambiente }: { ambiente?: string }) {
  if (!ambiente) return null;
  return (
    <p className={`mb-3 rounded-lg px-3 py-2 text-sm font-semibold ${ambiente === "producao" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
      {ambiente === "producao" ? "Ambiente de PRODUÇÃO: a nota é real, tem valor fiscal e vai para o cliente." : AVISO_TESTE}
    </p>
  );
}

function useAmbiente() {
  return useQuery({
    queryKey: ["nfe-ambiente"], staleTime: 60_000,
    queryFn: async () => (await callFunction<{ ambiente: string }>("nfe-consultar", { acao: "ambiente" })).ambiente,
  }).data;
}

function Conferencia({ titulo, pendencias, onVoltar, onEmitir }: { titulo: string; pendencias: Pendencia[]; onVoltar: () => void; onEmitir: () => void }) {
  const erros = pendencias.some((x) => x.nivel === "erro");
  return (
    <Modal open onClose={onVoltar} title={`Conferência fiscal · ${titulo}`}>
      <ul className="space-y-1.5 text-sm">
        {pendencias.map((x, i) => (
          <li key={i} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.nivel === "erro" ? "bg-red-500" : "bg-amber-500"}`} />{x.texto}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-600">
        {erros ? "Corrija os itens em vermelho (no cadastro do cliente, do produto ou da unidade) e tente de novo: a SEFAZ rejeitaria a nota." : "São só alertas. Confira e, se estiver certo, emita assim mesmo."}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onVoltar}>Voltar</Button>
        {!erros && <Button type="button" onClick={onEmitir}>Emitir mesmo assim</Button>}
      </div>
    </Modal>
  );
}

/** NF-e direta: sem pedido. Cliente, operação (venda, remessa, garantia…) e itens. */
function NotaDireta({ onClose, trocar }: { onClose: () => void; trocar: () => void }) {
  const { unidades, padrao } = useUnidade();
  const invalidar = useInvalidate();
  const ambiente = useAmbiente();
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: ufsIcms = [] } = useRows<{ uf: string }>("icms_uf", { order: "uf", ascending: true });
  const { data: regras = [] } = useRows<{ cfop: string | null; ativo: boolean }>("regras_tributacao", { order: "prioridade", ascending: true });
  const [unidadeId, setUnidadeId] = useState<string | null>(padrao);
  const [clienteId, setClienteId] = useState("");
  const [buscaCli, setBuscaCli] = useState("");
  const [operacao, setOperacao] = useState("venda");
  const [natureza, setNatureza] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [desconto, setDesconto] = useState("");
  const [frete, setFrete] = useState("");
  const [modalidade, setModalidade] = useState(9);
  const [obs, setObs] = useState("");
  const [conferindo, setConferindo] = useState<Pendencia[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const op = operacaoNota(operacao)!;
  const unidade = unidades.find((u) => u.id === unidadeId) ?? unidades[0];
  const cliente = clientes.find((c) => c.id === clienteId);
  const termo = buscaCli.trim().toLowerCase();
  const opcoesCli = (termo ? clientes.filter((c) => [c.nome, c.nome_fantasia, c.cpf_cnpj, c.municipio].join(" ").toLowerCase().includes(termo)) : clientes).slice(0, 200);
  const subtotal = totalItens(itens);
  const total = subtotal - Number(desconto.replace(",", ".") || 0) + Number(frete.replace(",", ".") || 0);
  const cfopOp = op.cfop && cliente?.uf && unidade?.uf && cliente.uf.toUpperCase() !== unidade.uf.toUpperCase() ? "6" + op.cfop.slice(1) : op.cfop;
  const temRegra = !op.cfop || regras.some((r) => r.ativo && r.cfop && r.cfop.replace(/\D/g, "") === cfopOp);

  async function emitir(conferido = false) {
    if (!unidade) return notify("Escolha a empresa", "erro");
    if (!cliente) return notify("Escolha o cliente", "erro");
    if (!itens.length) return notify("Adicione ao menos um item", "erro");
    if (!conferido) {
      const lista = conferirPedido({ cliente, unidade, produtos, itens, aliquotasUf: ufsIcms.map((u) => u.uf) });
      if (!temRegra) lista.push({ nivel: "alerta", texto: `Não há regra de tributação para o CFOP ${cfopOp} (${op.rotulo}): os impostos saem como na venda. Cadastre a regra em Notas fiscais → Regras de tributação, conforme o contador.` } as Pendencia);
      if (lista.length) return setConferindo(lista);
    }
    setConferindo(null);
    if (!(await confirmarSeTeste())) return;
    setOcupado(true);
    try {
      const r = await callFunction<{ nota?: { status: string; numero?: string | null } }>("nfe-emitir", { avulsa: {
        unidade_id: unidade.id, cliente_id: cliente.id, operacao, natureza: natureza.trim() || null,
        itens: itens.map((i) => ({ produto_id: i.produto_id, descricao: i.descricao, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario) })),
        desconto: Number(desconto.replace(",", ".") || 0), frete: Number(frete.replace(",", ".") || 0), modalidade_frete: modalidade, observacoes: obs.trim() || null,
      } });
      notify(r.nota?.status === "autorizada" ? `NF-e ${r.nota.numero ?? ""} autorizada. Na nota: lançar conta a receber e baixar estoque.` : "NF-e enviada para a SEFAZ. Acompanhe na lista.");
      invalidar("notas_fiscais");
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  if (conferindo) return <Conferencia titulo="nota direta" pendencias={conferindo} onVoltar={() => setConferindo(null)} onEmitir={() => emitir(true)} />;
  return (
    <Modal open onClose={onClose} title="Emitir NF-e" wide>
      <Escolha forma="direta" trocar={trocar} />
      <AvisoAmbiente ambiente={ambiente} />
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div><CampoUnidade value={unidadeId} onChange={setUnidadeId} label="Empresa que emite" /></div>
        <Field label="Tipo de operação">
          <select className="input" value={operacao} onChange={(e) => { setOperacao(e.target.value); setNatureza(""); }}>
            {OPERACOES_NOTA.map((o) => <option key={o.id} value={o.id}>{o.rotulo}{o.cfop ? ` (CFOP ${o.cfop})` : ""}</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-500">{op.ajuda}</span>
        </Field>
        <Field label="Cliente (destinatário)" className="sm:col-span-2">
          <div className="flex flex-col gap-1.5 sm:flex-row">
            <input className="input sm:max-w-[16rem]" placeholder="Buscar nome, CNPJ, cidade" value={buscaCli} onChange={(e) => setBuscaCli(e.target.value)} />
            <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Selecione…</option>
              {opcoesCli.map((c) => <option key={c.id} value={c.id}>{rotuloCliente(c)}{c.municipio ? ` · ${c.municipio}/${c.uf ?? ""}` : ""}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Natureza da operação (como sai na nota)" className="sm:col-span-2">
          <input className="input" value={natureza} placeholder={op.natureza ?? unidade?.natureza_operacao ?? "Venda de mercadoria"} onChange={(e) => setNatureza(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4"><ItensEditor itens={itens} onChange={setItens} comSerie /></div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Field label="Desconto (R$)"><input className="input" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} /></Field>
        <Field label="Frete (R$)"><input className="input" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} /></Field>
        <Field label="Frete por conta" className="col-span-2">
          <select className="input" value={modalidade} onChange={(e) => setModalidade(Number(e.target.value))}>
            <option value={9}>Sem frete</option><option value={0}>Emitente (MF Máquinas)</option><option value={1}>Destinatário (cliente)</option><option value={2}>Terceiros</option>
          </select>
        </Field>
        <Field label="Informações complementares (saem na nota)" className="col-span-2 sm:col-span-4"><textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-sm text-slate-600">Total dos produtos <b className="num">{brl(subtotal)}</b> · Total da nota <b className="num text-fg">{brl(total)}</b> <span className="text-xs">(+ IPI, se houver)</span></span>
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={ocupado} onClick={() => emitir()}><Send size={15} /> {ocupado ? "Enviando…" : "Emitir NF-e"}</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500"><FileText size={12} className="mr-1 inline" />Depois de autorizada, abra a nota para <b>lançar a conta a receber</b> e <b>baixar o estoque</b>.</p>
    </Modal>
  );
}

function DoPedido({ onClose, trocar }: { onClose: () => void; trocar: () => void }) {
  const navigate = useNavigate();
  const { filtrar, unidades } = useUnidade();
  const invalidar = useInvalidate();
  const { data: pedidosTodos = [], isLoading } = useRows<Pedido>("pedidos", {
    select: "*, cliente:clientes(*), itens:pedido_itens(*), notas:notas_fiscais(id, status, ambiente)", order: "numero", ascending: false,
  });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: ufsIcms = [] } = useRows<{ uf: string }>("icms_uf", { order: "uf", ascending: true });
  const [conferindo, setConferindo] = useState<{ pedido: Pedido; pendencias: Pendencia[] } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const ambiente = useAmbiente();

  const pendentes = filtrar(pedidosTodos).filter((p) => p.status === "aprovado" && !(p.notas ?? []).some((n) => n.ambiente !== "homologacao" && COM_NOTA.includes(n.status)));

  async function emitir(p: Pedido, conferido = false) {
    if (!conferido) {
      const lista = conferirPedido({
        cliente: p.cliente, unidade: unidades.find((u) => u.id === p.unidade_id), produtos,
        itens: (p.itens ?? []) as any, aliquotasUf: ufsIcms.map((u) => u.uf),
      });
      if (lista.length) return setConferindo({ pedido: p, pendencias: lista });
    }
    setConferindo(null);
    if (!(await confirmarSeTeste())) return;
    setOcupado(p.id);
    try {
      const r = await callFunction<{ nota?: { status: string; numero?: string | null } }>("nfe-emitir", { pedido_id: p.id });
      notify(r.nota?.status === "autorizada" ? `NF-e ${r.nota.numero ?? ""} autorizada` : "NF-e enviada para a SEFAZ. Acompanhe na lista.");
      invalidar("notas_fiscais", "pedidos");
      onClose();
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(null);
    }
  }

  if (conferindo) return <Conferencia titulo={`pedido #${conferindo.pedido.numero}`} pendencias={conferindo.pendencias} onVoltar={() => setConferindo(null)} onEmitir={() => emitir(conferindo.pedido, true)} />;

  return (
    <Modal open onClose={onClose} title="Emitir NF-e" wide>
      <Escolha forma="pedido" trocar={trocar} />
      <AvisoAmbiente ambiente={ambiente} />
      <p className="mb-3 text-sm text-slate-600">
        Pedidos aprovados que ainda não têm nota (o pedido já tem cliente, itens, frete e pagamento). Sem pedido, use <b>Nota direta</b>.
      </p>
      {!isLoading && !pendentes.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
          Nenhum pedido aprovado esperando nota.
          <div className="mt-3 flex flex-wrap justify-center gap-2"><Button onClick={trocar}>Fazer nota direta</Button><Button variant="secondary" onClick={() => { onClose(); navigate("/pedidos"); }}>Ir para Vendas e orçamentos</Button></div>
        </div>
      ) : (
        <Table head={<><th className="th">Pedido</th><th className="th">Data</th><th className="th">Cliente</th><th className="th text-right">Valor</th><th className="th" /></>}>
          {pendentes.map((p) => (
            <tr key={p.id}>
              <td className="td font-semibold">#{p.numero} <EtiquetaUnidade id={p.unidade_id} /></td>
              <td className="td">{dataBR(p.created_at)}</td>
              <td className="td">{p.cliente ? rotuloCliente(p.cliente) : "—"}</td>
              <td className="td num text-right">{brl(p.valor_total)}</td>
              <td className="td text-right">
                <Button onClick={() => emitir(p)} disabled={!!ocupado}><Send size={15} /> {ocupado === p.id ? "Enviando…" : "Emitir"}</Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">Nota de transferência entre a matriz e a filial sai em Transferências SC ↔ SP.</p>
    </Modal>
  );
}
