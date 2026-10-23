// Minhas empresas (aba do painel pessoal): as empresas em que a pessoa é ou já foi sócia, numa linha do tempo, com os
// dados públicos da Receita. Só o dono vê (public.pessoal_empresas).
import { useState, type FormEvent } from "react";
import { Briefcase, Building2, CalendarClock, CheckCircle2, Copy, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Store, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal, Stat } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, dataHoraBR, digitos, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import {
  agruparEmpresas, anosEntre, cnpjFormatado, cnpjValido, consultarReceita, euNoQuadro, resumoEmpresas, tomSituacao, type EmpresaPessoal,
} from "@/lib/minhasEmpresas";

const CHIP: Record<ReturnType<typeof tomSituacao>, string> = {
  ativa: "bg-emerald-100 text-emerald-800", baixada: "bg-slate-200 text-slate-700", problema: "bg-red-100 text-red-800",
  atencao: "bg-amber-100 text-amber-800", sem: "bg-slate-100 text-slate-500",
};
const BORDA: Record<ReturnType<typeof tomSituacao>, string> = {
  ativa: "#047857", baixada: "#94a3b8", problema: "#b91c1c", atencao: "#b45309", sem: "#cbd5e1",
};

export function MinhasEmpresas({ meusNomes }: { meusNomes: string[] }) {
  const invalidar = useInvalidate();
  const { data: lista = [], isLoading } = useRows<EmpresaPessoal>("pessoal_empresas", { order: "ordem", ascending: true });
  const [novo, setNovo] = useState("");
  const [conferindo, setConferindo] = useState<string | null>(null);
  const [edit, setEdit] = useState<EmpresaPessoal | null>(null);
  const grupos = agruparEmpresas(lista);
  const r = resumoEmpresas(lista);

  async function conferir(e: Pick<EmpresaPessoal, "id" | "cnpj" | "qualificacao" | "entrada">, calado = false) {
    setConferindo(e.id);
    try {
      const d = await consultarReceita(e.cnpj);
      if (!d) { if (!calado) notifyError(new Error("A Receita não respondeu agora (BrasilAPI e CNPJá). Tente de novo em alguns minutos.")); return false; }
      const eu = euNoQuadro(d.socios, meusNomes);
      const { error } = await supabase.from("pessoal_empresas").update({
        ...d, qualificacao: e.qualificacao || eu?.qualificacao || null, entrada: e.entrada || eu?.entrada || null, conferido_em: new Date().toISOString(),
      }).eq("id", e.id);
      if (error) throw error;
      if (!calado) notify("Conferido na Receita");
      return true;
    } catch (err) { if (!calado) notifyError(err); return false; } finally { setConferindo(null); invalidar("pessoal_empresas"); }
  }
  async function conferirTodas() {
    let ok = 0;
    for (const e of lista) if (await conferir(e, true)) ok += 1;
    notify(`${ok} de ${lista.length} ${pl(lista.length, "conferida", "conferidas")} na Receita`);
  }
  async function adicionar(ev: FormEvent) {
    ev.preventDefault();
    const d = digitos(novo);
    if (!cnpjValido(d)) return notifyError(new Error("CNPJ inválido: confira os 14 números"));
    if (lista.some((e) => e.cnpj === d)) return notifyError(new Error("Esse CNPJ já está na lista"));
    const { data, error } = await supabase.from("pessoal_empresas").insert({ cnpj: d, ordem: lista.length }).select("id, cnpj, qualificacao, entrada").single();
    if (error || !data) return notifyError(error);
    setNovo("");
    invalidar("pessoal_empresas");
    await conferir(data);
  }
  async function tirar(e: EmpresaPessoal) {
    if (!(await confirmar(`Tirar ${e.razao_social ?? cnpjFormatado(e.cnpj)} da sua lista? (Não muda nada na Receita.)`, { perigo: true }))) return;
    const { error } = await supabase.from("pessoal_empresas").delete().eq("id", e.id);
    if (error) return notifyError(error);
    invalidar("pessoal_empresas");
  }
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => notify("CNPJ copiado"), () => notifyError(new Error("Não deu para copiar")));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Empresas" valor={String(r.empresas)} icon={Building2} tom="info" sub={r.filiais ? `e ${r.filiais} ${pl(r.filiais, "filial", "filiais")}` : "sem filiais"} />
        <Stat label="Ativas" valor={String(r.ativas)} icon={CheckCircle2} tom="bom" sub={r.baixadas ? `${r.baixadas} ${pl(r.baixadas, "baixada", "baixadas")}` : "nenhuma baixada"} />
        <Stat label="Capital das ativas" valor={brl(r.capitalAtivas)} icon={Briefcase} tom="neutro" sub="soma do capital social (matrizes)" />
        <Stat label="Empreendendo desde" valor={r.desde ? r.desde.slice(0, 4) : "—"} icon={CalendarClock} tom="neutro" sub={r.desde ? `${anosEntre(r.desde, hoje())} anos` : "confira as datas na Receita"} />
      </div>

      <Card className="p-3 sm:p-4">
        <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2">
          <Field label="Adicionar um CNPJ" className="min-w-0 flex-1 basis-56"><input className="input" value={novo} onChange={(e) => setNovo(e.target.value)} inputMode="numeric" placeholder="00.000.000/0000-00" /></Field>
          <Button type="submit" disabled={digitos(novo).length !== 14}><Plus size={15} /> Adicionar</Button>
          <Button type="button" variant="secondary" onClick={conferirTodas} disabled={!lista.length || !!conferindo}>{conferindo ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Conferir todas na Receita</Button>
        </form>
        {r.semConferir > 0 && <p className="mt-2 text-xs text-amber-800">{r.semConferir} {pl(r.semConferir, "CNPJ ainda não foi conferido", "CNPJs ainda não foram conferidos")} na Receita: os dados vieram de sites de busca. Toque em "Conferir todas na Receita".</p>}
      </Card>

      {isLoading ? null : !grupos.length ? <Card className="p-6 text-center text-sm text-slate-500">Nenhuma empresa ainda. Adicione o CNPJ acima.</Card> : (
        <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4 sm:pl-6">
          {grupos.map(({ matriz: m, filiais }) => {
            const tom = tomSituacao(m.situacao);
            const fim = tom === "baixada" && m.data_situacao ? m.data_situacao : hoje();
            const anos = anosEntre(m.abertura, fim);
            return (
              <li key={m.id} className="relative">
                <span className="absolute -left-[23px] top-4 h-3 w-3 rounded-full ring-4 ring-surface sm:-left-[31px]" style={{ background: BORDA[tom] }} aria-hidden />
                <Card className="overflow-hidden">
                  <div className="border-l-4 p-3 sm:p-4" style={{ borderColor: BORDA[tom] }}>
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1 basis-60">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{m.abertura ? m.abertura.slice(0, 4) : "ano?"}{anos != null && ` · ${tom === "baixada" ? `durou ${anos} ${pl(anos, "ano", "anos")}` : `${anos} ${pl(anos, "ano", "anos")}`}`}</div>
                        <h3 className="text-base font-bold leading-tight text-fg">{m.nome_fantasia || m.razao_social || cnpjFormatado(m.cnpj)}</h3>
                        {m.nome_fantasia && m.razao_social && <div className="text-xs text-slate-500">{m.razao_social}</div>}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${CHIP[tom]}`}>{m.situacao ?? "a conferir"}{m.data_situacao && tom !== "ativa" ? ` em ${dataBR(m.data_situacao)}` : ""}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      <Linha rotulo="CNPJ"><button type="button" className="link-discreto inline-flex items-center gap-1 font-mono" onClick={() => copiar(cnpjFormatado(m.cnpj))}>{cnpjFormatado(m.cnpj)} <Copy size={12} aria-hidden /></button></Linha>
                      {m.abertura && <Linha rotulo="Abertura">{dataBR(m.abertura)}</Linha>}
                      {(m.municipio || m.uf) && <Linha rotulo="Cidade">{[m.municipio, m.uf].filter(Boolean).join(" / ")}</Linha>}
                      {m.capital_social != null && <Linha rotulo="Capital social">{brl(m.capital_social)}</Linha>}
                      {m.porte && <Linha rotulo="Porte">{m.porte}</Linha>}
                      {m.natureza && <Linha rotulo="Natureza">{m.natureza}</Linha>}
                      {m.cnae && <Linha rotulo="Atividade" largo>{m.cnae}</Linha>}
                      {(m.qualificacao || m.entrada) && <Linha rotulo="Você" largo><b>{m.qualificacao ?? "sócia"}</b>{m.entrada && ` desde ${dataBR(m.entrada)}`}{m.saida && ` até ${dataBR(m.saida)}`}</Linha>}
                    </dl>
                    {!!m.socios?.length && (
                      <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-xs font-semibold text-brand">Quadro de sócios ({m.socios.length})</summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{m.socios.map((s) => <li key={s.nome}>{s.nome} · {s.qualificacao ?? "—"}{s.entrada && ` · desde ${dataBR(s.entrada)}`}</li>)}</ul>
                      </details>
                    )}
                    {filiais.length > 0 && (
                      <div className="mt-2 rounded-xl bg-slate-50 p-2">
                        <div className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-600"><Store size={13} aria-hidden /> {filiais.length} {pl(filiais.length, "filial", "filiais")}</div>
                        <ul className="space-y-1 text-xs">
                          {filiais.map((f) => (
                            <li key={f.id} className="flex flex-wrap items-center gap-x-2">
                              <span className="font-mono">{cnpjFormatado(f.cnpj)}</span>
                              <span>{[f.municipio, f.uf].filter(Boolean).join(" / ")}</span>
                              <span className={`rounded-full px-1.5 font-semibold ${CHIP[tomSituacao(f.situacao)]}`}>{f.situacao ?? "a conferir"}</span>
                              <button type="button" className="botao-icone p-0.5" onClick={() => conferir(f)} aria-label={`Conferir a filial ${cnpjFormatado(f.cnpj)} na Receita`}>{conferindo === f.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}</button>
                              <button type="button" className="botao-icone-perigo p-0.5" onClick={() => tirar(f)} aria-label={`Tirar a filial ${cnpjFormatado(f.cnpj)}`}><Trash2 size={12} /></button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.lembranca && <p className="mt-2 rounded-xl bg-violet-50 px-3 py-2 text-sm italic text-violet-900">{m.lembranca}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="mr-auto text-slate-500">{m.conferido_em ? `conferido na Receita em ${dataHoraBR(m.conferido_em)}` : <span className="font-semibold text-amber-800">ainda não conferido na Receita</span>}
                        {m.fonte && !m.conferido_em && <> · <a href={m.fonte} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand hover:underline">fonte <ExternalLink size={11} /></a></>}</span>
                      <Button variant="secondary" onClick={() => conferir(m)} disabled={!!conferindo}>{conferindo === m.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Conferir</Button>
                      <Button variant="secondary" onClick={() => setEdit(m)}><Pencil size={14} /> Lembrança</Button>
                      <button type="button" className="botao-icone-perigo h-8 w-8 text-red-600" onClick={() => tirar(m)} aria-label={`Tirar ${m.razao_social ?? m.cnpj}`}><Trash2 size={15} /></button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
      {edit && <EditarEmpresa e={edit} onClose={() => setEdit(null)} onFeito={() => { setEdit(null); invalidar("pessoal_empresas"); }} />}
    </div>
  );
}

function Linha({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: React.ReactNode }) {
  return <div className={`min-w-0 ${largo ? "sm:col-span-2" : ""}`}><dt className="inline text-xs text-slate-500">{rotulo}: </dt><dd className="inline text-fg">{children}</dd></div>;
}

function EditarEmpresa({ e, onClose, onFeito }: { e: EmpresaPessoal; onClose: () => void; onFeito: () => void }) {
  const [f, setF] = useState({ lembranca: e.lembranca ?? "", qualificacao: e.qualificacao ?? "", entrada: e.entrada ?? "", saida: e.saida ?? "" });
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    const { error } = await supabase.from("pessoal_empresas").update({
      lembranca: f.lembranca.trim() || null, qualificacao: f.qualificacao.trim() || null, entrada: f.entrada || null, saida: f.saida || null,
    }).eq("id", e.id);
    if (error) return notifyError(error);
    notify("Salvo");
    onFeito();
  }
  return (
    <Modal open onClose={onClose} title={e.nome_fantasia || e.razao_social || cnpjFormatado(e.cnpj)}>
      <form onSubmit={salvar} className="space-y-3">
        <Field label="Lembrança (a história desta empresa)"><textarea className="input min-h-28" value={f.lembranca} onChange={(x) => setF({ ...f, lembranca: x.target.value })} maxLength={1000} autoFocus /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Você era/é"><input className="input" value={f.qualificacao} onChange={(x) => setF({ ...f, qualificacao: x.target.value })} maxLength={80} placeholder="Sócia-administradora" /></Field>
          <Field label="Entrou em"><input className="input" type="date" value={f.entrada} onChange={(x) => setF({ ...f, entrada: x.target.value })} /></Field>
          <Field label="Saiu em"><input className="input" type="date" value={f.saida} onChange={(x) => setF({ ...f, saida: x.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}
