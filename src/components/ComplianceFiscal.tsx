// Notas fiscais → Compliance fiscal: pendências que dão rejeição ou risco na fiscalização,
// e o acompanhamento da reforma tributária (IBS/CBS).
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Landmark, ShieldAlert } from "lucide-react";
import { Card, Section } from "./ui";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR } from "@/lib/format";
import { buracosNumeracao, conferirCliente, conferirProduto, conferirUnidade, REFORMA, TESTE_2026, type Pendencia } from "@/lib/compliance";
import type { Cliente, Produto } from "@/lib/types";

type Nota = { id: string; status: string; numero: string | null; serie: string | null; unidade_id: string | null; valor_total: number; created_at: string; mensagem: string | null; payload?: { items?: Record<string, number>[] } | null };
type Recebida = { id: string; emitente_nome: string; valor_total: number; data_emissao: string | null; manifestacao: string | null; situacao: string | null; origem: string | null; processamento: string | null };

type Grupo = { titulo: string; itens: Pendencia[]; ok: string };

export function ComplianceFiscal() {
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { data: clientes = [] } = useRows<Cliente>("clientes", { order: "nome", ascending: true });
  const { data: pedidos = [] } = useRows<{ cliente_id: string; created_at: string; status: string }>("pedidos", { select: "cliente_id, created_at, status" });
  const { data: notas = [] } = useRows<Nota>("notas_fiscais", {});
  const { data: recebidas = [] } = useRows<Recebida>("nfe_recebidas", { select: "id, emitente_nome, valor_total, data_emissao, manifestacao, situacao, origem, processamento" });
  const { data: ufs = [] } = useRows<{ uf: string; aliquota_interna: number }>("icms_uf", { order: "uf", ascending: true });
  const { unidades, nome } = useUnidade();

  const grupos: Grupo[] = useMemo(() => {
    const ativos = produtos.filter((p) => p.ativo && p.vendavel !== false && !p.kit);
    const fabrica = unidades.some((u) => u.fabrica);
    // clientes que compraram nos últimos 12 meses ou têm orçamento aberto
    const limite = new Date(Date.now() - 365 * 864e5).toISOString();
    const comMovimento = new Set(pedidos.filter((p) => p.created_at >= limite || p.status === "orcamento").map((p) => p.cliente_id));
    const hoje = Date.now();
    const recebidasPend: Pendencia[] = recebidas
      // XML importado (a MF já tem a nota) e histórico do sistema anterior não pedem manifestação aqui
      .filter((n) => n.situacao !== "cancelada" && n.origem !== "xml" && n.processamento !== "ignorada" && n.data_emissao && !["confirmacao", "desconhecimento", "nao_realizada"].includes(n.manifestacao ?? ""))
      .map((n) => ({ n, dias: Math.floor((hoje - new Date(n.data_emissao!).getTime()) / 864e5) }))
      .filter((x) => x.dias > 30)
      .map(({ n, dias }) => ({ nivel: dias > 150 ? "erro" as const : "alerta" as const,
        texto: `${n.emitente_nome} · ${brl(n.valor_total)} · emitida há ${dias} dias sem manifestação conclusiva (prazo: 180 dias)` }));
    return [
      { titulo: "Unidades (CNPJ emitente)", itens: unidades.flatMap(conferirUnidade), ok: "CNPJ, IE e endereço das unidades conferem" },
      { titulo: "Produtos", itens: ativos.flatMap((p) => conferirProduto(p, fabrica)), ok: "Todos os produtos à venda têm NCM válido" },
      { titulo: "Clientes com movimento", itens: clientes.filter((c) => comMovimento.has(c.id)).flatMap(conferirCliente), ok: "Cadastros dos clientes prontos para NF-e" },
      { titulo: "NF-e emitidas", ok: "Nenhuma nota com erro ou na fila",
        itens: notas.filter((n) => ["erro", "contingencia", "denegada"].includes(n.status)).map((n) => ({
          nivel: n.status === "contingencia" ? "alerta" as const : "erro" as const,
          texto: `${dataBR(n.created_at)} · ${brl(n.valor_total)} · ${n.status === "contingencia" ? "na fila de contingência" : n.status === "denegada" ? "DENEGADA (problema no cadastro do destinatário na SEFAZ)" : `rejeitada: ${n.mensagem ?? ""}`}` })) },
      { titulo: "Numeração da NF-e", ok: "Sem números pulados",
        itens: buracosNumeracao(notas.filter((n) => n.status !== "erro")).map((b) => ({ nivel: "alerta" as const,
          texto: `${nome(b.unidade_id)} série ${b.serie}: números ${b.faltando.slice(0, 12).join(", ")}${b.faltando.length > 12 ? "…" : ""} não foram usados. Inutilize até o dia 10 do mês seguinte (botão Inutilizar numeração).` })) },
      { titulo: "NF-e de fornecedores", itens: recebidasPend, ok: "Manifestações em dia" },
      { titulo: "DIFAL (tabela de alíquotas por UF)", ok: "Tabela de UF preenchida",
        itens: ufs.length < 27 ? [{ nivel: "alerta" as const, texto: `Só ${ufs.length} de 27 UFs com alíquota interna/FCP cadastrada: vendas para consumidor final dessas UFs saem sem DIFAL correto.` }] : [] },
    ];
  }, [produtos, clientes, pedidos, notas, recebidas, ufs, unidades, nome]);

  const erros = grupos.reduce((s, g) => s + g.itens.filter((i) => i.nivel === "erro").length, 0);
  const alertas = grupos.reduce((s, g) => s + g.itens.filter((i) => i.nivel === "alerta").length, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className={`grid h-11 w-11 place-items-center rounded-xl ${erros ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>{erros ? <ShieldAlert size={22} /> : <CheckCircle2 size={22} />}</span>
          <div><div className="num text-2xl font-bold text-fg">{erros}</div><div className="text-sm text-slate-500">impedem a emissão ou geram rejeição</div></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700"><AlertTriangle size={22} /></span>
          <div><div className="num text-2xl font-bold text-fg">{alertas}</div><div className="text-sm text-slate-500">alertas para conferir</div></div>
        </Card>
        <Card className="p-4 text-sm text-slate-600">
          O ERP também faz esta conferência na hora de emitir cada nota: com erro, a emissão é bloqueada e mostra o que corrigir.
        </Card>
      </div>

      <div className="space-y-2">
        {grupos.map((g) => <GrupoPendencias key={g.titulo} g={g} />)}
      </div>

      <Reforma notas={notas} />
    </div>
  );
}

function GrupoPendencias({ g }: { g: Grupo }) {
  const [aberto, setAberto] = useState(g.itens.some((i) => i.nivel === "erro"));
  const e = g.itens.filter((i) => i.nivel === "erro").length;
  const a = g.itens.length - e;
  return (
    <div className="rounded-xl border border-slate-200 bg-surface">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {g.itens.length ? <AlertTriangle size={18} className={e ? "text-red-600" : "text-amber-600"} /> : <CheckCircle2 size={18} className="text-emerald-600" />}
        <span className="flex-1 font-semibold text-fg">{g.titulo}</span>
        <span className="text-sm text-slate-500">{g.itens.length ? [e && `${e} erro(s)`, a && `${a} alerta(s)`].filter(Boolean).join(" · ") : g.ok}</span>
        {g.itens.length > 0 && <ChevronDown size={18} className={`text-slate-400 transition ${aberto ? "rotate-180" : ""}`} />}
      </button>
      {aberto && g.itens.length > 0 && (
        <ul className="space-y-1 border-t border-slate-100 px-4 py-3 text-sm">
          {g.itens.slice(0, 60).map((i, n) => (
            <li key={n} className="flex gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${i.nivel === "erro" ? "bg-red-500" : "bg-amber-500"}`} /><span>{i.texto}</span></li>
          ))}
          {g.itens.length > 60 && <li className="text-slate-500">… e mais {g.itens.length - 60}</li>}
        </ul>
      )}
    </div>
  );
}

function Reforma({ notas }: { notas: Nota[] }) {
  const ano = new Date().getFullYear();
  const [aliqRef, setAliqRef] = useState("26.5");
  const doAno = notas.filter((n) => n.status === "autorizada" && n.created_at.startsWith(String(ano)));
  const base = doAno.reduce((s, n) => s + Number(n.valor_total), 0);
  // carga atual destacada nas notas (quando o detalhe dos itens está gravado)
  const comPayload = doAno.filter((n) => n.payload?.items?.length);
  const somaCampo = (k: string) => comPayload.reduce((s, n) => s + (n.payload!.items ?? []).reduce((t, i) => t + Number(i[k] ?? 0), 0), 0);
  const baseComPayload = comPayload.reduce((s, n) => s + Number(n.valor_total), 0);
  const cargaAtual = baseComPayload ? (somaCampo("icms_valor") + somaCampo("ipi_valor") + somaCampo("pis_valor") + somaCampo("cofins_valor")) / baseComPayload : null;
  const ref = Number(aliqRef.replace(",", ".")) || 0;

  return (
    <Section title="Reforma tributária: IBS e CBS">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <ol className="space-y-3">
            {REFORMA.map((r) => (
              <li key={r.ano} className="flex gap-3">
                <span className={`num grid h-9 min-w-[64px] place-items-center rounded-lg px-2 text-sm font-bold ${r.ano.startsWith(String(ano)) ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-700"}`}>{r.ano}</span>
                <span className="text-sm text-slate-700">{r.texto}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-500">
            Base: EC 132/2023 e LC 214/2025. Os campos de IBS/CBS na NF-e seguem as notas técnicas da SEFAZ; a Focus NFe preenche conforme o
            cronograma. Confirme com o contador a classificação tributária (cClassTrib) dos produtos.
          </p>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Landmark size={16} /> {ano === 2026 ? "Destaque de teste em 2026" : `Vendas com NF-e em ${ano}`}</div>
            <div className="text-sm text-slate-600">NF-e autorizadas no ano: <b className="num">{brl(base)}</b> ({doAno.length} notas)</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-2">CBS {TESTE_2026.cbs.toLocaleString("pt-BR")}%<div className="num font-bold text-fg">{brl(base * TESTE_2026.cbs / 100)}</div></div>
              <div className="rounded-lg bg-slate-50 p-2">IBS {TESTE_2026.ibs.toLocaleString("pt-BR")}%<div className="num font-bold text-fg">{brl(base * TESTE_2026.ibs / 100)}</div></div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Em 2026 o valor é só informativo (compensado com PIS/COFINS).</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 text-sm font-semibold">Simulação: IVA cheio (a partir de 2033)</div>
            <label className="mb-2 flex items-center gap-2 text-sm">Alíquota de referência IBS+CBS (%)
              <input className="input w-24" inputMode="decimal" value={aliqRef} onChange={(e) => setAliqRef(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-2">Hoje nas notas (ICMS+IPI+PIS+COFINS)<div className="num font-bold text-fg">{cargaAtual == null ? "—" : `${(cargaAtual * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</div></div>
              <div className="rounded-lg bg-slate-50 p-2">Com IBS+CBS sobre as mesmas vendas<div className="num font-bold text-fg">{brl(base * ref / 100)}</div></div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Estimativa simples sobre o faturamento, sem créditos das compras (no IVA o crédito é amplo, o que reduz o valor efetivo). Serve para conversar com o contador, não para planejar caixa.</p>
          </div>
        </div>
      </div>
    </Section>
  );
}
