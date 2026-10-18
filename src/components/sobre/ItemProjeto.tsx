// Peças comuns do Handoff e das Ideias (Sobre o ERP Line): leitura dos itens, janela de anotar/editar,
// mudança de situação (com motivo quando descarta ou aguarda), voto e as etiquetas coloridas.
import { useState, type FormEvent } from "react";
import { Button, Field, Modal } from "@/components/ui";
import { pedirTexto } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { grupos } from "@/lib/menu";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import {
  RESPONSAVEIS, ROTULO_ESFORCO, ROTULO_PRIORIDADE, ROTULO_RESPONSAVEL, rotuloSituacao,
  type Esforco, type ItemProjeto, type Prioridade, type Responsavel, type SituacaoItem, type TipoItem,
} from "@/lib/projeto";

/** Áreas do menu (e "Geral") para separar os itens. */
export const AREAS = [{ id: "geral", titulo: "Geral" }, ...grupos.map((g) => ({ id: g.id, titulo: g.titulo || "Início" }))];
export const rotuloArea = (id: string) => AREAS.find((a) => a.id === id)?.titulo ?? id;

export function useItensProjeto() {
  return useRows<ItemProjeto>("projeto_itens", { order: "created_at", ascending: false });
}

const NOME_TIPO: Record<TipoItem, string> = { pendencia: "pendência", ideia: "ideia", decisao: "decisão" };

/** Muda a situação; pede o motivo ao descartar (ou revogar) e o que se aguarda. Devolve se mudou. */
export function useMudarSituacao() {
  const invalidate = useInvalidate();
  return async (i: ItemProjeto, situacao: SituacaoItem) => {
    let motivo: string | null = null;
    if (situacao === "descartada") {
      motivo = await pedirTexto(i.tipo === "decisao" ? "Por que esta decisão deixa de valer? (o que mudou)" : `Por que ${i.tipo === "ideia" ? "esta ideia" : "esta pendência"} não vai ser feita?`,
        "", { titulo: i.tipo === "decisao" ? "Revogar decisão" : "Descartar", ok: i.tipo === "decisao" ? "Revogar" : "Descartar", minimo: 5 });
      if (!motivo) return false;
    }
    if (situacao === "aguardando") {
      motivo = await pedirTexto("Aguardando o quê ou quem? (ex.: resposta do contador, XML do Tiny)", i.motivo ?? "", { titulo: "Aguardando", ok: "Salvar", minimo: 3 });
      if (!motivo) return false;
    }
    const { error } = await supabase.rpc("mudar_situacao_projeto", { p_id: i.id, p_situacao: situacao, p_motivo: motivo });
    if (error) { notifyError(error); return false; }
    notify(`${i.titulo.length > 40 ? `${i.titulo.slice(0, 40)}…` : i.titulo}: ${rotuloSituacao(i.tipo, situacao).toLowerCase()}`);
    invalidate("projeto_itens");
    return true;
  };
}

export function useVotar() {
  const invalidate = useInvalidate();
  return async (i: ItemProjeto) => {
    const { error } = await supabase.rpc("votar_ideia", { p_id: i.id });
    if (error) return notifyError(error);
    invalidate("projeto_itens");
  };
}

const COR_PRIORIDADE: Record<Prioridade, string> = {
  alta: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200", media: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  baixa: "bg-slate-100 text-slate-600",
};
export const COR_RESPONSAVEL: Record<Responsavel, string> = {
  empresa: "bg-violet-100 text-violet-800", claude: "bg-orange-100 text-orange-800", contador: "bg-sky-100 text-sky-800",
  advogado: "bg-slate-200 text-slate-700", fornecedor: "bg-teal-100 text-teal-800",
};
const COR_SITUACAO: Partial<Record<SituacaoItem, string>> = {
  aberta: "bg-slate-100 text-slate-700", andamento: "bg-blue-100 text-blue-800", aguardando: "bg-amber-100 text-amber-800",
  avaliando: "bg-blue-100 text-blue-800", planejada: "bg-violet-100 text-violet-800", feita: "bg-emerald-100 text-emerald-800",
  descartada: "bg-slate-100 text-slate-500 line-through",
};
const chip = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-bold";

export const ChipPrioridade = ({ p, rotulo = "" }: { p: Prioridade; rotulo?: string }) =>
  <span className={`${chip} ${COR_PRIORIDADE[p]}`} title={`${rotulo || "Prioridade"}: ${ROTULO_PRIORIDADE[p].toLowerCase()}`}>{rotulo ? `${rotulo} ` : ""}{ROTULO_PRIORIDADE[p].toLowerCase()}</span>;
export const ChipResponsavel = ({ r }: { r: Responsavel }) => <span className={`${chip} ${COR_RESPONSAVEL[r]}`}>{ROTULO_RESPONSAVEL[r]}</span>;
export const ChipSituacao = ({ i }: { i: Pick<ItemProjeto, "tipo" | "situacao"> }) =>
  <span className={`${chip} ${COR_SITUACAO[i.situacao] ?? "bg-slate-100 text-slate-700"}`}>{rotuloSituacao(i.tipo, i.situacao)}</span>;
export const ChipArea = ({ area }: { area: string }) => <span className={`${chip} bg-slate-100 font-semibold text-slate-600`}>{rotuloArea(area)}</span>;

/** Botões de escolha única (prioridade, esforço, quem faz). */
function Escolha<T extends string>({ valor, onChange, opcoes, rotulo }: { valor: T | null; onChange: (v: T) => void; opcoes: [T, string][]; rotulo: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={rotulo}>
      {opcoes.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${valor === v ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

export type InicialItem = Partial<Pick<ItemProjeto, "titulo" | "detalhe" | "area" | "responsavel" | "prioridade" | "esforco">>;

/** Anotar (sem item) ou editar um item. */
export function ItemModal({ tipo, item, inicial, onClose, onSalvo }: {
  tipo: TipoItem; item?: ItemProjeto | null; inicial?: InicialItem; onClose: () => void; onSalvo?: (id: string) => void;
}) {
  const base = item ?? inicial ?? {};
  const [titulo, setTitulo] = useState(base.titulo ?? "");
  const [detalhe, setDetalhe] = useState(base.detalhe ?? "");
  const [area, setArea] = useState(base.area ?? "geral");
  const [responsavel, setResponsavel] = useState<Responsavel | null>(base.responsavel ?? (tipo === "pendencia" ? "empresa" : null));
  const [prioridade, setPrioridade] = useState<Prioridade>(base.prioridade ?? "media");
  const [esforco, setEsforco] = useState<Esforco | null>(base.esforco ?? null);
  const [prazo, setPrazo] = useState(item?.prazo ?? "");
  const [salvando, setSalvando] = useState(false);
  const invalidate = useInvalidate();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const { data, error } = await supabase.rpc("salvar_item_projeto", {
      p_id: item?.id ?? null, p_tipo: tipo, p_titulo: titulo, p_detalhe: detalhe || null, p_area: area,
      p_responsavel: tipo === "pendencia" ? responsavel : null, p_prioridade: prioridade,
      p_esforco: tipo === "ideia" ? esforco : null, p_prazo: tipo === "pendencia" && prazo ? prazo : null,
    });
    setSalvando(false);
    if (error) return notifyError(error);
    notify(item ? "Alterado" : `${NOME_TIPO[tipo][0].toUpperCase()}${NOME_TIPO[tipo].slice(1)} anotada`);
    invalidate("projeto_itens");
    onSalvo?.(data as string);
    onClose();
  }

  const titulos: Record<TipoItem, string> = { pendencia: "pendência", ideia: "ideia", decisao: "decisão" };
  return (
    <Modal open onClose={onClose} title={`${item ? "Editar" : tipo === "decisao" ? "Registrar" : "Anotar"} ${titulos[tipo]}`}>
      <form onSubmit={salvar} className="space-y-3">
        <Field label={tipo === "pendencia" ? "O que precisa ser feito" : tipo === "ideia" ? "A ideia, em uma linha" : "O que ficou decidido"}>
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} required minLength={3} autoFocus />
        </Field>
        <Field label={tipo === "ideia" ? "Detalhes (o problema que resolve, como imagina)" : "Detalhes (como fazer, onde fica, o porquê)"}>
          <textarea className="input min-h-[90px]" value={detalhe} onChange={(e) => setDetalhe(e.target.value)} maxLength={2000} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Área">
            <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
            </select>
          </Field>
          {tipo === "pendencia" && (
            <Field label="Prazo (opcional)"><input className="input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Field>
          )}
        </div>
        {tipo === "pendencia" && (
          <Field label="Quem faz">
            <Escolha rotulo="Quem faz" valor={responsavel} onChange={setResponsavel} opcoes={RESPONSAVEIS.map((r) => [r, ROTULO_RESPONSAVEL[r]])} />
          </Field>
        )}
        {tipo !== "decisao" && (
          <Field label={tipo === "ideia" ? "Impacto (quanto ajuda)" : "Prioridade"}>
            <Escolha rotulo="Prioridade" valor={prioridade} onChange={setPrioridade} opcoes={(["alta", "media", "baixa"] as Prioridade[]).map((p) => [p, ROTULO_PRIORIDADE[p]])} />
          </Field>
        )}
        {tipo === "ideia" && (
          <Field label="Esforço (tamanho do trabalho, se souber)">
            <Escolha rotulo="Esforço" valor={esforco} onChange={setEsforco} opcoes={(["pequeno", "medio", "grande"] as Esforco[]).map((p) => [p, ROTULO_ESFORCO[p]])} />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando || titulo.trim().length < 3}>{salvando ? "Salvando…" : item ? "Salvar" : "Anotar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** "16/10" ou "16/10/2025" quando é de outro ano. */
export const dataCurta = (iso: string | null | undefined, hoje: string) =>
  !iso ? "" : iso.slice(0, 4) === hoje.slice(0, 4) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
