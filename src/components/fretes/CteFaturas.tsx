// Aba Faturas de Fretes e envios: a fatura da transportadora montada com os CT-e que a MF paga (vira conta a pagar e
// passa pela aprovação), a diferença entre a fatura e a soma dos CT-e, e a conferência do frete com o que saiu do banco.
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Ban, ChevronDown, ChevronUp, Landmark, Receipt } from "lucide-react";
import { Badge, Button, Field, Modal, Section, Stat, Table, nomeMes } from "@/components/ui";
import { SeloSentido, nomeTransportadora } from "@/components/fretes/CtePainel";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, somarDias } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { conferenciaMensal, faturavel, pagamentoDaTransportadora, type Cte, type FaturaCte } from "@/lib/cte";
import type { Transportadora } from "@/lib/types";

type Conta = { id: string; status: string; vencimento: string; valor: number };
type Lanc = { id: string; data: string; valor: number; descricao: string };
const r2 = (n: number) => Math.round(n * 100) / 100;

export function CteFaturas({ transportadoras }: { transportadoras: Transportadora[] }) {
  const { tem } = usePerfil();
  const podeFaturar = tem("financeiro");
  const { filtrar } = useUnidade();
  const { data: todosCtes = [] } = useRows<Cte>("ctes", { order: "emissao", ascending: false });
  const { data: todas = [] } = useRows<FaturaCte>("cte_faturas", { order: "vencimento", ascending: false });
  const ids = todas.map((f) => f.conta_pagar_id).filter(Boolean) as string[];
  const { data: contas = [] } = useRows<Conta>("contas_pagar", { select: "id, status, vencimento, valor", key: ["cte-faturas", ids.join()], filtro: (q) => q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]) });
  const ctes = filtrar(todosCtes);
  const faturas = filtrar(todas);
  const [montar, setMontar] = useState(false);
  const [cancelar, setCancelar] = useState<FaturaCte | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [verCanceladas, setVerCanceladas] = useState(false);

  const porId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const contaDe = new Map(contas.map((c) => [c.id, c]));
  const ctesDa = (f: string) => ctes.filter((c) => c.fatura_id === f);
  const validas = faturas.filter((f) => f.situacao !== "cancelada");
  const lista = verCanceladas ? faturas : validas;
  const abertas = validas.filter((f) => f.situacao === "aberta");
  const semFatura = ctes.filter(faturavel);
  const dia = hoje();
  const vencidas = abertas.filter((f) => f.vencimento < dia && contaDe.get(f.conta_pagar_id ?? "")?.status !== "pago");
  const comDiferenca = validas.filter((f) => Math.abs(Number(f.valor) - ctesDa(f.id).reduce((s, c) => s + Number(c.valor), 0)) > 0.009);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-slate-600">Quando a fatura da transportadora chegar, junte os CT-e dela: o ERP mostra se o valor bate com a soma dos CT-e
          e lança a conta a pagar (categoria frete), que passa pela aprovação como as outras.</p>
        {podeFaturar && <Button onClick={() => setMontar(true)} disabled={!semFatura.length}><Receipt size={16} /> Montar fatura</Button>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="CT-e ainda sem fatura" icon={Receipt} tom={semFatura.length ? "atencao" : "bom"} valor={brl(semFatura.reduce((s, c) => s + Number(c.valor), 0))}
          sub={`${semFatura.length} CT-e que a MF paga`} />
        <Stat label="Faturas em aberto" icon={Landmark} valor={brl(abertas.reduce((s, f) => s + Number(f.valor), 0))} sub={`${abertas.length} fatura(s)`} />
        <Stat label="Vencidas sem pagar" icon={AlertTriangle} tom={vencidas.length ? "critico" : "bom"} valor={String(vencidas.length)}
          sub={vencidas.length ? brl(vencidas.reduce((s, f) => s + Number(f.valor), 0)) : "nenhuma"} />
        <Stat label="Fatura diferente dos CT-e" icon={AlertTriangle} tom={comDiferenca.length ? "atencao" : "bom"} valor={String(comDiferenca.length)}
          sub={comDiferenca.length ? "confira taxa, reentrega ou CT-e faltando" : "todas batem com a soma dos CT-e"} />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">Faturas</h2>
          <span className="text-sm text-slate-500">{lista.length}</span>
          {faturas.length !== validas.length && (
            <label className="ml-auto inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} /> Ver canceladas</label>
          )}
        </div>
        <Table empty={!lista.length}
          head={<><th className="th">Fatura</th><th className="th">Transportadora</th><th className="th">Vencimento</th><th className="th text-right">CT-e</th>
            <th className="th text-right">Valor</th><th className="th">Situação</th><th className="th" /></>}>
          {lista.map((f) => {
            const dela = ctesDa(f.id);
            const soma = r2(dela.reduce((s, c) => s + Number(c.valor), 0));
            const dif = r2(Number(f.valor) - soma);
            const conta = contaDe.get(f.conta_pagar_id ?? "");
            const aberto = aberta === f.id;
            return (
              <Fragment key={f.id}>
                <tr>
                  <td className="td"><span className="font-semibold">nº {f.numero}</span>{f.emissao && <span className="block text-xs text-slate-500">emitida {dataBR(f.emissao)}</span>}</td>
                  <td className="td text-sm">{nomeTransportadora(porId.get(f.transportadora_id ?? ""))}</td>
                  <td className={`td whitespace-nowrap text-sm ${f.situacao === "aberta" && f.vencimento < dia && conta?.status !== "pago" ? "font-semibold text-red-700" : ""}`}>{dataBR(f.vencimento)}</td>
                  <td className="td num text-right text-sm">{dela.length}<span className="block text-xs text-slate-500">{brl(soma)}</span></td>
                  <td className="td num text-right font-semibold">{brl(f.valor)}{f.situacao !== "cancelada" && Math.abs(dif) > 0.009 &&
                    <span className="block text-xs font-semibold text-amber-700">{dif > 0 ? "+" : ""}{brl(dif)} dos CT-e</span>}</td>
                  <td className="td text-sm"><Badge value={f.situacao === "aberta" && conta?.status === "pago" ? "paga" : f.situacao} />
                    {conta ? <Link to="/financeiro" state={{ aba: "pagar" }} className="mt-0.5 block text-xs font-semibold text-brand">conta a pagar: {conta.status}</Link>
                      : f.situacao !== "cancelada" && <span className="mt-0.5 block text-xs text-slate-500">sem conta a pagar</span>}</td>
                  <td className="td whitespace-nowrap text-right">
                    <Button variant="ghost" onClick={() => setAberta(aberto ? null : f.id)} aria-expanded={aberto}>{aberto ? <ChevronUp size={15} /> : <ChevronDown size={15} />} CT-e</Button>
                    {podeFaturar && f.situacao !== "cancelada" && <Button variant="ghost" onClick={() => setCancelar(f)} title="Cancelar a fatura"><Ban size={15} /></Button>}
                  </td>
                </tr>
                {aberto && (
                  <tr><td className="td bg-slate-50" colSpan={7}>
                    {f.observacao && <p className="mb-2 text-xs text-slate-600">{f.observacao}</p>}
                    <ul className="divide-y divide-slate-200 text-sm">
                      {dela.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1">
                          <span className="font-semibold">{c.numero}</span><span className="text-xs text-slate-500">{dataBR(c.emissao)}</span><SeloSentido s={c.sentido} />
                          <span className="min-w-0 flex-1 text-xs text-slate-600">{c.sentido === "entrada" ? c.remetente_nome : c.destinatario_nome} · NF {c.nf_numero ?? "—"}</span>
                          <span className="num font-semibold">{brl(c.valor)}</span>
                        </li>
                      ))}
                      {!dela.length && <li className="py-1 text-slate-500">{f.situacao === "cancelada" ? "Os CT-e voltaram para \"sem fatura\" quando ela foi cancelada." : "Nenhum CT-e."}</li>}
                    </ul>
                  </td></tr>
                )}
              </Fragment>
            );
          })}
        </Table>
      </div>

      {podeFaturar && <ConferenciaBanco ctes={ctes} transportadoras={transportadoras} />}

      {montar && <MontarFatura ctes={ctes} transportadoras={transportadoras} onClose={() => setMontar(false)} />}
      {cancelar && <CancelarFatura fatura={cancelar} temConta={!!cancelar.conta_pagar_id} onClose={() => setCancelar(null)} />}
    </div>
  );
}

/** Frete dos CT-e (pela emissão) x saídas do banco para a transportadora, mês a mês, com o em aberto acumulado. */
function ConferenciaBanco({ ctes, transportadoras }: { ctes: Cte[]; transportadoras: Transportadora[] }) {
  const ids = [...new Set(ctes.filter((c) => c.mf_paga).map((c) => c.transportadora_id).filter(Boolean) as string[])];
  const [transp, setTransp] = useState(ids[0] ?? "");
  const t = transportadoras.find((x) => x.id === transp);
  const doTransp = ctes.filter((c) => c.transportadora_id === transp);
  const desde = doTransp.map((c) => c.emissao).sort()[0] ?? "9999-12-31";
  const { data: saidas = [] } = useRows<Lanc>("extrato_lancamentos", {
    select: "id, data, valor, descricao", order: "data", ascending: false, key: ["cte-banco", desde], filtro: (q) => q.lt("valor", 0).gte("data", desde),
  });
  const raiz = (t?.cnpj ?? "").replace(/\D/g, "").slice(0, 8);
  const pagos = t ? saidas.filter((l) => pagamentoDaTransportadora(l.descricao ?? "", t.nome, raiz)) : [];
  const linhas = conferenciaMensal(doTransp, pagos);
  if (!ids.length) return null;
  const totalFrete = r2(linhas.reduce((s, l) => s + l.frete, 0));
  const totalPago = r2(linhas.reduce((s, l) => s + l.pago, 0));
  return (
    <Section title="Conferência com o banco" actions={ids.length > 1 && (
      <select className="input w-auto" value={transp} onChange={(e) => setTransp(e.target.value)} aria-label="Transportadora">
        {ids.map((id) => <option key={id} value={id}>{nomeTransportadora(transportadoras.find((x) => x.id === id))}</option>)}
      </select>
    )}>
      <p className="mb-2 text-xs text-slate-500">Frete dos CT-e que a MF paga (pelo mês de emissão) x o que saiu dos bancos para {nomeTransportadora(t)} (pelo nome ou CNPJ na descrição).
        A fatura de um mês costuma ser paga no seguinte; o que vale é o <b>em aberto</b>, que soma mês a mês. Os CT-e só cobrem o período das planilhas importadas.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-2">Mês</th><th className="py-1 pr-2 text-right">Frete dos CT-e</th>
            <th className="py-1 pr-2 text-right">Pago no banco</th><th className="py-1 text-right">Em aberto (acumulado)</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <tr key={l.mes}><td className="whitespace-nowrap py-1.5 pr-2 font-semibold">{nomeMes(l.mes).replace(/^./, (x) => x.toUpperCase())}</td><td className="num py-1.5 pr-2 text-right">{brl(l.frete)}</td>
                <td className="num py-1.5 pr-2 text-right">{brl(l.pago)}</td>
                <td className={`num py-1.5 text-right font-semibold ${l.emAberto < -0.009 ? "text-amber-700" : ""}`}>{brl(l.emAberto)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-slate-200 font-semibold"><td className="py-1.5 pr-2">Total</td><td className="num py-1.5 pr-2 text-right">{brl(totalFrete)}</td>
            <td className="num py-1.5 pr-2 text-right">{brl(totalPago)}</td><td className="num py-1.5 text-right">{brl(r2(totalFrete - totalPago))}</td></tr></tfoot>
        </table>
      </div>
      {linhas[0]?.emAberto < -0.009 && <p className="mt-2 text-xs text-amber-700">Pago mais do que os CT-e importados: falta importar algum mês, ou o pagamento é de CT-e de outra unidade.</p>}
    </Section>
  );
}

/** Junta CT-e sem fatura (da mesma transportadora) numa fatura; com "lançar", cria a conta a pagar. */
export function MontarFatura({ ctes, transportadoras, inicial, onClose }: {
  ctes: Cte[]; transportadoras: Transportadora[]; inicial?: string[]; onClose: (ok?: boolean) => void;
}) {
  const invalidar = useInvalidate();
  const livres = ctes.filter(faturavel);
  const ids = [...new Set(livres.map((c) => c.transportadora_id ?? ""))];
  const primeiro = livres.find((c) => inicial?.includes(c.id))?.transportadora_id ?? ids[0] ?? "";
  const [transp, setTransp] = useState(primeiro);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(inicial?.length ? inicial : livres.filter((c) => c.transportadora_id === primeiro).map((c) => c.id)));
  const [numero, setNumero] = useState("");
  const [emissao, setEmissao] = useState(hoje());
  const [vencimento, setVencimento] = useState(somarDias(15));
  const [valor, setValor] = useState("");
  const [lancar, setLancar] = useState(true);
  const [gravando, setGravando] = useState(false);

  const visiveis = livres.filter((c) => (c.transportadora_id ?? "") === transp && (!de || c.emissao >= de) && (!ate || c.emissao <= ate));
  const escolhidos = visiveis.filter((c) => marcados.has(c.id));
  const soma = r2(escolhidos.reduce((s, c) => s + Number(c.valor), 0));
  const valorNum = valor.trim() ? Number(valor.replace(/\./g, "").replace(",", ".")) : soma;
  const dif = r2(valorNum - soma);
  const trocarTransp = (id: string) => { setTransp(id); setMarcados(new Set(livres.filter((c) => (c.transportadora_id ?? "") === id).map((c) => c.id))); };
  const marcar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosMarcados = visiveis.length > 0 && escolhidos.length === visiveis.length;

  async function gravar() {
    if (!numero.trim()) return notifyError(new Error("informe o número da fatura"));
    if (!escolhidos.length) return notifyError(new Error("marque os CT-e da fatura"));
    if (!(valorNum > 0)) return notifyError(new Error("valor da fatura inválido"));
    setGravando(true);
    const { error } = await supabase.rpc("criar_fatura_cte", {
      p_ctes: escolhidos.map((c) => c.id), p_numero: numero.trim(), p_vencimento: vencimento, p_valor: valor.trim() ? valorNum : null,
      p_emissao: emissao || null, p_lancar: lancar,
    });
    setGravando(false);
    if (error) return notifyError(error);
    notify(`Fatura nº ${numero.trim()} montada com ${escolhidos.length} CT-e${lancar ? " e lançada em contas a pagar (aguarda aprovação)" : ""}`);
    invalidar("ctes", "cte_faturas", "contas_pagar");
    onClose(true);
  }

  return (
    <Modal open wide onClose={() => onClose()} title="Montar fatura de frete">
      {!livres.length ? <p className="text-sm text-slate-600">Todos os CT-e que a MF paga já estão em fatura.</p> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            {ids.length > 1 && (
              <Field label="Transportadora" className="min-w-[12rem] flex-1">
                <select className="input" value={transp} onChange={(e) => trocarTransp(e.target.value)}>
                  {ids.map((id) => <option key={id} value={id}>{nomeTransportadora(transportadoras.find((t) => t.id === id))}</option>)}
                </select>
              </Field>
            )}
            <Field label="CT-e de" className="flex-1 sm:flex-none"><input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} /></Field>
            <Field label="até" className="flex-1 sm:flex-none"><input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></Field>
            <Button variant="ghost" onClick={() => setMarcados(todosMarcados ? new Set() : new Set(visiveis.map((c) => c.id)))}>{todosMarcados ? "Desmarcar todos" : "Marcar todos"}</Button>
          </div>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 text-sm">
            {visiveis.map((c) => (
              <li key={c.id}><label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 p-2 hover:bg-slate-50">
                <input type="checkbox" checked={marcados.has(c.id)} onChange={() => marcar(c.id)} />
                <span className="font-semibold">{c.numero}</span><span className="text-xs text-slate-500">{dataBR(c.emissao)}</span><SeloSentido s={c.sentido} />
                <span className="min-w-0 flex-1 text-xs text-slate-600">{c.sentido === "entrada" ? c.remetente_nome : c.destinatario_nome} · NF {c.nf_numero ?? "—"}</span>
                <span className="num font-semibold">{brl(c.valor)}</span>
              </label></li>
            ))}
            {!visiveis.length && <li className="p-3 text-slate-500">Nenhum CT-e sem fatura nesse período.</li>}
          </ul>
          <p className="text-sm"><b>{escolhidos.length} CT-e</b> marcados · soma {brl(soma)}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nº da fatura"><input className="input" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="como está no boleto" /></Field>
            <Field label="Emissão"><input className="input" type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} /></Field>
            <Field label="Vencimento"><input className="input" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></Field>
            <Field label="Valor da fatura"><input className="input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={brl(soma)} /></Field>
          </div>
          {Math.abs(dif) > 0.009 && escolhidos.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" />
              A fatura está {brl(Math.abs(dif))} {dif > 0 ? "acima" : "abaixo"} da soma dos CT-e marcados. Confira se falta CT-e, se há taxa (reentrega, TDE, agendamento) ou desconto.</p>
          )}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={lancar} onChange={(e) => setLancar(e.target.checked)} />
            <span>Lançar em contas a pagar (categoria frete, fornecedor pelo CNPJ da transportadora). A conta passa pela aprovação antes de pagar.</span></label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => onClose()}>Cancelar</Button>
            <Button onClick={gravar} disabled={gravando || !escolhidos.length}><Receipt size={16} /> {gravando ? "Gravando…" : `Montar fatura de ${brl(valorNum)}`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CancelarFatura({ fatura, temConta, onClose }: { fatura: FaturaCte; temConta: boolean; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [motivo, setMotivo] = useState("");
  const [gravando, setGravando] = useState(false);
  async function gravar() {
    setGravando(true);
    const { error } = await supabase.rpc("cancelar_fatura_cte", { p_fatura: fatura.id, p_motivo: motivo });
    setGravando(false);
    if (error) return notifyError(error);
    notify(`Fatura nº ${fatura.numero} cancelada; os CT-e voltaram para "sem fatura"`);
    invalidar("ctes", "cte_faturas");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={`Cancelar a fatura nº ${fatura.numero}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Os CT-e dela voltam para "sem fatura". Nada é apagado: a fatura fica como cancelada, com o motivo.</p>
        {temConta && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">A conta a pagar lançada por ela continua: cancele também em Contas a pagar, se for o caso.</p>}
        <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: número errado, CT-e faltando" /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button variant="danger" onClick={gravar} disabled={gravando || motivo.trim().length < 3}><Ban size={16} /> Cancelar fatura</Button>
        </div>
      </div>
    </Modal>
  );
}
