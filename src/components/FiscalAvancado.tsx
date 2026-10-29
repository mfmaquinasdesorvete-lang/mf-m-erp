// Notas fiscais: carta de correção, inutilização de numeração e regras de tributação.
import { useState, type FormEvent } from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Carregando, Field, Modal } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { callFunction, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR } from "@/lib/format";
import { CampoUnidade, useUnidade } from "@/lib/unidade";
import { CST_IBS_CBS, CST_ICMS, CST_IPI, CST_PIS_COFINS, type Codigo } from "@/lib/codigosFiscais";
import { SelectCodigo } from "./ConfigNfe";
import type { RegraTributaria } from "../../supabase/functions/_shared/nfe-impostos";
import { confirmar } from "@/components/Dialogos";
import { juntarCorrecao, semFreteNaNota, textoTrocaTransportadora, transportadoraDaUltimaCarta } from "@/lib/cartaCorrecao";
import { lerReducoes, textoReducoes, type ModeloRegra } from "@/lib/regrasTributacao";
import { CartaoRegra, ComoFuncionaRegras, GlossarioFiscal, ModelosRegra, TesteVenda } from "@/components/fiscal/RegrasPainel";

type Carta = { id: string; nota_id: string; sequencia: number | null; correcao: string; status: string; mensagem: string | null; pdf_url: string | null; created_at: string };

/* ------------------------------ Carta de correção ------------------------------ */

type Transp = { id: string; nome: string; nome_fantasia: string | null; cnpj: string | null; inscricao_estadual: string | null; logradouro: string | null; numero: string | null; bairro: string | null; municipio: string | null; uf: string | null };

export function CartaCorrecaoModal({ nota, onClose }: { nota: { id: string; numero: string | null; serie: string | null; payload?: any; pedido_id?: string | null }; onClose: () => void }) {
  const { data: todas = [], isLoading } = useRows<Carta>("nfe_cartas_correcao", { order: "created_at", ascending: true });
  const cartas = todas.filter((c) => c.nota_id === nota.id);
  // a última carta autorizada vale sozinha (substitui as anteriores): a nova começa com o texto dela
  const autorizadas = cartas.filter((c) => c.status === "autorizada")
    .sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0) || a.created_at.localeCompare(b.created_at));
  const ultima = autorizadas[autorizadas.length - 1] ?? null;
  const [texto, setTexto] = useState<string | null>(null);
  const atual = texto ?? (ultima?.correcao ?? "");
  const [ocupado, setOcupado] = useState(false);
  const invalidar = useInvalidate();
  // trocar a transportadora da nota já autorizada (29/10: não dava para ajustar pela NF): o texto sai pronto
  const { data: transportadoras = [] } = useRows<Transp>("transportadoras", {
    select: "id, nome, nome_fantasia, cnpj, inscricao_estadual, logradouro, numero, bairro, municipio, uf", order: "nome", ascending: true,
    filtro: (q) => q.eq("ativo", true).is("unificado_em", null),
  });
  const [novaTransp, setNovaTransp] = useState("");
  const semFrete = semFreteNaNota(nota.payload);
  const [modalidade, setModalidade] = useState(0);
  const hoje = transportadoraDaUltimaCarta(ultima ? [ultima.correcao] : []);

  function montar(id: string, mod: number) {
    const t = transportadoras.find((x) => x.id === id);
    // "não trocar" tira a troca do texto; as outras correções ficam
    setTexto(juntarCorrecao(atual, t ? textoTrocaTransportadora(nota.payload, t, semFrete ? mod : null) : ""));
  }

  const tamanho = atual.trim().length;
  async function enviar(e: FormEvent) {
    e.preventDefault();
    const t = transportadoras.find((x) => x.id === novaTransp);
    const trocando = !!t && /Transportadora: onde se lê/.test(atual);
    const aviso = [ultima ? `Esta carta substitui a ${ultima.sequencia ? `CC-e nº ${ultima.sequencia}` : "carta anterior"}: o que não estiver no texto deixa de valer.` : "",
      trocando && nota.pedido_id ? `O pedido e a expedição passam a usar a transportadora ${t!.nome_fantasia || t!.nome}.` : ""].filter(Boolean).join(" ");
    if (!(await confirmar(`Enviar a carta de correção para a SEFAZ? Não dá para desfazer.${aviso ? ` ${aviso}` : ""}`, { titulo: "Carta de correção", ok: "Enviar" }))) return;
    setOcupado(true);
    try {
      // a troca no pedido e na expedição é feita no servidor, depois que a SEFAZ aceita a carta
      const r = await callFunction<{ transportadora_trocada?: boolean }>("nfe-consultar", { nota_id: nota.id, acao: "carta_correcao", correcao: atual,
        ...(trocando ? { transportadora_id: t!.id, ...(semFrete ? { modalidade_frete: modalidade } : {}) } : {}) });
      notify(r?.transportadora_trocada ? "Carta de correção registrada e transportadora trocada no pedido" : "Carta de correção registrada na SEFAZ");
      setTexto(null); setNovaTransp("");
      invalidar("pedidos", "expedicoes");
    } catch (err) { notifyError(err); } finally { setOcupado(false); invalidar("nfe_cartas_correcao"); }
  }

  return (
    <Modal open onClose={onClose} title={`Carta de correção · NF-e ${nota.numero ?? ""}/${nota.serie ?? ""}`}>
      <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Serve para corrigir dados como descrição, endereço de entrega, transportadora ou informações complementares.
        <b> Não corrige</b> valores, impostos, quantidade, dados que mudem quem é o destinatário, nem a data de emissão.
        Cada nova carta substitui a anterior: por isso o texto já começa com o da última carta. Escreva todas as correções juntas.
      </div>
      {isLoading ? <Carregando linhas={2} /> : cartas.length > 0 && (
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Trocar a transportadora" className={semFrete ? "" : "sm:col-span-2"}
            dica={`Na nota: ${nota.payload?.nome_transportador || "sem transportadora"}${hoje ? `; pela última carta: ${hoje}` : ""}. Escolha a nova e o texto sai pronto.`}>
            <select className="input" value={novaTransp} onChange={(e) => { setNovaTransp(e.target.value); montar(e.target.value, modalidade); }}>
              <option value="">— não trocar —</option>
              {transportadoras.map((t) => <option key={t.id} value={t.id}>{t.nome_fantasia || t.nome}</option>)}
            </select>
          </Field>
          {semFrete && (
            <Field label="Frete por conta" dica="A nota saiu sem frete: a carta corrige também quem paga">
              <select className="input" value={modalidade} disabled={!novaTransp} onChange={(e) => { setModalidade(Number(e.target.value)); montar(novaTransp, Number(e.target.value)); }}>
                <option value={0}>Emitente (MF Máquinas)</option><option value={1}>Destinatário (cliente)</option><option value={2}>Terceiros</option>
              </select>
            </Field>
          )}
        </div>
        <Field label={`Correção (${tamanho}/1000, mínimo 15)`} erro={tamanho > 1000 ? "Passou de 1.000 caracteres: encurte as outras correções" : undefined}>
          <textarea className="input" rows={5} value={atual} onChange={(e) => setTexto(e.target.value)} required
            placeholder="Ex.: Onde se lê 'Rua das Flores, 10', leia-se 'Rua das Flores, 100'." />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          <Button disabled={ocupado || tamanho < 15 || tamanho > 1000}>{ocupado ? "Enviando…" : "Enviar carta de correção"}</Button>
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
    if (!(await confirmar(`Inutilizar os números ${f.numero_inicial} a ${f.numero_final || f.numero_inicial} da série ${f.serie} (${nome(f.unidade_id)})? Não dá para desfazer.`))) return;
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
  operacao: [["", "Qualquer (também remessas)"], ["venda", "Venda"], ["transferencia", "Transferência SC ↔ SP"]],
  destino: [["", "Qualquer"], ["interna", "Dentro do estado"], ["interestadual", "Outro estado"]],
  tipo_cliente: [["", "Qualquer"], ["contribuinte", "Contribuinte de ICMS (com IE)"], ["nao_contribuinte", "Consumidor final / sem IE"]],
  tipo_produto: [["", "Qualquer"], ["maquina", "Máquina"], ["peca", "Peça"], ["acessorio", "Acessório"], ["insumo", "Insumo"]],
  origem_mercadoria: [["", "Qualquer"], ["nacional", "Nacional"], ["importada", "Importada"]],
} as const;

export function RegrasTributacao({ podeEditar }: { podeEditar: boolean }) {
  const { data: regras = [], isLoading } = useRows<Regra>("regras_tributacao", { order: "prioridade", ascending: true });
  const { nome, unidades } = useUnidade();
  const [editando, setEditando] = useState<Regra | null>(null);
  const invalidar = useInvalidate();
  const ativas = regras.filter((r) => r.ativo !== false).length;

  async function remover(r: Regra) {
    if (!(await confirmar(`Apagar a regra "${r.nome}"?`))) return;
    const { error } = await supabase.from("regras_tributacao").delete().eq("id", r.id!);
    if (error) return notifyError(error);
    invalidar("regras_tributacao");
  }
  // modelo pronto: abre o formulário preenchido (a unidade pela UF do modelo); só grava ao salvar
  function usarModelo(m: ModeloRegra) {
    const { reducoes, uf, ...resto } = m.regra;
    const unidade = uf ? unidades.find((u) => String((u as { uf?: string }).uf ?? "").toUpperCase() === uf)?.id ?? null : null;
    setEditando({ ativo: true, prioridade: 100, ...resto, nome: resto.nome ?? m.titulo, unidade_id: unidade, icms_reducao_por_aliquota: reducoes ? lerReducoes(reducoes) : null } as Regra);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-slate-600">
          Sem regra, cada nota usa o padrão da unidade (aba Configurações da NF-e). Uma regra troca só o que você preencher,
          para as notas que combinam com as condições. Vale a primeira regra que combinar, pela ordem.
          <b> Confira cada regra com o contador e teste em homologação.</b>
        </p>
        {podeEditar && <Button onClick={() => setEditando({ nome: "", prioridade: 100, ativo: true })}><Plus size={16} /> Nova regra</Button>}
      </div>
      <ComoFuncionaRegras />
      <section aria-label="Regras cadastradas">
        <h3 className="mb-2 text-base font-bold text-fg">Suas regras <span className="text-sm font-normal text-slate-500">· {ativas} {ativas === 1 ? "ativa" : "ativas"}{regras.length > ativas ? ` de ${regras.length}` : ""}, na ordem em que o ERP confere</span></h3>
        {!isLoading && !regras.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Nenhuma regra ainda: todas as notas saem com o padrão da unidade. Comece por um dos modelos prontos abaixo.</p>}
        <ul className="grid gap-3">
          {regras.map((r) => (
            <CartaoRegra key={r.id} r={r} nomeUnidade={nome} podeEditar={podeEditar} onEditar={() => setEditando(r)} onApagar={() => remover(r)} />
          ))}
        </ul>
      </section>
      <TesteVenda regras={regras} />
      <ModelosRegra existentes={regras.map((r) => r.nome)} podeEditar={podeEditar} onUsar={usarModelo} />
      <GlossarioFiscal />
      {editando && <RegraModal regra={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

const NUM = ["icms_aliquota", "icms_reducao_base", "ipi_aliquota", "pis_aliquota", "cofins_aliquota"] as const;

/** motDesICMS mais usados (motivo da desoneração do ICMS). */
const MOTIVOS_DESONERACAO: [string, string][] = [
  ["9", "9 - Outros"], ["3", "3 - Produtor agropecuário"], ["7", "7 - SUFRAMA"], ["8", "8 - Venda a órgão público"],
  ["12", "12 - Órgão de fomento agropecuário"], ["90", "90 - Solicitado pelo fisco"],
];
const CST_COM_BENEFICIO = ["20", "30", "40", "41", "50", "51", "70", "90"];

/** Modelo pronto: máquinas industriais da matriz SC (RICMS/SC, Anexo 2, art. 9, I, Convênio ICMS 52/91), como o Tiny emitia. */
const modeloMaquinasSc = (unidadeSc: string | null): Record<string, any> => ({
  nome: "Máquinas industriais SC - redução art. 9, I, Anexo 2 RICMS-SC", prioridade: 10, ativo: true, unidade_id: unidadeSc,
  operacao: "venda", tipo_produto: "maquina", ncm_prefixo: "84186910", icms_cst: "20",
  reducoes: "17%=48,23 · 12%=26,66 · 7%=26,57", codigo_beneficio: "SC820028",
  icms_desonerar: true, icms_motivo_desoneracao: "9", icms_abater_desonerado: false,
  observacao_nfe: "Base de cálculo do ICMS reduzida conforme art. 9, I, do Anexo 2 do RICMS-SC/01 (Convênio ICMS 52/91).",
});

/** O que está incoerente ou faltando na regra (aparece na hora, antes de salvar). */
function avisosRegra(r: Record<string, any>, ufDaRegra: (id: string | null) => string[]) {
  const avisos: string[] = [];
  const cst = String(r.icms_cst ?? "");
  const temReducao = Number(String(r.icms_reducao_base ?? "").replace(",", ".")) > 0 || !!lerReducoes(r.reducoes);
  if (cst === "20" && !temReducao) avisos.push("CST 20 é \"com redução de base\": informe a redução (fixa ou por alíquota), senão a nota sai como CST 00.");
  if (cst === "00" && temReducao) avisos.push("CST 00 não tem redução: com redução, a nota sai como CST 20.");
  if (ufDaRegra(r.unidade_id).includes("SC") && CST_COM_BENEFICIO.includes(cst) && !r.codigo_beneficio) {
    avisos.push("Santa Catarina exige o código de benefício fiscal (cBenef) nesse CST. Ex.: SC820028 para a redução do art. 9, I (máquinas).");
  }
  if (r.codigo_beneficio && cst === "00") avisos.push("O cBenef não vai em nota com CST 00 (só nos CST com benefício).");
  if (r.icms_desonerar && cst && !["20", "30", "40", "41", "50", "70", "90"].includes(cst)) avisos.push("ICMS desonerado só existe nos CST 20, 30, 40, 41, 50, 70 e 90.");
  if (r.icms_abater_desonerado) avisos.push("Abater do total: a nota sai menor que o pedido no valor do ICMS desonerado. Combine com o contador e ajuste o preço/parcelas do pedido.");
  return avisos;
}

function RegraModal({ regra, onClose }: { regra: Regra; onClose: () => void }) {
  const { unidades } = useUnidade();
  const [r, setR] = useState<Record<string, any>>({ ...regra, difal: regra.difal == null ? "" : regra.difal ? "sim" : "nao", ufs_destino: (regra.ufs_destino ?? []).join(", "),
    reducoes: textoReducoes(regra.icms_reducao_por_aliquota), ipi_destacar: regra.ipi_destacar == null ? "" : regra.ipi_destacar ? "sim" : "nao" });
  const ufDaRegra = (id: string | null) => (id ? unidades.filter((u) => u.id === id) : unidades).map((u) => String((u as { uf?: string }).uf ?? "").toUpperCase());
  const avisos = avisosRegra(r, ufDaRegra);
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
    const { reducoes, ...resto } = r;
    const row: Record<string, any> = Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, v === "" ? null : v]));
    for (const k of NUM) row[k] = row[k] == null ? null : Number(String(row[k]).replace(",", "."));
    row.icms_reducao_por_aliquota = lerReducoes(reducoes);
    row.codigo_beneficio = String(r.codigo_beneficio ?? "").trim().toUpperCase() || null;
    row.icms_desonerar = !!r.icms_desonerar;
    row.icms_abater_desonerado = !!r.icms_abater_desonerado;
    row.icms_motivo_desoneracao = r.icms_desonerar ? (r.icms_motivo_desoneracao || "9") : null;
    row.ipi_destacar = r.ipi_destacar === "" || r.ipi_destacar == null ? null : r.ipi_destacar === "sim";
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
        {!regra.id && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
            <span className="min-w-0 flex-1">Modelo pronto: redução de base das máquinas industriais da matriz SC (RICMS-SC, Anexo 2, art. 9, I), como o Tiny emitia.</span>
            <Button type="button" variant="secondary" onClick={() => setR({ ...r, ...modeloMaquinasSc(unidades.find((u) => String((u as { uf?: string }).uf).toUpperCase() === "SC")?.id ?? null) })}>Usar modelo</Button>
          </div>
        )}
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
            {txt("icms_reducao_base", "ICMS redução da base % (fixa)")}
            <Field label="Redução por alíquota (ex.: 17%=48,23 · 12%=26,66 · 7%=26,57)" className="col-span-2">
              <input className="input" value={r.reducoes ?? ""} onChange={set("reducoes")} placeholder="Alíquota fora da lista = sem redução" />
            </Field>
            {txt("codigo_beneficio", "Código de benefício (cBenef)", "SC820028")}
            <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm sm:col-span-1">
              <input type="checkbox" className="h-5 w-5" checked={!!r.icms_desonerar} onChange={(e) => setR({ ...r, icms_desonerar: e.target.checked })} /> Informar ICMS desonerado
            </label>
            {r.icms_desonerar && (<>
              <Field label="Motivo da desoneração">
                <select className="input" value={r.icms_motivo_desoneracao ?? "9"} onChange={set("icms_motivo_desoneracao")}>
                  {MOTIVOS_DESONERACAO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={!!r.icms_abater_desonerado} onChange={(e) => setR({ ...r, icms_abater_desonerado: e.target.checked })} /> Abater o ICMS desonerado do total da nota
              </label>
            </>)}
            <Field label="DIFAL">
              <select className="input" value={r.difal} onChange={set("difal")}><option value="">Padrão</option><option value="sim">Calcular</option><option value="nao">Não calcular</option></select>
            </Field>
            {cod("ipi_cst", "IPI CST", CST_IPI)}
            {txt("ipi_aliquota", "IPI alíquota %", "TIPI do produto")}
            {txt("ipi_enquadramento", "IPI enquadramento", "999")}
            <Field label="Destacar IPI">
              <select className="input" value={r.ipi_destacar ?? ""} onChange={set("ipi_destacar")}>
                <option value="">Padrão</option><option value="sim">Destacar</option><option value="nao">Não destacar IPI</option>
              </select>
            </Field>
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
        {avisos.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">
            {avisos.map((a) => <li key={a}>• {a}</li>)}
          </ul>
        )}
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
