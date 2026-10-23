// Painel do contador → Certidões: as certidões da MF (federal, trabalhista e, por unidade, estadual, municipal e FGTS),
// com a mais nova de cada uma, quando vence e o PDF. Avisa antes de vencer (aqui e no aviso de obrigações).
// Só a MF: as das outras empresas do grupo ficam no painel pessoal. As contas ficam em lib/certidoes.ts.
import { useMemo, useState, type FormEvent } from "react";
import { ExternalLink, FilePlus2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { Anexos } from "@/components/Anexos";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, hoje as hojeISO } from "@/lib/format";
import {
  AVISO_DIAS, diasAte, quadroCertidoes, ROTULO_SITUACAO_CERTIDAO, TIPOS_CERTIDAO, validadeSugerida,
  type Certidao, type LinhaCertidao, type Prazo, type SituacaoCertidao, type TipoCertidao, type UnidadeCertidao,
} from "@/lib/certidoes";

const COR: Record<Prazo, string> = {
  falta: "bg-violet-100 text-violet-800", vencida: "bg-red-100 text-red-800", vence_logo: "bg-amber-100 text-amber-900", valida: "bg-emerald-100 text-emerald-800",
};

/** Quadro das certidões da MF com a situação de hoje (usado também no aviso de obrigações). */
export function useCertidoes() {
  const { unidades } = useUnidade();
  const { tem, papel } = usePerfil();
  const pode = tem("financeiro") || papel === "contador";
  const { data: certidoes = [] } = useRows<Certidao>("certidoes", { select: "id, unidade_id, tipo, situacao, emitida_em, validade, codigo, observacao, excluida_em", order: "validade", filtro: (q) => q.is("excluida_em", null), enabled: pode });
  const hoje = hojeISO();
  const linhas = useMemo(() => quadroCertidoes(certidoes, unidades as UnidadeCertidao[], hoje), [certidoes, unidades, hoje]);
  return { linhas, pode, hoje, unidades: (unidades as UnidadeCertidao[]).filter((u) => u.ativo !== false) };
}

export const textoPrazoCertidao = (l: LinhaCertidao, hoje: string) => {
  if (!l.atual) return "não cadastrada";
  const d = diasAte(l.atual.validade, hoje);
  return d < 0 ? `venceu há ${-d} ${-d === 1 ? "dia" : "dias"}` : d === 0 ? "vence hoje" : `vence em ${d} ${d === 1 ? "dia" : "dias"}`;
};
export const nomeLinhaCertidao = (l: LinhaCertidao) => `${TIPOS_CERTIDAO[l.tipo].rotulo}${l.unidade ? ` · ${l.unidade.codigo ?? l.unidade.nome}` : ""}`;

export function Certidoes() {
  const { linhas, pode, hoje, unidades } = useCertidoes();
  const [nova, setNova] = useState<{ tipo: TipoCertidao; unidade_id: string | null } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const invalidar = useInvalidate();
  if (!pode) return <Card className="p-4 text-sm text-slate-600">Só o contador, o financeiro e o administrador veem as certidões.</Card>;

  async function excluir(c: Certidao) {
    if (!(await confirmar(`Apagar a certidão emitida em ${dataBR(c.emitida_em)}?`, { perigo: true }))) return;
    const { error } = await supabase.from("certidoes").update({ excluida_em: new Date().toISOString() }).eq("id", c.id);
    if (error) return notifyError(error);
    notify("Certidão apagada");
    invalidar("certidoes");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        As certidões da MF que bancos, licitações e clientes grandes pedem. A federal e a trabalhista valem para o CNPJ todo; a estadual, a municipal
        e a do FGTS são de cada unidade. O ERP avisa {AVISO_DIAS} dias antes de vencer. As das outras empresas do grupo ficam no seu painel pessoal.
      </p>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {linhas.map((l) => (
          <li key={l.chave} className="cartao p-3">
            <div className="flex flex-wrap items-start gap-2">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${l.prazo === "valida" && l.atual?.situacao !== "positiva" ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {l.prazo === "valida" && l.atual?.situacao !== "positiva" ? <ShieldCheck size={18} aria-hidden /> : <ShieldAlert size={18} aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-fg">{nomeLinhaCertidao(l)}</p>
                <p className="text-xs text-slate-500">
                  {l.atual ? <>{ROTULO_SITUACAO_CERTIDAO[l.atual.situacao]} · emitida em {dataBR(l.atual.emitida_em)} · válida até <b className="text-fg">{dataBR(l.atual.validade)}</b></> : TIPOS_CERTIDAO[l.tipo].onde}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${COR[l.prazo]}`}>{textoPrazoCertidao(l, hoje)}</span>
            </div>
            {l.atual?.situacao === "positiva" && <p className="mt-2 text-xs text-red-700">Positiva: há débito em aberto. Leve ao contador para regularizar ou parcelar.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setNova({ tipo: l.tipo, unidade_id: l.unidade?.id ?? null })}><FilePlus2 size={16} aria-hidden /> {l.atual ? "Nova certidão" : "Cadastrar"}</Button>
              {TIPOS_CERTIDAO[l.tipo].link && (
                <a className="inline-flex min-h-10 items-center gap-1 px-2 text-sm font-semibold text-brand hover:underline sm:min-h-0" href={TIPOS_CERTIDAO[l.tipo].link} target="_blank" rel="noreferrer">
                  Emitir no site <ExternalLink size={14} aria-hidden />
                </a>
              )}
              {l.atual && <Button variant="ghost" onClick={() => setAberta(aberta === l.chave ? null : l.chave)}>{aberta === l.chave ? "Fechar" : "PDF e anteriores"}</Button>}
            </div>
            {aberta === l.chave && l.atual && (
              <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                {l.atual.codigo && <p className="text-xs text-slate-600">Código de controle: <span className="num">{l.atual.codigo}</span></p>}
                {l.atual.observacao && <p className="text-xs text-slate-600">{l.atual.observacao}</p>}
                <Anexos entidade="geral" id={l.atual.id} titulo="PDF da certidão" />
                <ul className="space-y-1 text-xs text-slate-600">
                  {l.historico.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">{dataBR(c.emitida_em)} → {dataBR(c.validade)} · {ROTULO_SITUACAO_CERTIDAO[c.situacao]}</span>
                      <Button variant="ghost" aria-label="Apagar a certidão" onClick={() => excluir(c)}><Trash2 size={14} aria-hidden /></Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
      {nova && <NovaCertidao inicial={nova} unidades={unidades} onClose={() => setNova(null)} />}
    </div>
  );
}

function NovaCertidao({ inicial, unidades, onClose }: { inicial: { tipo: TipoCertidao; unidade_id: string | null }; unidades: UnidadeCertidao[]; onClose: () => void }) {
  const [tipo, setTipo] = useState<TipoCertidao>(inicial.tipo);
  const [unidade, setUnidade] = useState(inicial.unidade_id ?? "");
  const [situacao, setSituacao] = useState<SituacaoCertidao>("negativa");
  const [emitida, setEmitida] = useState(hojeISO());
  const [validade, setValidade] = useState(validadeSugerida(inicial.tipo, hojeISO()));
  const [codigo, setCodigo] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  const { user_id } = usePerfil();
  const daUnidade = TIPOS_CERTIDAO[tipo].daUnidade;

  const mudarEmissao = (v: string) => { setEmitida(v); const s = validadeSugerida(tipo, v); if (s) setValidade(s); };
  const mudarTipo = (t: TipoCertidao) => { setTipo(t); const s = validadeSugerida(t, emitida); if (s) setValidade(s); };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (daUnidade && !unidade) return notifyError(new Error("Escolha a unidade da certidão."));
    if (!validade || validade < emitida) return notifyError(new Error("A validade não pode ser antes da emissão."));
    setSalvando(true);
    const { error } = await supabase.from("certidoes").insert({
      tipo, unidade_id: daUnidade ? unidade : null, situacao, emitida_em: emitida, validade,
      codigo: codigo.trim() || null, observacao: obs.trim() || null, created_by: user_id,
    });
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Certidão cadastrada. Anexe o PDF em \"PDF e anteriores\".");
    invalidar("certidoes");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Cadastrar certidão" sujo={!!codigo || !!obs}>
      <form onSubmit={salvar} className="space-y-3 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Certidão" obrigatorio>
            <select className="input" value={tipo} onChange={(e) => mudarTipo(e.target.value as TipoCertidao)}>
              {(Object.keys(TIPOS_CERTIDAO) as TipoCertidao[]).map((t) => <option key={t} value={t}>{TIPOS_CERTIDAO[t].rotulo}</option>)}
            </select>
          </Field>
          {daUnidade && (
            <Field label="Unidade" obrigatorio>
              <select className="input" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                <option value="">Escolha</option>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.uf ? ` (${u.uf})` : ""}</option>)}
              </select>
            </Field>
          )}
          <Field label="Resultado" obrigatorio>
            <select className="input" value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoCertidao)}>
              {(Object.keys(ROTULO_SITUACAO_CERTIDAO) as SituacaoCertidao[]).map((s) => <option key={s} value={s}>{ROTULO_SITUACAO_CERTIDAO[s]}</option>)}
            </select>
          </Field>
          <Field label="Emitida em" obrigatorio><input className="input" type="date" required max={hojeISO()} value={emitida} onChange={(e) => mudarEmissao(e.target.value)} /></Field>
          <Field label="Válida até" obrigatorio dica={TIPOS_CERTIDAO[tipo].dias ? `Em geral ${TIPOS_CERTIDAO[tipo].dias} dias; confira na certidão.` : "Copie a data escrita na certidão."}>
            <input className="input" type="date" required min={emitida} value={validade} onChange={(e) => setValidade(e.target.value)} />
          </Field>
          <Field label="Código de controle"><input className="input" maxLength={120} value={codigo} onChange={(e) => setCodigo(e.target.value)} /></Field>
        </div>
        <Field label="Observação"><textarea className="input" rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Cadastrar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
