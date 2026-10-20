// Notas fiscais → Faturamento: os números do faturamento para melhorar todo mês (Kaizen).
// Acerto de primeira (notas sem recusa da SEFAZ), tempo da venda aprovada até a nota, retrabalho (recusas,
// cancelamentos e cartas de correção), as recusas que mais acontecem e as vendas esperando nota.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Hourglass, Lightbulb, RotateCcw } from "lucide-react";
import { ler } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { indicadoresFaturamento, pendenciasFaturar, textoHoras, type NotaFat } from "@/lib/faturamento";

const DIAS = 14;

export function PainelFaturamento() {
  const { data, isLoading } = useQuery({
    queryKey: ["notas_fiscais", "painel-faturamento"],
    queryFn: async () => {
      const [notas, cartas, pedidos] = await Promise.all([
        ler(supabase.from("notas_fiscais").select("status, origem, ambiente, tentativas, historico_envios, mensagem, created_at, pedido:pedidos(aprovado_em)").eq("origem", "erp")),
        ler(supabase.from("nfe_cartas_correcao").select("id, status")),
        ler(supabase.from("pedidos").select("id, numero, status, id_externo, nf_outra_numero, aprovado_em, created_at, notas:notas_fiscais(status, ambiente)").in("status", ["aprovado", "entregue"])),
      ]);
      return { notas: (notas ?? []) as any[], cartas: (cartas ?? []) as any[], pedidos: (pedidos ?? []) as any[] };
    },
  });

  const r = useMemo(() => {
    if (!data) return null;
    const notas: NotaFat[] = data.notas.map((n) => ({ ...n, historico_envios: Array.isArray(n.historico_envios) ? n.historico_envios : [], pedido_aprovado_em: n.pedido?.aprovado_em ?? null }));
    const ind = indicadoresFaturamento(notas, data.cartas.filter((c) => c.status !== "erro").length);
    // vendas esperando nota: aprovadas no ERP, sem nota (as do Tiny e as com NF de outra empresa ficam de fora)
    const fila = data.pedidos.filter((p) => !pendenciasFaturar({ ...p, cliente: {}, itens: [] }, () => null)
      .some((f) => ["já tem NF-e", "veio do Tiny (nota feita lá)", "NF feita por outra empresa", "já faturado"].includes(f)));
    const agora = Date.now();
    const espera = fila.map((p) => (agora - new Date(p.aprovado_em ?? p.created_at).getTime()) / 36e5);
    // notas por dia (produção), últimos 14 dias
    const dias = Array.from({ length: DIAS }, (_, i) => { const d = new Date(agora - (DIAS - 1 - i) * 864e5); return d.toISOString().slice(0, 10); });
    const porDia = dias.map((d) => ({ d, n: notas.filter((n) => n.ambiente !== "homologacao" && n.status !== "erro" && n.created_at.slice(0, 10) === d).length }));
    return { ind, fila: fila.length, maisAntiga: espera.length ? Math.max(...espera) : null, porDia };
  }, [data]);

  if (isLoading || !r) return <p className="py-8 text-center text-slate-500">Carregando…</p>;
  const { ind } = r;
  const max = Math.max(1, ...r.porDia.map((x) => x.n));
  const cor = ind.acertoPrimeira == null ? "text-slate-500" : ind.acertoPrimeira >= 95 ? "text-emerald-600" : ind.acertoPrimeira >= 80 ? "text-amber-600" : "text-red-600";

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">Notas emitidas pelo ERP (as de teste e as importadas do Tiny não contam). Meta: <b>acerto de primeira acima de 95%</b> e nota no mesmo dia da venda aprovada.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao icone={<CheckCircle2 size={18} />} titulo="Acerto de primeira" valor={ind.acertoPrimeira == null ? "—" : `${ind.acertoPrimeira}%`} cor={cor}
          detalhe={`${ind.envios} envios à SEFAZ, ${ind.recusas} recusados`} />
        <Cartao icone={<Clock size={18} />} titulo="Venda aprovada → nota" valor={textoHoras(ind.horasAteNota)} cor="text-sky-600" detalhe="tempo do meio (mediana)" />
        <Cartao icone={<RotateCcw size={18} />} titulo="Retrabalho" valor={String(ind.recusas + ind.canceladas + ind.cartasCorrecao)} cor="text-violet-600"
          detalhe={`${ind.recusas} recusas · ${ind.canceladas} canceladas · ${ind.cartasCorrecao} cartas de correção`} />
        <Cartao icone={<Hourglass size={18} />} titulo="Vendas esperando nota" valor={String(r.fila)} cor={r.fila ? "text-amber-600" : "text-emerald-600"}
          detalhe={r.maisAntiga != null ? `a mais antiga há ${textoHoras(r.maisAntiga)}` : "nenhuma na fila"} />
      </div>

      {ind.emErroAgora > 0 && (
        <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={18} className="mt-0.5 shrink-0" />
          {ind.emErroAgora} {ind.emErroAgora === 1 ? "nota recusada está" : "notas recusadas estão"} sem resolver. Abra em NF-e emitidas → Pendentes: cada uma mostra o passo a passo.</p>
      )}

      <section className="rounded-2xl border border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-bold">Notas por dia (últimos {DIAS} dias)</h3>
        <div className="flex h-28 items-end gap-1" role="img" aria-label={`Notas por dia: ${r.porDia.map((x) => x.n).join(", ")}`}>
          {r.porDia.map((x) => (
            <div key={x.d} className="flex flex-1 flex-col items-center gap-1" title={`${x.d.split("-").reverse().slice(0, 2).join("/")}: ${x.n}`}>
              <span className="text-2xs text-slate-500">{x.n || ""}</span>
              <div className="w-full rounded-t bg-brand" style={{ height: `${(x.n / max) * 80}px`, minHeight: x.n ? 4 : 1, opacity: x.n ? 1 : 0.2 }} />
              <span className="text-2xs text-slate-400">{x.d.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 p-4">
        <h3 className="mb-1 text-sm font-bold">Por que a SEFAZ recusou</h3>
        <p className="mb-3 text-xs text-slate-500">Corrigir a causa no cadastro evita a mesma recusa nas próximas notas.</p>
        {ind.motivos.length ? (
          <ul className="space-y-2">
            {ind.motivos.map((m) => {
              return (
                <li key={m.motivo} className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2"><b>{m.motivo}</b><span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{m.n}×</span></div>
                  {m.dica && <p className="mt-1 flex gap-1.5 text-slate-600"><Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-500" /> {m.dica}</p>}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-emerald-700">Nenhuma recusa. 🎉</p>}
      </section>
    </div>
  );
}

function Cartao({ icone, titulo, valor, detalhe, cor }: { icone: React.ReactNode; titulo: string; valor: string; detalhe: string; cor: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-4">
      <div className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${cor}`}>{icone} {titulo}</div>
      <div className={`mt-2 text-3xl font-extrabold ${cor}`}>{valor}</div>
      <div className="mt-1 text-xs text-slate-500">{detalhe}</div>
    </div>
  );
}
