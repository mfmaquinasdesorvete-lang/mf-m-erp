// Aba Férias e ponto: períodos de férias de quem tem carteira assinada (direito, limite para tirar e o que já tirou),
// com o lançamento das férias tiradas; a folha de ponto fica na divisão Ponto da pasta de cada pessoa.
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, hoje, pl } from "@/lib/format";
import { registrado, desligada } from "@/lib/admissaoFuncionario";
import { feriasPendente, periodosFerias, periodosRecentes, somarDiasData, type FeriasTirada, type PeriodoFerias, type SituacaoFerias } from "@/lib/ferias";

type Pessoa = { id: string; nome: string; vinculo: string; situacao: string; ativo: boolean; data_admissao: string | null; data_desligamento: string | null };
type Tirada = FeriasTirada & { id: string; funcionario_id: string; observacao: string | null };

const ROTULO: Record<SituacaoFerias, { texto: string; cor: string }> = {
  vencida: { texto: "vencida", cor: "bg-red-50 text-red-700" },
  vence_logo: { texto: "vence logo", cor: "bg-amber-50 text-amber-800" },
  a_tirar: { texto: "a tirar", cor: "bg-sky-50 text-sky-800" },
  em_aquisicao: { texto: "em aquisição", cor: "bg-slate-100 text-slate-600" },
  tirada: { texto: "tirada", cor: "bg-emerald-50 text-emerald-700" },
};

export function FeriasEquipe({ lista }: { lista: Pessoa[] }) {
  const [comDesligados, setComDesligados] = useState(false);
  const [lancar, setLancar] = useState<{ pessoa: Pessoa; periodos: PeriodoFerias[] } | null>(null);
  const { data: tiradas = [] } = useRows<Tirada>("funcionario_ferias", { order: "inicio", ascending: false });
  const invalidar = useInvalidate();
  const dia = hoje();

  const pessoas = useMemo(() => lista
    .filter((f) => registrado(f.vinculo) && (comDesligados || !desligada(f)))
    .map((f) => {
      const { mostrar: periodos, antigos } = periodosRecentes(
        periodosFerias(f.data_admissao, dia, tiradas.filter((t) => t.funcionario_id === f.id), desligada(f) ? f.data_desligamento : null));
      return { f, periodos, antigos, pendente: feriasPendente(periodos) };
    })
    .sort((a, b) => (a.pendente?.limite ?? "9999").localeCompare(b.pendente?.limite ?? "9999") || a.f.nome.localeCompare(b.f.nome)), [lista, tiradas, comDesligados, dia]);

  async function apagar(t: Tirada) {
    if (!(await confirmar(`Apagar as férias de ${dataBR(t.inicio)} (${t.dias} dias)?`))) return;
    const { error } = await supabase.from("funcionario_ferias").delete().eq("id", t.id);
    if (error) notifyError(error); else { notify("Férias apagadas"); invalidar("funcionario_ferias"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>Férias de quem tem carteira assinada (CLT, experiência, estágio, aprendiz, temporário): 30 dias a cada 12 meses de casa, para tirar nos 12 meses seguintes.</span>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={comDesligados} onChange={(e) => setComDesligados(e.target.checked)} /> Mostrar desligados</label>
      </div>
      {pessoas.length ? (
        <ul className="space-y-2">
          {pessoas.map(({ f, periodos, antigos, pendente }) => (
            <li key={f.id} className="cartao p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-fg">{f.nome}{desligada(f) && <span className="ml-1 text-xs font-normal text-slate-500">(desligado)</span>}</span>
                <span className="flex items-center gap-2 text-sm">
                  {pendente
                    ? <span className={`rounded-full px-2 py-0.5 text-xs ${ROTULO[pendente.situacao].cor}`}>{pendente.saldo} dias {ROTULO[pendente.situacao].texto} · tirar até {dataBR(pendente.limite)}</span>
                    : <span className="text-xs text-slate-500">{f.data_admissao ? "nada a tirar agora" : "sem data de admissão"}</span>}
                  {!desligada(f) && periodos.some((p) => p.saldo > 0 && p.situacao !== "em_aquisicao") && (
                    <Button tamanho="mini" variant="secondary" onClick={() => setLancar({ pessoa: f, periodos })}><Plus size={13} /> Lançar férias</Button>
                  )}
                </span>
              </div>
              {periodos.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {periodos.map((p) => (
                    <li key={p.inicio} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                      <span className="text-slate-600">{dataBR(p.inicio)} a {dataBR(p.fim)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${ROTULO[p.situacao].cor}`}>{ROTULO[p.situacao].texto}</span>
                      {p.situacao !== "em_aquisicao" && <span className="text-xs text-slate-500">saldo {p.saldo} {pl(p.saldo, "dia", "dias")} · tirar até {dataBR(p.limite)}</span>}
                      {p.tiradas.map((t) => {
                        const tt = t as Tirada;
                        return (
                          <span key={tt.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            tirou {dataBR(tt.inicio)} a {dataBR(somarDiasData(tt.inicio, tt.dias - 1))}{tt.abono_dias ? ` + ${tt.abono_dias} vendidos` : ""}
                            <button type="button" aria-label="Apagar" className="botao-icone-perigo p-0.5" onClick={() => apagar(tt)}><Trash2 size={12} /></button>
                          </span>
                        );
                      })}
                    </li>
                  ))}
                  {antigos > 0 && <li className="py-1.5 text-xs text-slate-500">{antigos} {pl(antigos, "período anterior", "períodos anteriores")} sem registro (antes do ERP), fora da conta.</li>}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="cartao p-6 text-center text-sm text-slate-500">
          <CalendarClock size={18} className="mr-1 inline" aria-hidden />
          Ninguém com carteira assinada {comDesligados ? "no cadastro" : "na ativa"}. Quem for registrado aparece aqui com as férias de cada ano.
        </p>
      )}
      <p className="text-sm text-slate-600">
        Ponto: guarde a folha de ponto de cada mês na divisão <b>Ponto</b> da <Link to="/funcionarios-pasta" className="link-acao">Pasta de documentos</Link> da pessoa.
      </p>
      {lancar && <LancarFerias pessoa={lancar.pessoa} periodos={lancar.periodos} onClose={() => setLancar(null)} />}
    </div>
  );
}

function LancarFerias({ pessoa, periodos, onClose }: { pessoa: Pessoa; periodos: PeriodoFerias[]; onClose: () => void }) {
  const abertos = periodos.filter((p) => p.saldo > 0 && p.situacao !== "em_aquisicao").reverse();
  const [periodo, setPeriodo] = useState(abertos[0]?.inicio ?? "");
  const [inicio, setInicio] = useState(hoje());
  const [dias, setDias] = useState("30");
  const [abono, setAbono] = useState("0");
  const [obs, setObs] = useState("");
  const [gravando, setGravando] = useState(false);
  const trava = useRef(false);
  const invalidar = useInvalidate();
  const saldo = abertos.find((p) => p.inicio === periodo)?.saldo ?? 0;
  const nDias = Number(dias), nAbono = Number(abono || 0);
  const erro = !periodo ? "Escolha o período."
    : !Number.isInteger(nDias) || nDias < 1 ? "Dias de férias inválido."
    : !Number.isInteger(nAbono) || nAbono < 0 || nAbono > 10 ? "Dias vendidos: de 0 a 10."
    : nDias + nAbono > saldo ? `Passa do saldo do período (${saldo} dias).`
    : !inicio ? "Informe o início." : null;

  async function gravar() {
    if (erro || trava.current) return;
    trava.current = true; setGravando(true);
    try {
      const { error } = await supabase.from("funcionario_ferias").insert({
        funcionario_id: pessoa.id, aquisitivo_inicio: periodo, inicio, dias: nDias, abono_dias: nAbono, observacao: obs.trim() || null,
      });
      if (error) return notifyError(error);
      notify(`Férias lançadas: ${nDias} dias a partir de ${dataBR(inicio)}`);
      invalidar("funcionario_ferias");
      onClose();
    } finally { trava.current = false; setGravando(false); }
  }

  return (
    <Modal open onClose={() => !gravando && onClose()} title={`Lançar férias · ${pessoa.nome}`}>
      <div className="space-y-3 text-sm">
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Período aquisitivo</span>
          <select className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {abertos.map((p) => <option key={p.inicio} value={p.inicio}>{dataBR(p.inicio)} a {dataBR(p.fim)} · saldo {p.saldo} dias</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Início</span>
            <input type="date" className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Dias de férias</span>
            <input type="number" min={1} max={30} className="input" value={dias} onChange={(e) => setDias(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Dias vendidos</span>
            <input type="number" min={0} max={10} className="input" value={abono} onChange={(e) => setAbono(e.target.value)} /></label>
        </div>
        {nDias >= 1 && inicio && <p className="text-xs text-slate-500">Volta ao trabalho em {dataBR(somarDiasData(inicio, nDias))}.</p>}
        <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Observação</span>
          <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: aviso entregue em…" /></label>
        {erro && <p className="text-xs text-red-600">{erro}</p>}
        <p className="text-xs text-slate-500">Guarde o aviso e o recibo de férias na divisão Férias da pasta da pessoa.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={gravando} onClick={onClose}>Cancelar</Button>
          <Button disabled={!!erro || gravando} aria-busy={gravando || undefined} onClick={gravar}>{gravando ? "Gravando…" : "Lançar"}</Button>
        </div>
      </div>
    </Modal>
  );
}
