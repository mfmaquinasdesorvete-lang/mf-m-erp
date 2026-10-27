// Painel das licenças My Frost Sorveterias: as unidades licenciadas, quanto cada licença combinou e já pagou, o que falta,
// o recebido mês a mês e as máquinas nas unidades por modelo. Só o administrador abre (as linhas do banco são do dono).
// MF ≠ My Frost: estes números não entram nos painéis, no DRE nem no contador da MF; aqui é só leitura da carteira.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, IceCreamCone, Receipt, Store, Wallet } from "lucide-react";
import { Section } from "@/components/ui";
import { Secoes } from "@/components/Secoes";
import { Colunas, Ranking } from "@/components/Charts";
import { CabecalhoPainel, CartaoPainel, type Cartao } from "@/components/painel/Painel";
import { useRows } from "@/lib/data";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import {
  faixaLic, nomeModelo, nomeSituacao, PERIODOS_LIC, resumoLojas, serieMensalLojas, valePagamento,
  type Loja, type MaquinaLoja, type PagamentoLoja, type PeriodoLic,
} from "@/lib/licenciados";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const ROSA = "var(--kpi-rosa)";
const funcionando = (l: Loja) => ["ativa", "implantacao", "fechando"].includes(l.situacao);
/** "My Frost P 765 - Máquina de Sorvete…" vira "P 765" */
const modeloCurto = (d: string) => d.replace(/^My Frost\s*/i, "").split(/\s[-–]\s/)[0].trim() || d;

export default function PainelLicencas() {
  const navigate = useNavigate();
  const { data: lojas = [] } = useRows<Loja>("licenciados_lojas", { order: "ordem", ascending: true });
  const { data: pagamentos = [] } = useRows<PagamentoLoja>("licenciados_pagamentos", { order: "data", ascending: false });
  const { data: maquinas = [] } = useRows<MaquinaLoja>("licenciados_maquinas", { order: "data_compra", ascending: false });
  const [periodo, setPeriodo] = useState<PeriodoLic>("semana");

  const dia = hoje();
  const faixa = faixaLic(periodo, dia);
  const resumo = useMemo(() => resumoLojas(lojas, pagamentos, faixa, dia), [lojas, pagamentos, faixa.de, faixa.ate]); // eslint-disable-line react-hooks/exhaustive-deps
  const validos = pagamentos.filter(valePagamento);
  const doPeriodo = validos.filter((p) => p.data >= faixa.de && p.data <= faixa.ate);
  const recebido = doPeriodo.reduce((t, p) => t + Number(p.valor), 0);
  const taxas = doPeriodo.reduce((t, p) => t + Number(p.taxa), 0);
  const licencas = doPeriodo.filter((p) => p.tipo === "licenca").reduce((t, p) => t + Number(p.valor), 0);
  const ativas = lojas.filter(funcionando);
  const combinado = resumo.reduce((t, r) => t + (Number(r.loja.valor_combinado) || 0), 0);
  const falta = resumo.reduce((t, r) => t + (r.falta ?? 0), 0);
  const mensal = ativas.reduce((t, l) => t + (Number(l.mensalidade) || 0), 0);
  const naLoja = maquinas.filter((m) => m.situacao === "na_loja" || m.situacao === "manutencao");
  const serie = serieMensalLojas(pagamentos, (faixa.ate > dia ? dia : faixa.ate).slice(0, 7), 12);

  // máquinas nas unidades por modelo (o gráfico pedido: quantas de cada modelo estão com os licenciados)
  const porModelo = [...naLoja.reduce((m, x) => m.set(modeloCurto(x.descricao), (m.get(modeloCurto(x.descricao)) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  // atenção: licença com saldo a receber e unidade funcionando sem pagar há mais de 45 dias
  const atencao = resumo.filter((r) => funcionando(r.loja) && ((r.falta ?? 0) > 0 || (r.diasSemPagar ?? 0) > 45))
    .sort((a, b) => (b.falta ?? 0) - (a.falta ?? 0));

  const cartoes: Cartao[] = [
    { id: "unidades", rotulo: "Unidades funcionando", valor: ativas.length, sub: `${lojas.length} ${pl(lojas.length, "licença", "licenças")} no cadastro`, icone: Store, cor: ROSA, onClick: () => navigate("/licenciados") },
    { id: "recebido", rotulo: "Recebido no período", valor: brl(recebido), sub: `licenças ${brl(licencas)} · taxas ${brl(taxas)}`, icone: Wallet, cor: "var(--serie-1)", tendencia: serie.map((s) => s.valor), onClick: () => navigate("/licenciados?aba=pagamentos") },
    { id: "falta", rotulo: "Falta receber das licenças", valor: brl(falta), sub: combinado ? `de ${brl(combinado)} combinados` : "cadastre o valor combinado de cada licença", icone: Receipt, cor: "var(--kpi-laranja)" },
    { id: "maquinas", rotulo: "Máquinas nas unidades", valor: naLoja.length, sub: mensal ? `mensalidades ${brl(mensal)}/mês` : `${porModelo.length} ${pl(porModelo.length, "modelo", "modelos")}`, icone: IceCreamCone, cor: "var(--kpi-roxo)", onClick: () => navigate("/licenciados?aba=maquinas") },
  ];

  return (
    <div className="space-y-4">
      <CabecalhoPainel icone={IceCreamCone} area="My Frost Sorveterias" titulo="Licenças My Frost"
        resumo="Unidades licenciadas, quanto cada licença combinou e pagou, o que falta e as máquinas nas unidades. Separado da MF: não entra no DRE nem no contador."
        acoes={
          <div role="tablist" aria-label="Período" className="grid grid-cols-4 gap-0.5 rounded-xl bg-black/15 p-1 ring-1 ring-white/15">
            {PERIODOS_LIC.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} onClick={() => setPeriodo(p.id)}
                className={`min-h-[36px] whitespace-nowrap rounded-lg px-2.5 text-xs font-bold transition ${periodo === p.id ? "bg-white text-modulo-texto shadow" : "text-white/85 hover:bg-white/10"}`}>
                {p.rotulo}
              </button>
            ))}
          </div>
        } />

      {/* seções que a pessoa pode reordenar no "Organizar" (fica no perfil dela) */}
      <Secoes pagina="painel-licencas" secoes={[
        { id: "cartoes", titulo: "Números", largo: true, conteudo: (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {cartoes.map((c) => <CartaoPainel key={c.id} c={c} />)}
          </div>
        ) },
        { id: "recebido", titulo: "Recebido mês a mês", conteudo: (
          <Section title="Recebido mês a mês" className="h-full">
            <Colunas altura={230} vazio="Sem pagamentos nesses meses." dados={serie.map((s) => ({ rotulo: mesCurto(s.mes), valores: [s.valor, s.taxas] }))}
              series={[{ nome: "Recebido", cor: ROSA }, { nome: "Taxas", cor: "var(--serie-2)" }]} />
          </Section>
        ) },
        { id: "maquinas-modelo", titulo: "Máquinas nas unidades por modelo", conteudo: (
          <Section title="Máquinas nas unidades por modelo" className="h-full">
            <Ranking cor="var(--kpi-roxo)" formatar={(v) => String(v)} vazio="Nenhuma máquina cadastrada nas unidades."
              itens={porModelo.map(([nome, n]) => ({ rotulo: nome, valor: n, detalhe: `${Math.round((n / Math.max(1, naLoja.length)) * 100)}%` }))} />
          </Section>
        ) },
        { id: "licencas", titulo: "Licenças por unidade", conteudo: (
          <Section title="Licenças por unidade" className="h-full" actions={<span className="text-xs text-slate-500">toque para abrir a carteira</span>}>
            {!resumo.length ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma unidade cadastrada.</p> : (
              <ul className="divide-y divide-slate-100">
                {[...resumo].sort((a, b) => Number(funcionando(b.loja)) - Number(funcionando(a.loja)) || b.total - a.total).map((r) => (
                  <li key={r.loja.id}>
                    <button type="button" onClick={() => navigate("/licenciados")} className="linha-clicavel grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-fg">{r.loja.nome}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[nomeSituacao(r.loja.situacao), nomeModelo(r.loja.modelo), [r.loja.cidade, r.loja.uf].filter(Boolean).join("/"), r.ultimo && `último ${dataBR(r.ultimo)}`].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="num text-right text-sm">
                        <b className="text-fg">{brl(r.total)}</b>
                        {r.falta != null && <span className={`block text-xs ${r.falta > 0 ? "text-amber-700" : "text-emerald-700"}`}>{r.falta > 0 ? `falta ${brl(r.falta)}` : "licença quitada"}</span>}
                      </span>
                      {r.pct != null && (
                        <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-label={`${r.pct}% do combinado`}>
                          <span className="block h-full rounded-full" style={{ width: `${r.pct}%`, background: ROSA }} />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) },
        { id: "atencao", titulo: "Precisa de atenção", conteudo: (
          <Section title="Precisa de atenção" className="h-full">
            {!atencao.length ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma licença com saldo ou sem pagar há mais de 45 dias.</p> : (
              <ul className="space-y-2">
                {atencao.slice(0, 8).map((r) => (
                  <li key={r.loja.id} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <b>{r.loja.nome}</b>
                      <span className="block text-xs">
                        {[(r.falta ?? 0) > 0 && `falta ${brl(r.falta!)} da licença`, (r.diasSemPagar ?? 0) > 45 && `sem pagar há ${r.diasSemPagar} dias`, r.diasSemPagar == null && "nenhum pagamento ligado"].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) },
      ]} />
    </div>
  );
}
