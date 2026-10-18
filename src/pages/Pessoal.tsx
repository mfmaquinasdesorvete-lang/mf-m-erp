// Painel pessoal (pela carteira no fim do menu, só para o administrador): as contas pessoais do dono — banco, cartão,
// investimento —, separadas da empresa. Nada daqui entra no DRE, na conciliação, nos painéis da empresa nem no pacote
// do contador; no banco, cada linha é de quem a criou e só essa pessoa lê. Nada é apagado: lançamento errado é anulado.
// Período escolhido no alto (mês, 3/6/12 meses, ano, tudo ou datas livres), comparado com o período anterior.
// Os cards separam os gastos por tipo (veículo, impostos, plano de saúde…); os em âmbar são para mostrar ao contador, e o
// arquivo "Baixar para o contador" só sai quando o dono baixa (o contador não vê este painel).
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownCircle, ArrowUpCircle, Barcode, Building2, CalendarClock, Car, ChevronLeft, ChevronRight, CreditCard, Check, Download, FileUp, Fuel,
  HandHeart, HeartPulse, Home, Landmark, Lock, Pencil, Percent, PiggyBank, Pill, Plus, Receipt, Repeat, Search, ShieldCheck, ShoppingBag, ShoppingCart, Undo2,
  UtensilsCrossed, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import { Button, Card, Field, MaisAcoes, Modal, nomeMes, PageHeader, Stat } from "@/components/ui";
import { Area, Colunas, Ranking, Rosca } from "@/components/Charts";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { lerExtrato } from "@/lib/extrato";
import { lerExtratoPdf } from "@/lib/extratoPdf";
import { lerBoleto } from "@/lib/boleto";
import { numeroBR } from "@/lib/fichaCadastral";
import { baixarPlanilha } from "@/lib/exportar";
import { useUnidade } from "@/lib/unidade";
import type { Parte } from "@/lib/partesRelacionadas";
import {
  CATEGORIAS, CORES_CONTA, GRUPOS_PESSOAIS, NOME_TIPO_CONTA, PERIODOS_PESSOAIS, TIPOS_CONTA, categoriaDe, daEmpresa, faixaAnterior, faixaDoPeriodo,
  grupoDe, gruposDoPeriodo, proximos, recebidosDaEmpresa, resumoPeriodo, saldoConta, serieMensal, serieSaldo, somarDiasPessoal, somarMesPessoal,
  ultimoLancamento, type ContaPessoal, type Empresa, type Faixa, type GrupoPessoalId, type LancPessoal, type PeriodoId, type TipoConta,
} from "@/lib/pessoal";

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const corDe = (c: string | undefined) => CORES_CONTA[c ?? ""] ?? CORES_CONTA.sky;
const CORES_BARRA = ["#0284c7", "#7c3aed", "#047857", "#c2410c", "#be185d", "#b45309", "#0f766e", "#475569"];
const PRO_LABORE = "Salário e pró-labore";
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (ym: string) => `${MESES_CURTOS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const diaLongo = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });
const pct = (agora: number, antes: number) => (antes > 0 ? Math.round(((agora - antes) / antes) * 100) : null);
const NA_EMPRESA = "Pago pela conta pessoal do sócio (dinheiro do sócio). Confirmar com o contador.";

/** Ícone e cor de cada card de gasto (fundo forte, ícone branco: igual nos dois temas). */
const VISUAL_GRUPO: Record<GrupoPessoalId, { icone: LucideIcon; cor: string }> = {
  veiculo: { icone: Car, cor: "#0284c7" }, empresas: { icone: Building2, cor: "#7c3aed" }, impostos: { icone: Receipt, cor: "#b45309" },
  saude: { icone: HeartPulse, cor: "#047857" }, seguros: { icone: ShieldCheck, cor: "#1d4ed8" }, cartoes: { icone: CreditCard, cor: "#475569" },
  bancos: { icone: Landmark, cor: "#334155" }, postos: { icone: Fuel, cor: "#c2410c" }, online: { icone: ShoppingBag, cor: "#a21caf" },
  doacoes: { icone: HandHeart, cor: "#db2777" },
  delivery: { icone: UtensilsCrossed, cor: "#be185d" }, farmacia: { icone: Pill, cor: "#0f766e" }, mercado: { icone: ShoppingCart, cor: "#15803d" },
  assinaturas: { icone: Repeat, cor: "#6d28d9" }, casa: { icone: Home, cor: "#0369a1" }, tarifas: { icone: Percent, cor: "#b91c1c" },
};

/** "▲ 12% do período anterior", "igual ao período anterior" ou nada quando não há com o que comparar. */
function comparado(agora: number, antes: number) {
  const p = pct(agora, antes);
  if (p == null) return antes === 0 && agora > 0 ? "nada no período anterior" : undefined;
  return p === 0 ? "igual ao período anterior" : `${p > 0 ? "▲" : "▼"} ${Math.abs(p)}% do período anterior (${brl(antes)})`;
}

export default function Pessoal() {
  const invalidar = useInvalidate();
  const { unidades } = useUnidade();
  const { data: contas = [], isLoading } = useRows<ContaPessoal>("pessoal_contas", { order: "ordem", ascending: true });
  const { data: lancs = [] } = useRows<LancPessoal>("pessoal_lancamentos", { order: "data", ascending: false });
  const { data: partes = [] } = useRows<Parte>("partes_relacionadas", { order: "nome", ascending: true });
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState<PeriodoId>("mes");
  const [mesEscolhido, setMes] = useState<string | null>(null);
  const [livre, setLivre] = useState<Faixa>({ de: `${hoje().slice(0, 7)}-01`, ate: hoje() });
  const [conta, setConta] = useState("");
  const [categoria, setCategoria] = useState("");
  const [grupo, setGrupo] = useState<GrupoPessoalId | "">("");
  const [busca, setBusca] = useState("");
  const [editConta, setEditConta] = useState<Partial<ContaPessoal> | null>(null);
  const [editLanc, setEditLanc] = useState<Partial<LancPessoal> | null>(null);
  const [importar, setImportar] = useState(false);
  const [boleto, setBoleto] = useState(false);

  // a própria empresa (razão social e CNPJ das unidades): o Pix dela para a sua conta é pró-labore ou retirada
  const empresa: Empresa = useMemo(() => ({
    nomes: [...new Set(unidades.map((u) => u.razao_social ?? "").filter(Boolean))],
    documentos: unidades.map((u) => String(u.cnpj ?? "").replace(/\D/g, "")).filter((d) => d.length === 14),
  }), [unidades]);
  // para o card "Pix para as empresas": a MF e as empresas ligadas (cadastradas em Entre contas e sócios)
  const empresas: Empresa = useMemo(() => {
    const ligadas = partes.filter((p) => p.tipo === "empresa" && p.ativo !== false);
    return {
      nomes: [...empresa.nomes, ...ligadas.flatMap((p) => [p.nome, ...(p.nomes_extrato ?? [])])],
      documentos: [...empresa.documentos, ...ligadas.flatMap((p) => (p.documentos ?? []).map((d) => String(d).replace(/\D/g, "")))],
    };
  }, [empresa, partes]);

  // começa no mês atual; sem lançamento nele, no último mês com movimento (o extrato pode estar atrasado)
  const mesPadrao = useMemo(() => {
    const atual = hoje().slice(0, 7);
    const feitos = lancs.filter((l) => !l.anulado && l.situacao === "realizado" && l.data <= hoje());
    if (!feitos.length || feitos.some((l) => l.data.startsWith(atual))) return atual;
    return feitos.reduce((m, l) => (l.data > m ? l.data : m), "").slice(0, 7);
  }, [lancs]);
  const mes = mesEscolhido ?? mesPadrao;
  useEffect(() => { if (periodo === "pers" && livre.de === `${hoje().slice(0, 7)}-01`) setLivre({ de: `${mes}-01`, ate: faixaDoPeriodo("mes", mes, [], hoje()).ate }); }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const daConta = useMemo(() => lancs.filter((l) => !conta || l.conta_id === conta), [lancs, conta]);
  const faixa = faixaDoPeriodo(periodo, mes, lancs, hoje(), livre);
  const anterior = faixaAnterior(periodo, mes, faixa);
  const passo = PERIODOS_PESSOAIS.find((p) => p.id === periodo)?.meses;
  const resumo = useMemo(() => resumoPeriodo(daConta, faixa, hoje()), [daConta, faixa.de, faixa.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const resumoAnt = useMemo(() => resumoPeriodo(daConta, anterior), [daConta, anterior.de, anterior.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const serie = useMemo(() => serieMensal(daConta, faixa.ate.slice(0, 7) > hoje().slice(0, 7) ? hoje().slice(0, 7) : faixa.ate.slice(0, 7), 12), [daConta, faixa.ate]);
  const contasDoSaldo = conta ? contas.filter((c) => c.id === conta) : contas.filter((c) => c.ativa);
  const saldoNoTempo = useMemo(() => serieSaldo(contasDoSaldo, lancs, faixa, hoje()), [contasDoSaldo, lancs, faixa.de, faixa.ate]); // eslint-disable-line react-hooks/exhaustive-deps

  const ativas = contas.filter((c) => c.ativa);
  const nomeConta = (id: string) => contas.find((c) => c.id === id);
  const saldos = useMemo(() => new Map(contas.map((c) => [c.id, saldoConta(c, lancs)])), [contas, lancs]);
  const disponivel = ativas.filter((c) => c.tipo !== "cartao").reduce((t, c) => t + (saldos.get(c.id) ?? 0), 0);
  const cartoes = ativas.filter((c) => c.tipo === "cartao").reduce((t, c) => t + (saldos.get(c.id) ?? 0), 0);
  const prox = useMemo(() => proximos(lancs, hoje()).filter((l) => l.data <= somarDiasPessoal(hoje(), 30)), [lancs]);

  // Pix da empresa para você
  const daMF = useMemo(() => recebidosDaEmpresa(daConta, empresa), [daConta, empresa]);
  const daMFperiodo = daMF.filter((l) => l.situacao === "realizado" && l.data >= faixa.de && l.data <= faixa.ate).reduce((t, l) => t + Number(l.valor), 0);
  const daMFsemCategoria = daMF.filter((l) => l.categoria !== PRO_LABORE);

  // cards por tipo de gasto
  const grupos = useMemo(() => gruposDoPeriodo(daConta, faixa, anterior, empresas), [daConta, faixa.de, faixa.ate, anterior.de, anterior.ate, empresas]); // eslint-disable-line react-hooks/exhaustive-deps
  const grupoDoLanc = useMemo(() => new Map(daConta.map((l) => [l.id, grupoDe(l, empresas)])), [daConta, empresas]);
  const grupoSel = GRUPOS_PESSOAIS.find((g) => g.id === grupo);
  function escolherGrupo(id: GrupoPessoalId) {
    const novo = grupo === id ? "" : id;
    setGrupo(novo);
    if (novo) setTimeout(() => document.getElementById("lancamentos-pessoais")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  // imposto da MF pago daqui: abre Contas a pagar da empresa já preenchida, para conferir e salvar
  const lancarNaMF = (l: LancPessoal) => navigate("/financeiro", { state: { aba: "pagar", nova: true, tipo: "imposto", inicial: {
    descricao: l.descricao.slice(0, 200), valor: Math.abs(Number(l.valor)), vencimento: l.data, categoria: "impostos", observacoes: `${NA_EMPRESA} Pago em ${dataBR(l.data)}.`,
  } } });

  const lista = daConta.filter((l) => l.data >= faixa.de && l.data <= faixa.ate && (!categoria || (l.categoria ?? "Outros") === categoria)
    && (!grupo || grupoDoLanc.get(l.id) === grupo)
    && (!busca.trim() || [l.descricao, l.categoria].some((x) => sem(x).includes(sem(busca.trim())))));
  const porDia = useMemo(() => {
    const m = new Map<string, LancPessoal[]>();
    for (const l of lista.slice(0, 400)) m.set(l.data, [...(m.get(l.data) ?? []), l]);
    return [...m];
  }, [lista]);

  async function gravar(tabela: "pessoal_contas" | "pessoal_lancamentos", linha: Record<string, unknown>, ok: string) {
    const { id, ...resto } = linha;
    const { error } = id ? await supabase.from(tabela).update(resto).eq("id", id as string) : await supabase.from(tabela).insert(resto);
    if (error) { notifyError(/duplicate|unique/i.test(error.message) ? new Error("Esse lançamento já existe nesta conta.") : error); return false; }
    notify(ok);
    invalidar("pessoal_contas", "pessoal_lancamentos");
    return true;
  }
  const anular = (l: LancPessoal) => gravar("pessoal_lancamentos", { id: l.id, anulado: !l.anulado }, l.anulado ? "Lançamento de volta" : "Lançamento anulado");
  const pagar = (l: LancPessoal) => gravar("pessoal_lancamentos", { id: l.id, situacao: "realizado", data: l.data > hoje() ? hoje() : l.data }, "Marcado como pago");
  async function marcarProLabore() {
    const ids = daMFsemCategoria.map((l) => l.id);
    if (!ids.length) return;
    const { error } = await supabase.from("pessoal_lancamentos").update({ categoria: PRO_LABORE }).in("id", ids);
    if (error) return notifyError(error);
    notify(`${ids.length} ${pl(ids.length, "entrada da empresa ficou", "entradas da empresa ficaram")} como pró-labore`);
    invalidar("pessoal_lancamentos");
  }

  // planilha para mostrar ao contador: o resumo dos cards, o que precisa de decisão dele e o que veio da empresa
  async function baixarContador() {
    const noPeriodo = (l: LancPessoal) => !l.anulado && l.situacao === "realizado" && l.data >= faixa.de && l.data <= faixa.ate;
    const linha = (l: LancPessoal, tipo: string, obs: string) => ({
      Data: dataBR(l.data), Conta: nomeConta(l.conta_id)?.nome ?? "", Descrição: l.descricao, "Valor (R$)": Math.abs(Number(l.valor)), Tipo: tipo, Observação: obs,
    });
    const conferir = daConta.filter(noPeriodo).flatMap((l) => {
      const g = GRUPOS_PESSOAIS.find((x) => x.id === grupoDoLanc.get(l.id));
      return g?.aviso ? [linha(l, g.nome, g.aviso)] : [];
    });
    try {
      await baixarPlanilha(`pessoal-para-o-contador-${faixa.de}-a-${faixa.ate}`, [
        { nome: "Resumo por tipo", linhas: grupos.map((g) => ({ Tipo: g.nome, "Total no período (R$)": g.total, Lançamentos: g.qtd, "Período anterior (R$)": g.anterior, "Para o contador": g.aviso ?? "" })) },
        { nome: "Para conferir", linhas: conferir },
        { nome: "Da empresa para você", linhas: daMF.filter(noPeriodo).map((l) => linha(l, l.categoria ?? "", "Pró-labore, distribuição de lucros ou empréstimo? Confirmar com o contador.")) },
      ]);
    } catch (e) { notifyError(e); }
  }

  const rotuloPeriodo = periodo === "mes" ? nomeMes(mes) : periodo === "ano" ? mes.slice(0, 4)
    : passo ? `${nomeMes(somarMesPessoal(mes, 1 - passo))} a ${nomeMes(mes)}` : `${dataBR(faixa.de)} a ${dataBR(faixa.ate)}`;
  const totalCat = resumo.categorias.reduce((t, c) => t + c.valor, 0);
  const catAnt = new Map(resumoAnt.categorias.map((c) => [c.nome, c.valor]));

  return (
    <div>
      <PageHeader title="Painel pessoal" subtitle="Suas contas pessoais, separadas da empresa"
        actions={<>
          <MaisAcoes>
            <Button variant="secondary" onClick={() => setEditConta({ tipo: "corrente", cor: Object.keys(CORES_CONTA)[contas.length % 8], saldo_inicial: 0, saldo_inicial_em: hoje(), ativa: true, ordem: contas.length })}><Landmark size={16} /> Nova conta</Button>
            <Button variant="secondary" onClick={() => setImportar(true)} disabled={!ativas.length}><FileUp size={16} /> Importar extrato (OFX, CSV ou PDF)</Button>
            <Button variant="secondary" onClick={() => setBoleto(true)} disabled={!ativas.length}><Barcode size={16} /> Lançar boleto (DDA)</Button>
          </MaisAcoes>
          <Button onClick={() => setEditLanc({ conta_id: conta || ativas[0]?.id, data: hoje(), situacao: "realizado", valor: undefined })} disabled={!ativas.length}><Plus size={16} /> Lançar</Button>
        </>} />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-900">
        <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>Só você vê este painel. Nada daqui entra no DRE, na conciliação, nos painéis da empresa nem no que vai para o contador. Não precisa de senha do banco: só o nome da conta e o saldo.</span>
      </div>

      {!isLoading && !contas.length ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#7c3aed] text-white"><Wallet size={28} aria-hidden /></span>
          <h2 className="text-lg font-bold text-fg">Cadastre as suas contas</h2>
          <p className="max-w-md text-sm text-slate-600">Conta corrente, poupança, cartão ou investimento: o nome, o banco e o saldo de hoje. Depois é lançar ou importar o extrato do banco.</p>
          <Button onClick={() => setEditConta({ tipo: "corrente", cor: "sky", saldo_inicial: 0, saldo_inicial_em: hoje(), ativa: true, ordem: 0 })}><Plus size={16} /> Primeira conta</Button>
        </Card>
      ) : <>
        {/* período: vale para os números, os gráficos e a lista */}
        <Card className="mb-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Período">
              {PERIODOS_PESSOAIS.map((p) => (
                <button key={p.id} type="button" aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold ${periodo === p.id ? "bg-surface text-fg shadow-card" : "text-slate-600 hover:text-fg"}`}>{p.rotulo}</button>
              ))}
            </div>
            {passo ? (
              <div className="flex items-center gap-1">
                <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Período anterior" onClick={() => setMes(somarMesPessoal(mes, -passo))}><ChevronLeft size={18} /></button>
                <span className="min-w-0 text-sm font-bold text-fg">{rotuloPeriodo}</span>
                <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-40" aria-label="Próximo período"
                  disabled={somarMesPessoal(mes, passo) > hoje().slice(0, 7) && periodo !== "ano"} onClick={() => setMes(somarMesPessoal(mes, passo))}><ChevronRight size={18} /></button>
                {mes !== hoje().slice(0, 7) && <button type="button" className="ml-1 text-xs font-semibold text-brand hover:underline" onClick={() => setMes(hoje().slice(0, 7))}>Hoje</button>}
              </div>
            ) : periodo === "pers" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-1">De <input type="date" className="input w-auto" value={livre.de} onChange={(e) => setLivre({ ...livre, de: e.target.value })} /></label>
                <label className="flex items-center gap-1">até <input type="date" className="input w-auto" value={livre.ate} onChange={(e) => setLivre({ ...livre, ate: e.target.value })} /></label>
              </div>
            ) : <span className="text-sm font-bold text-fg">{rotuloPeriodo}</span>}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            De <b>{dataBR(faixa.de)}</b> a <b>{dataBR(faixa.ate)}</b> · comparado com {dataBR(anterior.de)} a {dataBR(anterior.ate)}
            {conta && <> · só a conta <b>{nomeConta(conta)?.nome}</b> <button type="button" className="font-semibold text-brand hover:underline" onClick={() => setConta("")}>ver todas</button></>}
          </p>
        </Card>

        {daMFsemCategoria.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <Building2 size={18} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {daMFsemCategoria.length} {pl(daMFsemCategoria.length, "entrada veio", "entradas vieram")} da empresa ({brl(daMFsemCategoria.reduce((t, l) => t + Number(l.valor), 0))}) e não {pl(daMFsemCategoria.length, "está", "estão")} como pró-labore.
              <span className="block text-xs text-sky-800">Pró-labore, distribuição de lucros ou empréstimo mudam o imposto: confirmar com o contador.</span>
            </span>
            <Button variant="secondary" onClick={marcarProLabore}><Check size={15} /> Marcar como pró-labore</Button>
          </div>
        )}

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label={`Disponível nas contas · hoje ${dataBR(hoje()).slice(0, 5)}`} valor={brl(disponivel)} icon={Wallet} tom={disponivel < 0 ? "critico" : "bom"} sub={`${ativas.filter((c) => c.tipo !== "cartao").length} ${pl(ativas.filter((c) => c.tipo !== "cartao").length, "conta", "contas")}`} />
          <Stat label="Cartões (fatura em aberto)" valor={brl(-cartoes)} icon={CreditCard} tom={cartoes < 0 ? "atencao" : "neutro"} sub={`${ativas.filter((c) => c.tipo === "cartao").length} ${pl(ativas.filter((c) => c.tipo === "cartao").length, "cartão", "cartões")}`} />
          <Stat label="Da empresa para você · período" valor={brl(daMFperiodo)} icon={Building2} tom="info" sub="Pix e TED da MF nas suas contas (pró-labore ou lucros)" />
          <Stat label="Entrou · período" valor={brl(resumo.entrou)} icon={ArrowUpCircle} tom="info" sub={comparado(resumo.entrou, resumoAnt.entrou) ?? "sem transferências entre as suas contas"} />
          <Stat label="Saiu · período" valor={brl(resumo.saiu)} icon={ArrowDownCircle} tom={resumo.saiu > resumo.entrou ? "atencao" : "neutro"}
            sub={[resumo.entrou ? `${Math.round((resumo.saiu / resumo.entrou) * 100)}% do que entrou` : null, comparado(resumo.saiu, resumoAnt.saiu)].filter(Boolean).join(" · ") || undefined} />
          <Stat label={resumo.resultado >= 0 ? "Sobrou no período" : "Faltou no período"} valor={brl(resumo.resultado)} icon={PiggyBank} tom={resumo.resultado >= 0 ? "bom" : "critico"}
            sub={`gasto médio de ${brl(resumo.mediaDia)} por dia · ${resumo.quantidade} ${pl(resumo.quantidade, "lançamento", "lançamentos")}`} />
        </div>

        {/* gastos por tipo: um card para cada; toque abre os lançamentos dele */}
        <Card className="mb-4 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-start gap-2">
            <div className="mr-auto min-w-0">
              <h2 className="font-bold text-fg">Seus gastos por tipo</h2>
              <p className="text-xs text-slate-500">Pelo texto do extrato · toque num card para ver os lançamentos · <span className="font-semibold text-amber-800">em âmbar: mostrar ao contador</span></p>
            </div>
            <Button variant="secondary" onClick={baixarContador} disabled={!grupos.length && !daMFperiodo}><Download size={15} /> Baixar para o contador</Button>
          </div>
          {!grupos.length ? <p className="text-sm text-slate-500">Nenhum gasto reconhecido no período (financiamento, impostos, plano de saúde, iFood, postos…).</p> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {grupos.map((g) => {
                const { icone: Icone, cor } = VISUAL_GRUPO[g.id];
                const v = pct(g.total, g.anterior);
                return (
                  <button key={g.id} type="button" onClick={() => escolherGrupo(g.id)} aria-pressed={grupo === g.id} title={g.dica}
                    className={`flex min-w-0 flex-col rounded-2xl border p-3 text-left transition hover:shadow-card ${g.aviso ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-surface"} ${grupo === g.id ? "ring-2 ring-brand" : ""} ${g.total ? "" : "opacity-70"}`}>
                    <span className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white" style={{ background: cor }}><Icone size={16} aria-hidden /></span>
                      <span className="line-clamp-2 min-w-0 text-sm font-bold leading-tight text-fg">{g.nome}</span>
                    </span>
                    <span className="num mt-2 text-lg font-bold text-fg">{brl(g.total)}</span>
                    <span className="flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                      <span>{g.qtd} {pl(g.qtd, "lançamento", "lançamentos")}</span>
                      {v != null ? <span className={v > 0 ? "font-semibold text-red-600" : v < 0 ? "font-semibold text-emerald-700" : ""} title={comparado(g.total, g.anterior)}>{v > 0 ? "▲" : v < 0 ? "▼" : "="} {Math.abs(v)}%</span>
                        : g.total > 0 && <span>novo no período</span>}
                    </span>
                    {g.aviso && <span className="mt-1 text-[11px] font-semibold text-amber-800">Mostrar ao contador</span>}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* as contas, cada uma com a sua cor */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {contas.map((c) => {
            const r = resumoPeriodo(lancs.filter((l) => l.conta_id === c.id), faixa);
            const saldo = saldos.get(c.id) ?? 0;
            const ultimo = ultimoLancamento(lancs, c.id);
            return (
              <div key={c.id} className={`overflow-hidden rounded-2xl text-white shadow-card ${c.ativa ? "" : "opacity-60"}`} style={{ background: `linear-gradient(135deg, ${corDe(c.cor)}, #0f172a)` }}>
                <button type="button" onClick={() => setConta(conta === c.id ? "" : c.id)} aria-pressed={conta === c.id}
                  className={`block w-full p-4 text-left ${conta === c.id ? "ring-4 ring-inset ring-white/60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-bold">{c.nome}</div>
                      <div className="truncate text-xs opacity-80">{[NOME_TIPO_CONTA[c.tipo], c.banco].filter(Boolean).join(" · ")}{!c.ativa && " · encerrada"}</div>
                    </div>
                    {c.tipo === "cartao" ? <CreditCard size={20} className="shrink-0 opacity-80" aria-hidden /> : <Landmark size={20} className="shrink-0 opacity-80" aria-hidden />}
                  </div>
                  <div className="num mt-3 text-2xl font-bold">{brl(c.tipo === "cartao" ? -saldo : saldo)}</div>
                  <div className="text-xs opacity-80">{c.tipo === "cartao" ? `fatura em aberto${c.limite ? ` · limite ${brl(c.limite)}` : ""}` : "saldo de hoje"}</div>
                  <div className="mt-2 flex flex-wrap gap-x-3 text-xs"><span>▲ {brl(r.entrou)}</span><span>▼ {brl(r.saiu)}</span><span className="opacity-80">no período</span></div>
                  <div className="mt-1 text-[11px] opacity-80">{ultimo ? `último lançamento em ${dataBR(ultimo)}` : "sem lançamentos"} · saldo inicial em {dataBR(c.saldo_inicial_em)}</div>
                </button>
                <div className="flex border-t border-white/20 text-xs font-semibold">
                  <button type="button" className="flex-1 py-2 hover:bg-white/10" onClick={() => setEditLanc({ conta_id: c.id, data: hoje(), situacao: "realizado" })}>Lançar</button>
                  <button type="button" className="flex-1 border-l border-white/20 py-2 hover:bg-white/10" onClick={() => setEditConta(c)}>Editar</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="min-w-0 p-4">
            <h2 className="font-bold text-fg">Entradas e saídas mês a mês</h2>
            <p className="mb-2 text-xs text-slate-500">12 meses até {nomeMes(serie[serie.length - 1].mes)}, sem transferências entre as suas contas</p>
            <Colunas altura={230} vazio="Sem lançamentos nesses meses."
              dados={serie.map((s) => ({ rotulo: mesCurto(s.mes), valores: [s.entrou, s.saiu] }))}
              series={[{ nome: "Entrou", cor: "var(--serie-3)" }, { nome: "Saiu", cor: "var(--serie-2)" }]} />
          </Card>
          <Card className="min-w-0 p-4">
            <h2 className="font-bold text-fg">Saldo {conta ? `de ${nomeConta(conta)?.nome}` : "das contas"} no período</h2>
            <p className="mb-2 text-xs text-slate-500">{saldoNoTempo.length > 100 || (saldoNoTempo.length && saldoNoTempo.length < 20 && periodo !== "mes" && periodo !== "pers") ? "no fim de cada mês" : "dia a dia"}, sem os cartões{faixa.ate > hoje() ? ` · até hoje (${dataBR(hoje())})` : ""}</p>
            {saldoNoTempo.length < 2 ? <p className="py-10 text-center text-sm text-slate-500">Sem saldo para mostrar neste período.</p> : (
              <Area altura={230} series={[{ nome: "Saldo", cor: "var(--serie-1)" }]}
                dados={saldoNoTempo.map((p) => ({ rotulo: saldoNoTempo.length > 40 && !p.dia.endsWith("-01") && p.dia !== saldoNoTempo[saldoNoTempo.length - 1].dia ? dataBR(p.dia).slice(0, 5) : dataBR(p.dia).slice(0, 5), valores: [p.saldo] }))} />
            )}
          </Card>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="min-w-0 p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold text-fg">Para onde foi o dinheiro</h2>
              {categoria && <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" onClick={() => setCategoria("")}><X size={12} /> tirar o filtro {categoria}</button>}
            </div>
            {!resumo.categorias.length ? <p className="text-sm text-slate-500">Nenhuma saída no período.</p> : (
              <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
                <Rosca total="Saiu" ativo={categoria || null} onClicar={(i) => setCategoria(resumo.categorias[i].nome === categoria ? "" : resumo.categorias[i].nome)}
                  fatias={resumo.categorias.map((c, i) => ({ rotulo: c.nome, valor: c.valor, cor: CORES_BARRA[i % CORES_BARRA.length] }))} />
                <ul className="space-y-2">
                  {resumo.categorias.map((c, i) => {
                    const ant = catAnt.get(c.nome) ?? 0;
                    const v = pct(c.valor, ant);
                    return (
                      <li key={c.nome}>
                        <button type="button" onClick={() => setCategoria(categoria === c.nome ? "" : c.nome)} aria-pressed={categoria === c.nome} className="block w-full text-left">
                          <div className="flex justify-between gap-2 text-sm"><span className="font-semibold text-fg">{c.nome}</span><span className="num">{brl(c.valor)}</span></div>
                          <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.max(2, (c.valor / Math.max(1, resumo.categorias[0].valor)) * 100)}%`, background: CORES_BARRA[i % CORES_BARRA.length] }} /></div>
                          <div className="mt-0.5 flex justify-between text-[11px] text-slate-500">
                            <span>{Math.round((c.valor / Math.max(1, totalCat)) * 100)}% do que saiu</span>
                            <span>{v == null ? (ant === 0 ? "novo no período" : "") : `${v > 0 ? "▲" : v < 0 ? "▼" : ""} ${Math.abs(v)}% do anterior`}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
          <Card className="min-w-0 p-4">
            <h2 className="mb-3 font-bold text-fg">Maiores gastos do período</h2>
            <Ranking vazio="Nenhuma saída no período."
              itens={resumo.maiores.map((l) => ({ rotulo: l.descricao, valor: -Number(l.valor), detalhe: `${dataBR(l.data)} · ${nomeConta(l.conta_id)?.nome ?? ""}${l.categoria ? ` · ${l.categoria}` : ""}` }))} />
          </Card>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="min-w-0 p-4">
            <h2 className="mb-3 font-bold text-fg">Por conta no período</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 font-semibold">Conta</th><th className="py-1 text-right font-semibold">Entrou</th><th className="py-1 text-right font-semibold">Saiu</th><th className="py-1 text-right font-semibold">Saldo hoje</th><th className="py-1 text-right font-semibold">Último</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {contas.filter((c) => c.ativa).map((c) => {
                    const r = resumoPeriodo(lancs.filter((l) => l.conta_id === c.id), faixa);
                    const s = saldos.get(c.id) ?? 0;
                    const u = ultimoLancamento(lancs, c.id);
                    return (
                      <tr key={c.id}>
                        <td className="py-1.5"><span className="inline-flex items-center gap-1.5 font-semibold text-fg"><span className="h-2.5 w-2.5 rounded-full" style={{ background: corDe(c.cor) }} aria-hidden />{c.nome}</span></td>
                        <td className="num py-1.5 text-right text-emerald-700">{brl(r.entrou)}</td>
                        <td className="num py-1.5 text-right text-red-600">{brl(r.saiu)}</td>
                        <td className="num py-1.5 text-right font-semibold">{brl(c.tipo === "cartao" ? -s : s)}</td>
                        <td className="py-1.5 text-right text-xs text-slate-500">{u ? dataBR(u) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="min-w-0 p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-fg"><CalendarClock size={18} aria-hidden /> Próximos 30 dias <span className="text-sm font-normal text-slate-500">· previstos</span></h2>
            {!prox.length ? <p className="text-sm text-slate-500">Nada previsto. Lance as contas a pagar (ou o boleto do DDA) como "previsto" para elas aparecerem aqui.</p> : (
              <ul className="divide-y divide-slate-100">
                {prox.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-20 shrink-0 text-xs font-semibold text-slate-500">{dataBR(l.data)}</span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDe(nomeConta(l.conta_id)?.cor) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-fg">{l.descricao}</span>
                    <span className={`num shrink-0 font-semibold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</span>
                    <button type="button" onClick={() => pagar(l)} className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100" title="Já foi pago ou recebido">
                      <Check size={13} className="inline" aria-hidden /> Feito
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div id="lancamentos-pessoais" className="mb-2 flex scroll-mt-4 flex-wrap items-center gap-2">
          <h2 className="mr-auto font-bold text-fg">Lançamentos <span className="text-sm font-normal text-slate-500">· {rotuloPeriodo}{conta ? ` · ${nomeConta(conta)?.nome}` : ""}{categoria ? ` · ${categoria}` : ""}{grupoSel ? ` · ${grupoSel.nome}` : ""} · {lista.length}</span></h2>
          <label className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input w-full pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lançamento" aria-label="Buscar lançamento" />
          </label>
          {(conta || categoria || grupo) && <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => { setConta(""); setCategoria(""); setGrupo(""); }}>Tirar os filtros</button>}
        </div>
        {grupoSel?.aviso && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="min-w-0 flex-1 basis-64"><b>{grupoSel.nome}:</b> {grupoSel.aviso}</span>
            {grupoSel.id === "impostos" && <span className="text-xs">Use <b>Lançar na MF</b> em cada imposto que for da empresa.</span>}
            {grupoSel.id === "empresas" && <Link to="/partes-relacionadas" className="text-xs font-semibold text-brand hover:underline">Ver o lado da empresa em Entre contas e sócios →</Link>}
          </div>
        )}
        <Card className="overflow-hidden">
          {!lista.length ? <p className="p-4 text-sm text-slate-500">Nenhum lançamento no período.</p> : (
            <div>
              {porDia.map(([dia, itens]) => {
                const liquido = itens.filter((l) => !l.anulado && l.situacao === "realizado").reduce((t, l) => t + Number(l.valor), 0);
                return (
                  <section key={dia} aria-label={diaLongo(dia)}>
                    <div className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-1.5 text-xs font-bold text-slate-600">
                      <span className="capitalize">{diaLongo(dia)}{dia > hoje() ? " · futuro" : dia === hoje() ? " · hoje" : ""}</span>
                      <span className={`num ${liquido < 0 ? "text-red-600" : liquido > 0 ? "text-emerald-700" : ""}`}>{brl(liquido)}</span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {itens.map((l) => {
                        const c = nomeConta(l.conta_id);
                        return (
                          <li key={l.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${l.anulado ? "opacity-50" : ""}`}>
                            <span className="min-w-0 flex-1 basis-48">
                              <span className={`block truncate font-semibold text-fg ${l.anulado ? "line-through" : ""}`}>{l.descricao}</span>
                              <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: corDe(c?.cor) }} aria-hidden />{c?.nome ?? "—"}</span>
                                {l.categoria && <button type="button" className="rounded bg-slate-100 px-1.5 hover:bg-slate-200" onClick={() => setCategoria(l.categoria ?? "")}>{l.categoria}</button>}
                                {l.valor > 0 && daEmpresa(l.descricao, empresa) && <span className="rounded bg-sky-100 px-1.5 text-sky-800">da empresa</span>}
                                {l.situacao === "previsto" && <span className="rounded bg-amber-100 px-1.5 text-amber-800">previsto</span>}
                                {l.anulado && <span className="rounded bg-slate-200 px-1.5">anulado</span>}
                              </span>
                            </span>
                            <span className={`num shrink-0 font-bold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</span>
                            <span className="flex shrink-0 items-center gap-1">
                              {grupoDoLanc.get(l.id) === "impostos" && !l.anulado && (
                                <button type="button" onClick={() => lancarNaMF(l)} title="Imposto da MF pago daqui: abre Contas a pagar da empresa já preenchido"
                                  className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">Lançar na MF</button>
                              )}
                              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => setEditLanc(l)} aria-label={`Editar ${l.descricao}`}><Pencil size={15} /></button>
                              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => anular(l)}
                                aria-label={l.anulado ? `Trazer de volta ${l.descricao}` : `Anular ${l.descricao}`} title={l.anulado ? "Trazer de volta" : "Anular (não conta no saldo)"}>{l.anulado ? <Undo2 size={15} /> : <span className="text-base leading-none">⊘</span>}</button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {lista.length > 400 && <p className="px-4 py-2 text-xs text-slate-500">Mostrando os 400 mais recentes de {lista.length}. Escolha um período menor ou busque pelo nome.</p>}
            </div>
          )}
        </Card>
      </>}

      {editConta && <ContaModal conta={editConta} onClose={() => setEditConta(null)} onGravar={async (c) => (await gravar("pessoal_contas", c, c.id ? "Conta alterada" : "Conta criada")) && setEditConta(null)} />}
      {editLanc && <LancModal lanc={editLanc} contas={ativas} onClose={() => setEditLanc(null)} onGravar={async (l) => (await gravar("pessoal_lancamentos", l, l.id ? "Lançamento alterado" : "Lançado")) && setEditLanc(null)} />}
      {importar && <ImportarModal contas={ativas} empresa={empresa} onClose={() => setImportar(false)} onFeito={() => { invalidar("pessoal_lancamentos"); setImportar(false); }} />}
      {boleto && <BoletoModal contas={ativas} onClose={() => setBoleto(false)} onGravar={async (l) => (await gravar("pessoal_lancamentos", l, "Boleto lançado como previsto")) && setBoleto(false)} />}
    </div>
  );
}

/** Boleto do DDA (ou qualquer boleto): cola a linha digitável e vira conta prevista com o valor e o vencimento. */
function BoletoModal({ contas, onClose, onGravar }: { contas: ContaPessoal[]; onClose: () => void; onGravar: (l: Record<string, unknown>) => void }) {
  const [texto, setTexto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valorTxt, setValorTxt] = useState("");
  const [venc, setVenc] = useState("");
  const [contaId, setContaId] = useState(contas.find((c) => c.tipo !== "cartao")?.id ?? contas[0]?.id ?? "");
  const b = texto.replace(/\D/g, "").length >= 44 ? lerBoleto(texto) : null;
  useEffect(() => {
    if (!b) return;
    if (b.valor != null) setValorTxt(String(b.valor).replace(".", ","));
    if (b.vencimento) setVenc(b.vencimento);
    setDescricao((d) => d || `Boleto ${b.bancoNome ?? (b.tipo === "arrecadacao" ? "de conta de consumo ou imposto" : "")}`.trim());
  }, [b?.linha]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const v = numeroBR(valorTxt);
    if (!b) return notifyError(new Error("Cole a linha digitável ou o código de barras do boleto"));
    if (!v) return notifyError(new Error("Informe o valor"));
    if (!venc) return notifyError(new Error("Informe o vencimento"));
    const desc = descricao.trim() || "Boleto";
    onGravar({ conta_id: contaId, data: venc, descricao: desc.slice(0, 200), valor: -Math.abs(v), categoria: categoriaDe(desc), situacao: "previsto", identificador: `boleto-${b.linha}`.slice(0, 200) });
  };
  return (
    <Modal open onClose={onClose} title="Lançar boleto (DDA)">
      <form onSubmit={enviar} className="space-y-3">
        <p className="text-sm text-slate-600">Abra o DDA no aplicativo do banco, copie a linha digitável do boleto e cole aqui. Ele entra como <b>previsto</b> no vencimento e aparece em Próximos 30 dias; depois é só marcar como feito.</p>
        <Field label="Linha digitável ou código de barras"><input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui" autoFocus inputMode="numeric" /></Field>
        {b && (
          <div className={`rounded-xl px-3 py-2 text-sm ${b.valido ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {b.valido ? "Boleto lido" : "Confira os números"}: {b.bancoNome ?? (b.tipo === "arrecadacao" ? "conta de consumo ou imposto" : "banco não identificado")}
            {b.valor != null && <> · {brl(b.valor)}</>}{b.vencimento && <> · vence {dataBR(b.vencimento)}</>}
            {!b.valido && b.erros.length > 0 && <span className="block text-xs">{b.erros.join("; ")}</span>}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Descrição" className="sm:col-span-2"><input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} placeholder="Ex.: Condomínio, escola, IPTU" /></Field>
          <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} placeholder="0,00" /></Field>
          <Field label="Vencimento"><input className="input" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} /></Field>
          <Field label="Pagar pela conta" className="sm:col-span-2">
            <select className="input" value={contaId} onChange={(e) => setContaId(e.target.value)}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </Field>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!b}>Lançar como previsto</Button></div>
      </form>
    </Modal>
  );
}

function ContaModal({ conta, onClose, onGravar }: { conta: Partial<ContaPessoal>; onClose: () => void; onGravar: (c: Record<string, unknown>) => void }) {
  const [c, setC] = useState({ ...conta, saldo_txt: conta.saldo_inicial != null ? String(conta.saldo_inicial).replace(".", ",") : "0", limite_txt: conta.limite != null ? String(conta.limite).replace(".", ",") : "" });
  const set = (k: string, v: unknown) => setC((x) => ({ ...x, [k]: v }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onGravar({
      id: conta.id, nome: String(c.nome ?? "").trim(), tipo: c.tipo, banco: String(c.banco ?? "").trim() || null, cor: c.cor,
      saldo_inicial: numeroBR(c.saldo_txt) ?? 0, saldo_inicial_em: c.saldo_inicial_em, limite: c.tipo === "cartao" ? numeroBR(c.limite_txt) : null,
      ativa: c.ativa !== false, ordem: c.ordem ?? 0,
    });
  };
  return (
    <Modal open onClose={onClose} title={conta.id ? "Editar conta" : "Nova conta pessoal"}>
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome (como você chama a conta)"><input className="input" value={c.nome ?? ""} onChange={(e) => set("nome", e.target.value)} required minLength={2} maxLength={60} placeholder="Ex.: Nubank pessoal" autoFocus /></Field>
          <Field label="Banco"><input className="input" value={c.banco ?? ""} onChange={(e) => set("banco", e.target.value)} maxLength={60} placeholder="Ex.: Nubank, Itaú, Inter" /></Field>
          <Field label="Tipo">
            <select className="input" value={c.tipo} onChange={(e) => set("tipo", e.target.value as TipoConta)}>{TIPOS_CONTA.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
          </Field>
          <Field label={c.tipo === "cartao" ? "Fatura em aberto hoje (R$)" : "Saldo de hoje (R$)"}><input className="input" inputMode="decimal" value={c.saldo_txt} onChange={(e) => set("saldo_txt", e.target.value)} placeholder="0,00" /></Field>
          <Field label="Saldo na data de"><input className="input" type="date" value={c.saldo_inicial_em ?? hoje()} onChange={(e) => set("saldo_inicial_em", e.target.value)} required /></Field>
          {c.tipo === "cartao" && <Field label="Limite do cartão (R$)"><input className="input" inputMode="decimal" value={c.limite_txt} onChange={(e) => set("limite_txt", e.target.value)} placeholder="opcional" /></Field>}
        </div>
        {c.tipo === "cartao" && <p className="text-xs text-slate-500">No cartão, informe a fatura como número positivo; as compras entram como saída e o pagamento da fatura como entrada no cartão.</p>}
        <Field label="Cor">
          <div className="flex flex-wrap gap-2">
            {Object.entries(CORES_CONTA).map(([nome, hex]) => (
              <button key={nome} type="button" onClick={() => set("cor", nome)} aria-label={`Cor ${nome}`} aria-pressed={c.cor === nome}
                className={`h-8 w-8 rounded-full ${c.cor === nome ? "ring-4 ring-brand/50" : ""}`} style={{ background: hex }} />
            ))}
          </div>
        </Field>
        {conta.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.ativa === false} onChange={(e) => set("ativa", !e.target.checked)} /> Conta encerrada (fica no histórico)</label>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}

function LancModal({ lanc, contas, onClose, onGravar }: { lanc: Partial<LancPessoal>; contas: ContaPessoal[]; onClose: () => void; onGravar: (l: Record<string, unknown>) => void }) {
  const [l, setL] = useState({ ...lanc, sentido: (lanc.valor ?? -1) < 0 ? "saida" : "entrada", valor_txt: lanc.valor != null ? String(Math.abs(lanc.valor)).replace(".", ",") : "" });
  const set = (k: string, v: unknown) => setL((x) => ({ ...x, [k]: v }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const v = numeroBR(l.valor_txt);
    if (!v) return notifyError(new Error("Informe o valor"));
    const descricao = String(l.descricao ?? "").trim();
    onGravar({
      id: lanc.id, conta_id: l.conta_id, data: l.data, descricao, valor: l.sentido === "saida" ? -Math.abs(v) : Math.abs(v),
      categoria: l.categoria || categoriaDe(descricao), situacao: l.situacao ?? "realizado",
    });
  };
  return (
    <Modal open onClose={onClose} title={lanc.id ? "Editar lançamento" : "Lançar"}>
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Entrada ou saída">
          {([["saida", "Saída (gastei)", "bg-solido-vermelho"], ["entrada", "Entrada (recebi)", "bg-solido-verde"]] as const).map(([v, nome, cor]) => (
            <button key={v} type="button" aria-pressed={l.sentido === v} onClick={() => set("sentido", v)}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold ${l.sentido === v ? `${cor} text-white` : "bg-slate-100 text-slate-600"}`}>{nome}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Descrição" className="sm:col-span-2"><input className="input" value={l.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} required maxLength={200} autoFocus placeholder="Ex.: Mercado, aluguel, pró-labore" /></Field>
          <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={l.valor_txt} onChange={(e) => set("valor_txt", e.target.value)} required placeholder="0,00" /></Field>
          <Field label="Data"><input className="input" type="date" value={l.data ?? hoje()} onChange={(e) => set("data", e.target.value)} required /></Field>
          <Field label="Conta">
            <select className="input" value={l.conta_id ?? ""} onChange={(e) => set("conta_id", e.target.value)} required>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </Field>
          <Field label="Categoria">
            <select className="input" value={l.categoria ?? ""} onChange={(e) => set("categoria", e.target.value)}>
              <option value="">Automática ({categoriaDe(l.descricao)})</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.situacao === "previsto"} onChange={(e) => set("situacao", e.target.checked ? "previsto" : "realizado")} /> Ainda vai acontecer (previsto: não mexe no saldo até marcar como feito)</label>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}

function ImportarModal({ contas, empresa, onClose, onFeito }: { contas: ContaPessoal[]; empresa: Empresa; onClose: () => void; onFeito: () => void }) {
  const [conta, setConta] = useState(contas[0]?.id ?? "");
  const [linhas, setLinhas] = useState<{ data: string; valor: number; descricao: string; identificador: string }[] | null>(null);
  const [nome, setNome] = useState("");
  const [gravando, setGravando] = useState(false);
  const [pdf, setPdf] = useState<{ ignoradas: number } | null>(null);
  async function ler(f: File | undefined) {
    if (!f) return;
    try {
      setNome(f.name);
      // PDF (Itaú e outros que só entregam assim): lido aqui no navegador, o arquivo não sai do aparelho
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        const r = await lerExtratoPdf(f);
        setPdf({ ignoradas: r.ignoradas });
        setLinhas(r.linhas);
        return;
      }
      setPdf(null);
      const r = await lerExtrato(f);
      setLinhas(r.linhas.filter((x) => x.valor && x.data).map((x) => ({ data: x.data, valor: x.valor, descricao: x.descricao || "Lançamento do extrato", identificador: x.identificador })));
    } catch (e) { notifyError(e); }
  }
  async function gravar() {
    if (!linhas?.length || !conta) return;
    setGravando(true);
    const novas = linhas.map((x) => ({ conta_id: conta, data: x.data, descricao: x.descricao.slice(0, 200), valor: x.valor, categoria: x.valor > 0 && daEmpresa(x.descricao, empresa) ? PRO_LABORE : categoriaDe(x.descricao), situacao: "realizado", identificador: x.identificador.slice(0, 200) }));
    const { error } = await supabase.from("pessoal_lancamentos").upsert(novas, { onConflict: "conta_id,identificador", ignoreDuplicates: true });
    setGravando(false);
    if (error) return notifyError(error);
    notify(`Extrato importado: ${novas.length} ${pl(novas.length, "linha lida", "linhas lidas")} (as que já existiam não entram de novo)`);
    onFeito();
  }
  const entradas = (linhas ?? []).filter((x) => x.valor > 0).reduce((t, x) => t + x.valor, 0);
  const saidas = -(linhas ?? []).filter((x) => x.valor < 0).reduce((t, x) => t + x.valor, 0);
  return (
    <Modal open onClose={onClose} title="Importar extrato pessoal">
      <div className="space-y-3">
        <Field label="Conta"><select className="input" value={conta} onChange={(e) => setConta(e.target.value)}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
        <Field label="Arquivo do banco (OFX, CSV ou PDF)"><input type="file" accept=".ofx,.csv,.txt,.pdf,application/pdf" className="input" onChange={(e) => ler(e.target.files?.[0])} /></Field>
        {linhas && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <b>{nome}</b>: {linhas.length} {pl(linhas.length, "lançamento", "lançamentos")} · entradas {brl(entradas)} · saídas {brl(saidas)}.
            <div className="mt-1 text-xs text-slate-500">A categoria vem do texto de cada linha; dá para trocar depois. Importar o mesmo extrato de novo não repete nada.</div>
          </div>
        )}
        {linhas && pdf && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <b>Extrato em PDF:</b> confira as primeiras linhas antes de importar{pdf.ignoradas ? ` (${pdf.ignoradas} linhas de saldo e totais ficaram de fora)` : ""}.
            {linhas.length === 0 && <span className="block">Nenhum lançamento reconhecido: o PDF pode ser de outro modelo. Use o OFX do banco, se houver.</span>}
            <ul className="mt-2 max-h-48 divide-y divide-amber-200 overflow-y-auto text-xs">
              {linhas.slice(0, 30).map((x) => (
                <li key={x.identificador} className="flex gap-2 py-1"><span className="num shrink-0">{dataBR(x.data)}</span><span className="min-w-0 flex-1 truncate">{x.descricao}</span>
                  <span className={`num shrink-0 font-semibold ${x.valor < 0 ? "text-red-700" : "text-emerald-700"}`}>{brl(x.valor)}</span></li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={gravar} disabled={!linhas?.length || gravando}>{gravando ? "Importando…" : "Importar"}</Button></div>
      </div>
    </Modal>
  );
}
