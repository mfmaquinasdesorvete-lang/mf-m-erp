// Regras dos cards do painel pessoal: "o que tiver este texto no extrato vai para este card". Ficam em
// public.pessoal_regras, só do dono. Valem antes das regras prontas; uma regra para um card que não existe cria o card.
import { useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { numeroBR } from "@/lib/fichaCadastral";
import type { LancPessoal } from "@/lib/pessoal";
import { CARDS_PRONTOS, IDS_PRONTOS, NOME_CARD_PRONTO, regraDo, type GrupoPessoalId, type RegraPessoal, type SentidoRegra } from "@/lib/pessoalCards";

const SENTIDOS: { id: SentidoRegra; nome: string }[] = [
  { id: "ambos", nome: "Entradas e saídas" }, { id: "saida", nome: "Só saídas" }, { id: "entrada", nome: "Só entradas" },
];
const NOVO = "__novo__";
const nomeDoCard = (card: string) => (IDS_PRONTOS.has(card) ? NOME_CARD_PRONTO[card as GrupoPessoalId] : card);

export function RegrasCards({ regras, lancs, inicial, onClose }: {
  regras: RegraPessoal[]; lancs: LancPessoal[]; inicial?: Partial<RegraPessoal> | null; onClose: () => void;
}) {
  const invalidar = useInvalidate();
  const [edit, setEdit] = useState<Partial<RegraPessoal> | null>(inicial ?? null);
  const ordenadas = [...regras].sort((a, b) => a.ordem - b.ordem);
  const proprios = [...new Set(regras.map((r) => r.card).filter((c) => !IDS_PRONTOS.has(c)))].sort();

  async function gravar(r: Partial<RegraPessoal>) {
    const { id, ...resto } = r;
    const linha = { ...resto, ordem: resto.ordem ?? (Math.max(0, ...regras.map((x) => x.ordem)) + 1) };
    const { error } = id ? await supabase.from("pessoal_regras").update(linha).eq("id", id) : await supabase.from("pessoal_regras").insert(linha);
    if (error) return notifyError(error);
    notify(id ? "Regra alterada" : "Regra criada: os cards já mudaram");
    invalidar("pessoal_regras");
    setEdit(null);
  }
  async function tirar(r: RegraPessoal) {
    if (!(await confirmar(`Tirar a regra "${r.texto}" → ${nomeDoCard(r.card)}? Os lançamentos voltam para as regras prontas.`, { perigo: true }))) return;
    const { error } = await supabase.from("pessoal_regras").delete().eq("id", r.id);
    if (error) return notifyError(error);
    invalidar("pessoal_regras");
  }
  // a ordem decide quando duas regras pegam o mesmo lançamento
  async function mover(r: RegraPessoal, passo: -1 | 1) {
    const i = ordenadas.findIndex((x) => x.id === r.id), j = i + passo;
    if (j < 0 || j >= ordenadas.length) return;
    const outra = ordenadas[j];
    const a = await supabase.from("pessoal_regras").update({ ordem: outra.ordem }).eq("id", r.id);
    const b = await supabase.from("pessoal_regras").update({ ordem: r.ordem === outra.ordem ? r.ordem + passo : r.ordem }).eq("id", outra.id);
    if (a.error || b.error) return notifyError(a.error ?? b.error);
    invalidar("pessoal_regras");
  }

  return (
    <Modal open onClose={onClose} title="Regras dos cards" wide>
      {edit ? <FormRegra regra={edit} proprios={proprios} lancs={lancs} onCancelar={() => (inicial ? onClose() : setEdit(null))} onGravar={gravar} /> : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Diga o que procurar no texto do extrato e para qual card vai. Vale antes das regras prontas. Um card que ainda não existe é criado
            (ex.: "Telefones da fábrica"). Use <b>/</b> para juntar vários textos numa regra (ex.: <i>itau gold / itau platinu</i>).
          </p>
          <div className="flex justify-end"><Button onClick={() => setEdit({ sentido: "ambos", ativa: true, da_empresa: false })}><Plus size={15} /> Nova regra</Button></div>
          {!ordenadas.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhuma regra ainda.</p> : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {ordenadas.map((r, i) => {
                const qtd = lancs.filter((l) => !l.anulado && regraDo(l, [r]) === r).length;
                return (
                  <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${r.ativa ? "" : "opacity-50"}`}>
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block font-semibold text-fg"><span className="font-mono text-xs">{r.texto}</span> → {nomeDoCard(r.card)}</span>
                      <span className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                        {r.rotulo && <span>como "{r.rotulo}"</span>}
                        <span>{SENTIDOS.find((s) => s.id === r.sentido)?.nome}</span>
                        {r.da_empresa && <span className="font-semibold text-amber-800">gasto da empresa</span>}
                        {r.meta_total && <span>meta {brl(r.meta_total)}{r.parcelas ? ` em ${r.parcelas}x` : ""}</span>}
                        {r.observacao && <span>· {r.observacao}</span>}
                        <span>· {qtd} {pl(qtd, "lançamento", "lançamentos")}</span>
                        {!r.ativa && <span>· desligada</span>}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" className="botao-icone h-8 w-8" disabled={i === 0} onClick={() => mover(r, -1)} aria-label="Subir a regra"><ArrowUp size={15} /></button>
                      <button type="button" className="botao-icone h-8 w-8" disabled={i === ordenadas.length - 1} onClick={() => mover(r, 1)} aria-label="Descer a regra"><ArrowDown size={15} /></button>
                      <button type="button" className="botao-icone h-8 w-8" onClick={() => setEdit(r)} aria-label={`Editar a regra ${r.texto}`}><Pencil size={15} /></button>
                      <button type="button" className="botao-icone-perigo h-8 w-8 text-red-600" onClick={() => tirar(r)} aria-label={`Tirar a regra ${r.texto}`}><Trash2 size={15} /></button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function FormRegra({ regra, proprios, lancs, onCancelar, onGravar }: {
  regra: Partial<RegraPessoal>; proprios: string[]; lancs: LancPessoal[]; onCancelar: () => void; onGravar: (r: Partial<RegraPessoal>) => void;
}) {
  const cardInicial = regra.card ? (IDS_PRONTOS.has(regra.card) || proprios.includes(regra.card) ? regra.card : NOVO) : "";
  const [r, setR] = useState({ ...regra, meta_txt: regra.meta_total != null ? String(regra.meta_total).replace(".", ",") : "" });
  const [escolha, setEscolha] = useState(cardInicial);
  const [novoCard, setNovoCard] = useState(cardInicial === NOVO ? regra.card ?? "" : "");
  const set = (k: string, v: unknown) => setR((x) => ({ ...x, [k]: v }));
  const card = escolha === NOVO ? novoCard.trim() : escolha;
  // prévia: quantos lançamentos a regra pega
  const pega = useMemo(() => {
    if (!r.texto?.trim()) return [];
    const teste: RegraPessoal = { id: "teste", texto: r.texto, card: card || "x", rotulo: null, sentido: (r.sentido ?? "ambos") as SentidoRegra, da_empresa: false, observacao: null, meta_total: null, parcelas: null, ativa: true, ordem: 0 };
    return lancs.filter((l) => !l.anulado && regraDo(l, [teste]));
  }, [r.texto, r.sentido, card, lancs]);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!card || card.length < 2) return notifyError(new Error("Escolha o card ou dê o nome do card novo"));
    onGravar({
      id: regra.id, texto: String(r.texto ?? "").trim(), card, rotulo: String(r.rotulo ?? "").trim() || null, sentido: (r.sentido ?? "ambos") as SentidoRegra,
      da_empresa: !!r.da_empresa, observacao: String(r.observacao ?? "").trim() || null, meta_total: numeroBR(r.meta_txt) || null,
      parcelas: r.parcelas ? Number(r.parcelas) : null, ativa: r.ativa !== false, ordem: regra.ordem,
    });
  };
  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="O que procurar no texto do extrato" className="sm:col-span-2">
          <input className="input" value={r.texto ?? ""} onChange={(e) => set("texto", e.target.value)} required minLength={2} maxLength={300} autoFocus placeholder="Ex.: pix transf fulano / transf fulana" />
        </Field>
        <Field label="Vai para o card">
          <select className="input" value={escolha} onChange={(e) => setEscolha(e.target.value)} required>
            <option value="" disabled>Escolha</option>
            {CARDS_PRONTOS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            {proprios.length > 0 && <optgroup label="Seus cards">{proprios.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>}
            <option value={NOVO}>Card novo…</option>
          </select>
        </Field>
        {escolha === NOVO
          ? <Field label="Nome do card novo"><input className="input" value={novoCard} onChange={(e) => setNovoCard(e.target.value)} maxLength={60} placeholder="Ex.: Telefones da fábrica" required /></Field>
          : <Field label="Valer para">
              <select className="input" value={r.sentido ?? "ambos"} onChange={(e) => set("sentido", e.target.value)}>{SENTIDOS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
            </Field>}
        {escolha === NOVO && (
          <Field label="Valer para">
            <select className="input" value={r.sentido ?? "ambos"} onChange={(e) => set("sentido", e.target.value)}>{SENTIDOS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
          </Field>
        )}
        <Field label="Mostrar como (opcional)"><input className="input" value={r.rotulo ?? ""} onChange={(e) => set("rotulo", e.target.value)} maxLength={60} placeholder="Junta textos diferentes com um nome só" /></Field>
        <Field label="Observação (opcional)" className="sm:col-span-2"><input className="input" value={r.observacao ?? ""} onChange={(e) => set("observacao", e.target.value)} maxLength={300} placeholder="Aparece no card" /></Field>
        <Field label="Meta: valor total (opcional)"><input className="input" inputMode="decimal" value={r.meta_txt} onChange={(e) => set("meta_txt", e.target.value)} placeholder="Ex.: 21.000,00" /></Field>
        <Field label="Em quantas vezes (opcional)"><input className="input" type="number" min={1} max={360} value={r.parcelas ?? ""} onChange={(e) => set("parcelas", e.target.value ? Number(e.target.value) : null)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!r.da_empresa} onChange={(e) => set("da_empresa", e.target.checked)} /> É gasto da empresa pago pela conta pessoal (card em âmbar, para mostrar ao contador, com o botão Lançar na MF)</label>
      {regra.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.ativa === false} onChange={(e) => set("ativa", !e.target.checked)} /> Desligar esta regra</label>}
      <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        {r.texto?.trim() ? <>Pega <b>{pega.length}</b> {pl(pega.length, "lançamento", "lançamentos")}{pega.length > 0 && <> (ex.: {pega.slice(0, 3).map((l) => l.descricao).join(" · ")})</>}.</> : "Escreva o texto para ver quais lançamentos ela pega."}
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onCancelar}>Cancelar</Button><Button type="submit">Salvar regra</Button></div>
    </form>
  );
}
