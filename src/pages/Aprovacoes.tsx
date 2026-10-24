// Aprovações: fluxo de revisão das contas a pagar e a receber antes do contador. 1ª revisão (responsável da área),
// 2ª revisão (controladoria) pela alçada e nas exceções, pendências fora do pacote, devolução e rejeição com motivo.
// As regras valem no banco (revisar_contas); esta tela só mostra e chama.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, BadgeCheck, Check, ClipboardCheck, FileWarning, History, Paperclip, RotateCcw, Settings2, Undo2, X,
} from "lucide-react";
import { Button, Field, Indicador, Modal, PageHeader, Tabs } from "@/components/ui";
import { Anexos } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import {
  COR_TOM, etapaConta, pendencias, precisa2a, quemPode, regrasDe, ROTULO_PENDENCIA, TABELA,
  type ContaRevisao, type Pendencia, type TipoConta,
} from "@/lib/aprovacao";
import { useAbaUrl } from "@/lib/abaUrl";
import { ehGastoCartao } from "@/lib/gastosCartao";

type Linha = { tipo: TipoConta; c: ContaRevisao; terceiro: string | null; pend: Pendencia[] };
type Hist = { id: string; tabela: string; conta_id: string; acao: string; etapa: string | null; comentario: string | null; usuario_nome: string | null; created_at: string };
type Acao = "aprovar" | "devolver" | "rejeitar" | "reenviar";
type Aba = "revisar" | "pendencias" | "aprovadas" | "regras";

const TEXTO_ACAO: Record<Acao, string> = { aprovar: "Aprovar", devolver: "Devolver para correção", rejeitar: "Rejeitar", reenviar: "Reenviar para revisão" };
const diaAprov = (c: ContaRevisao) => (c.revisao2_em ?? c.revisao1_em ?? "").slice(0, 10);

export default function Aprovacoes() {
  const eu = usePerfil();
  const admin = eu.papel === "admin";
  const podeAgir = eu.tem("financeiro");
  const navigate = useNavigate();
  const invalidar = useInvalidate();
  const { data: cfg } = useConfig();
  const regras = regrasDe(cfg);
  const { filtrar } = useUnidade();
  // mesmos selects do Financeiro: a lista já carregada serve às duas telas
  const { data: pagarT = [] } = useRows<ContaRevisao & { fornecedor?: { nome: string } | null }>("contas_pagar", { select: "*, fornecedor:fornecedores(nome, cnpj, bloqueado, bloqueio_motivo)" });
  const { data: receberT = [] } = useRows<ContaRevisao & { cliente?: { nome: string; nome_fantasia?: string | null } | null }>("contas_receber", { select: "*, cliente:clientes(*)" });
  const { data: docs = [] } = useRows<{ entidade: string; entidade_id: string }>("documentos", { select: "entidade, entidade_id" });
  const { data: categorias = [] } = useRows<{ nome: string; tipo: string; ativo: boolean }>("categorias_financeiras", { order: "ordem", ascending: true });
  const { data: historico = [] } = useRows<Hist>("revisoes_contas", { order: "created_at", ascending: false });
  const [aba, setAba] = useAbaUrl<Aba>("revisar", ["revisar", "pendencias", "aprovadas", "regras"] as const);
  const [soMinha, setSoMinha] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [decidir, setDecidir] = useState<{ acao: Acao; linhas: Linha[] } | null>(null);
  const [anexos, setAnexos] = useState<Linha | null>(null);
  const [verHist, setVerHist] = useState<Linha | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mes = hoje().slice(0, 7);

  const linhas = useMemo<Linha[]>(() => {
    const pagar = filtrar(pagarT), receber = filtrar(receberT);
    const anexosP = new Set(docs.filter((d) => d.entidade === "conta_pagar").map((d) => d.entidade_id));
    const anexosR = new Set(docs.filter((d) => d.entidade === "conta_receber").map((d) => d.entidade_id));
    const calc = (tipo: TipoConta, c: ContaRevisao, todas: ContaRevisao[]) =>
      c.revisao === "em_revisao" || c.revisao === "devolvido" ? pendencias(c, tipo, { anexos: tipo === "pagar" ? anexosP : anexosR, categorias, todas }) : [];
    return [
      ...pagar.map((c) => ({ tipo: "pagar" as const, c, terceiro: c.fornecedor?.nome ?? null, pend: calc("pagar", c, pagar) })),
      ...receber.map((c) => ({ tipo: "receber" as const, c, terceiro: c.cliente ? c.cliente.nome_fantasia?.trim() || c.cliente.nome : null, pend: calc("receber", c, receber) })),
    ];
  }, [pagarT, receberT, docs, categorias, filtrar]);

  // compras do cartão (extrato do cartão, uma por linha) saem da lista: aqui só boletos, Pix e contas. Elas aparecem
  // num bloco à parte, uma linha por dia, aprovadas de uma vez (pedido de 24/10)
  const ehCartao = (l: Linha) => l.tipo === "pagar" && ehGastoCartao(l.c as never);
  const cartaoDias = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) {
      if (!ehCartao(l) || l.c.revisao !== "em_revisao" || !quemPode(l.c, { id: eu.user_id, admin }, regras).pode) continue;
      const d = (l.c as { data_pagamento?: string | null }).data_pagamento ?? l.c.vencimento;
      m.set(d, [...(m.get(d) ?? []), l]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [linhas, eu.user_id, admin, regras.revisor1.join(), regras.revisor2.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = useMemo(() => {
    const semCartao = linhas.filter((l) => !ehCartao(l));
    const emRevisao = semCartao.filter((l) => l.c.revisao === "em_revisao");
    const minha = emRevisao.filter((l) => quemPode(l.c, { id: eu.user_id, admin }, regras).pode);
    const aprovadasMes = semCartao.filter((l) => l.c.revisao === "aprovado" && diaAprov(l.c).startsWith(mes));
    return {
      emRevisao, minha,
      segunda: emRevisao.filter((l) => l.c.revisao1_em),
      pendentes: emRevisao.filter((l) => !l.c.revisao1_em && l.pend.length),
      devolvidas: semCartao.filter((l) => l.c.revisao === "devolvido"),
      aprovadasMes, validadasMes: aprovadasMes.filter((l) => l.c.contador_status === "validado"),
      aprovadas: semCartao.filter((l) => l.c.revisao === "aprovado").sort((a, b) => diaAprov(b.c).localeCompare(diaAprov(a.c))),
    };
  }, [linhas, eu.user_id, admin, regras.revisor1.join(), regras.revisor2.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const ordenar = (l: Linha[]) => [...l].sort((a, b) => a.c.vencimento.localeCompare(b.c.vencimento));
  const lista = aba === "revisar" ? ordenar(soMinha ? k.minha : k.emRevisao)
    : aba === "pendencias" ? ordenar([...k.devolvidas, ...k.pendentes])
    : k.aprovadas.slice(0, 60);
  const marcaveis = lista.filter((l) => quemPode(l.c, { id: eu.user_id, admin }, regras).pode && !l.pend.length);
  const marcadas = lista.filter((l) => sel.has(l.c.id));

  async function executar(acao: Acao, ls: Linha[], comentario: string | null) {
    setOcupado(true);
    try {
      let n = 0;
      for (const tipo of ["pagar", "receber"] as const) {
        const ids = ls.filter((l) => l.tipo === tipo).map((l) => l.c.id);
        if (!ids.length) continue;
        const { data, error } = await supabase.rpc("revisar_contas", { p_tabela: TABELA[tipo], p_ids: ids, p_acao: acao, p_comentario: comentario });
        if (error) throw error;
        n += Number(data ?? 0);
      }
      const txt = { aprovar: "aprovada(s)", devolver: "devolvida(s) para correção", rejeitar: "rejeitada(s) e cancelada(s)", reenviar: "de volta para a revisão" }[acao];
      notify(`${n} ${pl(n, "conta", "contas")} ${txt.replace(/\(s\)/g, n === 1 ? "" : "s")}`);
      setSel(new Set()); setDecidir(null);
      invalidar("contas_pagar", "contas_receber", "revisoes_contas");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  // aprovar sem pendência vai direto; o resto pede o comentário
  const pedir = (acao: Acao, ls: Linha[]) => (acao === "aprovar" && ls.every((l) => !l.pend.length) ? executar(acao, ls, null) : setDecidir({ acao, linhas: ls }));

  const minhaEtapa = [regras.revisor1.includes(eu.user_id) && "1ª revisão", regras.revisor2.includes(eu.user_id) && "2ª revisão"].filter(Boolean).join(" e ");
  return (
    <div>
      <PageHeader title="Aprovações" subtitle={`Contas a pagar e a receber passam pela revisão antes do contador. 2ª revisão a partir de ${brl(regras.alcada)}, nas exceções, estornos e alterações depois de aprovadas.${minhaEtapa ? ` Você faz a ${minhaEtapa}.` : admin ? " Como administrador, você pode fazer as duas (nunca as duas na mesma conta)." : ""}`} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador rotulo="Sua vez" icon={ClipboardCheck} cor={k.minha.length ? "azul" : "verde"} valor={k.minha.length} sub="contas que você pode revisar agora" />
        <Indicador rotulo="Na 2ª revisão" icon={BadgeCheck} cor="indigo" valor={k.segunda.length} sub={`a partir de ${brl(regras.alcada)} e exceções`} />
        <Indicador rotulo="Aguardando documento" icon={FileWarning} cor={k.pendentes.length ? "ambar" : "neutro"} valor={k.pendentes.length} sub="ficam fora do pacote do contador" />
        <Indicador rotulo="Devolvidas" icon={Undo2} cor={k.devolvidas.length ? "laranja" : "neutro"} valor={k.devolvidas.length} sub="esperando correção de quem lançou" />
        <Indicador rotulo="Aprovadas no mês" icon={Check} cor="verde" valor={k.aprovadasMes.length}
          sub={`${k.validadasMes.length} ${pl(k.validadasMes.length, "validada", "validadas")} pelo contador`} />
      </div>

      <Tabs value={aba} onChange={(v) => { setAba(v); setSel(new Set()); }} options={[
        { value: "revisar", label: `Para revisar (${k.emRevisao.length})` },
        { value: "pendencias", label: `Pendências e devolvidas (${k.pendentes.length + k.devolvidas.length})` },
        { value: "aprovadas", label: "Aprovadas" },
        { value: "regras", label: "Regras" },
      ]} />

      {aba === "regras" ? <Regras admin={admin} regras={regras} /> : (
        <>
          {aba === "revisar" && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Quais contas" className="cartao inline-flex p-1">
                {[{ v: true, t: `Minha vez (${k.minha.length})` }, { v: false, t: `Todas em revisão (${k.emRevisao.length})` }].map((o) => (
                  <button key={String(o.v)} type="button" role="tab" aria-selected={soMinha === o.v} onClick={() => setSoMinha(o.v)}
                    className={`min-h-[36px] rounded-lg px-3 text-sm font-semibold ${soMinha === o.v ? "bg-modulo text-white" : "text-slate-600 hover:bg-slate-50"}`}>{o.t}</button>
                ))}
              </div>
              {podeAgir && marcaveis.length > 1 && (
                <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" className="h-5 w-5" checked={marcaveis.every((l) => sel.has(l.c.id))}
                    onChange={(e) => setSel(new Set(e.target.checked ? marcaveis.map((l) => l.c.id) : []))} /> Marcar as {marcaveis.length} sem pendência
                </label>
              )}
            </div>
          )}
          {aba === "revisar" && podeAgir && cartaoDias.length > 0 && (
            <details className="cartao mb-3 p-3 text-sm">
              <summary className="cursor-pointer font-semibold text-fg">Gastos cartão ({cartaoDias.reduce((s, [, ls]) => s + ls.length, 0)} compras em {cartaoDias.length} {pl(cartaoDias.length, "dia", "dias")}) · aprovar por dia</summary>
              <ul className="mt-2 divide-y divide-slate-100">
                {cartaoDias.map(([d, ls]) => (
                  <li key={d} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span className="min-w-40 flex-1"><b>Gastos cartão {dataBR(d)}</b> <span className="text-xs text-slate-500">· {ls.length} {pl(ls.length, "compra", "compras")}</span></span>
                    <span className="num font-semibold">{brl(ls.reduce((s, l) => s + Number(l.c.valor), 0))}</span>
                    <Button type="button" variant="secondary" className="!min-h-0 !py-1" disabled={ocupado}
                      onClick={() => executar("aprovar", ls, "Gastos do cartão do dia, aprovados juntos")}><Check size={14} /> Aprovar o dia</Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {lista.length ? (
            <ul className="space-y-2.5">
              {lista.map((l) => (
                <LinhaConta key={`${l.tipo}-${l.c.id}`} l={l} eu={{ id: eu.user_id, admin }} regras={regras} podeAgir={podeAgir}
                  marcavel={aba === "revisar" && marcaveis.includes(l)} marcada={sel.has(l.c.id)}
                  onMarcar={() => setSel((s) => { const n = new Set(s); if (n.has(l.c.id)) n.delete(l.c.id); else n.add(l.c.id); return n; })}
                  onAcao={(a) => pedir(a, [l])} onAnexos={() => setAnexos(l)} onHistorico={() => setVerHist(l)}
                  onAbrir={() => navigate("/financeiro", { state: { aba: l.tipo } })} ocupado={ocupado} />
              ))}
            </ul>
          ) : (
            <p className="cartao p-8 text-center text-slate-500">
              {aba === "revisar" ? (soMinha ? "Nada esperando a sua revisão. ✅" : "Nenhuma conta em revisão. ✅") : aba === "pendencias" ? "Nenhuma pendência nem devolução. ✅" : "Nenhuma conta aprovada ainda."}
            </p>
          )}
          {marcadas.length > 0 && (
            <div className="cartao sticky bottom-2 z-20 mt-3 flex flex-wrap items-center gap-2 p-2.5 shadow-pop">
              <span className="mr-auto text-sm"><b>{marcadas.length}</b> {pl(marcadas.length, "marcada", "marcadas")} · <b className="num">{brl(marcadas.reduce((s, l) => s + Number(l.c.valor), 0))}</b></span>
              <Button type="button" variant="ghost" onClick={() => setSel(new Set())}><X size={15} /> Desmarcar</Button>
              <Button type="button" disabled={ocupado} onClick={() => pedir("aprovar", marcadas)}><Check size={15} /> Aprovar {marcadas.length}</Button>
            </div>
          )}
        </>
      )}

      {decidir && <ModalDecisao d={decidir} regras={regras} ocupado={ocupado} onClose={() => setDecidir(null)} onConfirmar={(com) => executar(decidir.acao, decidir.linhas, com)} />}
      {anexos && (
        <Modal open onClose={() => setAnexos(null)} title={`Documentos · ${anexos.c.descricao}`}>
          <Anexos entidade={anexos.tipo === "pagar" ? "conta_pagar" : "conta_receber"} id={anexos.c.id} titulo="Boleto, nota, recibo" />
          <p className="mt-3 text-xs text-slate-500">Anexar o documento tira a pendência “sem documento” (atualize a lista depois de anexar).</p>
        </Modal>
      )}
      {verHist && (
        <Modal open onClose={() => setVerHist(null)} title={`Histórico · ${verHist.c.descricao}`}>
          <HistoricoConta itens={historico.filter((h) => h.conta_id === verHist.c.id)} c={verHist.c} />
        </Modal>
      )}
    </div>
  );
}

function LinhaConta({ l, eu, regras, podeAgir, marcavel, marcada, onMarcar, onAcao, onAnexos, onHistorico, onAbrir, ocupado }: {
  l: Linha; eu: { id: string; admin: boolean }; regras: ReturnType<typeof regrasDe>; podeAgir: boolean; marcavel: boolean; marcada: boolean;
  onMarcar: () => void; onAcao: (a: Acao) => void; onAnexos: () => void; onHistorico: () => void; onAbrir: () => void; ocupado: boolean;
}) {
  const { c, tipo, pend } = l;
  const e = etapaConta(c, pend);
  const q = quemPode(c, eu, regras);
  const vai2a = c.revisao === "em_revisao" && !c.revisao1_em && precisa2a(c, pend, regras);
  const vencida = c.status === "aberto" && c.vencimento < hoje();
  return (
    <li className={`rounded-2xl border bg-surface p-3 shadow-card sm:p-4 ${marcada ? "border-modulo ring-1 ring-modulo/30" : "border-slate-200"}`}>
      <div className="flex items-start gap-3">
        {marcavel && podeAgir && <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={marcada} onChange={onMarcar} aria-label={`Marcar ${c.descricao}`} />}
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tipo === "pagar" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}
          title={tipo === "pagar" ? "Conta a pagar" : "Conta a receber"}>
          {tipo === "pagar" ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <button type="button" onClick={onAbrir} className="min-w-0 truncate text-left text-sm font-semibold text-fg hover:underline">{l.terceiro || c.descricao}</button>
            <span className="num shrink-0 text-base font-bold text-fg">{brl(Number(c.valor))}</span>
          </div>
          <p className="truncate text-sm text-slate-600">{l.terceiro && c.descricao !== l.terceiro ? c.descricao : ""}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {tipo === "pagar" ? "A pagar" : "A receber"} · <span className={vencida ? "font-semibold text-red-600" : ""}>vence {dataBR(c.vencimento)}</span>
            {c.categoria ? ` · ${c.categoria}` : ""}{c.competencia ? ` · competência ${dataBR(c.competencia).slice(3)}` : ""}
            {c.status === "pago" ? ` · paga em ${dataBR(c.data_pagamento)}` : ""}
            {c.lancamento ? ` · ${c.lancamento === "automatico" ? "lançamento automático" : c.lancamento === "importado" ? "importada" : "lançada à mão"}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span title={e.dica} className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR_TOM[e.tom]}`}>{e.texto}</span>
            {pend.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                <AlertTriangle size={11} aria-hidden /> {ROTULO_PENDENCIA[p]}
              </span>
            ))}
            {(c.motivo_2a || vai2a) && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-2xs font-semibold text-indigo-800 ring-1 ring-inset ring-indigo-200">
                2ª revisão: {c.motivo_2a ?? (Number(c.valor) >= regras.alcada ? `valor a partir de ${brl(regras.alcada)}` : "exceção")}
              </span>
            )}
            {c.revisao1_nome && <span className="text-2xs text-slate-500">1ª: {c.revisao1_nome}{c.revisao1_em ? ` em ${dataBR(c.revisao1_em.slice(0, 10))}` : ""}</span>}
            {c.revisao2_nome && <span className="text-2xs text-slate-500">· 2ª: {c.revisao2_nome}</span>}
          </div>
          {c.revisao_comentario && (c.revisao === "devolvido" || c.revisao === "rejeitado" || c.revisao === "em_revisao") && (
            <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-sm ${c.revisao === "devolvido" ? "bg-orange-50 text-orange-900" : "bg-slate-50 text-slate-700"}`}>“{c.revisao_comentario}”</p>
          )}
          {c.contador_status === "duvida" && c.contador_comentario && (
            <p className="mt-2 rounded-lg bg-violet-50 px-2.5 py-1.5 text-sm text-violet-900">Contador: “{c.contador_comentario}”</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {podeAgir && q.pode && (
              <>
                <Button type="button" disabled={ocupado} onClick={() => onAcao("aprovar")} className="!min-h-[36px] !px-3 !py-1.5 text-sm">
                  <Check size={15} /> {q.etapa === 2 ? "Aprovar (2ª revisão)" : pend.length ? "Aprovar com exceção" : "Aprovar"}
                </Button>
                <Button type="button" variant="secondary" disabled={ocupado} onClick={() => onAcao("devolver")} className="!min-h-[36px] !px-3 !py-1.5 text-sm"><Undo2 size={15} /> Devolver</Button>
                <Button type="button" variant="ghost" disabled={ocupado} onClick={() => onAcao("rejeitar")} className="!min-h-[36px] !px-3 !py-1.5 text-sm text-red-700"><X size={15} /> Rejeitar</Button>
              </>
            )}
            {podeAgir && c.revisao === "devolvido" && (
              <Button type="button" variant="secondary" disabled={ocupado} onClick={() => onAcao("reenviar")} className="!min-h-[36px] !px-3 !py-1.5 text-sm"><RotateCcw size={15} /> Já corrigi: reenviar</Button>
            )}
            {!q.pode && c.revisao === "em_revisao" && q.motivo && <span className="text-xs text-slate-500">{q.motivo}</span>}
            {/* no celular só os ícones, para os botões não ocuparem várias linhas */}
            <span className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" onClick={onAnexos} title="Documentos" aria-label="Documentos" className="!min-h-[36px] !px-2.5 !py-1.5 text-sm"><Paperclip size={15} /><span className="hidden sm:inline">Documentos</span></Button>
              <Button type="button" variant="ghost" onClick={onHistorico} title="Histórico" aria-label="Histórico" className="!min-h-[36px] !px-2.5 !py-1.5 text-sm"><History size={15} /><span className="hidden sm:inline">Histórico</span></Button>
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function ModalDecisao({ d, regras, ocupado, onClose, onConfirmar }: {
  d: { acao: Acao; linhas: Linha[] }; regras: ReturnType<typeof regrasDe>; ocupado: boolean; onClose: () => void; onConfirmar: (comentario: string | null) => void;
}) {
  const [txt, setTxt] = useState("");
  const comPend = d.linhas.filter((l) => l.pend.length);
  const minimo = d.acao === "aprovar" ? (comPend.length ? 10 : 0) : d.acao === "reenviar" ? 0 : 5;
  const um = d.linhas.length === 1 ? d.linhas[0] : null;
  const dica = d.acao === "aprovar"
    ? `Aprovando com pendência (${comPend.flatMap((l) => l.pend).map((p) => ROTULO_PENDENCIA[p]).filter((v, i, a) => a.indexOf(v) === i).join(", ")}): diga por quê. Vai para a 2ª revisão.`
    : d.acao === "devolver" ? "O que precisa ser corrigido? Quem lançou vê este texto."
    : d.acao === "rejeitar" ? "Por que rejeitar? A conta em aberto é cancelada com este motivo (fica no histórico)."
    : "Comentário (opcional).";
  return (
    <Modal open onClose={onClose} title={`${TEXTO_ACAO[d.acao]}${um ? ` · ${um.c.descricao}` : ` · ${d.linhas.length} contas`}`}>
      <form onSubmit={(e) => { e.preventDefault(); onConfirmar(txt.trim() || null); }} className="space-y-3">
        {um && <p className="text-sm text-slate-600">{um.terceiro ? `${um.terceiro} · ` : ""}{brl(Number(um.c.valor))} · vence {dataBR(um.c.vencimento)}
          {d.acao === "aprovar" && precisa2a(um.c, um.pend, regras) ? " · vai para a 2ª revisão" : ""}</p>}
        <Field label={dica}>
          <textarea className="input" rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} minLength={minimo || undefined} required={minimo > 0} autoFocus
            placeholder={d.acao === "devolver" ? "Ex.: falta anexar o boleto; categoria deve ser manutenção" : d.acao === "rejeitar" ? "Ex.: cobrança em duplicidade" : ""} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={ocupado || txt.trim().length < minimo}>{ocupado ? "Salvando…" : TEXTO_ACAO[d.acao]}</Button>
        </div>
      </form>
    </Modal>
  );
}

function HistoricoConta({ itens, c }: { itens: Hist[]; c: ContaRevisao }) {
  const ACAO: Record<string, string> = { aprovou: "aprovou", devolveu: "devolveu", rejeitou: "rejeitou", reenviou: "reenviou para revisão", validou: "validou", perguntou: "perguntou", "desfez a validação": "desfez a validação" };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {c.lancamento === "automatico" ? "Lançamento automático" : c.lancamento === "manual" ? "Lançada à mão" : "Lançada antes do fluxo"}
        {c.revisao1_nome?.startsWith("Automático") ? " · aprovada automaticamente (passou nas validações)" : ""}
      </p>
      {itens.length ? (
        <ol className="space-y-2">
          {itens.map((h) => (
            <li key={h.id} className="rounded-xl border border-slate-200 p-2.5 text-sm">
              <div className="text-xs text-slate-500">{new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{h.etapa ? ` · ${h.etapa}` : ""}</div>
              <div className="text-fg"><b>{h.usuario_nome ?? "—"}</b> {ACAO[h.acao] ?? h.acao}</div>
              {h.comentario && <p className="mt-0.5 text-slate-600">“{h.comentario}”</p>}
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-slate-500">Nenhuma revisão ainda. As alterações da conta ficam em Auditoria financeira → Histórico.</p>}
    </div>
  );
}

/** Quem faz cada revisão e a alçada (só o administrador muda). */
function Regras({ admin, regras }: { admin: boolean; regras: ReturnType<typeof regrasDe> }) {
  const { data: usuarios = [] } = useRows<{ user_id: string; nome: string; papel: string; ativo: boolean }>("usuarios_erp", { order: "nome", ascending: true, key: ["aprovacoes"] });
  const [r1, setR1] = useState<string[]>(regras.revisor1);
  const [r2, setR2] = useState<string[]>(regras.revisor2);
  const [alcada, setAlcada] = useState(String(regras.alcada));
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  const candidatos = usuarios.filter((u) => u.ativo && ["admin", "financeiro"].includes(u.papel));
  const nome = (id: string) => usuarios.find((u) => u.user_id === id)?.nome ?? "—";
  const alterna = (l: string[], set: (v: string[]) => void, id: string) => set(l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.from("configuracoes").update({ aprovacao_revisor1: r1, aprovacao_revisor2: r2, aprovacao_alcada: Number(alcada) || 0 }).eq("id", 1);
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Regras salvas"); invalidar("configuracoes");
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="cartao p-4">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-fg"><Settings2 size={18} /> Quem revisa</h2>
        {admin ? (
          <>
            <p className="mb-3 text-sm text-slate-600">Marque quem faz cada revisão. O administrador pode fazer qualquer uma, mas nunca as duas na mesma conta.</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5">Pessoa</th><th className="py-1.5 text-center">1ª revisão</th><th className="py-1.5 text-center">2ª revisão</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {candidatos.map((u) => (
                  <tr key={u.user_id}>
                    <td className="py-2 font-semibold text-fg">{u.nome} <span className="text-xs font-normal text-slate-500">{u.papel === "admin" ? "administrador" : "financeiro"}</span></td>
                    <td className="py-2 text-center"><input type="checkbox" className="h-5 w-5" aria-label={`${u.nome} na 1ª revisão`} checked={r1.includes(u.user_id)} onChange={() => alterna(r1, setR1, u.user_id)} /></td>
                    <td className="py-2 text-center"><input type="checkbox" className="h-5 w-5" aria-label={`${u.nome} na 2ª revisão`} checked={r2.includes(u.user_id)} onChange={() => alterna(r2, setR2, u.user_id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Field label="2ª revisão a partir de (R$)" className="mt-3 max-w-[220px]">
              <input className="input" type="number" min={0} step="0.01" value={alcada} onChange={(e) => setAlcada(e.target.value)} />
            </Field>
            <div className="mt-3 flex justify-end"><Button type="button" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar regras"}</Button></div>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            1ª revisão: {regras.revisor1.length} {pl(regras.revisor1.length, "pessoa", "pessoas")} · 2ª revisão: {regras.revisor2.length} {pl(regras.revisor2.length, "pessoa", "pessoas")} · alçada {brl(regras.alcada)}. Só o administrador muda.
          </p>
        )}
        {admin && <p className="mt-3 text-xs text-slate-500">Hoje: 1ª revisão {regras.revisor1.map(nome).join(", ") || "—"} · 2ª revisão {regras.revisor2.map(nome).join(", ") || "—"}.</p>}
      </div>
      <div className="cartao p-4 text-sm text-slate-700">
        <h2 className="mb-2 text-base font-bold text-fg">Como funciona</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><b>Lançou, entrou em revisão.</b> Lançamento automático (pedido, NF de fornecedor, tarifas, extrato) que passa nas validações já entra aprovado.</li>
          <li><b>Validações:</b> documento (número, NF, pedido/OS ou anexo), categoria do plano de contas e possível duplicidade. O que falta fica em “Pendências” e fora do pacote do contador.</li>
          <li><b>1ª revisão</b> (responsável da área): aprovar, devolver para correção ou rejeitar. Quem lançou não faz a 1ª revisão.</li>
          <li><b>2ª revisão</b> (controladoria): a partir de {brl(regras.alcada)}, quando aprovou com pendência, no estorno, na alteração depois de aprovada e no lançamento corretivo.</li>
          <li><b>Contador:</b> no Painel do contador, valida o que foi aprovado ou manda dúvida. A dúvida volta presa ao lançamento; corrigido, fica “ajustado” e volta para ele.</li>
          <li><b>Fechar o mês:</b> só com tudo aprovado e validado, ou com a justificativa escrita. Depois de fechado, ajuste só por lançamento corretivo.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">“Aprovado internamente” e “validado pelo contador” são contados separados: exportar ou enviar o pacote não valida nada.</p>
      </div>
    </div>
  );
}
