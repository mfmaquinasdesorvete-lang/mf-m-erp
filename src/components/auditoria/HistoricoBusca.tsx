// Auditoria → Histórico de alterações: uma busca que procura em tudo (quem fez, área, ação, descrição e os valores
// antes e depois) e filtros de período, pessoa, área, ação e faixa de valor. O que foi achado fica marcado em amarelo.
import { memo, useDeferredValue, useMemo, useState } from "react";
import { Download, SlidersHorizontal, X } from "lucide-react";
import { Button, Card, Field, Table } from "@/components/ui";
import { ROTULO_CAMPO, valorCampo, type LinhaAuditoria } from "@/components/Historico";
import { baixarPlanilha } from "@/lib/exportar";
import { notifyError } from "@/lib/notify";
import { dataBR, pl } from "@/lib/format";
import {
  ACOES, camposAchados, consultaHistorico, descricaoLinha, FILTROS_HISTORICO, filtrarHistorico, filtrosAtivos, filtrosLimpos, hojeLocal,
  indexarHistorico, intervalo, lerConsulta, lerValor, PERIODOS, quem, ROTULO_ACAO, ROTULO_TABELA, rotuloTabela, somarDiasData, valorBR,
  type FiltrosHistorico, type OpcoesHistorico, type Termo,
} from "@/lib/auditoriaBusca";
import { CampoBusca, Destaque, FiltroAtivo, Pilula } from "./BuscaUi";
import { useHistorico } from "./useAuditoria";

const rotuloCampo = (c: string) => ROTULO_CAMPO[c] ?? c.replace(/_/g, " ");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const PAGINA = 200;

export function HistoricoBusca({ inicial, nomeRegistro }: { inicial?: Partial<FiltrosHistorico>; nomeRegistro: NonNullable<OpcoesHistorico["nomeRegistro"]> }) {
  // a busca fica separada dos outros filtros: digitar não refaz a consulta e a lista acompanha sem travar
  const [texto, setTexto] = useState(inicial?.busca ?? "");
  const [f, setF] = useState<FiltrosHistorico>({ ...FILTROS_HISTORICO, ...inicial, busca: "" });
  const [mostrar, setMostrar] = useState(PAGINA);
  const [verFiltros, setVerFiltros] = useState(false);
  const mudar = (m: Partial<FiltrosHistorico>) => { setF((x) => ({ ...x, ids: undefined, ...m })); setMostrar(PAGINA); };
  const digitar = (v: string) => { setTexto(v); setMostrar(PAGINA); if (f.ids) setF((x) => ({ ...x, ids: undefined })); };

  const hoje = hojeLocal();
  const { linhas, isLoading, isError } = useHistorico(consultaHistorico(f, hoje));
  const itens = useMemo(() => indexarHistorico(linhas, { rotuloCampo, nomeRegistro }), [linhas, nomeRegistro]);
  const busca = useDeferredValue(texto);
  const filtros = useMemo(() => ({ ...f, busca }), [f, busca]);
  const resultado = useMemo(() => filtrarHistorico(itens, filtros, hoje), [itens, filtros, hoje]);
  const termos = useMemo(() => lerConsulta(busca), [busca]);

  const pessoas = useMemo(() => [...new Set(linhas.map(quem))].sort((a, b) => a.localeCompare(b, "pt-BR")), [linhas]);
  const tabelas = useMemo(() => [...new Set([...Object.keys(ROTULO_TABELA), ...linhas.map((l) => l.tabela)])]
    .map((v) => ({ v, r: rotuloTabela(v) })).sort((a, b) => a.r.localeCompare(b.r, "pt-BR")), [linhas]);
  const { de, ate } = intervalo(f, hoje);
  const periodo = f.ids?.length ? "" : de && ate ? (de === ate ? `em ${dataBR(de)}` : `de ${dataBR(de)} a ${dataBR(ate)}`)
    : de ? `desde ${dataBR(de)}` : ate ? `até ${dataBR(ate)}` : "em todo o histórico";
  const ativos = filtrosAtivos(f);
  const limpo = filtrosLimpos({ ...f, busca: texto });
  const valorInvalido = (v: string) => !!v.trim() && lerValor(v) == null;

  function limpar() { setTexto(""); setF(FILTROS_HISTORICO); setMostrar(PAGINA); }

  function exportar() {
    baixarPlanilha("historico-alteracoes", [{ nome: "Histórico", linhas: resultado.map(({ l }) => ({
      Quando: new Date(l.created_at).toLocaleString("pt-BR"), Usuário: quem(l), Origem: l.origem === "sistema" ? "automático" : "manual",
      Área: rotuloTabela(l.tabela), Registro: descricaoLinha(l, nomeRegistro), Ação: ROTULO_ACAO[l.acao] ?? l.acao, Campos: (l.campos ?? []).join(", "),
      Antes: l.antes ? JSON.stringify(l.antes) : "", Depois: l.depois ? JSON.stringify(l.depois) : "", Motivo: l.motivo ?? "",
    })) }]).catch(notifyError);
  }

  return (
    <div>
      <Card className="mb-3 p-3 sm:p-4">
        <CampoBusca value={texto} onChange={digitar} rotulo="Buscar no histórico"
          placeholder="Buscar: pessoa, área, descrição, valor (1.234,56), CPF/CNPJ, nota, data…" />
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <Pilula key={p.valor} ativo={!f.ids?.length && f.periodo === p.valor}
              onClick={() => mudar(p.valor === "livre" ? { periodo: "livre", de: de || somarDiasData(hoje, -29), ate: ate || hoje } : { periodo: p.valor })}>
              {p.rotulo}
            </Pilula>
          ))}
          <Button type="button" variant="secondary" className="ml-auto md:hidden" aria-expanded={verFiltros} onClick={() => setVerFiltros((v) => !v)}>
            <SlidersHorizontal size={16} /> Filtros{ativos ? ` (${ativos})` : ""}
          </Button>
        </div>
        {f.periodo === "livre" && !f.ids?.length && (
          <div className="mt-3">
            <div className="grid max-w-md grid-cols-2 gap-2">
              <Field label="De"><input type="date" className="input" value={f.de} max={f.ate || undefined} onChange={(e) => mudar({ de: e.target.value })} /></Field>
              <Field label="Até"><input type="date" className="input" value={f.ate} min={f.de || undefined} onChange={(e) => mudar({ ate: e.target.value })} /></Field>
            </div>
            <p className="mt-1 text-xs text-slate-500">Período longo demora mais para carregar (o histórico cresce todo dia).</p>
          </div>
        )}
        <div className={`${verFiltros ? "grid" : "hidden md:grid"} mt-3 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`}>
          <Field label="Pessoa">
            <select className="input" value={f.pessoa} onChange={(e) => mudar({ pessoa: e.target.value })}>
              <option value="">Todas as pessoas</option>
              {(f.pessoa && !pessoas.includes(f.pessoa) ? [f.pessoa, ...pessoas] : pessoas).map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Área">
            <select className="input" value={f.tabela} onChange={(e) => mudar({ tabela: e.target.value })}>
              <option value="">Todas as áreas</option>
              {tabelas.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
            </select>
          </Field>
          <Field label="Ação">
            <select className="input" value={f.acao} onChange={(e) => mudar({ acao: e.target.value as FiltrosHistorico["acao"] })}>
              {ACOES.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
            </select>
          </Field>
          <Field label="Valor (R$)">
            <div className="flex items-center gap-1.5">
              <input className={`input ${valorInvalido(f.valorMin) ? "border-red-500" : ""}`} inputMode="decimal" placeholder="de" aria-label="Valor de"
                value={f.valorMin} onChange={(e) => mudar({ valorMin: e.target.value })} />
              <span className="text-xs text-slate-500">a</span>
              <input className={`input ${valorInvalido(f.valorMax) ? "border-red-500" : ""}`} inputMode="decimal" placeholder="até" aria-label="Valor até"
                value={f.valorMax} onChange={(e) => mudar({ valorMax: e.target.value })} />
            </div>
          </Field>
        </div>
      </Card>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="min-w-0 text-sm text-slate-600" aria-live="polite">
          {isLoading ? "Carregando o histórico…" : isError ? <span className="text-red-600">Não foi possível carregar o histórico.</span>
            : <><b className="num text-fg">{resultado.length.toLocaleString("pt-BR")}</b> {pl(resultado.length, "resultado", "resultados")} {periodo}</>}
        </p>
        {!limpo && <Button variant="ghost" onClick={limpar}><X size={16} /> Limpar filtros</Button>}
        <Button variant="secondary" className="ml-auto" onClick={exportar} disabled={!resultado.length}><Download size={16} /> Exportar</Button>
      </div>

      {(texto || ativos > 0 || !!f.ids?.length) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {!!f.ids?.length && <FiltroAtivo onRemover={() => mudar({ ids: undefined })}>{f.ids.length} {pl(f.ids.length, "alteração escolhida", "alterações escolhidas")} · ver todas do período</FiltroAtivo>}
          {texto && <FiltroAtivo onRemover={() => digitar("")}>Busca: “{texto}”</FiltroAtivo>}
          {f.pessoa && <FiltroAtivo onRemover={() => mudar({ pessoa: "" })}>Pessoa: {f.pessoa}</FiltroAtivo>}
          {f.tabela && <FiltroAtivo onRemover={() => mudar({ tabela: "" })}>Área: {rotuloTabela(f.tabela)}</FiltroAtivo>}
          {f.acao !== FILTROS_HISTORICO.acao && <FiltroAtivo onRemover={() => mudar({ acao: FILTROS_HISTORICO.acao })}>Ação: {ACOES.find((a) => a.valor === f.acao)?.rotulo}</FiltroAtivo>}
          {(f.valorMin || f.valorMax) && (
            <FiltroAtivo onRemover={() => mudar({ valorMin: "", valorMax: "" })}>
              Valor: {[lerValor(f.valorMin), lerValor(f.valorMax)].map((v, i) => (v == null ? null : `${i ? "até" : "de"} R$ ${valorBR(Math.abs(v))}`)).filter(Boolean).join(" ")}
            </FiltroAtivo>
          )}
        </div>
      )}

      <Table empty={!isLoading && !resultado.length}
        head={<><th className="th">Quando</th><th className="th">Quem</th><th className="th">Área</th><th className="th">O que mudou</th><th className="th">Motivo</th></>}>
        {resultado.slice(0, mostrar).map(({ l }) => <Linha key={l.id} l={l} termos={termos} nomeRegistro={nomeRegistro} />)}
      </Table>
      {!isLoading && !resultado.length && ["hoje", "7d"].includes(f.periodo) && !f.ids?.length && (
        <p className="mt-2 text-center text-sm text-slate-500">
          Não achou? <button type="button" className="font-semibold text-brand hover:underline" onClick={() => mudar({ periodo: "30d" })}>Procure nos últimos 30 dias</button>
        </p>
      )}
      {resultado.length > mostrar && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={() => setMostrar((m) => m + PAGINA)}>
            Mostrar mais {Math.min(PAGINA, resultado.length - mostrar)} (de {resultado.length.toLocaleString("pt-BR")})
          </Button>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        A busca ignora acento e maiúscula; com várias palavras, todas precisam aparecer. Valor vale de qualquer jeito (1.234,56 · 1234.56 · R$ 1.234,56)
        e CPF/CNPJ com ou sem pontos. O histórico é gravado pelo banco de dados a cada alteração e não pode ser editado nem apagado por ninguém.
      </p>
    </div>
  );
}

const ITEM: Record<string, string> = { item_incluido: "incluiu item", item_removido: "removeu item", item_alterado: "alterou item" };
const OCULTOS = ["conciliado_em", "conciliado_por", "baixou_conta", "updated_at", "atualizado_por"];
const PRINCIPAL = ["valor", "valor_total", "preco_venda", "saldo_inicial"];

const Linha = memo(function Linha({ l, termos, nomeRegistro }: { l: LinhaAuditoria; termos: Termo[]; nomeRegistro: OpcoesHistorico["nomeRegistro"] }) {
  const desc = descricaoLinha(l, nomeRegistro);
  return (
    <tr>
      <td className="td whitespace-nowrap text-sm"><Destaque texto={quando(l.created_at)} termos={termos} /></td>
      <td className="td text-sm"><Destaque texto={quem(l)} termos={termos} />{l.origem === "sistema" && <div className="text-xs text-slate-500">automático</div>}</td>
      <td className="td text-sm">
        <Destaque texto={rotuloTabela(l.tabela)} termos={termos} />
        {desc && <div className="text-xs text-slate-500"><Destaque texto={desc} termos={termos} /></div>}
      </td>
      <td className="td text-sm"><Mudanca l={l} termos={termos} /></td>
      <td className="td text-sm text-amber-700">{l.motivo ? <Destaque texto={l.motivo} termos={termos} /> : null}</td>
    </tr>
  );
});

/** O que mudou, com o termo buscado marcado (na criação e na exclusão, também em que campo a busca achou). */
function Mudanca({ l, termos }: { l: LinhaAuditoria; termos: Termo[] }) {
  const d = (s: string) => <Destaque texto={s} termos={termos} />;
  if (l.acao === "insert" || l.acao === "delete") {
    const reg = (l.acao === "insert" ? l.depois : l.antes) ?? {};
    const principal = PRINCIPAL.find((k) => reg[k] != null && reg[k] !== "");
    const achados = camposAchados(reg, termos).filter((k) => k !== principal && !["descricao", "nome", ...OCULTOS].includes(k)).slice(0, 3);
    return (
      <span>
        <span className={l.acao === "delete" ? "font-semibold text-red-600" : ""}>{l.acao === "insert" ? "criou o registro" : "excluiu o registro"}</span>
        {principal && <> · {d(`${rotuloCampo(principal)} ${valorCampo(principal, reg[principal])}`)}</>}
        {achados.map((k) => <span key={k} className="mt-0.5 block text-xs text-slate-500">achou em <b>{rotuloCampo(k)}</b>: {d(valorCampo(k, reg[k]))}</span>)}
      </span>
    );
  }
  const item = (l.campos ?? []).find((c) => ITEM[c]);
  if (item) {
    const antes = String(l.antes?.[item] ?? ""), depois = String(l.depois?.[item] ?? "");
    return <span><b>{ITEM[item]}</b>: {d(item === "item_alterado" ? `${antes} → ${depois}` : depois || antes)}</span>;
  }
  // o nome do vendedor já diz quem é: o id não precisa aparecer
  const campos = (l.campos ?? []).filter((c) => !OCULTOS.includes(c) && !(c === "vendedor_id" && l.campos?.includes("vendedor")));
  return (
    <span>
      {campos.map((c, i) => (
        <span key={c}>{i > 0 && "; "}<b>{d(rotuloCampo(c))}</b>: {d(valorCampo(c, l.antes?.[c]))} → {d(valorCampo(c, l.depois?.[c]))}</span>
      ))}
    </span>
  );
}
