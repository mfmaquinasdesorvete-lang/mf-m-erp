// Marcas no INPI (pedido de 27/10): as marcas das sorveterias (My Frost Sorveterias e Yozzy) com o processo, a situação,
// o último despacho e os prazos. O alerta aparece quando há prazo para responder (60 dias da RPI) perto ou vencido, ou
// quando a RPI (sai toda terça) não é conferida há mais de 7 dias. "Conferi hoje" grava a data da conferência.
// Os dados ficam só no banco (cada linha é de quem a criou); nada de número de processo no código.
import { useState, type FormEvent } from "react";
import { AlertTriangle, BadgeCheck, CalendarCheck, ExternalLink, Pencil, Plus } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { MARCAS_LOJA, SITUACOES_MARCA, alertaMarca, nomeSituacaoMarca, prazo60, type MarcaInpi } from "@/lib/licenciados";

const ROSA_CARTAO = "#e91e63";
const YOZZY = "#f97316";
const PEPI = "https://busca.inpi.gov.br/pePI/";

export function MarcasAba() {
  const invalidar = useInvalidate();
  const { data: marcas = [], isLoading, error } = useRows<MarcaInpi>("licenciados_marcas", { order: "nome", ascending: true });
  const [edit, setEdit] = useState<Partial<MarcaInpi> | null>(null);
  const dia = hoje();

  async function gravar(m: Partial<MarcaInpi>) {
    const { id, ...resto } = m;
    const { error: e } = id ? await supabase.from("licenciados_marcas").update(resto).eq("id", id) : await supabase.from("licenciados_marcas").insert(resto);
    if (e) return notifyError(e);
    notify(id ? "Marca alterada" : "Marca cadastrada");
    invalidar("licenciados_marcas");
    setEdit(null);
  }
  async function conferiHoje(m: MarcaInpi) {
    const { error: e } = await supabase.from("licenciados_marcas").update({ conferida_em: dia }).eq("id", m.id);
    if (e) return notifyError(e);
    notify("Conferência da RPI anotada");
    invalidar("licenciados_marcas");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <p className="mr-auto max-w-2xl text-sm text-slate-500">
          O INPI publica tudo na RPI, toda terça. Exigência, oposição ou indeferimento dão 60 dias para responder.
          O INPI não manda boleto: a guia (GRU) sai só no site dele.
        </p>
        <a className="link-acao inline-flex items-center gap-1 text-sm" href={PEPI} target="_blank" rel="noreferrer">Consultar no INPI <ExternalLink size={14} aria-hidden /></a>
        <Button onClick={() => setEdit({ marca: "myfrost", situacao: "exame" })}><Plus size={16} /> Nova marca</Button>
      </div>
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {error && <p className="text-sm text-red-700">Não deu para abrir as marcas. Tente de novo.</p>}
      {!isLoading && !error && !marcas.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhuma marca cadastrada.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {marcas.map((m, i) => {
          const cor = m.marca === "yozzy" ? YOZZY : ROSA_CARTAO;
          const alerta = alertaMarca(m, dia);
          const chip = "rounded-md px-1.5 py-0.5 text-2xs font-bold";
          return (
            <div key={m.id} className={`cartao relative overflow-hidden p-4 pr-14 ${m.situacao === "arquivada" ? "opacity-60" : ""}`}>
              <span className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-bl-2xl text-sm font-bold text-white" style={{ background: cor }}>{String(i + 1).padStart(2, "0")}</span>
              <p className="text-base font-bold leading-tight" style={{ color: cor }}>{m.nome}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                <span className={`${chip} ${m.situacao === "concedida" || m.situacao === "deferida" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{nomeSituacaoMarca(m.situacao)}</span>
                {m.processo && <span>Processo {m.processo}</span>}
                {m.classe && <span className={`${chip} bg-cyan-100 text-cyan-700`}>Classe {m.classe}</span>}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                {m.publicada_em && <><dt>Publicada na RPI</dt><dd className="font-semibold text-fg">{dataBR(m.publicada_em)}</dd></>}
                {m.fim_oposicao && <><dt>Fim da oposição</dt><dd className="font-semibold text-fg">{dataBR(m.fim_oposicao)}</dd></>}
                {m.ultimo_despacho && <><dt>Último despacho</dt><dd className="font-semibold text-fg">{m.ultimo_despacho}{m.despacho_em ? ` (${dataBR(m.despacho_em)})` : ""}</dd></>}
                {m.prazo_resposta && <><dt>Prazo para responder</dt><dd className="font-semibold text-fg">{dataBR(m.prazo_resposta)}</dd></>}
                <dt>RPI conferida</dt><dd className="font-semibold text-fg">{m.conferida_em ? dataBR(m.conferida_em) : "ainda não"}</dd>
              </dl>
              {alerta && (
                <p role="status" className={`mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${alerta.nivel === "conferir" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>
                  <AlertTriangle size={14} aria-hidden /> {alerta.texto}
                </p>
              )}
              {!alerta && m.situacao !== "arquivada" && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><BadgeCheck size={14} aria-hidden /> Em dia</p>}
              {m.observacoes && <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-slate-500">{m.observacoes}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {m.situacao !== "arquivada" && m.situacao !== "concedida" && <Button variant="secondary" onClick={() => conferiHoje(m)}><CalendarCheck size={15} /> Conferi a RPI hoje</Button>}
                <Button variant="secondary" onClick={() => setEdit(m)} aria-label={`Editar a marca ${m.nome}`}><Pencil size={15} /> Editar</Button>
              </div>
            </div>
          );
        })}
      </div>
      {edit && <MarcaModal marca={edit} onClose={() => setEdit(null)} onGravar={gravar} />}
    </div>
  );
}

function MarcaModal({ marca, onClose, onGravar }: { marca: Partial<MarcaInpi>; onClose: () => void; onGravar: (m: Partial<MarcaInpi>) => void }) {
  const [m, setM] = useState<Partial<MarcaInpi>>(marca);
  const set = <K extends keyof MarcaInpi>(k: K, v: MarcaInpi[K] | null) => setM((x) => ({ ...x, [k]: v }));
  const txt = (v: unknown) => String(v ?? "").trim() || null;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onGravar({
      id: marca.id, nome: String(m.nome ?? "").trim(), marca: m.marca ?? "myfrost", situacao: m.situacao ?? "exame",
      processo: txt(m.processo), classe: txt(m.classe), titular: txt(m.titular), ultimo_despacho: txt(m.ultimo_despacho), observacoes: txt(m.observacoes),
      publicada_em: m.publicada_em || null, fim_oposicao: m.fim_oposicao || null, despacho_em: m.despacho_em || null,
      prazo_resposta: m.prazo_resposta || null, conferida_em: m.conferida_em || null,
    });
  };
  return (
    <Modal open onClose={onClose} title={marca.id ? "Editar marca" : "Nova marca no INPI"}>
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome da marca" className="sm:col-span-2"><input className="input" value={m.nome ?? ""} onChange={(e) => set("nome", e.target.value)} required minLength={2} maxLength={120} autoFocus /></Field>
          <Field label="Rede">
            <select className="input" value={m.marca ?? "myfrost"} onChange={(e) => set("marca", e.target.value as MarcaInpi["marca"])}>{MARCAS_LOJA.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
          </Field>
          <Field label="Situação">
            <select className="input" value={m.situacao ?? "exame"} onChange={(e) => set("situacao", e.target.value as MarcaInpi["situacao"])}>{SITUACOES_MARCA.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
          </Field>
          <Field label="Nº do processo"><input className="input" inputMode="numeric" value={m.processo ?? ""} onChange={(e) => set("processo", e.target.value)} maxLength={30} /></Field>
          <Field label="Classe (NCL)"><input className="input" value={m.classe ?? ""} onChange={(e) => set("classe", e.target.value)} maxLength={30} /></Field>
          <Field label="Titular" className="sm:col-span-2"><input className="input" value={m.titular ?? ""} onChange={(e) => set("titular", e.target.value)} maxLength={160} /></Field>
          <Field label="Publicada na RPI em">
            <input className="input" type="date" value={m.publicada_em ?? ""} onChange={(e) => { set("publicada_em", e.target.value); if (e.target.value && !m.fim_oposicao) set("fim_oposicao", prazo60(e.target.value)); }} />
          </Field>
          <Field label="Fim do prazo de oposição"><input className="input" type="date" value={m.fim_oposicao ?? ""} onChange={(e) => set("fim_oposicao", e.target.value)} /></Field>
          <Field label="Último despacho" className="sm:col-span-2"><input className="input" value={m.ultimo_despacho ?? ""} onChange={(e) => set("ultimo_despacho", e.target.value)} maxLength={300} placeholder="Ex.: exigência formal" /></Field>
          <Field label="Despacho publicado em">
            <input className="input" type="date" value={m.despacho_em ?? ""} onChange={(e) => { set("despacho_em", e.target.value); if (e.target.value && ["exigencia", "indeferida", "oposicao"].includes(m.situacao ?? "")) set("prazo_resposta", prazo60(e.target.value)); }} />
          </Field>
          <Field label="Prazo para responder"><input className="input" type="date" value={m.prazo_resposta ?? ""} onChange={(e) => set("prazo_resposta", e.target.value)} /></Field>
          <Field label="RPI conferida em"><input className="input" type="date" value={m.conferida_em ?? ""} onChange={(e) => set("conferida_em", e.target.value)} /></Field>
          <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-24" value={m.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} maxLength={4000} /></Field>
        </div>
        <p className="text-xs text-slate-500">Com a data do despacho de exigência, oposição ou indeferimento, o prazo de 60 dias é preenchido sozinho.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}
