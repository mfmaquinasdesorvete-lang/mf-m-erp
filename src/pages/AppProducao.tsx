// App da produção no celular (erp.myfrost.ai/app/producao): a fábrica sem o menu do ERP. As OPs abertas (máquinas e
// peças da tornearia/mecânica), atrasadas primeiro, com a barra das etapas; tocar abre a lista para marcar cada etapa
// (fica gravado quem fez e quando), iniciar a produção e, no fim, "Concluir" abre a OP no ERP (números de série,
// teste do giga e baixa das peças ficam lá, com as conferências de sempre).
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Check, CheckCircle2, Circle, Factory, LayoutGrid, MoreHorizontal, Play, Search, Wrench } from "lucide-react";
import { InstalarApp } from "@/components/InstalarApp";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, hoje, pl } from "@/lib/format";
import { combina } from "@/lib/appVendas";
import { CHAVE_APP_PRODUCAO, progressoEtapas } from "@/lib/appCelular";
import type { EtapaOp, OrdemProducao, Produto } from "@/lib/types";

type OP = OrdemProducao & { produto?: Produto };
type Aba = "maquinas" | "pecas" | "mais";
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

export default function AppProducao() {
  const { nome, pode } = usePerfil();
  const podeEditar = pode("editar_producao");
  const navigate = useNavigate();
  const invalidar = useInvalidate();
  const { filtrar } = useUnidade();
  const { data: todas = [] } = useRows<OP>("ordens_producao", { select: "*, produto:produtos(id, descricao, sku, tipo)" });
  const [aba, setAba] = useState<Aba>("maquinas");
  const [aberta, setAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [sempre, setSempre] = useState(ler(CHAVE_APP_PRODUCAO) !== "0");
  const dia = hoje();

  const abertas = useMemo(() => filtrar(todas).filter((o) => ["planejada", "em_producao"].includes(o.status))
    // atrasadas primeiro, depois em produção, depois pela previsão
    .sort((a, b) => Number(!!b.previsao && b.previsao < dia) - Number(!!a.previsao && a.previsao < dia)
      || Number(b.status === "em_producao") - Number(a.status === "em_producao") || (a.previsao ?? "9").localeCompare(b.previsao ?? "9")), [todas, filtrar, dia]);
  const ehMaquina = (o: OP) => o.produto?.tipo === "maquina";
  const daAba = abertas.filter((o) => (aba === "pecas" ? !ehMaquina(o) : ehMaquina(o)));
  const lista = daAba.filter((o) => !busca.trim() || combina(`${o.numero} ${o.produto?.descricao ?? ""} ${o.produto?.sku ?? ""} ${o.responsavel ?? ""} ${o.numeros_serie ?? ""}`, busca.replace(/^#/, "")));
  const atrasadas = abertas.filter((o) => o.previsao && o.previsao < dia).length;

  async function marcar(o: OP, i: number) {
    // desmarcar apaga quem fez e quando: pergunta antes (toque sem querer na bancada)
    const e = ((Array.isArray(o.etapas) ? o.etapas : []) as EtapaOp[])[i];
    if (e?.feita && !(await confirmar(`Desmarcar "${e.nome}"? Ela volta a ficar pendente.`, { titulo: `OP #${o.numero}`, ok: "Desmarcar" }))) return;
    setOcupado(o.id);
    try {
      // lê as etapas do banco antes de marcar (outra pessoa pode ter marcado outra no meio)
      const { data, error: e1 } = await supabase.from("ordens_producao").select("etapas").eq("id", o.id).single();
      if (e1) throw e1;
      const atuais = (Array.isArray(data?.etapas) ? data!.etapas : []) as EtapaOp[];
      const novas = atuais.map((e, j) => (j === i ? { ...e, feita: !e.feita, por: !e.feita ? nome : null, em: !e.feita ? new Date().toISOString() : null } : e));
      const { error } = await supabase.from("ordens_producao").update({ etapas: novas }).eq("id", o.id);
      if (error) throw error;
      invalidar("ordens_producao");
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }
  async function iniciar(o: OP) {
    setOcupado(o.id);
    const { error } = await supabase.from("ordens_producao").update({ status: "em_producao" }).eq("id", o.id);
    setOcupado(null);
    if (error) return notifyError(error);
    notify(`OP #${o.numero}: produção iniciada`);
    invalidar("ordens_producao");
  }
  const concluirNoErp = (o: OP) => navigate("/producao", { state: { abrirOp: o.id } });

  return (
    <div className="min-h-screen bg-[#07090f] pb-28 text-[#e9ecf2]" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto max-w-md px-4">
        <header className="flex items-center gap-3 py-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#f97316] to-[#eab308] font-bold text-[#07090f]">MF</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#8b93a7]">{abertas.length} {pl(abertas.length, "OP aberta", "OPs abertas")}{atrasadas ? ` · ${atrasadas} ${pl(atrasadas, "atrasada", "atrasadas")}` : ""}</p>
            <p className="truncate font-bold tracking-wide">Produção MF</p>
          </div>
        </header>

        {aba !== "mais" && (
          <>
            <label className="relative mb-3 block">
              <span className="sr-only">Procurar OP</span>
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8b93a7]" aria-hidden />
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº da OP, produto, série ou responsável"
                className="w-full rounded-2xl border border-white/15 bg-[#111521] py-3 pl-11 pr-4 text-base placeholder:text-[#6b7385] focus:border-[#f97316] focus:outline-none" />
            </label>
            <ul className="space-y-2.5">
              {lista.map((o) => {
                const etapas = (Array.isArray(o.etapas) ? o.etapas : []) as EtapaOp[];
                const p = progressoEtapas(etapas);
                const atrasada = !!o.previsao && o.previsao < dia;
                const abertaAqui = aberta === o.id;
                const cor = o.status === "em_producao" ? "#f97316" : "#64748b";
                return (
                  <li key={o.id} className="rounded-2xl border border-white/10 bg-[#111521] p-3.5" style={{ borderLeft: `4px solid ${cor}` }}>
                    <button type="button" aria-expanded={abertaAqui} onClick={() => setAberta(abertaAqui ? null : o.id)} className="w-full text-left">
                      <span className="flex items-center gap-2 text-sm">
                        <b className="num text-[#8b93a7]">OP #{o.numero}</b>
                        <span className="rounded-md px-1.5 py-0.5 text-2xs font-bold" style={{ background: `${cor}33`, color: cor === "#64748b" ? "#cbd5e1" : cor }}>{o.status === "em_producao" ? "Em produção" : "Planejada"}</span>
                        {atrasada && <span className="rounded-md bg-[#fb7185]/15 px-1.5 py-0.5 text-2xs font-bold text-[#fda4af]">atrasada</span>}
                      </span>
                      <span className="mt-0.5 block font-semibold leading-snug">{Number(o.quantidade).toLocaleString("pt-BR")}× {o.produto?.descricao ?? "Produto"}</span>
                      <span className="flex flex-wrap gap-x-3 text-xs text-[#8b93a7]">
                        {o.previsao && <span className={`inline-flex items-center gap-1 ${atrasada ? "font-semibold text-[#fb7185]" : ""}`}><CalendarClock size={12} aria-hidden /> {dataBR(o.previsao)}</span>}
                        {o.responsavel && <span>{o.responsavel}</span>}
                      </span>
                      {etapas.length > 0 && (
                        <span className="mt-2 block">
                          <span className="flex h-2 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${p.feitas} de ${p.total} etapas feitas`}>
                            <span className="h-full rounded-full bg-[#34d399]" style={{ width: `${p.pct}%` }} />
                          </span>
                          <span className="mt-1 block text-xs text-[#b8bfcd]">{p.feitas} de {p.total} etapas{p.proxima ? ` · próxima: ${p.proxima}` : " ✓"}</span>
                        </span>
                      )}
                    </button>

                    {abertaAqui && (
                      <div className="mt-3 border-t border-white/10 pt-3">
                        {etapas.length ? (
                          <ol className="space-y-1.5" aria-label={`Etapas da OP ${o.numero}`}>
                            {etapas.map((e, i) => (
                              <li key={i}>
                                <button type="button" disabled={!podeEditar || ocupado === o.id} aria-pressed={e.feita} onClick={() => marcar(o, i)}
                                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-60 ${e.feita ? "border-[#34d399]/30 bg-[#34d399]/10" : "border-white/10"}`}>
                                  {e.feita ? <CheckCircle2 size={22} className="shrink-0 text-[#34d399]" aria-hidden /> : <Circle size={22} className="shrink-0 text-[#6b7385]" aria-hidden />}
                                  <span className="min-w-0 flex-1">
                                    <span className={`block text-sm font-semibold ${e.feita ? "text-[#b8bfcd] line-through" : ""}`}>{e.nome}</span>
                                    {e.feita && (e.por || e.em) && <span className="block text-2xs text-[#8b93a7]">{[e.por, e.em && new Date(e.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ")}</span>}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ol>
                        ) : <p className="text-sm text-[#8b93a7]">Esta OP não tem etapas. Cadastre as etapas na ficha técnica da máquina (ERP → Produção → Ficha técnica).</p>}
                        {podeEditar && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {o.status === "planejada"
                              ? <button type="button" disabled={ocupado === o.id} onClick={() => iniciar(o)} className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-[#f97316] py-3.5 font-bold text-[#07090f] disabled:opacity-50"><Play size={17} /> Iniciar produção</button>
                              : <button type="button" onClick={() => concluirNoErp(o)} className={`col-span-2 flex items-center justify-center gap-1.5 rounded-xl py-3.5 font-bold disabled:opacity-50 ${p.feitas === p.total && p.total > 0 ? "bg-[#34d399] text-[#04130d]" : "border border-white/20 text-[#e9ecf2]"}`}>
                                <Check size={17} /> Concluir (série, giga e baixa no ERP)
                              </button>}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {!lista.length && <p className="rounded-2xl border border-white/10 p-6 text-center text-[#8b93a7]">{busca ? "Nenhuma OP com essa busca." : `Nenhuma OP de ${aba === "pecas" ? "peças" : "máquinas"} aberta ✓`}</p>}
          </>
        )}

        {aba === "mais" && (
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 p-4 text-sm">
              <span>Abrir sempre aqui pelo celular</span>
              <input type="checkbox" className="h-5 w-5 accent-[#f97316]" checked={sempre}
                onChange={(e) => { setSempre(e.target.checked); gravar(CHAVE_APP_PRODUCAO, e.target.checked ? "1" : "0"); }} />
            </label>
            <InstalarApp />
            <p className="px-1 text-xs text-[#8b93a7]">Nova OP, peças que faltam, compras e ficha técnica ficam no ERP completo.</p>
            <button type="button" onClick={() => navigate("/producao")} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-sm text-[#b8bfcd]">
              <LayoutGrid size={18} /> <span className="flex-1">Abrir o ERP completo</span>
            </button>
          </div>
        )}
      </div>

      <nav aria-label="App da produção" className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#0b0e16]/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto grid max-w-md grid-cols-3">
          {([["maquinas", "Máquinas", Factory, abertas.filter(ehMaquina).length], ["pecas", "Peças", Wrench, abertas.filter((o) => !ehMaquina(o)).length], ["mais", "Mais", MoreHorizontal, 0]] as const).map(([id, rot, Icone, n]) => (
            <button key={id} type="button" onClick={() => { setAba(id); setAberta(null); setBusca(""); }} aria-current={aba === id ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs ${aba === id ? "text-[#fb923c]" : "text-[#8b93a7]"}`}>
              <Icone size={21} />{rot}
              {n > 0 && <span className="absolute right-[28%] top-1 rounded-full bg-[#f97316] px-1.5 text-2xs font-bold text-[#07090f]">{n}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
