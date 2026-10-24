// Perguntar à IA (Buscar do menu): a pessoa escreve a pergunta em português ("máquinas vendidas em SP com a preventiva
// vencida") e a função ia-busca devolve como a IA entendeu, os filtros e o que achou, com o login de quem perguntou.
// Tocar num resultado abre o registro na tela dele; "Exportar" baixa a lista em Excel.
// Perguntas prontas (vendido hoje e na semana, saldo, peças faltando, frete demorando): respondem na hora, sem a IA.
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FileDown, Sparkles } from "lucide-react";
import { Button, Modal } from "./ui";
import { callFunction } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { ORDEM_PRONTAS, PRONTAS, reconhecer, type Pronta } from "@/lib/respostasProntas";
import { RespostaPronta } from "./RespostaPronta";
import { DuvidaManutencao } from "./DuvidaManutencao";

type Achado = { tipo: string; id: string; titulo: string; sub: string | null; valor: number | null; data: string | null };
type Resposta = { filtros: { entendi: string; nao_deu: string | null; entidade: string }; etiquetas: string[]; resultados: Achado[] };

// para onde cada tipo leva (abrir = a tela abre o registro; senão ele vem em destaque na lista)
const DESTINO: Record<string, { to: string; rotulo: string; abrir?: boolean }> = {
  venda: { to: "/pedidos", rotulo: "Venda", abrir: true },
  cliente: { to: "/clientes", rotulo: "Cliente" },
  maquina: { to: "/garantias", rotulo: "Máquina" },
  os: { to: "/assistencia", rotulo: "OS", abrir: true },
  receber: { to: "/financeiro", rotulo: "Conta a receber" },
  pagar: { to: "/financeiro", rotulo: "Conta a pagar" },
  nota: { to: "/notas", rotulo: "Nota fiscal" },
  produto: { to: "/estoque", rotulo: "Produto" },
};

const EXEMPLOS = [
  "máquinas vendidas em SP com a preventiva vencida",
  "clientes que não compram desde abril",
  "contas a pagar vencidas acima de 5 mil",
  "OS abertas da Queen",
  "vendas de setembro em MG",
];

/** Parece pergunta (e não um nome ou número): 3 palavras ou mais, ou termina com "?". */
export const parecePergunta = (t: string) => t.trim().endsWith("?") || t.trim().split(/\s+/).filter((p) => p.length > 1).length >= 3;

export function PerguntarIA({ inicial, onClose }: { inicial: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [pergunta, setPergunta] = useState(inicial);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pronta, setPronta] = useState<Pronta | null>(null);
  const [manutencao, setManutencao] = useState(false);

  async function perguntar(texto = pergunta) {
    if (texto.trim().length < 4) return;
    // pergunta que o ERP já sabe responder: na hora, sem chamar a IA
    const conhecida = reconhecer(texto);
    setPronta(conhecida);
    if (conhecida) { setResposta(null); setErro(null); return; }
    setOcupado(true); setErro(null);
    try {
      setResposta(await callFunction<Resposta>("ia-busca", { pergunta: texto }));
    } catch (e) {
      setResposta(null);
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }
  // já pergunta ao abrir com o que estava escrito na busca
  useEffect(() => { if (inicial.trim().length >= 4) perguntar(inicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const enviar = (e: FormEvent) => { e.preventDefault(); perguntar(); };

  const ir = (a: Achado) => {
    const d = DESTINO[a.tipo];
    if (!d) return;
    onClose();
    navigate(d.to, { state: d.abrir ? { abrir: a.id } : { destaque: { ids: [a.id], titulo: `${d.rotulo}: ${a.titulo}`, origem: "Perguntar à IA" } } });
  };
  const exportar = () => resposta && baixarPlanilha("pergunta-ia", [{ nome: "Resultado", linhas: resposta.resultados.map((a) => ({
    Tipo: DESTINO[a.tipo]?.rotulo ?? a.tipo, Item: a.titulo, Detalhe: a.sub ?? "", Valor: a.valor ?? "", Data: a.data ? dataBR(a.data.slice(0, 10)) : "",
  })) }]).catch(notifyError);

  return (
    <Modal open onClose={onClose} title="Perguntar à IA" wide>
      <form onSubmit={enviar} className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" value={pergunta} onChange={(e) => setPergunta(e.target.value)} maxLength={500} autoFocus
          placeholder="Ex.: máquinas vendidas em SP com a preventiva vencida" aria-label="Pergunta" />
        <Button type="submit" disabled={ocupado || pergunta.trim().length < 4}><Sparkles size={16} aria-hidden /> {ocupado ? "Procurando…" : "Perguntar"}</Button>
      </form>
      {!resposta && !erro && !ocupado && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <span className="text-slate-500">Na hora:</span>
          {ORDEM_PRONTAS.map((x) => (
            <Button key={x} type="button" tamanho="mini" variant={pronta === x ? "primary" : "secondary"} onClick={() => { setPergunta(PRONTAS[x].rotulo); setPronta(x); setResposta(null); setErro(null); }}>
              {PRONTAS[x].emoji} {PRONTAS[x].rotulo}
            </Button>
          ))}
          <Button type="button" tamanho="mini" variant="secondary" onClick={() => setManutencao(true)}>🛠️ Dúvida de manutenção</Button>
        </div>
      )}
      {manutencao && <DuvidaManutencao inicial={pergunta} onClose={() => setManutencao(false)} />}
      {!pronta && !resposta && !erro && !ocupado && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <span className="text-slate-500">Exemplos:</span>
          {EXEMPLOS.map((x) => <Button key={x} type="button" tamanho="mini" variant="secondary" onClick={() => { setPergunta(x); perguntar(x); }}>{x}</Button>)}
        </div>
      )}
      {!pronta && !resposta && <p className="mt-2 text-xs text-slate-500">No celular dá para perguntar falando: toque no campo e use o 🎤 do teclado.</p>}
      {pronta && <RespostaPronta key={pronta} tipo={pronta} onIr={onClose} />}
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{erro}</p>}
      {resposta && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <p><b>Entendi:</b> {resposta.filtros.entendi}</p>
            {resposta.etiquetas.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{resposta.etiquetas.map((e) => <span key={e} className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">{e}</span>)}</div>}
            {resposta.filtros.nao_deu && <p className="mt-1 text-xs text-amber-800">Não deu para filtrar: {resposta.filtros.nao_deu}</p>}
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">{resposta.resultados.length ? `${resposta.resultados.length}${resposta.resultados.length >= 50 ? " (os 50 primeiros)" : ""} ${resposta.resultados.length === 1 ? "resultado" : "resultados"}` : "Nada encontrado com esses filtros."}</span>
            {resposta.resultados.length > 0 && <Button variant="secondary" onClick={exportar}><FileDown size={16} aria-hidden /> Exportar</Button>}
          </div>
          <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-200">
            {resposta.resultados.map((a) => (
              <li key={`${a.tipo}-${a.id}`}>
                <button type="button" onClick={() => ir(a)} className="linha-clicavel flex items-start gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-fg">{a.titulo}</span>
                    <span className="block truncate text-xs text-slate-500">{[DESTINO[a.tipo]?.rotulo, a.sub, a.data && dataBR(a.data.slice(0, 10))].filter(Boolean).join(" · ")}</span>
                  </span>
                  {a.valor !== null && <span className="num shrink-0 text-sm font-semibold">{brl(a.valor)}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">A IA só transforma a pergunta em filtros; a busca usa o seu login, então aparece só o que você já pode ver.</p>
        </div>
      )}
    </Modal>
  );
}
