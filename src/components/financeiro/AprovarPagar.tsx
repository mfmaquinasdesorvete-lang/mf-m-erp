// Aprovar ou não as contas a pagar ali mesmo, sem ir para a tela Aprovações: "Aprovar" com um toque (com pendência, pede
// o porquê), "Não" com o motivo (devolver para corrigir ou rejeitar e cancelar), "Aprovar todas as completas" e a faixa
// "Sua vez de aprovar". As regras continuam no banco (revisar_contas); aqui só mostra e chama.
import { useMemo, useState, type ReactNode } from "react";
import { Check, CheckCheck, ClipboardCheck, RotateCcw, Undo2, X } from "lucide-react";
import { Button, chip, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, pl } from "@/lib/format";
import { pendencias, precisa2a, quemPode, regrasDe, ROTULO_PENDENCIA, type ContaRevisao, type Pendencia } from "@/lib/aprovacao";
import { ORDEM_TIPOS, TIPOS_PAGAR, type TipoPagar } from "@/lib/tiposPagar";

type ContaAprovar = ContaRevisao & { fornecedor?: { nome: string } | null };
export type InfoAprovar = { pode: boolean; etapa: 1 | 2; motivo?: string; pend: Pendencia[]; vai2a: boolean };
type Acao = "aprovar" | "devolver" | "rejeitar" | "reenviar";
type Janela<T> = { tipo: "aprovar" | "nao" | "todas"; contas: T[] };

const MOTIVOS_NAO = ["Falta o boleto ou a nota", "Valor errado", "Conta repetida", "Não reconheço esta cobrança", "Vencimento errado"];
const nome = (c: ContaAprovar) => c.fornecedor?.nome || c.descricao;
const soma = (l: { valor: number }[]) => l.reduce((s, c) => s + Number(c.valor), 0);

/** Botão verde grande (Aprovar) e vermelho de contorno (Não); "!" para valer também dentro do rodapé compacto do quadro. */
const BTN = "inline-flex !min-h-[40px] items-center justify-center gap-1.5 rounded-lg !px-4 !py-2 !text-sm font-bold transition disabled:opacity-50";

export function useAprovarPagar<T extends ContaAprovar>(contas: T[], tipoDe: (c: T) => TipoPagar) {
  const eu = usePerfil();
  const admin = eu.papel === "admin";
  const podeAgir = eu.tem("financeiro");
  const invalidar = useInvalidate();
  const { data: cfg } = useConfig();
  const regras = regrasDe(cfg);
  // mesmas consultas da tela Aprovações (o que já está carregado serve às duas)
  const { data: docs = [] } = useRows<{ entidade: string; entidade_id: string }>("documentos", { select: "entidade, entidade_id" });
  const { data: categorias = [] } = useRows<{ nome: string; tipo: string; ativo: boolean }>("categorias_financeiras", { order: "ordem", ascending: true });
  const [janela, setJanela] = useState<Janela<T> | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const infos = useMemo(() => {
    const anexos = new Set(docs.filter((d) => d.entidade === "conta_pagar").map((d) => d.entidade_id));
    const m = new Map<string, InfoAprovar>();
    for (const c of contas) {
      if (c.revisao !== "em_revisao" && c.revisao !== "devolvido") continue;
      const pend = pendencias(c, "pagar", { anexos, categorias, todas: contas });
      const q = quemPode(c, { id: eu.user_id, admin }, regras);
      m.set(c.id, { ...q, pode: podeAgir && q.pode, pend, vai2a: !c.revisao1_em && precisa2a(c, pend, regras) });
    }
    return m;
  }, [contas, docs, categorias, eu.user_id, admin, podeAgir, regras.revisor1.join(), regras.revisor2.join(), regras.alcada]); // eslint-disable-line react-hooks/exhaustive-deps

  const minhaVez = contas.filter((c) => c.status === "aberto" && infos.get(c.id)?.pode);
  const completas = minhaVez.filter((c) => !infos.get(c.id)?.pend.length);

  async function executar(acao: Acao, lista: T[], comentario: string | null) {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("revisar_contas", { p_tabela: "contas_pagar", p_ids: lista.map((c) => c.id), p_acao: acao, p_comentario: comentario });
      if (error) throw error;
      const n = Number(data ?? lista.length);
      if (acao === "aprovar") {
        const segunda = lista.filter((c) => infos.get(c.id)?.vai2a).length;
        notify(n === 1 && segunda ? `Aprovada na 1ª revisão: falta a 2ª (a partir de ${brl(regras.alcada)} ou com pendência)`
          : n === 1 ? "Conta aprovada: agora é só escolher quando pagar"
          : `${n} contas aprovadas${segunda ? ` · ${segunda} ${pl(segunda, "vai", "vão")} para a 2ª revisão` : ""}`);
      } else {
        notify({ devolver: "Conta devolvida: quem lançou corrige e reenvia", rejeitar: "Conta rejeitada e cancelada (o motivo fica no histórico)", reenviar: "Conta reenviada para a aprovação" }[acao]);
      }
      setJanela(null);
      invalidar("contas_pagar", "revisoes_contas");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  // sem pendência aprova com um toque; com pendência pede o porquê (vai para a 2ª revisão)
  const aprovar = (c: T) => (infos.get(c.id)?.pend.length ? setJanela({ tipo: "aprovar", contas: [c] }) : executar("aprovar", [c], null));

  /** Os botões da conta (ou o porquê de não poder); null quando a conta não está na aprovação. */
  function botoes(c: T): ReactNode {
    const i = infos.get(c.id);
    if (!i || c.status !== "aberto") return null;
    if (c.revisao === "devolvido") {
      return podeAgir ? (
        <Button type="button" tom="desfazer" disabled={ocupado} onClick={() => executar("reenviar", [c], null)} title={c.revisao_comentario ? `Motivo: ${c.revisao_comentario}` : undefined}><RotateCcw size={15} aria-hidden /> Já corrigi: reenviar</Button>
      ) : c.revisao_comentario ? <span className="text-xs text-orange-900">Motivo: {c.revisao_comentario}</span> : null;
    }
    if (!i.pode) {
      return <span className="text-xs text-slate-500" title={i.motivo}>Esperando a {i.etapa}ª revisão{i.motivo === "você lançou esta conta" || i.motivo === "você fez a 1ª revisão" ? ` (${i.motivo})` : ""}</span>;
    }
    const dica = [i.etapa === 2 ? "2ª revisão" : "1ª revisão", i.vai2a && "depois vai para a 2ª revisão", i.pend.length && `pendência: ${i.pend.map((p) => ROTULO_PENDENCIA[p]).join(", ")}`].filter(Boolean).join(" · ");
    return (
      <span className="inline-flex gap-1.5">
        <button type="button" disabled={ocupado} onClick={() => aprovar(c)} title={dica} aria-label={`Aprovar ${nome(c)}`}
          className={`${BTN} bg-solido-verde text-white hover:brightness-110`}><Check size={16} aria-hidden /> Aprovar</button>
        <Button type="button" tom="perigo" disabled={ocupado} onClick={() => setJanela({ tipo: "nao", contas: [c] })} title="Devolver para corrigir ou rejeitar, com o motivo" aria-label={`Não aprovar ${nome(c)}`}><X size={16} aria-hidden /> Não</Button>
      </span>
    );
  }

  /** Faixa roxa "Sua vez de aprovar" (some quando não há nada na sua vez). */
  function faixa(onVer: () => void): ReactNode {
    if (!minhaVez.length) return null;
    return (
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-fixo-violet-600 p-4 text-white shadow-card sm:p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20"><ClipboardCheck size={22} aria-hidden /></span>
        <span className="mr-auto min-w-0">
          <span className="block text-base font-bold leading-tight">Sua vez de aprovar: {minhaVez.length} {pl(minhaVez.length, "conta", "contas")} · <span className="num whitespace-nowrap">{brl(soma(minhaVez))}</span></span>
          <span className="mt-0.5 block text-xs leading-snug text-white/85">Em cada conta: <b>Aprovar</b> libera para pagar; <b>Não</b> devolve para corrigir ou cancela, com o motivo.</span>
        </span>
        <span className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" onClick={onVer} className="inline-flex min-h-toque flex-1 items-center justify-center rounded-xl bg-white px-4 text-sm font-bold text-fixo-violet-900 hover:bg-white/90 sm:flex-none">Ver uma a uma</button>
          {completas.length > 1 && (
            <button type="button" disabled={ocupado} onClick={() => setJanela({ tipo: "todas", contas: completas })}
              className="inline-flex min-h-toque flex-1 items-center justify-center gap-1.5 rounded-xl bg-solido-verde px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50 sm:flex-none">
              <CheckCheck size={16} aria-hidden /> Aprovar as {completas.length} completas
            </button>
          )}
        </span>
      </div>
    );
  }

  const modais = janela && (
    janela.tipo === "nao" ? <ModalNao conta={janela.contas[0]} ocupado={ocupado} onClose={() => setJanela(null)} onConfirmar={(acao, motivo) => executar(acao, janela.contas, motivo)} />
    : janela.tipo === "aprovar" ? <ModalAprovarComPendencia conta={janela.contas[0]} pend={infos.get(janela.contas[0].id)?.pend ?? []} ocupado={ocupado} onClose={() => setJanela(null)} onConfirmar={(txt) => executar("aprovar", janela.contas, txt)} />
    : <ModalAprovarTodas contas={janela.contas} tipoDe={tipoDe} pulam={minhaVez.length - completas.length} vai2a={janela.contas.filter((c) => infos.get(c.id)?.vai2a).length}
        ocupado={ocupado} onClose={() => setJanela(null)} onConfirmar={() => executar("aprovar", janela.contas, null)} />
  );

  return { infos, minhaVez, botoes, faixa, modais };
}

function ModalNao({ conta, ocupado, onClose, onConfirmar }: { conta: ContaAprovar; ocupado: boolean; onClose: () => void; onConfirmar: (acao: "devolver" | "rejeitar", motivo: string) => void }) {
  const [acao, setAcao] = useState<"devolver" | "rejeitar">("devolver");
  const [motivo, setMotivo] = useState("");
  const ok = motivo.trim().length >= 5;
  return (
    <Modal open onClose={onClose} title={`Não aprovar · ${nome(conta)}`}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onConfirmar(acao, motivo.trim()); }} className="space-y-3">
        <p className="text-sm text-slate-600"><b className="num">{brl(Number(conta.valor))}</b> · vence {dataBR(conta.vencimento)}{conta.descricao !== nome(conta) ? ` · ${conta.descricao}` : ""}</p>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">O que fazer com a conta</legend>
          {([["devolver", Undo2, "Devolver para corrigir", "Quem lançou acerta (boleto, valor, nota) e reenvia."],
            ["rejeitar", X, "Rejeitar e cancelar", "A conta é cancelada: não vai ser paga."]] as const).map(([v, Icone, titulo, sub]) => (
            <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${acao === v ? (v === "rejeitar" ? "border-red-400 bg-red-50 ring-1 ring-red-300" : "border-orange-400 bg-orange-50 ring-1 ring-orange-300") : "border-slate-200 bg-surface"}`}>
              <input type="radio" name="acao-nao" className="mt-1" checked={acao === v} onChange={() => setAcao(v)} />
              <span><span className="flex items-center gap-1 text-sm font-bold text-fg"><Icone size={15} aria-hidden /> {titulo}</span><span className="block text-xs text-slate-600">{sub}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-1.5" aria-label="Motivos prontos">
          {MOTIVOS_NAO.map((m) => (
            <button key={m} type="button" onClick={() => setMotivo(m)} className={chip(motivo === m, "border-fg bg-fg text-surface")}>{m}</button>
          ))}
        </div>
        <Field label="Motivo (quem lançou vê e fica no histórico)">
          <textarea className="input" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={5} autoFocus placeholder="Ex.: falta anexar o boleto" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant={acao === "rejeitar" ? "danger" : "primary"} disabled={ocupado || !ok}>{ocupado ? "Salvando…" : acao === "rejeitar" ? "Rejeitar e cancelar" : "Devolver"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ModalAprovarComPendencia({ conta, pend, ocupado, onClose, onConfirmar }: { conta: ContaAprovar; pend: Pendencia[]; ocupado: boolean; onClose: () => void; onConfirmar: (txt: string) => void }) {
  const [txt, setTxt] = useState("");
  return (
    <Modal open onClose={onClose} title={`Aprovar · ${nome(conta)}`}>
      <form onSubmit={(e) => { e.preventDefault(); if (txt.trim().length >= 10) onConfirmar(txt.trim()); }} className="space-y-3">
        <p className="text-sm text-slate-600"><b className="num">{brl(Number(conta.valor))}</b> · vence {dataBR(conta.vencimento)}</p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Esta conta tem pendência: <b>{pend.map((p) => ROTULO_PENDENCIA[p]).join(", ")}</b>. Dá para aprovar mesmo assim, dizendo por quê — ela vai para a 2ª revisão.</p>
        <Field label="Por que aprovar mesmo assim (mínimo 10 letras)">
          <textarea className="input" rows={2} value={txt} onChange={(e) => setTxt(e.target.value)} required minLength={10} autoFocus placeholder="Ex.: boleto chegou no WhatsApp, anexo depois" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button disabled={ocupado || txt.trim().length < 10}><Check size={15} /> {ocupado ? "Salvando…" : "Aprovar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ModalAprovarTodas<T extends ContaAprovar>({ contas, tipoDe, pulam, vai2a, ocupado, onClose, onConfirmar }: {
  contas: T[]; tipoDe: (c: T) => TipoPagar; pulam: number; vai2a: number; ocupado: boolean; onClose: () => void; onConfirmar: () => void;
}) {
  const porTipo = ORDEM_TIPOS.map((t) => ({ t, l: contas.filter((c) => tipoDe(c) === t) })).filter((x) => x.l.length);
  return (
    <Modal open onClose={onClose} title={`Aprovar ${contas.length} contas`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Só as contas completas (com documento, categoria certa e sem repetição). Confira o total antes:</p>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {porTipo.map(({ t, l }) => (
            <li key={t} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIPOS_PAGAR[t].chip}`}>{TIPOS_PAGAR[t].rotulo}</span>
              <span className="text-slate-500">{l.length} {pl(l.length, "conta", "contas")}</span>
              <b className="num ml-auto">{brl(soma(l))}</b>
            </li>
          ))}
          <li className="flex items-center px-3 py-2 text-sm font-bold"><span>Total</span><span className="num ml-auto">{brl(soma(contas))}</span></li>
        </ul>
        {(vai2a > 0 || pulam > 0) && (
          <p className="text-xs text-slate-500">
            {vai2a > 0 && <>{vai2a} {pl(vai2a, "vai", "vão")} para a 2ª revisão (valor alto ou exceção). </>}
            {pulam > 0 && <>{pulam} com pendência {pl(pulam, "fica", "ficam")} de fora: aprove uma a uma, dizendo por quê.</>}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button type="button" disabled={ocupado} onClick={onConfirmar}><CheckCheck size={15} /> {ocupado ? "Aprovando…" : `Aprovar ${contas.length} · ${brl(soma(contas))}`}</Button>
        </div>
      </div>
    </Modal>
  );
}
