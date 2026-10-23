// Alto da Ficha 360 no estilo painel escuro (o mesmo do "Quanto tem para pagar" e do "Vendas do ano"): o total comprado
// no centro do anel, um pedaço por ano (tocar mostra só o ano); à esquerda os números da relação com o cliente; à direita
// as máquinas dele em etiquetas grandes, cada modelo na sua cor, com a venda, a garantia e o nº de série.
import { useState } from "react";
import { AlertTriangle, BadgeCheck, CalendarDays, Receipt, ShieldCheck, Snowflake, TrendingUp } from "lucide-react";
import { AnelEscuro, NumeroEscuro, QuadroEscuro, ladrilho, type FatiaAnel, TOM_ESCURO } from "@/components/painel/PainelEscuro";
import { corMaquinaHex, rotuloMaquina } from "@/components/clientes/MaquinasCliente";
import { brl, dataBR, pl } from "@/lib/format";
import { comprasPorAno, type CompraCliente, type resumoCliente } from "@/lib/fichaCliente";
import { mesAnoCompra } from "../../../supabase/functions/_shared/compra-maquina";

// cores dos anos (o mais novo por último, com a cor mais forte)
const CORES = [
  { ...TOM_ESCURO.cinza }, { ...TOM_ESCURO.roxo }, { ...TOM_ESCURO.indigo },
  { ...TOM_ESCURO.ciano }, { ...TOM_ESCURO.laranja }, { ...TOM_ESCURO.verde },
];

type Maquina = { id: string; descricao: string; numero_serie?: string | null; data_venda?: string | null; garantia_ate?: string | null; origem?: string | null; usada?: boolean | null };

export function PainelFicha({ r, compras, maquinas, compraCadastro, hoje }: {
  r: ReturnType<typeof resumoCliente>; compras: CompraCliente[]; maquinas: Maquina[];
  /** data de compra de máquina guardada no cadastro (quando nenhuma máquina registrada é daquele mês) */
  compraCadastro?: string | null; hoje: string;
}) {
  const [ano, setAno] = useState("");
  const anos = comprasPorAno(compras);
  const fatias: FatiaAnel<string>[] = anos.map((a, i) => ({
    id: a.ano, rotulo: a.rotulo, valor: a.valor, ...CORES[(CORES.length - anos.length + i + CORES.length) % CORES.length],
    dica: `${a.rotulo}: ${brl(a.valor)} em ${a.n} ${pl(a.n, "compra", "compras")}`,
  }));
  const daVez = ano ? anos.find((a) => a.ano === ano) : undefined;
  const ordem = [...maquinas].sort((a, b) => (b.data_venda ?? "").localeCompare(a.data_venda ?? ""));
  const soCadastro = !!compraCadastro && !maquinas.some((m) => (m.data_venda ?? "").slice(0, 7) === compraCadastro.slice(0, 7));
  const MAX = 6;

  return (
    <QuadroEscuro rotulo="Resumo do cliente" titulo="Ficha" destaque="360°" className=""
      filtro={daVez ? { texto: daVez.rotulo, onLimpar: () => setAno("") } : undefined}>
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,13.5rem)_auto_minmax(0,1fr)] lg:gap-5">
        <div className="order-1 min-w-0 lg:order-2">
          <AnelEscuro fatias={fatias} escolhida={ano} onEscolher={setAno}
            rotulo={`Total comprado ${brl(r.total)}: ${anos.map((a) => `${a.rotulo} ${brl(a.valor)}`).join(", ")}`}
            centro={daVez
              ? { rotulo: daVez.rotulo === daVez.ano ? `Compras em ${daVez.ano}` : daVez.rotulo, valor: brl(daVez.valor), sub: `${daVez.n} ${pl(daVez.n, "compra", "compras")}` }
              : { rotulo: "Total comprado", valor: brl(r.total), sub: r.primeira ? `cliente desde ${dataBR(r.primeira).slice(3)}` : "sem compras" }} />
          {/* legenda: qual cor é qual ano (tocar também mostra só o ano) */}
          {fatias.length > 1 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1" role="group" aria-label="Compras por ano">
              {fatias.map((f) => (
                <button key={f.id} type="button" aria-pressed={ano === f.id} onClick={() => setAno(ano === f.id ? "" : f.id)} title={f.dica}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold transition ${ano === f.id ? "bg-white text-[#0a1f3d]" : "bg-white/[.06] text-white/80 hover:bg-white/10"}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: f.neon }} aria-hidden />{f.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="order-2 grid min-w-0 grid-cols-2 gap-2 lg:order-1 lg:grid-cols-1">
          <NumeroEscuro icone={TrendingUp} rotulo="Últimos 12 meses" valor={brl(r.ultimos12m)} sub={`${r.compras} ${pl(r.compras, "compra", "compras")} no total`}
            tom="anil" aceso={r.ultimos12m > 0} />
          <NumeroEscuro icone={Receipt} rotulo="Ticket médio" valor={brl(r.ticket)} sub={r.intervaloMedio ? `compra a cada ${r.intervaloMedio} dias` : undefined}
            tom="roxo" aceso={r.ticket > 0} />
          <NumeroEscuro icone={CalendarDays} rotulo="Última compra" valor={r.ultima ? dataBR(r.ultima) : "—"} sub={r.semComprar !== null ? `há ${r.semComprar} dias` : undefined}
            {...(r.situacao === "inativo" ? { de: "#fb7185", ate: "#e11d48" } : r.situacao === "em_risco" ? { de: "#fbbf24", ate: "#d97706" } : { de: "#34d399", ate: "#059669" })}
            aceso={!!r.ultima} />
          <NumeroEscuro icone={r.vencido > 0 ? AlertTriangle : BadgeCheck} rotulo="Vencido" valor={brl(r.vencido)}
            sub={r.vencidas ? `${r.vencidas} ${pl(r.vencidas, "parcela", "parcelas")}` : "nada vencido"}
            {...(r.vencido > 0 ? { de: "#fb7185", ate: "#e11d48" } : { de: "#34d399", ate: "#059669" })} aceso={r.vencido > 0} />
        </div>

        <div className="order-3 min-w-0">
          <p className="mb-1.5 text-2xs font-bold uppercase tracking-[.14em] text-white/75">
            {ordem.length ? `${ordem.length} ${pl(ordem.length, "máquina", "máquinas")}` : "Máquinas"}
          </p>
          {!ordem.length && !soCadastro ? <p className="rounded-2xl border border-white/[.07] bg-white/[.04] p-3 text-sm text-white/70">Nenhuma máquina registrada.</p> : (
            <ul className="grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
              {soCadastro && (
                <li className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/[.07] bg-white/[.04] p-2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#06132a]" style={ladrilho("#cbd5e1", "#64748b")}><Snowflake size={20} aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-base font-bold leading-tight text-white">Máquina · {mesAnoCompra(compraCadastro)}</span>
                    <span className="block text-xs text-white/70">data do cadastro; modelo não informado</span>
                  </span>
                </li>
              )}
              {ordem.slice(0, MAX).map((m) => {
                const rot = rotuloMaquina(m.descricao), c = corMaquinaHex(rot);
                const garantia = m.garantia_ate && m.garantia_ate >= hoje;
                return (
                  <li key={m.id} title={m.descricao} className="flex min-w-0 items-center gap-2.5 rounded-2xl border p-2"
                    style={{ borderColor: `color-mix(in srgb, ${c.neon} 35%, transparent)`, background: `color-mix(in srgb, ${c.cor} 14%, transparent)` }}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#06132a]" style={ladrilho(c.neon, c.cor)}><Snowflake size={20} aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold leading-tight" style={{ color: c.neon }}>{rot}{m.usada ? " · usada" : ""}</span>
                      <span className="block truncate text-xs text-white/75">
                        {[m.data_venda ? `vendida em ${dataBR(m.data_venda).slice(3)}` : "data não informada", m.origem && m.origem !== "MF" ? m.origem : "", m.numero_serie ? `nº ${m.numero_serie}` : ""].filter(Boolean).join(" · ")}
                      </span>
                      {m.garantia_ate && (
                        <span className={`mt-0.5 inline-flex items-center gap-1 text-xs font-semibold ${garantia ? "text-fixo-emerald-300" : "text-white/55"}`}>
                          <ShieldCheck size={12} aria-hidden /> {garantia ? `garantia até ${dataBR(m.garantia_ate)}` : "fora da garantia"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {ordem.length > MAX && <p className="mt-1.5 text-xs text-white/70">e mais {ordem.length - MAX} {pl(ordem.length - MAX, "máquina", "máquinas")} na aba Assistência.</p>}
        </div>
      </div>
    </QuadroEscuro>
  );
}
