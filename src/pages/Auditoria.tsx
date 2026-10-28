import { useCallback, useDeferredValue, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Badge, Button, Card, Field, Modal, PageHeader, Table, Tabs } from "@/components/ui";
import { ler, useInvalidate, useRows } from "@/lib/data";
import { useQuery } from "@tanstack/react-query";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { calcularExcecoes, faixasAtraso, TIPOS, type Excecao, type TipoExcecao } from "@/lib/auditoria";
import { baixarPlanilha } from "@/lib/exportar";
import { ChecklistAuditoria } from "@/components/ChecklistAuditoria";
import { useAbaUrl } from "@/lib/abaUrl";
import {
  FILTROS_EXCECOES, filtrarExcecoes, hojeLocal, lerConsulta, somarDiasData, VER_EXCECOES,
  type FiltrosExcecoes, type FiltrosHistorico, type VerExcecoes,
} from "@/lib/auditoriaBusca";
import { PainelAuditoria } from "@/components/auditoria/PainelAuditoria";
import { HistoricoBusca } from "@/components/auditoria/HistoricoBusca";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { Destaque, FiltroAtivo, Pilula } from "@/components/auditoria/BuscaUi";
import { useNomesRegistros, type Destino } from "@/components/auditoria/useAuditoria";
import { HistoricoTratativa } from "@/components/auditoria/HistoricoTratativa";
import { RodadaDiaria } from "@/components/auditoria/RodadaDiaria";

export type Tratativa = { id?: string; chave: string; tipo: string; titulo?: string | null; situacao: "indicio" | "confirmado" | "resolvido" | "descartado"; impacto: string | null; responsavel: string | null; prazo: string | null; observacao: string | null; updated_at?: string };

type Aba = "painel" | "checklist" | "excecoes" | "historico";
const ABAS = ["painel", "checklist", "excecoes", "historico"] as const;

export default function Auditoria() {
  const [aba, setAba] = useAbaUrl<Aba>("painel", ABAS);
  // filtros com que a aba abre quando vem do painel ou do checklist; clicar na aba abre sem filtro
  const [inicial, setInicial] = useState<{ n: number; exc?: Partial<FiltrosExcecoes>; hist?: Partial<FiltrosHistorico> }>({ n: 0 });
  const dados = useExcecoes();
  const topo = useRef<HTMLDivElement>(null);
  const abrir = useCallback((d: Destino) => {
    setInicial((x) => ({ n: x.n + 1, exc: d.aba === "excecoes" ? d.filtros : undefined, hist: d.aba === "historico" ? d.filtros : undefined }));
    setAba(d.aba);
    // o painel é comprido: volta para o começo da lista que abriu
    if (topo.current && topo.current.getBoundingClientRect().top < 0) topo.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setAba]);
  return (
    <div>
      <PageHeader title="Auditoria financeira" subtitle="Painel, checklist do mês, exceções para conferir e o histórico de tudo o que foi alterado" />
      <div ref={topo} className="scroll-mt-4" />
      <RodadaDiaria verAchado={(chave) => abrir({ aba: "excecoes", filtros: { chave, ver: "todas" } })} />
      <Tabs value={aba} onChange={(a) => { setAba(a); setInicial((x) => ({ n: x.n + 1 })); }} options={[
        { value: "painel", label: "Painel" }, { value: "checklist", label: "Checklist do mês" },
        { value: "excecoes", label: "Exceções" }, { value: "historico", label: "Histórico de alterações" },
      ]} />
      {aba === "painel" ? <AbaPainel dados={dados} abrir={abrir} />
        : aba === "checklist" ? <ChecklistAuditoria dados={dados} verExcecoes={(t) => abrir({ aba: "excecoes", filtros: { tipo: t } })} />
          : aba === "excecoes" ? <Excecoes key={inicial.n} dados={dados} inicial={inicial.exc} abrir={abrir} />
            : <AbaHistorico key={inicial.n} dados={dados} inicial={inicial.hist} />}
    </div>
  );
}

/** Painel e histórico mostram o nome atual do registro alterado (a alteração guarda só os campos que mudaram). */
function AbaPainel({ dados, abrir }: { dados: DadosExcecoes; abrir: (d: Destino) => void }) {
  const nomeRegistro = useNomesRegistros(dados.fontes);
  return <PainelAuditoria dados={dados} nomeRegistro={nomeRegistro} abrir={abrir} />;
}
function AbaHistorico({ dados, inicial }: { dados: DadosExcecoes; inicial?: Partial<FiltrosHistorico> }) {
  const nomeRegistro = useNomesRegistros(dados.fontes);
  return <HistoricoBusca inicial={inicial} nomeRegistro={nomeRegistro} />;
}

/* ------------------------------------ Exceções ------------------------------------ */

export type DadosExcecoes = ReturnType<typeof useExcecoes>;

// lista vazia sempre a mesma enquanto carrega: senão as regras (e a busca) seriam refeitas a cada letra digitada
const NENHUM: never[] = [];

/** Exceções calculadas pelas regras + as registradas à mão pelo checklist, com a tratativa de cada uma. */
function useExcecoes() {
  const { filtrar } = useUnidade();
  const { data: receber = NENHUM } = useRows<any>("contas_receber");
  const { data: pagar = NENHUM } = useRows<any>("contas_pagar");
  const { data: lancamentos = NENHUM } = useRows<any>("extrato_lancamentos");
  const { data: bancos = NENHUM } = useRows<any>("contas_bancarias", { order: "nome", ascending: true });
  const { data: importacoes = NENHUM } = useRows<any>("extrato_importacoes");
  // as regras só olham o histórico das contas, dos produtos e das vendas (o resto do histórico não é baixado), e das
  // contas e dos produtos só o que uma pessoa fez: o que o sistema gravou sozinho (~10 mil linhas) nenhuma regra usa
  const { data: auditoria = NENHUM } = useRows<any>("auditoria", {
    filtro: (q) => q.in("tabela", ["contas_receber", "contas_pagar", "produtos", "pedidos"]).or("origem.eq.usuario,tabela.eq.pedidos"), key: ["excecoes"],
  });
  const { data: documentos = NENHUM } = useRows<any>("documentos", { select: "entidade, entidade_id" });
  const { data: pedidos = NENHUM } = useRows<any>("pedidos", { select: "id, numero, numero_externo, status, unidade_id, valor_total, valor_produtos, desconto, vendedor_id, origem, nf_outra_numero, created_at, notas:notas_fiscais(status, ambiente)" });
  const { data: formas = NENHUM } = useRows<any>("formas_pagamento", { select: "meio, taxa_percentual, tarifa_fixa, conta_bancaria_id, ativo" });
  const { data: recebidas = NENHUM } = useRows<any>("nfe_recebidas", { select: "id, chave, emitente_nome, valor_total, data_emissao, situacao, processamento, conta_pagar_id, estoque_lancado, unidade_id" });
  const { data: usuariosCad = NENHUM } = useRows<any>("usuarios_erp", { select: "user_id, nome, papel, ativo, created_at" });
  // o último acesso vem do login (função do banco: só administrador, financeiro e contador); sem ele a regra de acesso fica de fora
  const { data: acessos } = useQuery({
    queryKey: ["usuarios_ultimo_acesso"],
    queryFn: async () => (await ler(supabase.rpc("usuarios_ultimo_acesso"))) as { user_id: string; ultimo_acesso: string | null }[] | null,
  });
  const usuarios = useMemo(() => {
    if (!acessos) return usuariosCad;
    const m = new Map(acessos.map((a) => [a.user_id, a.ultimo_acesso]));
    return usuariosCad.map((u: any) => (m.has(u.user_id) ? { ...u, ultimo_acesso: m.get(u.user_id) } : u));
  }, [usuariosCad, acessos]);
  const { data: produtos = NENHUM } = useRows<any>("produtos", { select: "id, sku, descricao, tipo, unidade, ncm, preco_custo, preco_venda, estoque_atual, estoque_minimo, ativo, vendavel, kit, categoria, localizacao, fornecedor_padrao_id, fora_de_linha, created_at" });
  const { data: ordens = NENHUM } = useRows<any>("ordens_servico", { select: "id, numero, status, em_garantia, valor_total, unidade_id" });
  const { data: fornecedores = NENHUM } = useRows<any>("fornecedores", { select: "id, nome" });
  const { data: tratativas = NENHUM as Tratativa[] } = useRows<Tratativa>("auditoria_excecoes");

  const bancosU = filtrar(bancos);
  const idsBancos = new Set(bancosU.map((b: any) => b.id));
  const excecoes = useMemo(() => [
    ...calcularExcecoes({
      receber: filtrar(receber), pagar: filtrar(pagar), lancamentos: lancamentos.filter((l: any) => idsBancos.has(l.conta_bancaria_id)), bancos: bancosU,
      importacoes: importacoes.filter((i: any) => idsBancos.has(i.conta_bancaria_id)), auditoria, documentos, pedidos: filtrar(pedidos), ordens: filtrar(ordens), fornecedores,
      recebidas: filtrar(recebidas), usuarios, produtos, formas, hoje: hoje(),
    }),
    // itens do checklist marcados como não conformes viram exceção para tratar (responsável, prazo, evidência)
    ...tratativas.filter((t) => t.tipo === "checklist").map((t): Excecao => ({
      chave: t.chave, tipo: "checklist", gravidade: "media", link: "/auditoria", titulo: t.titulo ?? "Item do checklist",
      detalhe: `Competência ${t.chave.split(":")[1] ?? ""}`, data: t.updated_at?.slice(0, 10),
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [receber, pagar, lancamentos, bancos, importacoes, auditoria, documentos, pedidos, ordens, fornecedores, recebidas, usuarios, produtos, formas, tratativas, filtrar]);

  const trat = (e: Excecao): Tratativa => tratativas.find((t) => t.chave === e.chave) ?? { chave: e.chave, tipo: e.tipo, situacao: "indicio", impacto: null, responsavel: null, prazo: null, observacao: null };
  const fechada = (t: Tratativa) => t.situacao === "resolvido" || t.situacao === "descartado";
  const abertasPorTipo = (k: TipoExcecao) => excecoes.filter((e) => e.tipo === k && !fechada(trat(e))).length;
  // para o histórico mostrar o nome do registro alterado (todas as unidades: o histórico não separa por unidade)
  const fontes = useMemo(() => ({ receber, pagar, pedidos, produtos, fornecedores, usuarios, bancos }), [receber, pagar, pedidos, produtos, fornecedores, usuarios, bancos]);
  return { excecoes, trat, fechada, abertasPorTipo, receber: filtrar(receber), pagar: filtrar(pagar), fontes };
}

/** Linha do histórico que gerou a exceção (alteração de conta, produto ou pedido). */
const idHistorico = (e: Excecao) => { const m = e.chave.match(/^alteracao(?:_produto|_pedido)?:(\d+)$/); return m ? Number(m[1]) : null; };
const GRAVIDADES = [["alta", "Alta", "bg-red-500"], ["media", "Média", "bg-amber-500"], ["baixa", "Baixa", "bg-slate-400"]] as const;

function Excecoes({ dados, inicial, abrir }: { dados: DadosExcecoes; inicial?: Partial<FiltrosExcecoes>; abrir: (d: Destino) => void }) {
  const { excecoes, trat, fechada, receber, pagar } = dados;
  const [f, setF] = useState<FiltrosExcecoes>({ ...FILTROS_EXCECOES, ...inicial });
  const [texto, setTexto] = useState(inicial?.busca ?? "");
  const busca = useDeferredValue(texto);
  const termos = useMemo(() => lerConsulta(busca), [busca]);
  const mudar = (m: Partial<FiltrosExcecoes>) => setF((x) => ({ ...x, chave: "", ...m }));
  const [editar, setEditar] = useState<{ e: Excecao; t: Tratativa } | null>(null);
  const dia = hojeLocal();
  const lista = filtrarExcecoes(excecoes, { ...f, busca }, trat, dia, (t) => TIPOS[t].rotulo);
  const contagem = Object.keys(TIPOS).map((k) => ({ k: k as TipoExcecao, n: excecoes.filter((e) => e.tipo === k && !fechada(trat(e))).length }));
  const atrasoR = faixasAtraso(receber, hoje());
  const atrasoP = faixasAtraso(pagar, hoje());
  const atrasados = (t: Tratativa) => t.prazo && t.prazo < dia && !fechada(t);
  const limpar = () => { setTexto(""); setF(FILTROS_EXCECOES); };

  // exceção que nasceu do histórico: abre a linha do histórico (a alteração com quem, quando e o motivo)
  function verNoHistorico(e: Excecao, id: number) {
    abrir({ aba: "historico", filtros: e.data
      ? { periodo: "livre", de: somarDiasData(e.data, -1), ate: somarDiasData(e.data, 1), ids: [id] }
      : { periodo: "30d", ids: [id] } });
  }

  function exportar() {
    baixarPlanilha("auditoria-excecoes", [{ nome: "Exceções", linhas: lista.map((e) => {
      const t = trat(e);
      return { Tipo: TIPOS[e.tipo].rotulo, Critério: TIPOS[e.tipo].criterio, Item: e.titulo, Evidência: e.detalhe, Valor: e.valor ?? "", Data: e.data ? dataBR(e.data) : "",
        Situação: t.situacao, Impacto: t.impacto ?? "", Responsável: t.responsavel ?? "", Prazo: t.prazo ? dataBR(t.prazo) : "", Observação: t.observacao ?? "" };
    }) }]).catch(notifyError);
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {([["A receber vencido", atrasoR], ["A pagar vencido", atrasoP]] as const).map(([titulo, faixas]) => (
          <Card key={titulo} className="p-4">
            <div className="mb-2 text-sm font-semibold">{titulo} por faixa de atraso</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {faixas.map((x) => (
                <div key={x.rotulo} className={`rounded-lg px-2 py-2 ${x.qtd ? (x.max > 60 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800") : "bg-slate-50 text-slate-500"}`}>
                  <div className="text-2xs">{x.rotulo}</div><div className="text-sm font-bold">{brl(x.valor)}</div><div className="text-2xs">{x.qtd} {pl(x.qtd, "conta", "contas")}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* a mesma barra das outras listas: busca, e o que mostrar e a gravidade no botão Filtros; os tipos em pílulas logo abaixo */}
      <BarraFiltros busca={texto} onBusca={(v) => { setTexto(v); if (f.chave) mudar({}); }}
        placeholder="Buscar: fornecedor, cliente, valor (1.234,56), documento, responsável, observação…"
        filtros={<>
          <label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Mostrar</span>
            <select className="input w-auto max-w-full" value={f.ver} onChange={(e) => mudar({ ver: e.target.value as VerExcecoes })}>
              {VER_EXCECOES.map((v) => <option key={v.valor} value={v.valor}>{v.rotulo}</option>)}
            </select></label>
          <div className="pb-1">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Gravidade</span>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Gravidade">
              {GRAVIDADES.map(([g, rotulo, cor]) => (
                <Pilula key={g} ativo={f.gravidade === g} onClick={() => mudar({ gravidade: f.gravidade === g ? "" : g })} title={`Só gravidade ${rotulo.toLowerCase()}`}>
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full ${cor}`} aria-hidden />{rotulo}
                </Pilula>
              ))}
            </div>
          </div>
        </>}
        nFiltros={(f.ver !== FILTROS_EXCECOES.ver ? 1 : 0) + (f.gravidade ? 1 : 0) + (f.tipo ? 1 : 0)} onLimpar={limpar}
        direita={<Button variant="secondary" onClick={exportar} disabled={!lista.length}>Exportar</Button>} />
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Pilula ativo={!f.tipo} onClick={() => mudar({ tipo: "" })}>Todas ({contagem.reduce((s, c) => s + c.n, 0)})</Pilula>
        {contagem.filter((c) => c.n || f.tipo === c.k).map((c) => (
          <Pilula key={c.k} ativo={f.tipo === c.k} onClick={() => mudar({ tipo: c.k })} title={TIPOS[c.k].criterio}>{TIPOS[c.k].rotulo} ({c.n})</Pilula>
        ))}
      </div>
      {f.tipo && <p className="mb-2 text-xs text-slate-500"><b>Critério:</b> {TIPOS[f.tipo].criterio}</p>}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-600" aria-live="polite"><b className="num text-fg">{lista.length}</b> {pl(lista.length, "exceção", "exceções")}</p>
        {f.chave && <FiltroAtivo onRemover={() => mudar({ chave: "", ver: FILTROS_EXCECOES.ver })}>Exceção escolhida no painel · ver todas</FiltroAtivo>}
      </div>

      {!excecoes.length ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-slate-600"><ShieldAlert className="text-emerald-600" /> Nenhuma exceção encontrada pelas regras atuais.</Card>
      ) : (
        <Table empty={!lista.length}
          head={<><th className="th">Exceção</th><th className="th">Evidência</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th">Responsável / prazo</th><th className="th" /></>}>
          {lista.map((e) => {
            const t = trat(e);
            const idHist = idHistorico(e);
            return (
              <tr key={e.chave}>
                <td className="td">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span className={`h-2 w-2 rounded-full ${e.gravidade === "alta" ? "bg-red-500" : e.gravidade === "media" ? "bg-amber-500" : "bg-slate-400"}`} aria-label={`gravidade ${e.gravidade}`} />
                    {TIPOS[e.tipo].rotulo}
                  </div>
                  {e.link === "/auditoria" ? (
                    <button type="button" className="text-left font-medium text-fg hover:underline"
                      onClick={() => (idHist != null ? verNoHistorico(e, idHist) : abrir({ aba: "checklist" }))}>
                      <Destaque texto={e.titulo} termos={termos} />
                    </button>
                  ) : <Link to={e.link} className="font-medium text-fg hover:underline"><Destaque texto={e.titulo} termos={termos} /></Link>}
                  {idHist != null && e.link !== "/auditoria" && (
                    <button type="button" onClick={() => verNoHistorico(e, idHist)} className="link-acao mt-0.5 block text-xs">Ver no histórico</button>
                  )}
                </td>
                <td className="td text-sm text-slate-600"><Destaque texto={e.detalhe} termos={termos} />{t.observacao && <div className="mt-1 text-xs text-slate-500">Obs.: <Destaque texto={t.observacao} termos={termos} /></div>}</td>
                <td className={`td whitespace-nowrap text-right ${e.valor != null && e.valor < 0 ? "text-red-600" : ""}`}>{e.valor != null ? <Destaque texto={brl(e.valor)} termos={termos} /> : "—"}</td>
                <td className="td"><Badge value={t.id ? t.situacao : "novo"} />{t.impacto && <div className="mt-1 text-xs text-slate-500">impacto {t.impacto}</div>}</td>
                <td className="td text-sm">{t.responsavel ? <Destaque texto={t.responsavel} termos={termos} /> : <span className="text-slate-400">—</span>}{t.prazo && <div className={`text-xs ${atrasados(t) ? "font-semibold text-red-600" : "text-slate-500"}`}>até {dataBR(t.prazo)}</div>}</td>
                <td className="td text-right"><Button variant="secondary" onClick={() => setEditar({ e, t })}>Tratar</Button></td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">Os alertas servem para escolher o que conferir. Uma exceção só vira <b>confirmada</b> depois de olhar o documento ou o extrato.</p>
      {editar && <TratarExcecao e={editar.e} t={editar.t} onClose={() => setEditar(null)} />}
    </div>
  );
}

function TratarExcecao({ e, t, onClose }: { e: Excecao; t: Tratativa; onClose: () => void }) {
  const [f, setF] = useState<Tratativa>(t);
  const invalidate = useInvalidate();
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    const row = { chave: e.chave, tipo: e.tipo, titulo: e.titulo, situacao: f.situacao, impacto: f.impacto || null, responsavel: f.responsavel || null, prazo: f.prazo || null, observacao: f.observacao || null };
    const { error } = await supabase.from("auditoria_excecoes").upsert(row, { onConflict: "chave" });
    if (error) return notifyError(error);
    notify("Tratativa salva");
    invalidate("auditoria_excecoes", "auditoria");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={TIPOS[e.tipo].rotulo}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2">
          <div className="font-semibold text-fg">{e.titulo}</div>
          <div className="text-slate-600">{e.detalhe}</div>
          <div className="mt-1 text-xs text-slate-500"><b>Critério:</b> {TIPOS[e.tipo].criterio}</div>
        </div>
        <Field label="Situação">
          <select className="input" value={f.situacao} onChange={(x) => setF({ ...f, situacao: x.target.value as Tratativa["situacao"] })}>
            <option value="indicio">Em análise</option><option value="confirmado">Erro confirmado</option>
            <option value="resolvido">Resolvido</option><option value="descartado">Descartado (estava certo)</option>
          </select>
        </Field>
        <Field label="Impacto">
          <select className="input" value={f.impacto ?? ""} onChange={(x) => setF({ ...f, impacto: x.target.value })}>
            <option value="">—</option><option value="baixo">Baixo</option><option value="medio">Médio</option><option value="alto">Alto</option>
          </select>
        </Field>
        <Field label="Responsável"><input className="input" value={f.responsavel ?? ""} onChange={(x) => setF({ ...f, responsavel: x.target.value })} /></Field>
        <Field label="Prazo para corrigir"><input className="input" type="date" value={f.prazo ?? ""} onChange={(x) => setF({ ...f, prazo: x.target.value })} /></Field>
        <Field label="Evidência / o que foi feito" className="sm:col-span-2">
          <textarea className="input" rows={3} value={f.observacao ?? ""} onChange={(x) => setF({ ...f, observacao: x.target.value })} required={f.situacao !== "indicio"}
            placeholder="Ex.: conferido com o comprovante do banco; boleto pago em duplicidade, fornecedor vai devolver" />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button>Salvar</Button>
        </div>
      </form>
      {t.id && <HistoricoTratativa id={t.id} />}
    </Modal>
  );
}
