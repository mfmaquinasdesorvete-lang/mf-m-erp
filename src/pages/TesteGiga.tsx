// Teste do giga (registro de qualidade REG-006), na área das máquinas: lançamento rápido na bancada, painel,
// registros (planilha e PDF no formato do papel), os limites dos testes e o manual do equipamento (HG371). Técnico e administrador lançam;
// o financeiro vê o painel e os registros. Tudo grava pelas funções do banco, com auditoria.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Factory, LayoutDashboard } from "lucide-react";
import { Button, PageHeader, Tabs } from "@/components/ui";
import { LancarTeste, type Preenchido } from "@/components/testeGiga/LancarTeste";
import { PainelGiga } from "@/components/testeGiga/PainelGiga";
import { RegistrosGiga } from "@/components/testeGiga/RegistrosGiga";
import { ParametrosGiga } from "@/components/testeGiga/ParametrosGiga";
import { ManualGiga } from "@/components/testeGiga/ManualGiga";
import { RetesteGiga, useRetestesGiga } from "@/components/testeGiga/RetesteGiga";
import type { ContextoGiga, OpGiga } from "@/components/testeGiga/tipos";
import { useAbaUrl } from "@/lib/abaUrl";
import { usePerfil } from "@/lib/auth";
import { useRows } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { textoPadrao } from "@/lib/textosPadrao";
import { diaBrasil, validos, type FiltroTestes, type TesteGiga } from "@/lib/testeGiga";
import { MSG_SEM_BANCO, useParametrosGiga, useTestesGiga } from "@/lib/testeGigaDados";
import type { Produto } from "@/lib/types";

type Aba = "lancar" | "painel" | "registros" | "reteste" | "parametros" | "manual";
const nomeDaMaquina = (p?: Produto | null) => p?.modelo?.trim() || p?.descricao || "Máquina";

export default function TesteGiga() {
  const { pode, papel } = usePerfil();
  const podeLancar = pode("lancar_teste_giga");
  const navigate = useNavigate();
  const location = useLocation();
  const abas: Aba[] = podeLancar ? ["lancar", "painel", "registros", "reteste", "parametros", "manual"] : ["painel", "registros", "reteste", "parametros", "manual"];
  const [aba, setAba] = useAbaUrl<Aba>(podeLancar ? "lancar" : "painel", abas);
  const { data: cfg } = useConfig();
  const testesQ = useTestesGiga();
  const parQ = useParametrosGiga();
  const retQ = useRetestesGiga();
  const semEnsaio = (retQ.data ?? []).filter((r) => r.situacao === "pendente").length;
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: ops = [] } = useRows<OpGiga>("ordens_producao", {
    select: "id, numero, produto_id, status, numeros_serie, unidade_id, concluida_em", order: "numero", key: ["teste_giga"],
  });

  // vindo da OP ("Lançar teste") ou de "Lançar reteste": abre o lançamento já preenchido
  const [preenchido, setPreenchido] = useState<Preenchido | null>(() => (location.state as { giga?: Preenchido } | null)?.giga ?? null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    if ((location.state as { giga?: unknown } | null)?.giga) navigate(location.pathname + location.search, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [filtroReg, setFiltroReg] = useState<FiltroTestes | null>(null);
  const [versaoReg, setVersaoReg] = useState(0);

  const testes = useMemo(() => testesQ.data?.linhas ?? [], [testesQ.data]);
  const maquinas = useMemo(() => {
    const testadas = new Set(testes.map((t) => t.produto_id));
    return produtos.filter((p) => p.tipo === "maquina" && (p.ativo !== false || testadas.has(p.id)))
      .sort((a, b) => nomeDaMaquina(a).localeCompare(nomeDaMaquina(b), "pt-BR"));
  }, [produtos, testes]);
  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const nomeMaquina = useCallback((id: string) => nomeDaMaquina(porId.get(id)), [porId]);
  const opsMaquinas = useMemo(() => ops.filter((o) => porId.get(o.produto_id)?.tipo === "maquina"), [ops, porId]);

  const ctx: ContextoGiga = { testes, maquinas, nomeMaquina, ops: opsMaquinas, parametros: parQ.data ?? [], podeLancar };
  const hoje = diaBrasil(new Date().toISOString());
  const testesHoje = validos(testes).filter((t) => diaBrasil(t.testado_em) === hoje).length;

  const reteste = (t: TesteGiga) => {
    setPreenchido({ produto_id: t.produto_id, numero_serie: t.numero_serie, ordem_producao_id: t.ordem_producao_id ?? null });
    setVersao((v) => v + 1);
    setAba("lancar");
  };
  const lancarDoReteste = (p: Preenchido) => { setPreenchido(p); setVersao((v) => v + 1); setAba("lancar"); };
  const verRegistros = (f: Partial<FiltroTestes>) => { setFiltroReg(f); setVersaoReg((v) => v + 1); setAba("registros"); };

  return (
    <div>
      <PageHeader title="Teste do giga"
        subtitle="Registro de qualidade REG-006: cada máquina passa pelos testes funcional, de continuidade do aterramento e de tensão suportável antes de sair da fábrica."
        actions={<>
          <Button variant="secondary" onClick={() => navigate("/produtos/maquinas")}><Factory size={16} /> Máquinas</Button>
          <Button variant="secondary" onClick={() => navigate("/painel/maquinas")}><LayoutDashboard size={16} /> Painel das máquinas</Button>
        </>} />

      <Tabs value={aba} onChange={setAba} options={[
        ...(podeLancar ? [{ value: "lancar" as const, label: testesHoje ? `Lançar teste (${testesHoje} hoje)` : "Lançar teste" }] : []),
        { value: "painel" as const, label: "Painel" },
        { value: "registros" as const, label: `Registros${validos(testes).length ? ` (${validos(testes).length})` : ""}` },
        { value: "reteste" as const, label: semEnsaio ? `Reteste (${semEnsaio})` : "Reteste" },
        { value: "parametros" as const, label: "Parâmetros" },
        { value: "manual" as const, label: "Manual do HG371" },
      ]} />

      {testesQ.data?.semBanco && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {MSG_SEM_BANCO}
        </p>
      )}
      {testesQ.isLoading ? <p className="py-8 text-center text-slate-500">Carregando os testes…</p> : <>
        {aba === "lancar" && podeLancar && <LancarTeste key={versao} ctx={ctx} inicial={preenchido} onVerRegistros={() => verRegistros({})} />}
        {aba === "painel" && <PainelGiga ctx={ctx} onReteste={reteste} onVerRegistros={verRegistros} />}
        {aba === "registros" && <RegistrosGiga key={versaoReg} ctx={ctx} filtroInicial={filtroReg} onReteste={reteste} />}
        {aba === "reteste" && <RetesteGiga ctx={ctx} onLancar={lancarDoReteste} />}
        {aba === "parametros" && (parQ.isLoading ? <p className="py-8 text-center text-slate-500">Carregando…</p>
          : <ParametrosGiga ctx={ctx} admin={papel === "admin"} revisao={textoPadrao(cfg, "reg006_revisao")} />)}
        {aba === "manual" && <ManualGiga ctx={ctx} admin={papel === "admin"} />}
      </>}
    </div>
  );
}
