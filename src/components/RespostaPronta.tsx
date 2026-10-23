// Resposta na hora das perguntas prontas do Perguntar à IA (lib/respostasProntas): vendido hoje e na semana, saldo,
// peças faltando e frete demorando. Busca com o login de quem pergunta (cada um vê só o que já pode ver); sem a IA.
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import {
  freteDemorando, inicioDaSemana, inicioDoDiaSP, pecasFaltando, PRONTAS, somar, type EnvioPrazo, type Pronta, type ProdutoEstoque,
} from "@/lib/respostasProntas";

type Linha = { id: string; titulo: string; sub?: string | null; valor?: number | null; to: string; state?: unknown };
type Resultado = { resumo: string; destaque?: string | null; linhas: Linha[]; aviso?: string | null };
const um = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const nomeCli = (c: { nome?: string | null; nome_fantasia?: string | null } | null) => c?.nome_fantasia?.trim() || c?.nome || "—";

async function vendas(desde: string, periodo: string): Promise<Resultado> {
  const { data, error } = await supabase.from("pedidos").select("id, numero, valor_total, aprovado_em, origem, cliente:clientes(nome, nome_fantasia)")
    .in("status", ["aprovado", "faturado", "entregue"]).is("excluida_em", null).gte("aprovado_em", inicioDoDiaSP(desde))
    .order("aprovado_em", { ascending: false }).limit(300);
  if (error) throw error;
  const l = (data ?? []) as any[];
  const total = somar(l.map((p) => p.valor_total));
  return {
    resumo: l.length ? `${l.length} ${pl(l.length, "venda", "vendas")} ${periodo}` : `Nenhuma venda aprovada ${periodo}.`,
    destaque: l.length ? brl(total) : null,
    linhas: l.map((p) => ({ id: p.id, titulo: `Pedido ${p.numero} · ${nomeCli(um(p.cliente))}`, sub: [p.aprovado_em && dataBR(String(p.aprovado_em).slice(0, 10)), p.origem].filter(Boolean).join(" · "), valor: Number(p.valor_total) || 0, to: "/pedidos", state: { abrir: p.id } })),
  };
}

async function saldo(): Promise<Resultado> {
  const { data, error } = await supabase.rpc("saldos_bancarios");
  if (error) {
    if (/permiss/i.test(error.message)) return { resumo: "O saldo dos bancos é só para quem cuida do financeiro.", linhas: [] };
    throw error;
  }
  const l = (data ?? []) as { conta_id: string; nome: string; saldo: number; data_base: string | null }[];
  return {
    resumo: `${l.length} ${pl(l.length, "conta", "contas")} no ERP`,
    destaque: brl(somar(l.map((c) => c.saldo))),
    linhas: l.map((c) => ({ id: c.conta_id, titulo: c.nome, sub: c.data_base ? `conferido com o extrato de ${dataBR(c.data_base)}` : null, valor: Number(c.saldo) || 0, to: "/conciliacao" })),
    aviso: "Saldo pelo último extrato de cada banco mais o que foi lançado depois.",
  };
}

async function pecas(): Promise<Resultado> {
  const { data, error } = await supabase.from("produtos").select("id, descricao, sku, estoque_atual, estoque_minimo, kit, sob_encomenda")
    .eq("ativo", true).gt("estoque_minimo", 0).limit(3000);
  if (error) throw error;
  const l = pecasFaltando((data ?? []) as ProdutoEstoque[]);
  return {
    resumo: l.length ? `${l.length} ${pl(l.length, "peça abaixo do mínimo", "peças abaixo do mínimo")}` : "Nenhuma peça abaixo do mínimo.",
    linhas: l.map((p) => ({ id: p.id, titulo: p.descricao, sub: `${p.sku ? `${p.sku} · ` : ""}tem ${Math.max(0, Number(p.estoque_atual) || 0)}, mínimo ${p.estoque_minimo} · faltam ${p.falta}`, to: "/estoque", state: { destaque: { ids: [p.id], titulo: `Peça: ${p.descricao}`, origem: "Perguntar à IA" } } })),
  };
}

async function fretes(): Promise<Resultado> {
  const { data, error } = await supabase.from("envios").select("id, numero, status, entrega_prevista, coleta_prevista, coletado_em, entregue_em, aviso_atraso_em, transportadora_nome, cliente:clientes(nome, nome_fantasia), pedido:pedidos(numero)")
    .is("entregue_em", null).not("status", "in", "(entregue,cancelado,cotacao)").limit(500);
  if (error) throw error;
  const dia = hoje();
  const l = ((data ?? []) as (EnvioPrazo & any)[])
    .map((e) => ({ e, d: freteDemorando(e, dia) })).filter((x) => x.d).sort((a, b) => b.d!.dias - a.d!.dias);
  return {
    resumo: l.length ? `${l.length} ${pl(l.length, "frete demorando", "fretes demorando")}` : "Nenhum frete demorando.",
    linhas: l.map(({ e, d }) => ({
      id: e.id, titulo: `Envio ${e.numero}${um(e.pedido)?.numero ? ` · pedido ${um(e.pedido).numero}` : ""} · ${nomeCli(um(e.cliente))}`,
      sub: [e.transportadora_nome, `${d!.motivo} há ${d!.dias} ${pl(d!.dias, "dia", "dias")}`].filter(Boolean).join(" · "), to: "/fretes",
    })),
  };
}

function buscar(tipo: Pronta): Promise<Resultado> {
  const dia = hoje();
  if (tipo === "vendas_hoje") return vendas(dia, "hoje");
  if (tipo === "vendas_semana") { const seg = inicioDaSemana(dia); return vendas(seg, `de segunda (${dataBR(seg)}) até hoje`); }
  if (tipo === "saldo") return saldo();
  if (tipo === "pecas_faltando") return pecas();
  return fretes();
}

export function RespostaPronta({ tipo, onIr }: { tipo: Pronta; onIr: () => void }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["resposta_pronta", tipo, hoje()], queryFn: () => buscar(tipo) });
  const r = q.data;
  return (
    <div className="mt-4 space-y-3" aria-live="polite">
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <p><b>{PRONTAS[tipo].emoji} {PRONTAS[tipo].rotulo}</b> · resposta na hora, direto do ERP</p>
      </div>
      {q.isLoading && <p className="text-sm text-slate-500">Buscando…</p>}
      {q.isError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">Não deu para buscar: {(q.error as Error).message}</p>}
      {r && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3">
            {r.destaque && <span className="num text-2xl font-bold text-fg">{r.destaque}</span>}
            <span className="text-sm text-slate-600">{r.resumo}</span>
          </div>
          {r.linhas.length > 0 && (
            <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-200">
              {r.linhas.slice(0, 100).map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => { onIr(); navigate(l.to, l.state ? { state: l.state } : undefined); }} className="linha-clicavel flex items-start gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{l.titulo}</span>
                      {l.sub && <span className="block truncate text-xs text-slate-500">{l.sub}</span>}
                    </span>
                    {l.valor != null && <span className="num shrink-0 text-sm font-semibold">{brl(l.valor)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {r.aviso && <p className="text-xs text-slate-500">{r.aviso}</p>}
        </>
      )}
    </div>
  );
}
