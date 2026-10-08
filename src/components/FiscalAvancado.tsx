// Notas fiscais: carta de correção, inutilização de numeração e regras de tributação.
import { useState, type FormEvent } from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Field, Modal, Table } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { callFunction, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR } from "@/lib/format";
import { CampoUnidade, useUnidade } from "@/lib/unidade";
import { CST_IBS_CBS, CST_ICMS, CST_IPI, CST_PIS_COFINS, type Codigo } from "@/lib/codigosFiscais";
import { SelectCodigo } from "./ConfigNfe";
import type { RegraTributaria } from "../../supabase/functions/_shared/nfe-impostos";

type Carta = { id: string; nota_id: string; sequencia: number | null; correcao: string; status: string; mensagem: string | null; pdf_url: string | null; created_at: string };

/* ------------------------------ Carta de correção ------------------------------ */

export function CartaCorrecaoModal({ nota, onClose }: { nota: { id: string; numero: string | null; serie: string | null }; onClose: () => void }) {
  const { data: todas = [] } = useRows<Carta>("nfe_cartas_correcao", { order: "created_at", ascending: true });
  const cartas = todas.filter((c) => c.nota_id === nota.id);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidar = useInvalidate();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      await callFunction("nfe-consultar", { nota_id: nota.id, acao: "carta_correcao", correcao: texto });
      notify("Carta de correção registrada na SEFAZ");
      setTexto("");
    } catch (err) { notifyError(err); } finally { setOcupado(false); invalidar("nfe_cartas_correcao"); }
  }

  return (
    <Modal open onClose={onClose} title={`Carta de correção · NF-e ${nota.numero ?? ""}/${nota.serie ?? ""}`}>
      <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Serve para corrigir dados como descrição, endereço de entrega, transportadora ou informações complementares.
        <b> Não corrige</b> valores, impostos, quantidade, dados que mudem quem é o destinatário, nem a data de emissão.
        Cada nova carta substitui a anterior: escreva todas as correções juntas.
      </div>
      {cartas.length > 0 && (
        <ul className="mb-3 space-y-2">
          {cartas.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{c.sequencia ? `CC-e nº ${c.sequencia}` : "CC-e"}</b> <Badge value={c.status} />
                <span className="text-xs text-slate-500">{dataBR(c.created_at)}</span>
                {c.pdf_url && <a href={c.pdf_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-brand"><ExternalLink size={14} /> PDF</a>}
              </div>
              <p className="mt-1 text-slate-700">{c.correcao}</p>
              {c.status === "erro" && c.mensagem && <p className="text-xs text-red-600">{c.mensagem}</p>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={enviar} className="space-y-3">
        <Field label={`Correção (${texto.trim().length}/1000, mínimo 15)`}>
          <textarea className="input" rows={4} maxLength={1000} value={texto} onChange={(e) => setTexto(e.target.value)} required
            placeholder="Ex.: Onde se lê 'Rua das Flores, 10', leia-se 'Rua das Flores, 100'." />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          <Button disabled={ocupado || texto.trim().length < 15}>{ocupado ? "Enviando…" : "Enviar carta de correção"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ Inutilização ------------------------------ */

type Inutilizacao = { id: string; unidade_id: string; serie: number; numero_inicial: number; numero_final: number; justificativa: string; status: string; mensagem: string | null; created_at: string };

export function InutilizarModal({ onClose }: { onClose: () => void }) {
  const { padrao, nome, unidades } = useUnidade();
  const { data: lista = [] } = useRows<Inutilizacao>("nfe_inutilizacoes", {});
  const [f, setF] = useState({ unidade_id: padrao ?? unidades[0]?.id ?? "", serie: "1", numero_inicial: "", numero_final: "", justificativa: "" });
  const [ocupado, setOcupado] = useState(false);
  const invalidar = useInvalidate();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!confirm(`Inutilizar os números ${f.numero_inicial} a ${f.numero_final || f.numero_inicial} da série ${f.serie} (${nome(f.unidade_id)})? Não dá para desfazer.`)) return;
    setOcupado(true);
    try {
      await callFunction("nfe-consultar", { acao: "inutilizar", ...f, numero_final: f.numero_final || f.numero_inicial });
      notify("Numeração inutilizada na SEFAZ");
      setF({ ...f, numero_inicial: "", numero_final: "", justificativa: "" });
    } catch (err) { notifyError(err); } finally { setOcupado(false); invalidar("nfe_inutilizacoes"); }
  }

  return (
    <Modal open onClose={onClose} title="Inutilizar numeração de NF-e">
      <p className="mb-3 text-sm text-slate-600">
        Use quando um número de nota foi pulado e nunca vai ser usado (ex.: a nota foi rejeitada e a próxima saiu com outro número).
        A SEFAZ exige a inutilização até o dia 10 do mês seguinte.
      </p>
      <form onSubmit={enviar} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-4"><CampoUnidade value={f.unidade_id} onChange={(v) => setF({ ...f, unidade_id: v })} label="CNPJ (unidade)" /></div>
        <Field label="Série"><input className="input" inputMode="numeric" value={f.serie} onChange={set("serie")} required /></Field>
        <Field label="Do número"><input className="input" inputMode="numeric" value={f.numero_inicial} onChange={set("numero_inicial")} required /></Field>
        <Field label="Até o número"><input className="input" inputMode="numeric" value={f.numero_final} onChange={set("numero_final")} placeholder={f.numero_inicial} /></Field>
        <div />
        <Field label="Justificativa (mínimo 15 caracteres)" className="col-span-2 sm:col-span-4">
          <input className="input" value={f.justificativa} onChange={set("justificativa")} maxLength={255} required placeholder="Ex.: Numeração pulada por falha na transmissão" />
        </Field>
        <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          <Button disabled={ocupado}>{ocupado ? "Enviando…" : "Inutilizar"}</Button>
        </div>
      </form>
      {lista.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
          <ul className="space-y-1 text-sm">
            {lista.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <span>{nome(i.unidade_id)} · série {i.serie} · nº {i.numero_inicial}{i.numero_final !== i.numero_inicial ? ` a ${i.numero_final}` : ""}</span>
                <Badge value={i.status} /><span className="text-xs text-slate-500">{dataBR(i.created_at)}</span>
                {i.status === "erro" && <span className="w-full text-xs text-red-600">{i.mensagem}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------ Regras de tributação ------------------------------ */

type Regra = RegraTributaria & { id?: string };
const OPCOES = {
  operacao: [["", "Qualquer"], ["venda", "Venda"], ["transferencia", "Transferência SC ↔ SP"]],
  destino: [["", "Qualquer"], ["interna", "Dentro do estado"], ["interestadual", "Outro estado"]],
  tipo_cliente: [["", "Qualquer"], ["contribuinte", "Contribuinte de ICMS (com IE)"], ["nao_contribuinte", "Consumidor final / sem IE"]],
  tipo_produto: [["", "Qualquer"], ["maquina", "Máquina"], ["peca", "Peça"], ["acessorio", "Acessório"], ["insumo", "Insumo"]],
  origem_mercadoria: [["", "Qualquer"], ["nacional", "Nacional"], ["importada", "Importada"]],
} as const;
const rotulo = (k: keyof typeof OPCOES, v: unknown) => OPCOES[k].find(([x]) => x === (v ?? ""))?.[1];

function resumoCondicao(r: Regra, nomeUn: (id: string) => string) {
  const p = [
    r.unidade_id && nomeUn(r.unidade_id), r.operacao && rotulo("operacao", r.operacao), r.destino && rotulo("destino", r.destino),
    r.tipo_cliente && rotulo("tipo_cliente", r.tipo_cliente), r.tipo_produto && rotulo("tipo_produto", r.tipo_produto),
    r.origem_mercadoria && rotulo("origem_mercadoria", r.origem_mercadoria), r.ncm_prefixo && `NCM ${r.ncm_prefixo}…`, r.cfop && `CFOP ${r.cfop}`,
    r.ufs_destino?.length && `para ${r.ufs_destino.join(", ")}`,
  ].filter(Boolean);
  return p.length ? p.join(" · ") : "Todas as operações";
}
function resumoResultado(r: Regra) {
  const p = [
    r.cfop_saida && `CFOP ${r.cfop_saida}`,
    (r.icms_cst || r.icms_aliquota != null || r.icms_reducao_base != null) && `ICMS ${[r.icms_cst && `CST ${r.icms_cst}`, r.icms_aliquota != null && `${r.icms_aliquota}%`, r.icms_reducao_base != null && `redução ${r.icms_reducao_base}%`].filter(Boolean).join(" ")}`,
    r.difal != null && (r.difal ? "com DIFAL" : "sem DIFAL"),
    (r.ipi_cst || r.ipi_aliquota != null) && `IPI ${[r.ipi_cst && `CST ${r.ipi_cst}`, r.ipi_aliquota != null && `${r.ipi_aliquota}%`].filter(Boolean).join(" ")}`,
    (r.pis_cst || r.pis_aliquota != null) && `PIS ${[r.pis_cst, r.pis_aliquota != null && `${r.pis_aliquota}%`].filter(Boolean).join(" ")}`,
    (r.cofins_cst || r.cofins_aliquota != null) && `COFINS ${[r.cofins_cst, r.cofins_aliquota != null && `${r.cofins_aliquota}%`].filter(Boolean).join(" ")}`,
    (r.ibs_cbs_cst || r.ibs_cbs_class_trib) && `IBS/CBS ${[r.ibs_cbs_cst && `CST ${r.ibs_cbs_cst}`, r.ibs_cbs_class_trib].filter(Boolean).join(" ")}`,
    r.observacao_nfe && "observação na nota",
  ].filter(Boolean);
  return p.length ? p.join(" · ") : "—";
}

export function RegrasTributacao({ podeEditar }: { podeEditar: boolean }) {
  const { data: regras = [], isLoading } = useRows<Regra>("regras_tributacao", { order: "prioridade", ascending: true });
  const { nome } = useUnidade();
  const [editando, setEditando] = useState<Regra | null>(null);
  const invalidar = useInvalidate();

  async function remover(r: Regra) {
    if (!confirm(`Apagar a regra "${r.nome}"?`)) return;
    const { error } = await supabase.from("regras_tributacao").delete().eq("id", r.id!);
    if (error) return notifyError(error);
    invalidar("regras_tributacao");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-600">
          Sem regra, cada nota usa o padrão da unidade (aba Configurações da NF-e). Uma regra troca só o que você preencher,
          para as notas que combinam com as condições. Vale a primeira regra que combinar, pela ordem de prioridade.
          <b> Confira cada regra com o contador e teste em homologação.</b>
        </p>
        {podeEditar && <Button onClick={() => setEditando({ nome: "", prioridade: 100, ativo: true })}><Plus size={16} /> Nova regra</Button>}
      </div>
      <Table empty={!isLoading && !regras.length}
        head={<><th className="th w-16">Ordem</th><th className="th">Regra</th><th className="th">Quando</th><th className="th">Aplica</th><th className="th" /></>}>
        {regras.map((r) => (
          <tr key={r.id} className={r.ativo === false ? "opacity-60" : ""}>
            <td className="td num">{r.prioridade}</td>
            <td className="td"><div className="font-semibold">{r.nome}</div>{r.ativo === false && <Badge value="inativo" />}</td>
            <td className="td text-sm">{resumoCondicao(r, nome)}</td>
            <td className="td text-sm">{resumoResultado(r)}</td>
            <td className="td whitespace-nowrap text-right">
              {podeEditar && <>
                <Button variant="secondary" onClick={() => setEditando(r)}><Pencil size={15} /> Editar</Button>
                <Button variant="ghost" className="!text-red-600" aria-label="Apagar" onClick={() => remover(r)}><Trash2 size={15} /></Button>
              </>}
            </td>
          </tr>
        ))}
      </Table>
      {editando && <RegraModal regra={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

const NUM = ["icms_aliquota", "icms_reducao_base", "ipi_aliquota", "pis_aliquota", "cofins_aliquota"] as const;

function RegraModal({ regra, onClose }: { regra: Regra; onClose: () => void }) {
  const [r, setR] = useState<Record<string, any>>({ ...regra, difal: regra.difal == null ? "" : regra.difal ? "sim" : "nao", ufs_destino: (regra.ufs_destino ?? []).join(", ") });
  const invalidar = useInvalidate();
  const set = (k: string) => (e: { target: { value: string } }) => setR({ ...r, [k]: e.target.value });
  const sel = (k: keyof typeof OPCOES, label: string) => (
    <Field label={label}><select className="input" value={r[k] ?? ""} onChange={set(k)}>{OPCOES[k].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
  );
  const txt = (k: string, label: string, ph = "") => <Field label={label}><input className="input" value={r[k] ?? ""} onChange={set(k)} placeholder={ph} /></Field>;
  const cod = (k: string, label: string, lista: Codigo[]) => (
    <Field label={label}><SelectCodigo lista={lista} value={r[k]} onChange={(v) => setR({ ...r, [k]: v })} vazio="Padrão da unidade" /></Field>
  );

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const row: Record<string, any> = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === "" ? null : v]));
    for (const k of NUM) row[k] = row[k] == null ? null : Number(String(row[k]).replace(",", "."));
    row.prioridade = Number(row.prioridade || 100);
    row.difal = r.difal === "" ? null : r.difal === "sim";
    row.ativo = !!r.ativo;
    const ufs = String(r.ufs_destino ?? "").toUpperCase().split(/[^A-Z]+/).filter((x) => x.length === 2);
    row.ufs_destino = ufs.length ? [...new Set(ufs)] : null;
    const { error } = row.id
      ? await supabase.from("regras_tributacao").update(row).eq("id", row.id)
      : await supabase.from("regras_tributacao").insert(row);
    if (error) return notifyError(error);
    notify("Regra salva");
    invalidar("regras_tributacao");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={regra.id ? "Editar regra de tributação" : "Nova regra de tributação"} wide>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Nome da regra" className="sm:col-span-2"><input className="input" value={r.nome} onChange={set("nome")} required placeholder="Ex.: Máquinas para outro estado" /></Field>
          <Field label="Ordem (menor vale primeiro)"><input className="input" type="number" value={r.prioridade} onChange={set("prioridade")} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={!!r.ativo} onChange={(e) => setR({ ...r, ativo: e.target.checked })} /> Ativa</label>
        </div>
        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold">Quando (vazio = qualquer)</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><CampoUnidadeOpcional value={r.unidade_id} onChange={(v) => setR({ ...r, unidade_id: v })} /></div>
            {sel("operacao", "Operação")}
            {sel("destino", "Destino")}
            {sel("tipo_cliente", "Cliente")}
            {sel("tipo_produto", "Tipo de produto")}
            {sel("origem_mercadoria", "Origem da mercadoria")}
            {txt("ncm_prefixo", "NCM começa com", "8418")}
            {txt("cfop", "CFOP calculado", "6102")}
            <Field label="Estados de destino (vazio = todos)" className="sm:col-span-2">
              <input className="input" value={r.ufs_destino} onChange={set("ufs_destino")} placeholder="MG, PR, RJ, RS, SP" />
            </Field>
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold">Aplica (vazio = padrão da unidade)</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {txt("cfop_saida", "Trocar CFOP para", "6108")}
            {cod("icms_cst", "ICMS CST", CST_ICMS)}
            {txt("icms_aliquota", "ICMS alíquota %", "auto")}
            {txt("icms_reducao_base", "ICMS redução da base %")}
            <Field label="DIFAL">
              <select className="input" value={r.difal} onChange={set("difal")}><option value="">Padrão</option><option value="sim">Calcular</option><option value="nao">Não calcular</option></select>
            </Field>
            {cod("ipi_cst", "IPI CST", CST_IPI)}
            {txt("ipi_aliquota", "IPI alíquota %", "TIPI do produto")}
            {txt("ipi_enquadramento", "IPI enquadramento", "999")}
            {cod("pis_cst", "PIS CST", CST_PIS_COFINS)}
            {txt("pis_aliquota", "PIS %", "1,65")}
            {cod("cofins_cst", "COFINS CST", CST_PIS_COFINS)}
            {txt("cofins_aliquota", "COFINS %", "7,6")}
            {cod("ibs_cbs_cst", "IBS/CBS CST", CST_IBS_CBS)}
            {txt("ibs_cbs_class_trib", "IBS/CBS cClassTrib", "000001")}
            <Field label="Texto nas informações complementares da nota" className="col-span-2 sm:col-span-4">
              <textarea className="input" rows={2} value={r.observacao_nfe ?? ""} onChange={set("observacao_nfe")} placeholder="Ex.: Base de cálculo reduzida conforme art. … do RICMS/SC" />
            </Field>
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button>Salvar regra</Button>
        </div>
      </form>
    </Modal>
  );
}

function CampoUnidadeOpcional({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { unidades } = useUnidade();
  return (
    <Field label="Unidade (CNPJ)">
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Todas</option>
        {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </select>
    </Field>
  );
}
