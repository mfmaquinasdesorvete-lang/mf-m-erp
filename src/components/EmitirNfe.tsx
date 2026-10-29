// Notas fiscais → Emitir NF-e. Duas formas:
//   Nota direta: escolhe empresa, cliente, operação e itens e emite, sem pedido. Pode ser de saída ou de entrada
//   (a MF emite a nota de quem não emite: máquina usada de pessoa física, conserto, retorno de comodato…), com ou sem NF referenciada.
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
import { cfopDaOperacao, chaveValida, OPERACOES_NOTA, operacaoNota } from "../../supabase/functions/_shared/nfe-operacoes";
import { type AliquotasUf, itemDoCadastro, itensVenda, type RegraTributaria, type UnidadeFiscal } from "../../supabase/functions/_shared/nfe-impostos";
import { itensEntrada, pendenciasEntrada } from "../../supabase/functions/_shared/nfe-entrada";
import { pendenciaCbenef } from "../../supabase/functions/_shared/nfe-conferencia";
import { ClienteBusca } from "@/components/ClienteBusca";

const COM_NOTA = ["autorizada", "processando", "contingencia"];

/** Nota direta já preenchida (ex.: a OS abre a nota de entrada ou de volta da máquina do conserto). */
export type InicialNota = { operacao?: string; unidade_id?: string | null; cliente_id?: string; itens?: Item[]; obs?: string; chave?: string };

export function EmitirNfeModal({ onClose, inicial }: { onClose: () => void; inicial?: InicialNota }) {
  const [forma, setForma] = useState<"direta" | "pedido">("direta");
  return forma === "direta" ? <NotaDireta onClose={onClose} trocar={() => setForma("pedido")} inicial={inicial} /> : <DoPedido onClose={onClose} trocar={() => setForma("direta")} />;
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

/** Conferência fiscal antes de emitir: erros (vermelho) impedem; alertas (amarelo) deixam emitir mesmo assim. */
export function Conferencia({ titulo, pendencias, onVoltar, onEmitir }: { titulo: string; pendencias: Pendencia[]; onVoltar: () => void; onEmitir: () => void }) {
  const erros = pendencias.some((x) => x.nivel === "erro");
  return (
    <Modal open onClose={onVoltar} title={`Conferência fiscal · ${titulo}`}>
      <ul className="space-y-1.5 text-sm">
        {pendencias.map((x, i) => (
          <li key={i} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.nivel === "erro" ? "bg-red-500" : "bg-amber-500"}`} />{x.texto}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-slate-600">
        {erros ? "Corrija os itens em vermelho e tente de novo: a SEFAZ rejeitaria a nota e o número ficaria perdido." : "São só alertas. Confira e, se estiver certo, emita assim mesmo."}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onVoltar}>Voltar</Button>
        {!erros && <Button type="button" onClick={onEmitir}>Emitir mesmo assim</Button>}
      </div>
    </Modal>
  );
}

/** NF-e direta: sem pedido. Cliente, operação (venda, remessa, garantia… ou uma entrada) e itens. */
function NotaDireta({ onClose, trocar, inicial }: { onClose: () => void; trocar: () => void; inicial?: InicialNota }) {
  const { unidades, padrao } = useUnidade();
  const invalidar = useInvalidate();
  const ambiente = useAmbiente();
  const { data: clientes = [], isLoading: carregandoClientes } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: ufsIcms = [] } = useRows<{ uf: string; aliquota_interna: number; fcp: number }>("icms_uf", { order: "uf", ascending: true });
  const { data: regras = [] } = useRows<RegraTributaria>("regras_tributacao", { order: "prioridade", ascending: true });
  const { data: notasCliente = [] } = useRows<{ id: string; numero: string | null; serie: string | null; chave: string | null; created_at: string; valor_total: number; cliente_id: string | null; status: string; tipo_operacao: string | null; destinatario_doc: string | null }>("notas_fiscais", {
    select: "id, numero, serie, chave, created_at, valor_total, cliente_id, status, tipo_operacao, destinatario_doc", order: "created_at", ascending: false,
  });
  const [unidadeId, setUnidadeId] = useState<string | null>(inicial?.unidade_id ?? padrao);
  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? "");
  const [operacao, setOperacao] = useState(inicial?.operacao ?? "venda");
  const [natureza, setNatureza] = useState("");
  const [itens, setItens] = useState<Item[]>(inicial?.itens ?? []);
  const [desconto, setDesconto] = useState("");
  const [frete, setFrete] = useState("");
  const [modalidade, setModalidade] = useState(9);
  // transportadora da nota (29/10: não dava para pôr a transportadora na NF direta)
  const [transportadora, setTransportadora] = useState("");
  const { data: transportadoras = [] } = useRows<{ id: string; nome: string; nome_fantasia: string | null }>("transportadoras", {
    select: "id, nome, nome_fantasia", order: "nome", ascending: true, filtro: (q) => q.eq("ativo", true).is("unificado_em", null),
  });
  const [obs, setObs] = useState(inicial?.obs ?? "");
  const [chaveRef, setChaveRef] = useState(inicial?.chave ?? "");
  const [conferindo, setConferindo] = useState<Pendencia[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const op = operacaoNota(operacao)!;
  const unidade = unidades.find((u) => u.id === unidadeId) ?? unidades[0];
  const cliente = clientes.find((c) => c.id === clienteId);
  const subtotal = totalItens(itens);
  const total = subtotal - Number(desconto.replace(",", ".") || 0) + Number(frete.replace(",", ".") || 0);
  const cfopOp = op.cfop ? cfopDaOperacao(op.cfop, !!(cliente?.uf && unidade?.uf && cliente.uf.toUpperCase() !== unidade.uf.toUpperCase())) : op.cfop;
  const temRegra = !op.cfop || regras.some((r) => r.ativo && r.cfop && r.cfop.replace(/\D/g, "") === cfopOp);

  /** Itens como a função vai montar (CST, cBenef): para a conferência parar o que a SEFAZ rejeitaria. */
  function previaItens(): Record<string, unknown>[] {
    if (!unidade?.uf || !cliente?.uf) return [];
    const doCadastro = itens.map((i) => {
      const p = produtos.find((x) => x.id === i.produto_id);
      return itemDoCadastro(p ?? { id: i.produto_id, tipo: "peca" }, i.descricao, Number(i.quantidade), Number(i.valor_unitario), op.cfop ? { cfop: op.cfop } : {});
    });
    const daUnidade = regras.filter((r) => r.ativo !== false && (!r.unidade_id || r.unidade_id === unidade.id));
    const contrib = cliente.tipo_pessoa === "PJ" && Number(cliente.contribuinte_icms) === 1;
    try {
      if (op.entrada) {
        return itensEntrada(op, doCadastro, { ufEmitente: unidade.uf, ufRemetente: cliente.uf, contribuinte: contrib, aliquotaInterna: Number(unidade.icms_aliquota_interna ?? 17), regras: daUnidade, unidade_id: unidade.id });
      }
      const ufs: AliquotasUf = Object.fromEntries(ufsIcms.map((x) => [x.uf, x]));
      const u = (op.financeiro ? unidade : { ...unidade, pis_cst: "49", cofins_cst: "49" }) as unknown as UnidadeFiscal;
      return itensVenda(u, { uf: cliente.uf.toUpperCase(), contribuinte: contrib }, doCadastro, ufs, { regras: daUnidade, unidade_id: unidade.id, operacao: op.financeiro ? "venda" : "remessa" });
    } catch { return []; }
  }
  const entrada = !!op.entrada;
  const chaveDigitos = chaveRef.replace(/\D/g, "");
  const chaveOk = !chaveDigitos || !!chaveValida(chaveDigitos);
  // NF-e autorizadas deste cliente (para referenciar a nota de venda da máquina, por exemplo)
  const docCliente = (cliente?.cpf_cnpj ?? "").replace(/\D/g, "");
  const notasDoCliente = cliente ? notasCliente.filter((x) => x.chave && x.status === "autorizada" && (x.cliente_id === cliente.id || (!!docCliente && (x.destinatario_doc ?? "").replace(/\D/g, "") === docCliente))).slice(0, 30) : [];
  const ieCliente = cliente?.tipo_pessoa === "PJ" && Number(cliente.contribuinte_icms) === 1;

  async function emitir(conferido = false) {
    if (!unidade) return notify("Escolha a empresa", "erro");
    if (!cliente) return notify("Escolha o cliente", "erro");
    if (!itens.length) return notify("Adicione ao menos um item", "erro");
    if (!chaveOk) return notify("Chave da NF referenciada inválida: confira os 44 números ou deixe em branco", "erro");
    if (!conferido) {
      // na entrada não há DIFAL (os avisos de venda para consumidor final não valem)
      const lista = conferirPedido({ cliente, unidade, produtos, itens, aliquotasUf: ufsIcms.map((u) => u.uf) }).filter((x) => !(entrada && x.texto.includes("DIFAL")));
      if (!temRegra) lista.push({ nivel: "alerta", texto: entrada
        ? `Não há regra de tributação para o CFOP ${cfopOp} (${op.rotulo}): a nota sai com ICMS CST ${op.icms_cst} e PIS/COFINS CST ${op.pis_cofins_cst}, sem valores. Confirme com o contador; se ele pedir outra coisa, cadastre a regra (Operação "Qualquer" e o CFOP ${cfopOp}) em Notas fiscais → Regras de tributação.`
        : `Não há regra de tributação para o CFOP ${cfopOp} (${op.rotulo}): o ICMS e o IPI saem como na venda (PIS/COFINS sem valor, CST 49). Cadastre a regra (Operação "Qualquer" e o CFOP) em Notas fiscais → Regras de tributação, conforme o contador.` } as Pendencia);
      const previa = previaItens();
      if (entrada) lista.push(...pendenciasEntrada(op, { ufEmitente: unidade.uf ?? "", itens: previa, chaveReferenciada: chaveDigitos }));
      else {
        const cb = pendenciaCbenef(unidade.uf, previa, `Ponha o código na regra de tributação do CFOP ${cfopOp ?? "da venda"} (Notas fiscais → Regras de tributação), conforme o contador.`);
        if (cb) lista.push(cb);
      }
      if (entrada && ieCliente) lista.push({ nivel: "alerta", texto: `${cliente.nome} tem inscrição estadual: normalmente é a própria empresa que emite a nota (remessa para conserto 5915, venda ou devolução) e ela chega em NF-e recebidas. Emita esta só se ela não emitir.` } as Pendencia);
      if (lista.length) return setConferindo(lista);
    }
    setConferindo(null);
    // trava antes da pergunta de teste (ela consulta o servidor): dois cliques não emitem duas notas
    if (ocupado) return;
    setOcupado(true);
    if (!(await confirmarSeTeste())) return setOcupado(false);
    try {
      const r = await callFunction<{ nota?: { status: string; numero?: string | null } }>("nfe-emitir", { avulsa: {
        unidade_id: unidade.id, cliente_id: cliente.id, operacao, natureza: natureza.trim() || null,
        itens: itens.map((i) => ({ produto_id: i.produto_id, descricao: i.descricao, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario) })),
        desconto: Number(desconto.replace(",", ".") || 0), frete: Number(frete.replace(",", ".") || 0), modalidade_frete: modalidade, transportadora_id: modalidade !== 9 ? transportadora || null : null, observacoes: obs.trim() || null,
        chave_referenciada: chaveDigitos || null,
      } });
      notify(r.nota?.status === "autorizada"
        ? `NF-e ${r.nota.numero ?? ""} autorizada. ${entrada ? (op.estoque ? "Na nota: dar entrada no estoque." : "Imprima o DANFE para ir junto com a máquina.") : "Na nota: lançar conta a receber e baixar estoque."}`
        : "NF-e enviada para a SEFAZ. Acompanhe na lista.");
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
            <optgroup label="Saída (a MF envia)">
              {OPERACOES_NOTA.filter((o) => !o.entrada).map((o) => <option key={o.id} value={o.id}>{o.rotulo}{o.cfop ? ` (CFOP ${o.cfop})` : ""}</option>)}
            </optgroup>
            <optgroup label="Entrada (a MF recebe de quem não emite nota)">
              {OPERACOES_NOTA.filter((o) => o.entrada).map((o) => <option key={o.id} value={o.id}>{o.rotulo} (CFOP {o.cfop})</option>)}
            </optgroup>
          </select>
          <span className="mt-1 block text-xs text-slate-500">{op.ajuda}{cfopOp && cfopOp !== op.cfop ? ` Outro estado: CFOP ${cfopOp}.` : ""}</span>
        </Field>
        {entrada && (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 sm:col-span-2">
            <b>Nota de entrada:</b> a MF emite a nota da máquina ou peça que vem de pessoa física, MEI ou empresa sem inscrição estadual. O DANFE vai junto no transporte.
            Devolução de uma venda da MF: use o botão <b>Devolução</b> na nota de venda.
          </p>
        )}
        <Field label={entrada ? "Quem manda (remetente)" : "Cliente (destinatário)"} className="sm:col-span-2">
          <ClienteBusca clientes={clientes} carregando={carregandoClientes} value={clienteId} onChange={(id) => { setClienteId(id); setChaveRef(""); }} />
        </Field>
        <Field label={op.exige_referencia ? "NF de remessa (obrigatória)" : "NF referenciada (opcional)"} className="sm:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            {notasDoCliente.length > 0 && (
              <select className="input sm:max-w-64" value={notasDoCliente.find((x) => x.chave === chaveDigitos)?.chave ?? ""} onChange={(e) => setChaveRef(e.target.value)}>
                <option value="">Notas deste cliente…</option>
                {notasDoCliente.map((x) => <option key={x.id} value={x.chave!}>NF {x.numero ?? "—"} · {dataBR(x.created_at)} · {brl(x.valor_total)}{x.tipo_operacao === "entrada" ? " · entrada" : ""}</option>)}
              </select>
            )}
            <input className="input min-w-0 flex-1" inputMode="numeric" value={chaveRef} placeholder="Chave de acesso (44 números) ou deixe em branco" onChange={(e) => setChaveRef(e.target.value)} aria-invalid={!chaveOk} />
          </div>
          <span className={`mt-1 block text-xs ${chaveOk ? "text-slate-500" : "font-semibold text-red-700"}`}>
            {!chaveOk ? "Chave inválida: confira os 44 números (o último é o dígito verificador)."
              : op.exige_referencia && !chaveDigitos ? "Obrigatória: a chave da NF de remessa (a nota de ida). O retorno precisa citar a saída."
              : chaveDigitos ? "A chave vai na nota (referência) e nas informações complementares."
              : entrada ? "Ex.: a NF de venda da máquina (da MF ou da My Frost). Sem nota, deixe em branco." : "Só se a operação se referir a outra nota."}
          </span>
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
        <Field label="Transportadora (sai na nota)" className="col-span-2" dica={modalidade === 9 ? "Escolha antes quem paga o frete" : undefined}>
          <select className="input" value={transportadora} onChange={(e) => setTransportadora(e.target.value)} disabled={modalidade === 9}>
            <option value="">— sem transportadora —</option>
            {transportadoras.map((t) => <option key={t.id} value={t.id}>{t.nome_fantasia || t.nome}</option>)}
          </select>
        </Field>
        <Field label="Informações complementares (saem na nota)" className="col-span-2 sm:col-span-4"><textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-sm text-slate-600">Total dos produtos <b className="num">{brl(subtotal)}</b> · Total da nota <b className="num text-fg">{brl(total)}</b> <span className="text-xs">(+ IPI, se houver)</span></span>
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={ocupado} onClick={() => emitir()}><Send size={15} /> {ocupado ? "Enviando…" : "Emitir NF-e"}</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500"><FileText size={12} className="mr-1 inline" />
        {entrada
          ? <>Depois de autorizada, abra a nota para {op.estoque ? <><b>dar entrada no estoque</b> e </> : null}imprimir o <b>DANFE</b>{op.id === "compra_usado" ? <> (o pagamento ao dono vai em Contas a pagar)</> : null}.</>
          : <>Depois de autorizada, abra a nota para <b>lançar a conta a receber</b> e <b>baixar o estoque</b>.</>}
      </p>
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
    if (ocupado) return;
    setOcupado(p.id);
    if (!(await confirmarSeTeste())) return setOcupado(null);
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
          <div className="mt-3 flex flex-wrap justify-center gap-2"><Button onClick={trocar}>Fazer nota direta</Button><Button variant="secondary" onClick={() => { onClose(); navigate("/pedidos"); }}>Ir para Venda de Peças</Button></div>
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
