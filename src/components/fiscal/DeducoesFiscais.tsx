// Analista fiscal → Deduções (modo fiscal avançado): o que transforma gasto em despesa dedutível no Lucro Real e o
// que tira essa dedução. Junta o checklist da empresa (baixas com motivo, devolução a fornecedor, sucata,
// prestadores sem CNPJ, contratos PJ, manutenção da fábrica, CT-e nos fretes e créditos de PIS/COFINS), os pagamentos
// dos extratos sem documento e as baixas de estoque com o que falta para cada uma. Regras em lib/fiscalAvancado.ts.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, FileWarning, PackageMinus, Plus, Receipt, ShieldCheck, Truck } from "lucide-react";
import { Button, Field, Indicador, Modal, Table } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { useUnidade, EtiquetaUnidade } from "@/lib/unidade";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import {
  comprovacaoSaidas, creditoFretes, ehFrete, GRUPOS_COMPROVACAO, grupoComprovacao, pendenciasBaixa, REGRAS_BAIXA, regraBaixa,
  resumoBaixas, ROTULO_DEDUTIVEL, servicoSemDocumento, type BaixaEstoque, type SaidaExtrato,
} from "@/lib/fiscalAvancado";
import { RegistrarBaixa } from "./BaixaEstoque";

type BaixaLinha = BaixaEstoque & { produto: { descricao: string; unidade: string | null } | null };
type Situacao = "ok" | "parcial" | "falta";

const desde = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); };

export function DeducoesFiscais() {
  const navigate = useNavigate();
  const { tem, papel } = usePerfil();
  const invalidar = useInvalidate();
  const { filtrar } = useUnidade();
  const podeEditar = tem("financeiro");
  const inicio = useMemo(desde, []);
  const [baixa, setBaixa] = useState(false);
  const [documentar, setDocumentar] = useState<BaixaLinha | null>(null);
  const [cancelar, setCancelar] = useState<BaixaLinha | null>(null);

  const { data: config = [] } = useRows<{ id: string; fiscal_avancado: boolean }>("configuracoes", { select: "id, fiscal_avancado", order: "id", key: ["fiscal"] });
  const avancado = config[0]?.fiscal_avancado ?? true;
  async function alternar() {
    if (!config[0]) return;
    const { error } = await supabase.from("configuracoes").update({ fiscal_avancado: !avancado }).eq("id", config[0].id);
    if (error) return notifyError(error);
    notify(avancado ? "Modo fiscal avançado desligado" : "Modo fiscal avançado ligado");
    invalidar("configuracoes");
  }
  const { data: baixasT = [] } = useRows<BaixaLinha>("baixas_estoque", { select: "*, produto:produtos(descricao, unidade)", order: "created_at" });
  const { data: saidasT = [] } = useRows<SaidaExtrato & { conta_bancaria_id: string }>("extrato_lancamentos", {
    select: "id, data, valor, descricao, status, conta_pagar_id, identificador, conta_bancaria_id", order: "data",
    key: ["fiscal", inicio], filtro: (q) => q.lt("valor", 0).gte("data", inicio),
  });
  const { data: funcionarios = [] } = useRows<{ nome: string }>("funcionarios", { select: "nome", order: "nome", key: ["fiscal"] });
  const { data: ctes = [] } = useRows<{ mf_paga: boolean; sentido: string; valor: number; fatura_id: string | null; unidade_id: string | null; situacao: string | null; chave: string | null }>("ctes", {
    select: "mf_paga, sentido, valor, fatura_id, unidade_id, situacao, chave", order: "emissao", key: ["fiscal"],
  });
  const { data: faturas = [] } = useRows<{ conta_pagar_id: string | null }>("cte_faturas", { select: "conta_pagar_id", order: "created_at", key: ["fiscal"] });
  const { data: contas = [] } = useRows<{ id: string; descricao: string; categoria: string | null; fornecedor_id: string | null; valor: number; status: string; vencimento: string; unidade_id: string | null }>("contas_pagar", {
    select: "id, descricao, categoria, fornecedor_id, valor, status, vencimento, unidade_id", order: "vencimento", key: ["fiscal", inicio], filtro: (q) => q.gte("vencimento", inicio),
  });
  const { data: fornecedores = [] } = useRows<{ id: string; cnpj: string | null }>("fornecedores", { select: "id, cnpj", order: "nome", key: ["fiscal"] });
  const { data: devolucoes = [] } = useRows<{ id: string; status: string; unidade_id: string | null }>("notas_fiscais", {
    select: "id, status, unidade_id", order: "created_at", key: ["fiscal-devolucao"], filtro: (q) => q.eq("finalidade", "devolucao"),
  });

  const baixas = filtrar(baixasT);
  // o extrato é da conta bancária (sem unidade): entra inteiro
  const saidas: SaidaExtrato[] = saidasT;
  const grupos = useMemo(() => comprovacaoSaidas(saidas, funcionarios), [saidas, funcionarios]);
  const semDoc = grupos.reduce((s, g) => s + g.pendenteValor, 0);
  const pessoa = grupos.find((g) => g.grupo === "pessoa");
  const resumo = useMemo(() => resumoBaixas(baixas), [baixas]);
  const ano = hoje().slice(0, 4);
  const baixasAno = baixas.filter((b) => b.situacao !== "cancelada" && b.created_at.startsWith(ano));
  const baixasPendentes = baixas.filter((b) => pendenciasBaixa(b).length > 0);
  const fretes = creditoFretes(filtrar(ctes));
  const contasFiltradas = filtrar(contas).filter((c) => c.status !== "cancelado");
  const comFatura = new Set(faturas.map((f) => f.conta_pagar_id).filter(Boolean));
  const fretesSemCte = contasFiltradas.filter((c) => ehFrete(c) && !comFatura.has(c.id));
  const fornPorId = new Map(fornecedores.map((f) => [f.id, f]));
  const servicosSemDoc = contasFiltradas.filter((c) => servicoSemDocumento(c, c.fornecedor_id ? fornPorId.get(c.fornecedor_id) : null));
  const maiores = useMemo(() => saidas
    .filter((s) => !s.conta_pagar_id && s.status !== "conciliado" && s.status !== "transferencia" && s.status !== "ignorado")
    .map((s) => ({ ...s, grupo: grupoComprovacao(s.descricao, Number(s.valor), funcionarios) }))
    .filter((s) => GRUPOS_COMPROVACAO[s.grupo].risco !== "baixo")
    .sort((a, b) => Number(a.valor) - Number(b.valor)).slice(0, 25), [saidas, funcionarios]);

  const checklist: { titulo: string; situacao: Situacao; texto: string; acao?: { rotulo: string; ir: () => void } }[] = [
    {
      titulo: "Motivos de baixa de estoque", situacao: "ok",
      texto: `Quebra, defeito de fornecedor, obsolescência, furto, uso interno, manutenção da fábrica, sucata e amostra, cada um com o documento exigido. ${baixasAno.length} ${pl(baixasAno.length, "baixa", "baixas")} em ${ano}.`,
      acao: podeEditar ? { rotulo: "Registrar baixa", ir: () => setBaixa(true) } : undefined,
    },
    {
      titulo: "NF de devolução de compras", situacao: baixas.some((b) => b.motivo === "defeito_fornecedor" && !b.nota_devolucao_id && b.situacao !== "cancelada") ? "parcial" : "ok",
      texto: `${devolucoes.filter((d) => d.status === "autorizada").length} NF de devolução autorizadas. Peça com defeito entra como "Defeito de fornecedor" e fica pendente até ligar a NF de devolução.`,
      acao: { rotulo: "Emitir devolução", ir: () => navigate("/notas") },
    },
    {
      titulo: "Sucatas e cavacos", situacao: "ok",
      texto: "Motivo \"Sucata\" com o peso (kg) obrigatório; a venda para a recicladora sai pela NF direta (Notas fiscais → Emitir NF).",
    },
    {
      titulo: "Prestador sem CNPJ/CPF", situacao: servicosSemDoc.length ? "parcial" : "ok",
      texto: servicosSemDoc.length
        ? `${servicosSemDoc.length} ${pl(servicosSemDoc.length, "conta", "contas")} de serviço para fornecedor sem CNPJ/CPF (${brl(servicosSemDoc.reduce((s, c) => s + Number(c.valor), 0))}). Sem beneficiário identificado a despesa é glosada.`
        : "Nenhuma conta de serviço para fornecedor sem CNPJ/CPF nos últimos 12 meses.",
      acao: { rotulo: "Contas a pagar", ir: () => navigate("/financeiro?aba=pagar") },
    },
    {
      titulo: "Contratos de serviço PJ", situacao: "parcial",
      texto: "Use Contas fixas para cada contrato mensal (contador, advogado, manutenção) e importe a NFS-e de cada mês em Notas fiscais → NFS-e → Recebidas.",
      acao: { rotulo: "NFS-e recebidas", ir: () => navigate("/notas?aba=nfse") },
    },
    {
      titulo: "Manutenção das máquinas da fábrica", situacao: "parcial",
      texto: "Peças aplicadas: baixa \"Manutenção de máquina da fábrica\" com a máquina. Serviço de terceiro: NFS-e recebida em nome da MF. (OS interna com as duas coisas juntas: próxima etapa.)",
    },
    {
      titulo: "CT-e nos fretes", situacao: fretesSemCte.length ? "parcial" : "ok",
      texto: fretesSemCte.length
        ? `${fretesSemCte.length} ${pl(fretesSemCte.length, "conta", "contas")} de frete sem CT-e ligado (${brl(fretesSemCte.reduce((s, c) => s + Number(c.valor), 0))}). Monte a fatura em Fretes → Faturas de frete.`
        : "Fretes pagos pela fatura de CT-e (Fretes → Faturas de frete).",
      acao: { rotulo: "CT-e e faturas", ir: () => navigate("/fretes?aba=faturas") },
    },
    {
      titulo: "Crédito de PIS/COFINS sobre fretes", situacao: fretes.base ? "parcial" : "falta",
      texto: `${fretes.n} CT-e pagos pela MF em compras e vendas${fretes.daSefaz ? ` (${fretes.daSefaz} vindos sozinhos da SEFAZ)` : ""}: base ${brl(fretes.base)}, crédito estimado ${brl(fretes.credito)} (9,25%). CT-e cancelado fica fora. Confirmar com o contador se já entra na EFD-Contribuições.`,
    },
  ];

  return (
    <div className="space-y-5">
      <div className={`flex gap-2 rounded-xl border p-3 text-sm ${avancado ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <p>
          <b>Modo fiscal avançado {avancado ? "ligado" : "desligado"}.</b> {avancado
            ? "Toda saída de estoque que não é venda pede motivo fiscal; obsolescência exige laudo, furto exige boletim de ocorrência, defeito exige o fornecedor, manutenção exige a máquina e sucata exige o peso."
            : "As baixas de estoque ficam sem exigência de documento."}
          {" "}Estimativas a partir do ERP; a dedução oficial (LALUR/ECF) é do contador.
          {papel === "admin" && <button type="button" onClick={alternar} className="ml-1 font-semibold underline">{avancado ? "Desligar" : "Ligar"}</button>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Saídas sem documento (12 meses)" valor={brl(semDoc)} sub="nos extratos, sem NF ou conta ligada" icon={FileWarning} cor={semDoc ? "vermelho" : "verde"} />
        <Indicador rotulo="Pix para pessoas sem documento" valor={brl(pessoa?.pendenteValor ?? 0)} sub={`${pessoa?.pendentes ?? 0} pagamentos · risco de IRRF 35%`} icon={AlertTriangle} cor={pessoa?.pendenteValor ? "ambar" : "verde"} />
        <Indicador rotulo={`Baixas de estoque em ${ano}`} valor={brl(baixasAno.reduce((s, b) => s + Number(b.valor ?? 0), 0))} sub={`${baixasPendentes.length} sem documento`} icon={PackageMinus} cor="azul" />
        <Indicador rotulo="Crédito estimado sobre fretes" valor={brl(fretes.credito)} sub={`PIS/COFINS de ${fretes.n} CT-e`} icon={Truck} cor="verde" />
      </div>

      <section>
        <h3 className="mb-2 font-bold">Checklist da fábrica e da revenda</h3>
        <ul className="grid gap-2 md:grid-cols-2">
          {checklist.map((c) => (
            <li key={c.titulo} className="flex gap-3 rounded-xl border border-slate-200 bg-surface p-3">
              {c.situacao === "ok" ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" aria-label="pronto" />
                : c.situacao === "parcial" ? <CircleDashed size={20} className="mt-0.5 shrink-0 text-amber-600" aria-label="parcial" />
                : <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" aria-label="falta" />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.titulo}</div>
                <p className="text-sm text-slate-600">{c.texto}</p>
                {c.acao && <button type="button" onClick={c.acao.ir} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">{c.acao.rotulo} <ArrowRight size={14} /></button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-1 font-bold">Pagamentos dos extratos: quanto tem documento</h3>
        <p className="mb-2 text-sm text-slate-600">Despesa só é dedutível com documento (NF, NFS-e, RPA ou recibo com CPF/CNPJ). Ligue cada pagamento à conta da nota em Bancos e conciliação.</p>
        <Table head={<><th className="th">Tipo</th><th className="th text-right">Pagamentos</th><th className="th text-right">Sem documento</th><th className="th">O que fazer</th></>}>
          {grupos.map((g) => {
            const info = GRUPOS_COMPROVACAO[g.grupo];
            return (
              <tr key={g.grupo} className="tr">
                <td className="td" data-label="Tipo">
                  <div className="font-medium">{info.rotulo}</div>
                  <span className={`text-xs font-semibold ${info.risco === "alto" ? "text-red-700" : info.risco === "medio" ? "text-amber-700" : "text-slate-500"}`}>risco {info.risco}</span>
                </td>
                <td className="td text-right whitespace-nowrap" data-label="Pagamentos">{brl(g.total)}<div className="text-xs text-slate-500">{g.n}</div></td>
                <td className="td text-right whitespace-nowrap" data-label="Sem documento">{brl(g.pendenteValor)}<div className="text-xs text-slate-500">{g.pendentes}</div></td>
                <td className="td text-sm text-slate-600" data-label="O que fazer">{info.oQueFazer}</td>
              </tr>
            );
          })}
        </Table>
        {maiores.length > 0 && (
          <details className="mt-2 rounded-xl border border-slate-200 bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold">Os {maiores.length} maiores pagamentos sem documento</summary>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {maiores.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="w-20 shrink-0 text-slate-500">{dataBR(s.data)}</span>
                  <span className="min-w-0 flex-1 truncate">{s.descricao}</span>
                  <span className="text-xs text-slate-500">{GRUPOS_COMPROVACAO[s.grupo].rotulo}</span>
                  <span className="num font-semibold">{brl(-Number(s.valor))}</span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" className="mt-2" onClick={() => navigate("/conciliacao")}>Abrir Bancos e conciliação</Button>
          </details>
        )}
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold">Baixas de estoque (perdas, consumo e sucata)</h3>
          {podeEditar && <Button onClick={() => setBaixa(true)}><Plus size={16} /> Registrar baixa</Button>}
        </div>
        {resumo.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {resumo.map((r) => (
              <span key={r.motivo} className="rounded-full border border-slate-200 bg-surface px-3 py-1 text-xs">
                {regraBaixa(r.motivo)?.rotulo}: <b>{brl(r.valor)}</b> · {r.n}{r.pendentes ? <span className="text-amber-700"> · {r.pendentes} sem documento</span> : null}
              </span>
            ))}
          </div>
        )}
        <Table empty={!baixas.length} head={<>
          <th className="th">Nº / data</th><th className="th">Motivo</th><th className="th">Item</th><th className="th text-right">Valor</th><th className="th">Documento</th><th className="th" />
        </>}>
          {[...baixas].reverse().map((b) => {
            const r = regraBaixa(b.motivo);
            const falta = pendenciasBaixa(b);
            return (
              <tr key={b.id} className={`tr ${b.situacao === "cancelada" ? "opacity-60" : ""}`}>
                <td className="td whitespace-nowrap" data-label="Nº">#{b.numero}<div className="text-xs text-slate-500">{dataBR(b.created_at)}</div><EtiquetaUnidade id={b.unidade_id} /></td>
                <td className="td" data-label="Motivo">
                  <div className="font-medium">{r?.rotulo ?? b.motivo}</div>
                  {r && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROTULO_DEDUTIVEL[r.dedutivel].cor}`}>{ROTULO_DEDUTIVEL[r.dedutivel].label}</span>}
                </td>
                <td className="td" data-label="Item">
                  <div>{b.produto?.descricao ?? "—"}</div>
                  <div className="text-xs text-slate-500">{Number(b.quantidade)} {b.produto?.unidade ?? ""}{b.peso_kg ? ` · ${Number(b.peso_kg)} kg` : ""}{b.equipamento ? ` · ${b.equipamento}` : ""} · {b.descricao}</div>
                </td>
                <td className="td text-right whitespace-nowrap" data-label="Valor">{brl(Number(b.valor ?? 0))}</td>
                <td className="td text-sm" data-label="Documento">
                  {b.situacao === "cancelada" ? <span className="text-slate-500">Cancelada: {b.cancelada_motivo}</span>
                    : falta.length ? <span className="text-amber-700">Falta: {falta.join(", ")}</span>
                    : <span className="text-emerald-700">{b.situacao === "comprovada" ? "Comprovada" : "Documentada"}{b.evidencia ? ` · ${b.evidencia}` : ""}</span>}
                </td>
                <td className="td whitespace-nowrap" data-label="">
                  {podeEditar && b.situacao !== "cancelada" && <>
                    <Button variant="ghost" onClick={() => setDocumentar(b)}><Receipt size={15} /> Documento</Button>
                    <Button variant="ghost" onClick={() => setCancelar(b)}>Cancelar</Button>
                  </>}
                </td>
              </tr>
            );
          })}
        </Table>
      </section>

      <section className="rounded-xl border border-slate-200 bg-surface p-3 text-sm">
        <h3 className="mb-1 font-bold">Regras de cada motivo</h3>
        <ul className="space-y-1.5">
          {REGRAS_BAIXA.map((r) => (
            <li key={r.id}><b>{r.rotulo}</b> — {ROTULO_DEDUTIVEL[r.dedutivel].label.toLowerCase()}. {r.documento}. <span className="text-slate-500">{r.base}.</span></li>
          ))}
        </ul>
      </section>

      {baixa && <RegistrarBaixa onClose={() => setBaixa(false)} />}
      {documentar && <DocumentarBaixa baixa={documentar} onClose={() => setDocumentar(null)} />}
      {cancelar && <CancelarBaixa baixa={cancelar} onClose={() => setCancelar(null)} />}
    </div>
  );
}

function DocumentarBaixa({ baixa, onClose }: { baixa: BaixaLinha; onClose: () => void }) {
  const r = regraBaixa(baixa.motivo)!;
  const [evidencia, setEvidencia] = useState(baixa.evidencia ?? "");
  const [nota, setNota] = useState(baixa.nota_devolucao_id ?? "");
  const [equipamento, setEquipamento] = useState(baixa.equipamento ?? "");
  const [peso, setPeso] = useState(baixa.peso_kg ? String(baixa.peso_kg) : "");
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  const { data: devolucoes = [] } = useRows<{ id: string; numero: number | null; status: string; created_at: string }>("notas_fiscais", {
    select: "id, numero, status, created_at", order: "created_at", key: ["devolucoes-baixa"], filtro: (q) => q.eq("finalidade", "devolucao"),
  });

  async function salvar(comprovada: boolean) {
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("documentar_baixa_estoque", {
        p_id: baixa.id, p_evidencia: evidencia || null, p_nota_devolucao: nota || null, p_equipamento: equipamento || null,
        p_peso_kg: peso ? Number(peso.replace(",", ".")) : null, p_comprovada: comprovada,
      });
      if (error) throw error;
      notify(comprovada ? "Baixa comprovada" : "Documento guardado");
      invalidar("baixas_estoque");
      onClose();
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} title={`Documento da baixa #${baixa.numero}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{r.rotulo}: {r.documento}.</p>
        <Field label={r.id === "furto_extravio" ? "Boletim de ocorrência" : "Laudo, fotos ou comprovante (número ou link)"}>
          <input className="input" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} />
        </Field>
        {r.id === "defeito_fornecedor" && (
          <Field label="NF de devolução">
            <select className="input" value={nota} onChange={(e) => setNota(e.target.value)}>
              <option value="">Escolha a nota…</option>
              {devolucoes.map((d) => <option key={d.id} value={d.id}>NF {d.numero ?? "—"} · {dataBR(d.created_at)} · {d.status}</option>)}
            </select>
          </Field>
        )}
        {r.exigeEquipamento && <Field label="Máquina da fábrica"><input className="input" value={equipamento} onChange={(e) => setEquipamento(e.target.value)} /></Field>}
        {r.pedePeso && <Field label="Peso (kg)"><input className="input" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></Field>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => salvar(false)} disabled={salvando}>Guardar</Button>
          <Button onClick={() => salvar(true)} disabled={salvando}>Guardar e marcar comprovada</Button>
        </div>
      </div>
    </Modal>
  );
}

function CancelarBaixa({ baixa, onClose }: { baixa: BaixaLinha; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  async function cancelar() {
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("cancelar_baixa_estoque", { p_numero: baixa.numero, p_motivo: motivo });
      if (error) throw error;
      notify(`Baixa #${baixa.numero} cancelada; o estoque voltou`);
      invalidar("baixas_estoque", "produtos", "estoque_movimentos", "estoque_unidade");
      onClose();
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }
  return (
    <Modal open onClose={onClose} title={`Cancelar a baixa #${baixa.numero}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Todos os itens desta baixa voltam para o estoque. O registro fica no histórico.</p>
        <Field label="Motivo do cancelamento"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: peça encontrada no almoxarifado" /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button onClick={cancelar} disabled={salvando || motivo.trim().length < 5}>Cancelar baixa</Button>
        </div>
      </div>
    </Modal>
  );
}
