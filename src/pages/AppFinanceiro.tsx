// App do financeiro no celular (erp.myfrost.ai/app): tela própria, sem o menu do ERP, para quem só precisa aprovar e
// ver quanto tem nas contas. Saldos de relance, as contas que esperam a aprovação dele (aprovar com um toque, devolver
// com o motivo) e o que vence na semana. As regras de quem aprova valem no banco (revisar_contas), como em Aprovações.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Check, ClipboardCheck, Eye, EyeOff, Home, LayoutGrid, Receipt, Undo2, Wallet } from "lucide-react";
import { GastoRapido } from "@/components/financeiro/GastoRapido";
import { useInvalidate, useRows } from "@/lib/data";
import { InstalarApp } from "@/components/InstalarApp";
import { useConfig } from "@/lib/useConfig";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { pedirTexto } from "@/components/Dialogos";
import { quemPode, regrasDe, type ContaRevisao } from "@/lib/aprovacao";
import { CHAVE_APP, proximosDias, saldosPorUnidade } from "@/lib/appFinanceiro";

type Pagar = ContaRevisao & { fornecedor?: { nome: string; bloqueado?: boolean | null } | null };
type Receber = ContaRevisao & { cliente?: { nome: string; nome_fantasia?: string | null } | null };
type Aba = "inicio" | "aprovar";

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

export default function AppFinanceiro() {
  const eu = usePerfil();
  const admin = eu.papel === "admin";
  const navigate = useNavigate();
  const invalidar = useInvalidate();
  const { data: cfg } = useConfig();
  const regras = regrasDe(cfg);
  const { unidades } = useUnidade();
  const [aba, setAba] = useState<Aba>("inicio");
  const [ocultar, setOcultar] = useState(ler("mf-erp-app-ocultar") === "1");
  const [sempre, setSempre] = useState(ler(CHAVE_APP) !== "0");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [gasto, setGasto] = useState(false);
  const dia = hoje();

  const { data: pagar = [] } = useRows<Pagar>("contas_pagar", { select: "*, fornecedor:fornecedores(nome, cnpj, bloqueado, bloqueio_motivo)" });
  const { data: receber = [] } = useRows<Receber>("contas_receber", { select: "*, cliente:clientes(*)" });
  const { data: saldos = [] } = useQuery({
    queryKey: ["saldos_bancarios", "app"],
    queryFn: async () => { const { data, error } = await supabase.rpc("saldos_bancarios"); if (error) throw error; return (data ?? []) as { conta_id: string; nome: string; unidade_id: string; saldo: number }[]; },
  });

  const caixa = saldosPorUnidade(saldos);
  const semanaPagar = proximosDias(pagar, dia);
  const semanaReceber = proximosDias(receber, dia);
  const paraAprovar = useMemo(() => [
    ...pagar.map((c) => ({ tipo: "pagar" as const, c, quem: c.fornecedor?.nome ?? null })),
    ...receber.map((c) => ({ tipo: "receber" as const, c, quem: c.cliente ? c.cliente.nome_fantasia?.trim() || c.cliente.nome : null })),
  ].filter((l) => l.c.revisao === "em_revisao" && quemPode(l.c, { id: eu.user_id, admin }, regras).pode)
    .sort((a, b) => a.c.vencimento.localeCompare(b.c.vencimento)), [pagar, receber, eu.user_id, admin, regras.revisor1.join(), regras.revisor2.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalAprovar = paraAprovar.reduce((s, l) => s + Number(l.c.valor || 0), 0);

  const v = (n: number) => (ocultar ? "R$ •••••" : brl(n));
  const nomeUnidade = (id: string) => unidades.find((u) => u.id === id)?.nome ?? "Sem unidade";

  async function decidir(l: (typeof paraAprovar)[number], acao: "aprovar" | "devolver") {
    let comentario: string | null = null;
    if (acao === "devolver") {
      comentario = await pedirTexto("Por que devolver? Quem lançou recebe o motivo para corrigir.", "", { titulo: "Devolver a conta", ok: "Devolver", minimo: 5 });
      if (!comentario) return;
    }
    setOcupado(l.c.id);
    try {
      const { error } = await supabase.rpc("revisar_contas", { p_tabela: l.tipo === "pagar" ? "contas_pagar" : "contas_receber", p_ids: [l.c.id], p_acao: acao, p_comentario: comentario });
      if (error) throw error;
      notify(acao === "aprovar" ? "Aprovada" : "Devolvida para correção");
      invalidar("contas_pagar", "contas_receber", "revisoes_contas");
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }

  const primeiro = (eu.nome || "").split(" ")[0];
  return (
    <div className="min-h-screen bg-noite-fundo pb-28 text-noite-texto" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-md px-4">
        <header className="flex items-center gap-3 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-fixo-cyan-400 font-bold text-noite-fundo">MF</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-noite-fraco">Olá{primeiro ? `, ${primeiro}` : ""}</p>
            <p className="truncate font-bold tracking-wide">Financeiro MF</p>
          </div>
          <button type="button" aria-label={ocultar ? "Mostrar valores" : "Esconder valores"} className="grid h-10 w-10 place-items-center rounded-full border border-white/10"
            onClick={() => { setOcultar(!ocultar); gravar("mf-erp-app-ocultar", ocultar ? "0" : "1"); }}>
            {ocultar ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </header>

        {aba === "inicio" && (
          <>
            <button type="button" onClick={() => setGasto(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-fixo-cyan-400/40 bg-fixo-cyan-400/10 py-3.5 font-bold text-fixo-cyan-300">
              <Receipt size={20} /> Lançar gasto (falar ou foto do cupom)
            </button>
            {/* saldo nas contas */}
            <section className="rounded-3xl border border-fixo-cyan-400/25 bg-noite-cartao p-5 shadow-card">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-noite-fraco"><Wallet size={14} /> Saldo nas contas</p>
              <p className="num mt-1 text-4xl font-bold">{v(caixa.total)}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[...caixa.por].map(([id, saldo]) => (
                  <div key={id} className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                    <p className="truncate text-xs text-noite-fraco">{nomeUnidade(id)}</p>
                    <p className={`num font-bold ${saldo < 0 ? "text-fixo-rose-400" : ""}`}>{v(saldo)}</p>
                  </div>
                ))}
              </div>
              {saldos.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-semibold text-fixo-cyan-400">Ver cada conta ({saldos.length})</summary>
                  <ul className="mt-2 space-y-1">
                    {saldos.map((s) => (
                      <li key={s.conta_id} className="flex justify-between gap-2"><span className="truncate text-noite-medio">{s.nome}</span><span className="num font-semibold">{v(Number(s.saldo || 0))}</span></li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            {/* para aprovar */}
            <button type="button" onClick={() => setAba("aprovar")}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-fixo-purple-500/40 bg-fixo-purple-500/10 p-4 text-left">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-fixo-purple-500 text-white"><ClipboardCheck size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{paraAprovar.length ? `${paraAprovar.length} ${pl(paraAprovar.length, "conta para aprovar", "contas para aprovar")}` : "Nada para aprovar"}</span>
                <span className="block text-sm text-noite-medio">{paraAprovar.length ? v(totalAprovar) : "Tudo em dia ✓"}</span>
              </span>
              {paraAprovar.length > 0 && <span className="rounded-full bg-fixo-purple-500 px-3 py-1 text-sm font-bold text-white">Ver</span>}
            </button>

            {/* semana */}
            <h2 className="mb-2 mt-6 text-sm font-semibold text-noite-fraco">Próximos 7 dias</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-fixo-rose-400/30 bg-fixo-rose-400/10 p-3">
                <p className="flex items-center gap-1 text-xs font-semibold text-fixo-rose-300"><ArrowUpCircle size={14} /> A pagar</p>
                <p className="num mt-1 text-xl font-bold">{v(semanaPagar.valorSemana)}</p>
                <p className="text-xs text-noite-medio">{semanaPagar.semana} {pl(semanaPagar.semana, "conta", "contas")}{semanaPagar.hoje ? ` · ${semanaPagar.hoje} hoje` : ""}</p>
                {semanaPagar.vencidas > 0 && <p className="mt-1 text-xs font-semibold text-fixo-rose-400">{semanaPagar.vencidas} {pl(semanaPagar.vencidas, "vencida", "vencidas")} · {v(semanaPagar.valorVencidas)}</p>}
              </div>
              <div className="rounded-2xl border border-fixo-emerald-400/30 bg-fixo-emerald-400/10 p-3">
                <p className="flex items-center gap-1 text-xs font-semibold text-fixo-emerald-300"><ArrowDownCircle size={14} /> A receber</p>
                <p className="num mt-1 text-xl font-bold">{v(semanaReceber.valorSemana)}</p>
                <p className="text-xs text-noite-medio">{semanaReceber.semana} {pl(semanaReceber.semana, "conta", "contas")}{semanaReceber.hoje ? ` · ${semanaReceber.hoje} hoje` : ""}</p>
                {semanaReceber.vencidas > 0 && <p className="mt-1 text-xs font-semibold text-fixo-amber-400">{semanaReceber.vencidas} {pl(semanaReceber.vencidas, "atrasada", "atrasadas")} · {v(semanaReceber.valorVencidas)}</p>}
              </div>
            </div>

            <label className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-3 text-sm">
              <span>Abrir sempre aqui pelo celular</span>
              <input type="checkbox" className="h-5 w-5 accent-fixo-cyan-400" checked={sempre}
                onChange={(e) => { setSempre(e.target.checked); gravar(CHAVE_APP, e.target.checked ? "1" : "0"); }} />
            </label>
            <div className="mt-3"><InstalarApp /></div>
          </>
        )}

        {aba === "aprovar" && (
          <>
            <h2 className="mb-1 text-lg font-bold">Para aprovar</h2>
            <p className="mb-3 text-sm text-noite-fraco">{paraAprovar.length ? `${paraAprovar.length} · ${v(totalAprovar)}` : "Nada esperando você."}</p>
            <ul className="space-y-3">
              {paraAprovar.map((l) => {
                const vencida = l.c.vencimento < dia;
                return (
                  <li key={l.c.id} className="rounded-2xl border border-white/10 bg-noite-cartao p-4">
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 rounded-md px-1.5 py-0.5 text-2xs font-bold ${l.tipo === "pagar" ? "bg-fixo-rose-400/20 text-fixo-rose-300" : "bg-fixo-emerald-400/20 text-fixo-emerald-300"}`}>{l.tipo === "pagar" ? "PAGAR" : "RECEBER"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{l.quem ?? l.c.descricao}</p>
                        {l.quem && <p className="truncate text-sm text-noite-fraco">{l.c.descricao}</p>}
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <p className="num text-2xl font-bold">{v(Number(l.c.valor))}</p>
                      <p className={`text-xs font-semibold ${vencida ? "text-fixo-rose-400" : "text-noite-fraco"}`}>{vencida ? "venceu" : "vence"} {dataBR(l.c.vencimento)}</p>
                    </div>
                    {l.tipo === "pagar" && (l as { c: Pagar }).c.fornecedor?.bloqueado && <p className="mt-1 text-xs font-bold text-fixo-rose-400">Fornecedor marcado como golpe: não aprove.</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" disabled={ocupado === l.c.id} onClick={() => decidir(l, "devolver")}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-fixo-amber-400/40 py-3 font-semibold text-fixo-amber-300 disabled:opacity-50"><Undo2 size={17} /> Devolver</button>
                      <button type="button" disabled={ocupado === l.c.id} onClick={() => decidir(l, "aprovar")}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-fixo-emerald-500 py-3 font-bold text-noite-tinta disabled:opacity-50"><Check size={18} /> Aprovar</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {paraAprovar.length === 0 && <p className="rounded-2xl border border-white/10 p-6 text-center text-noite-fraco">Tudo aprovado ✓</p>}
          </>
        )}
      </div>

      {/* barra de baixo */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-noite-fundo-2/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-3">
          {([["inicio", "Início", Home], ["aprovar", "Aprovar", ClipboardCheck]] as const).map(([id, rot, Icone]) => (
            <button key={id} type="button" onClick={() => setAba(id)} className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs ${aba === id ? "text-fixo-cyan-400" : "text-noite-fraco"}`}>
              <Icone size={21} />{rot}
              {id === "aprovar" && paraAprovar.length > 0 && <span className="absolute right-1/4 top-1 rounded-full bg-fixo-purple-500 px-1.5 text-2xs font-bold text-white">{paraAprovar.length}</span>}
            </button>
          ))}
          <button type="button" onClick={() => navigate("/financeiro")} className="flex flex-col items-center gap-0.5 py-2.5 text-xs text-noite-fraco">
            <LayoutGrid size={21} />ERP completo
          </button>
        </div>
      </nav>
      <Link to="/aprovacoes" className="sr-only">Aprovações completas</Link>
      {gasto && <GastoRapido onClose={() => setGasto(false)} />}
    </div>
  );
}
