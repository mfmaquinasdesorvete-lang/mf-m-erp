// Bancos e conciliação → Por favorecido: as linhas pendentes do extrato agrupadas por quem recebeu ou pagou, para lançar
// (despesa ou receita na categoria, ligada ao fornecedor ou cliente do cadastro) ou ignorar o grupo inteiro de uma vez.
// "Lembrar" guarda a regra: o extrato novo desse favorecido já chega em "Com sugestão". O banco faz cada linha pelas
// mesmas funções da conciliação de uma linha (conciliar_em_lote), e a linha que uma trava recusar fica pendente.
import { useMemo, useState, type FormEvent } from "react";
import { Ban, Check, ChevronDown, ChevronUp, ListChecks, Receipt, Search, Users } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { CampoCategoria } from "@/components/financeiro/CategoriaRateio";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { classificar, soDigitos, type Parte } from "@/lib/partesRelacionadas";
import {
  agrupar, cadastroDoFavorecido, chaveRegra, emPedacos, resumoErros, textoRegra,
  type AcaoLote, type GrupoFavorecido, type LinhaLote, type RegraConciliacao,
} from "@/lib/conciliacaoLote";

type Cadastro = { id: string; nome: string; nome_fantasia: string | null };
/** Favorecido que é a própria MF (outra conta nossa) ou sócio/empresa ligada: não é despesa nem receita. */
type Ligacao = "entre_contas" | "parte" | null;
const AVISO_LIGACAO: Record<Exclude<Ligacao, null>, { selo: string; texto: string }> = {
  entre_contas: { selo: "entre contas da empresa", texto: "Parece dinheiro entre as contas da própria empresa: não é despesa nem receita. Ligue as duas pontas em “Transferência entre contas” (linha a linha) ou ignore com o motivo." },
  parte: { selo: "sócio ou empresa ligada", texto: "É de um sócio ou de uma empresa ligada (Entre contas e sócios): aporte, retirada ou empréstimo não é despesa nem receita. Na dúvida, confirme com o contador antes de lançar." },
};
const POR_PAGINA = 40;

export function PorFavorecido({ linhas, deFora, regras, nomeConta, podeEditar }: {
  /** pendentes sem sugestão de conta ou transferência (as com regra entram) */
  linhas: LinhaLote[];
  /** pendentes deixadas de fora por já terem uma conta ou transferência sugerida */
  deFora: number;
  regras: RegraConciliacao[];
  nomeConta: (id: string) => string;
  podeEditar: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [sentido, setSentido] = useState<"" | "entrada" | "saida">("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [aberto, setAberto] = useState<string | null>(null);
  const [lote, setLote] = useState<{ grupo: GrupoFavorecido; acao: AcaoLote } | null>(null);
  const [verRegras, setVerRegras] = useState(false);
  const { data: fornecedores = [] } = useRows<Cadastro>("fornecedores", { select: "id, nome, nome_fantasia", order: "nome", ascending: true, key: ["favorecidos"] });
  const { data: clientes = [] } = useRows<Cadastro>("clientes", { select: "id, nome, nome_fantasia", order: "nome", ascending: true, key: ["favorecidos"] });
  const { data: unidades = [] } = useRows<{ id: string; razao_social: string | null; cnpj: string | null }>("unidades", { select: "id, razao_social, cnpj", order: "nome", ascending: true, key: ["partes"] });
  const { data: partes = [] } = useRows<Parte>("partes_relacionadas", { order: "nome", ascending: true });
  const propria = useMemo(() => ({
    nomes: [...new Set(unidades.map((u) => u.razao_social ?? "").filter(Boolean))], documentos: unidades.map((u) => soDigitos(u.cnpj)).filter(Boolean),
  }), [unidades]);
  const ligacaoDe = (g: GrupoFavorecido): Ligacao => {
    const achados = [g.rotulo, ...g.exemplos].map((d) => classificar({ descricao: d }, partes, propria)?.grupo ?? null);
    return achados.includes("parte") ? "parte" : achados.includes("entre_contas") ? "entre_contas" : null;
  };

  const todos = useMemo(() => agrupar(linhas), [linhas]);
  const porId = useMemo(() => new Map(linhas.map((l) => [l.id, l])), [linhas]);
  const regraDe = useMemo(() => new Map(regras.filter((r) => r.ativo).map((r) => [chaveRegra(r.chave, r.direcao), r])), [regras]);
  const termo = busca.trim().toLowerCase();
  const grupos = todos.filter((g) => (!sentido || g.direcao === sentido) && (!termo || g.rotulo.toLowerCase().includes(termo) || g.chave.toLowerCase().includes(termo)));
  const emGrupos = todos.filter((g) => g.qtd >= 3).reduce((s, g) => s + g.qtd, 0);
  const cadastroDe = (g: GrupoFavorecido) => cadastroDoFavorecido(g.chave, g.direcao === "saida" ? fornecedores : clientes);

  return (
    <div>
      <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <b>{todos.length} {pl(todos.length, "favorecido", "favorecidos")}</b> em {linhas.length} {pl(linhas.length, "linha pendente", "linhas pendentes")}
        {emGrupos > 0 && <> · {emGrupos} estão em grupos de 3 ou mais</>}. Lance ou ignore o grupo inteiro; marque “lembrar” e o extrato novo do mesmo favorecido já chega com a sugestão.
        {deFora > 0 && <div className="mt-1 text-xs">{deFora} {pl(deFora, "linha ficou", "linhas ficaram")} de fora porque já {pl(deFora, "tem", "têm")} uma conta ou transferência sugerida: aprove em “Com sugestão” (lançar de novo duplicaria a conta).</div>}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Buscar favorecido</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input pl-9" placeholder="Buscar favorecido…" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_PAGINA); }} />
        </label>
        <select className="input w-auto" value={sentido} onChange={(e) => setSentido(e.target.value as typeof sentido)} aria-label="Sentido">
          <option value="">Entradas e saídas</option><option value="saida">Só saídas</option><option value="entrada">Só entradas</option>
        </select>
        <Button variant="secondary" onClick={() => setVerRegras(true)}><ListChecks size={16} /> Regras ({regras.filter((r) => r.ativo).length})</Button>
      </div>

      {!grupos.length && <p className="cartao p-6 text-center text-sm text-slate-500">Nenhuma linha pendente {termo ? "com este nome" : "nestes filtros"}.</p>}
      <ul className="cartao divide-y divide-slate-100 overflow-hidden">
        {grupos.slice(0, limite).map((g) => {
          const k = chaveRegra(g.chave, g.direcao);
          const regra = regraDe.get(k);
          const cad = cadastroDe(g);
          const lig = ligacaoDe(g);
          const contas = [...new Set(g.contas.map(nomeConta))];
          return (
            <li key={k} className="p-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="break-words font-semibold text-fg">{g.rotulo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${g.direcao === "saida" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{g.direcao === "saida" ? "saída" : "entrada"}</span>
                    {regra && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-2xs font-semibold text-sky-800">regra: {textoRegra(regra)}</span>}
                    {lig && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-semibold text-amber-900" title={AVISO_LIGACAO[lig].texto}>{AVISO_LIGACAO[lig].selo}</span>}
                  </div>
                  <div className="text-xs text-slate-600">
                    {g.qtd} {pl(g.qtd, "linha", "linhas")} · {contas.join(", ")} · {g.primeira === g.ultima ? dataBR(g.primeira) : `${dataBR(g.primeira)} a ${dataBR(g.ultima)}`}
                    {cad && <> · {g.direcao === "saida" ? "fornecedor" : "cliente"} no cadastro: <b className="text-slate-700">{cad.nome}</b></>}
                  </div>
                </div>
                <div className={`num whitespace-nowrap text-right font-bold ${g.total < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(g.total)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {podeEditar && <Button variant={lig ? "secondary" : "primary"} onClick={() => setLote({ grupo: g, acao: regra?.acao ?? "lancar" })}><Receipt size={15} /> Lançar{g.qtd > 1 ? ` ${g.qtd}` : ""}</Button>}
                  {podeEditar && <Button variant="secondary" onClick={() => setLote({ grupo: g, acao: "ignorar" })}><Ban size={15} /> Ignorar</Button>}
                  <Button variant="ghost" aria-expanded={aberto === k} aria-label={`${aberto === k ? "Esconder" : "Ver"} as linhas de ${g.rotulo}`} onClick={() => setAberto(aberto === k ? null : k)}>
                    {aberto === k ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </Button>
                </div>
              </div>
              {aberto === k && (
                <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-100">
                  <table className="min-w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {g.ids.slice(0, 60).map((id) => porId.get(id)!).sort((a, b) => b.data.localeCompare(a.data)).map((l) => (
                        <tr key={l.id}>
                          <td className="whitespace-nowrap px-2 py-1.5">{dataBR(l.data)}</td>
                          <td className="hidden whitespace-nowrap px-2 py-1.5 text-slate-500 sm:table-cell">{nomeConta(l.conta_bancaria_id)}</td>
                          <td className="min-w-[10rem] break-words px-2 py-1.5 text-slate-700">{l.descricao}</td>
                          <td className={`whitespace-nowrap px-2 py-1.5 text-right font-semibold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {g.qtd > 60 && <p className="px-2 py-1.5 text-xs text-slate-500">e mais {g.qtd - 60}…</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {grupos.length > limite && (
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={() => setLimite(limite + POR_PAGINA * 2)}>Mostrar mais ({grupos.length - limite} {pl(grupos.length - limite, "favorecido", "favorecidos")})</Button>
        </div>
      )}

      {lote && <LoteModal grupo={lote.grupo} acaoInicial={lote.acao} regra={regraDe.get(chaveRegra(lote.grupo.chave, lote.grupo.direcao)) ?? null}
        cadastro={cadastroDe(lote.grupo)} ligacao={ligacaoDe(lote.grupo)} onClose={() => setLote(null)} />}
      {verRegras && <RegrasModal regras={regras} podeEditar={podeEditar} onClose={() => setVerRegras(false)} />}
    </div>
  );
}

function LoteModal({ grupo, acaoInicial, regra, cadastro, ligacao, onClose }: {
  grupo: GrupoFavorecido; acaoInicial: AcaoLote; regra: RegraConciliacao | null; cadastro: Cadastro | null; ligacao: Ligacao; onClose: () => void;
}) {
  const saida = grupo.direcao === "saida";
  const invalidate = useInvalidate();
  const [acao, setAcao] = useState<AcaoLote>(acaoInicial);
  const [categoria, setCategoria] = useState(regra?.categoria ?? (saida ? "" : "outras receitas"));
  const [motivo, setMotivo] = useState(regra?.motivo ?? "");
  const [ligar, setLigar] = useState(!!cadastro);
  const [lembrar, setLembrar] = useState(true);
  const [rodando, setRodando] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [resultado, setResultado] = useState<{ feitos: number; erros: { id: string; erro: string }[] } | null>(null);

  async function executar(e: FormEvent) {
    e.preventDefault();
    setRodando(true); setFeitas(0);
    const fornecedor = ligar && cadastro && saida ? cadastro.id : null;
    const cliente = ligar && cadastro && !saida ? cadastro.id : null;
    try {
      let regraId = regra?.id ?? null;
      if (lembrar) {
        const { data, error } = await supabase.from("conciliacao_regras").upsert({
          chave: grupo.chave, direcao: grupo.direcao, rotulo: grupo.rotulo.slice(0, 200), acao,
          categoria: acao === "lancar" ? categoria : null, motivo: acao === "ignorar" ? motivo.trim() : null,
          fornecedor_id: fornecedor, cliente_id: cliente, ativo: true,
        }, { onConflict: "chave,direcao" }).select("id").single();
        if (error) throw error;
        regraId = (data as { id: string }).id;
      }
      let feitos = 0;
      const erros: { id: string; erro: string }[] = [];
      for (const pedaco of emPedacos(grupo.ids)) {
        const { data, error } = await supabase.rpc("conciliar_em_lote", {
          p_ids: pedaco, p_acao: acao, p_direcao: grupo.direcao, p_categoria: acao === "lancar" ? categoria : null,
          p_motivo: acao === "ignorar" ? motivo.trim() : null, p_fornecedor: fornecedor, p_cliente: cliente,
          p_regra: lembrar || regra?.acao === acao ? regraId : null,
        });
        if (error) { erros.push(...pedaco.map((id) => ({ id, erro: error.message }))); continue; }
        const r = data as { feitos: number; erros: { id: string; erro: string }[] };
        feitos += r.feitos; erros.push(...r.erros);
        setFeitas(feitos + erros.length);
      }
      setResultado({ feitos, erros });
      invalidate("extrato_lancamentos", "contas_pagar", "contas_receber", "conciliacao_regras", "auditoria", "saldos_bancarios", "movimentos_realizados");
      if (feitos) notify(`${feitos} ${pl(feitos, "linha", "linhas")} ${acao === "lancar" ? pl(feitos, "lançada", "lançadas") : pl(feitos, "ignorada", "ignoradas")}`);
    } catch (err) { notifyError(err); } finally { setRodando(false); }
  }

  return (
    <Modal open onClose={rodando ? () => undefined : onClose} title={`${acao === "lancar" ? "Lançar" : "Ignorar"} em lote: ${grupo.rotulo}`} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3">
        <div className="text-sm text-slate-600"><b className="text-fg">{grupo.qtd} {pl(grupo.qtd, "linha", "linhas")}</b> de {saida ? "saída" : "entrada"} · {dataBR(grupo.primeira)} a {dataBR(grupo.ultima)}</div>
        <div className={`text-lg font-bold ${saida ? "text-red-600" : "text-emerald-700"}`}>{brl(grupo.total)}</div>
      </div>

      {ligacao && !resultado && <p role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{AVISO_LIGACAO[ligacao].texto}</p>}
      {resultado ? (
        <div className="space-y-3">
          {resultado.feitos > 0 && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><Check size={16} /> {resultado.feitos} {pl(resultado.feitos, "linha", "linhas")} {acao === "lancar" ? `${pl(resultado.feitos, "lançada", "lançadas")} em ${categoria}` : pl(resultado.feitos, "ignorada", "ignoradas")}{lembrar ? "; regra guardada para o extrato novo" : ""}.</p>}
          {resultado.erros.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <b>{resultado.erros.length} {pl(resultado.erros.length, "ficou pendente", "ficaram pendentes")}:</b>
              <ul className="mt-1 list-disc pl-5">{resumoErros(resultado.erros).map((e) => <li key={e.erro}>{e.erro} ({e.qtd})</li>)}</ul>
            </div>
          )}
          <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
        </div>
      ) : (
        <form onSubmit={executar} className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {([["lancar", saida ? "Lançar como despesa" : "Lançar como receita", Receipt], ["ignorar", "Ignorar", Ban]] as const).map(([v, l, I]) => (
              <button key={v} type="button" onClick={() => setAcao(v)} aria-pressed={acao === v}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${acao === v ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}><I size={14} /> {l}</button>
            ))}
          </div>
          {acao === "lancar" ? (
            <>
              <CampoCategoria tipo={saida ? "despesa" : "receita"} value={categoria} onChange={setCategoria} />
              {cadastro && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5" checked={ligar} onChange={(e) => setLigar(e.target.checked)} />
                  <span>Ligar ao {saida ? "fornecedor" : "cliente"} do cadastro <b>{cadastro.nome}</b>{cadastro.nome_fantasia ? ` (${cadastro.nome_fantasia})` : ""}</span>
                </label>
              )}
              <p className="text-xs text-slate-500">Cada linha vira uma conta {saida ? "a pagar" : "a receber"} já paga na data do banco, com a descrição do banco, nesta conta bancária, e entra no resultado (DRE).</p>
            </>
          ) : (
            <>
              <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} maxLength={300} placeholder="Ex.: aplicação automática, estorno do próprio banco" /></Field>
              <p className="text-xs text-slate-500">Use só para o que não é receita nem despesa da empresa. O motivo fica registrado em cada linha.</p>
            </>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
            <span>Lembrar: o extrato novo de <b>{grupo.rotulo}</b> ({saida ? "saídas" : "entradas"}) já chega em “Com sugestão” para aprovar</span>
          </label>
          {regra && <p className="text-xs text-slate-500">Regra atual: {textoRegra(regra)} · usada {regra.usos} {pl(regra.usos, "vez", "vezes")}.</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {rodando && <span className="mr-auto text-sm text-slate-600" role="status">Tratando {feitas} de {grupo.qtd}…</span>}
            <Button type="button" variant="secondary" onClick={onClose} disabled={rodando}>Cancelar</Button>
            <Button disabled={rodando || (acao === "lancar" && !categoria)}>
              {acao === "lancar" ? <Receipt size={15} /> : <Ban size={15} />} {rodando ? "Tratando…" : `${acao === "lancar" ? "Lançar" : "Ignorar"} ${grupo.qtd} ${pl(grupo.qtd, "linha", "linhas")}`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function RegrasModal({ regras, podeEditar, onClose }: { regras: RegraConciliacao[]; podeEditar: boolean; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [mudando, setMudando] = useState<string | null>(null);
  const lista = [...regras].sort((a, b) => Number(b.ativo) - Number(a.ativo) || b.usos - a.usos || a.rotulo.localeCompare(b.rotulo));
  async function alternar(r: RegraConciliacao) {
    setMudando(r.id);
    const { error } = await supabase.from("conciliacao_regras").update({ ativo: !r.ativo }).eq("id", r.id);
    setMudando(null);
    if (error) return notifyError(error);
    invalidate("conciliacao_regras");
    notify(r.ativo ? "Regra desligada: o extrato novo deste favorecido não vem mais com sugestão" : "Regra ligada de novo");
  }
  return (
    <Modal open onClose={onClose} title="Regras do extrato por favorecido" wide>
      <p className="mb-3 text-sm text-slate-600">Cada regra vira sugestão para a linha nova do mesmo favorecido, no mesmo sentido, quando não houver uma conta ou transferência que combine. Para mudar a categoria, lance o grupo de novo com “lembrar”.</p>
      {!lista.length && <p className="flex items-center gap-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-600"><Users size={16} aria-hidden /> Nenhuma regra ainda: elas nascem ao lançar ou ignorar um grupo com “lembrar”.</p>}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {lista.map((r) => (
          <li key={r.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 ${r.ativo ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1 basis-56">
              <div className="break-words text-sm font-semibold text-fg">{r.rotulo} <span className="font-normal text-slate-500">· {r.direcao === "saida" ? "saídas" : "entradas"}</span></div>
              <div className="text-xs text-slate-600">{textoRegra(r)} · usada {r.usos} {pl(r.usos, "vez", "vezes")}{r.ultimo_uso ? ` · última em ${dataBR(r.ultimo_uso)}` : ""}{r.ativo ? "" : " · desligada"}</div>
            </div>
            {podeEditar && <Button variant="secondary" disabled={mudando === r.id} onClick={() => alternar(r)}>{r.ativo ? "Desligar" : "Ligar"}</Button>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
    </Modal>
  );
}
