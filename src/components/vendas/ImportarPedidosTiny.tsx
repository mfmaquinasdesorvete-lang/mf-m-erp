// Histórico de vendas do Tiny pela API (função tiny-historico): todos os pedidos de venda com itens entram em Venda de
// Peças / Venda de Máquinas e as NF-e do Tiny já importadas ficam ligadas a eles. Não mexe em estoque, contas nem comissão.
// Mostra também quantos pedidos do Tiny já estão no ERP (pela API ou pela planilha) e quando o Tiny recusa a API.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field } from "@/components/ui";
import { notify } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { dataBR, pl } from "@/lib/format";
import { situacaoHistorico, trouxeAlgo } from "@/lib/tinyHistorico";

type Estado = {
  etapa: string; pagina: number; indice: number; unidade_id: string | null;
  totais: Record<string, any>; erros: { quando: string; etapa: string; mensagem: string }[];
  iniciado_em: string | null; concluido_em: string | null; atualizado_em?: string | null;
};
type Resposta = { configurado: boolean; estado: Estado | null; aguardar?: number };

const ETAPAS: [string, string][] = [
  ["notas", "Lista das notas fiscais do Tiny (para ligar cada venda à sua nota)"],
  ["pedidos", "Pedidos de venda, com itens, cliente, vendedor e pagamento"],
  ["ligar", "Ligar as notas já importadas aos pedidos"],
];
const SECRETS = "https://supabase.com/dashboard/project/antfofmwrmkadiavjycg/functions/secrets";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ImportarPedidosTiny() {
  const { unidades, padrao } = useUnidade();
  const qc = useQueryClient();
  const [info, setInfo] = useState<Resposta | null>(null);
  const [unidade, setUnidade] = useState("");
  const [rodando, setRodando] = useState(false);
  const [pausa, setPausa] = useState(0);
  const [erro, setErro] = useState("");
  const ativo = useRef(true);
  // pedidos do Tiny que já estão no ERP, venham da API ou da planilha exportada do Tiny
  const noErp = useQuery({
    queryKey: ["pedidos", "tiny_no_erp"],
    queryFn: async () => {
      const base = () => supabase.from("pedidos").select("created_at", { count: "exact" }).like("id_externo", "tiny%");
      const [primeiro, ultimo] = await Promise.all([base().order("created_at").limit(1), base().order("created_at", { ascending: false }).limit(1)]);
      if (primeiro.error) throw primeiro.error;
      return { total: primeiro.count ?? 0, de: primeiro.data?.[0]?.created_at ?? null, ate: ultimo.data?.[0]?.created_at ?? null };
    },
  });

  useEffect(() => {
    ativo.current = true;
    callFunction<Resposta>("tiny-historico", { acao: "status" }).then(setInfo).catch((e) => setErro((e as Error).message));
    return () => { ativo.current = false; };
  }, []);
  useEffect(() => { if (!unidade && padrao) setUnidade(padrao); }, [padrao, unidade]);

  async function rodar(inicio: "iniciar" | "continuar") {
    setErro("");
    setRodando(true);
    try {
      let r = await callFunction<Resposta>("tiny-historico", inicio === "iniciar" ? { acao: "iniciar", unidade_id: unidade } : { acao: "continuar" });
      setInfo(r);
      while (ativo.current && r.estado && r.estado.etapa !== "concluida") {
        if (r.aguardar) {
          for (let s = r.aguardar; s > 0 && ativo.current; s--) { setPausa(s); await espera(1000); }
          setPausa(0);
        }
        r = await callFunction<Resposta>("tiny-historico", { acao: "continuar" });
        if (!ativo.current) return;
        setInfo(r);
      }
      if (r.estado?.etapa === "concluida") {
        notify("Histórico de vendas do Tiny importado");
        noErp.refetch();
        ["pedidos", "notas_fiscais", "clientes"].forEach((t) => qc.invalidateQueries({ queryKey: [t] }));
      }
    } catch (e) {
      if (ativo.current) setErro((e as Error).message);
      // a recusa do Tiny fica guardada na importação: relê para o quadro mostrar a situação
      callFunction<Resposta>("tiny-historico", { acao: "status" }).then((r) => { if (ativo.current) setInfo(r); }).catch(() => {});
    } finally {
      if (ativo.current) { setRodando(false); setPausa(0); }
    }
  }

  const e = info?.estado;
  const sit = situacaoHistorico(e);
  const travada = sit.tipo === "bloqueada" || sit.tipo === "parada";
  const t = e?.totais ?? {};
  const p = t.pedidos ?? {};
  const emAndamento = !!e && e.etapa !== "concluida";
  const posicao = ETAPAS.findIndex(([k]) => k === e?.etapa);
  const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR");

  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold">Pedidos de venda do Tiny (histórico completo)</h2>
      <p className="mb-3 text-sm text-slate-600">
        Traz todos os pedidos de venda do Tiny, de qualquer data e situação, com itens, cliente, vendedor, frete e pagamento. Eles aparecem em
        Venda de Peças e Venda de Máquinas com o número do Tiny, e cada nota fiscal já importada fica ligada ao seu pedido (a venda conta uma vez só
        nos relatórios). O histórico não mexe em estoque, contas a receber, comissão nem manda mensagem ao cliente.
      </p>
      <p className="mb-3 text-sm text-slate-600">
        Pode importar de novo quando quiser: pedido que já veio não duplica, e o que não mudou no Tiny nem é consultado. O Tiny limita as
        consultas por minuto (uma por pedido), então leva um tempo; se fechar a tela, ela continua de onde parou.
      </p>

      {!!noErp.data?.total && (
        <p className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          Já no ERP: <b>{n(noErp.data.total)} {pl(noErp.data.total, "pedido", "pedidos")} do Tiny</b>
          {noErp.data.de && noErp.data.ate ? `, de ${dataBR(noErp.data.de)} a ${dataBR(noErp.data.ate)}` : ""} (pela API ou pela planilha exportada do Tiny),
          em Venda de Peças e Venda de Máquinas.
        </p>
      )}

      {sit.tipo === "bloqueada" && (
        <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <b>A importação pela API está parada{sit.em ? ` desde ${dataBR(sit.em)}` : ""}:</b> {sit.mensagem}
          <span className="mt-1 block text-red-700">Enquanto o Tiny não liberar, nada novo entra por aqui; o que já está no ERP continua lá.</span>
        </div>
      )}
      {sit.tipo === "parada" && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <b>A importação pela API não andou{sit.desde ? ` desde ${dataBR(sit.desde)}` : ""}</b> e não trouxe nada: o Tiny não deixou consultar
          (a conta da MF estava com a API bloqueada). Clique em “Tentar de novo” para ver se o Tiny já liberou e qual é o motivo.
        </div>
      )}

      {info && !info.configurado && (
        <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Falta o token do Tiny. No Tiny, copie o token em <b>Configurações → Token API</b>. No Supabase, abra{" "}
          <a className="underline" href={SECRETS} target="_blank" rel="noreferrer">Edge Functions → Secrets</a> e crie o secret{" "}
          <b>TINY_API_TOKEN</b> com esse valor. Depois recarregue esta página.
        </div>
      )}

      {e && (
        <div className="mb-3 space-y-2 text-sm">
          {t.conta?.nome && <p className="text-slate-500">Conta do Tiny: <b>{t.conta.nome}</b>{t.conta.cnpj ? ` (${t.conta.cnpj})` : ""}</p>}
          <ul className="space-y-1">
            {ETAPAS.map(([k, rotulo], i) => {
              const feito = e.etapa === "concluida" || i < posicao;
              const agora = i === posicao;
              return (
                <li key={k} className={feito ? "text-green-700" : agora ? "font-semibold" : "text-slate-400"}>
                  {feito ? "✓" : agora ? "▸" : "·"} {rotulo}
                  {agora && k === "pedidos" && p.paginas ? ` (página ${e.pagina} de ${p.paginas})` : ""}
                  {agora && k === "notas" && t.notas?.paginas ? ` (página ${e.pagina} de ${t.notas.paginas})` : ""}
                </li>
              );
            })}
          </ul>
          {!trouxeAlgo(t) ? <p className="text-slate-500">Nada veio pela API até agora.</p> : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
            <span>Pedidos novos: <b>{n(p.novos)}</b></span>
            <span>Já estavam no ERP: <b>{n((p.existentes ?? 0) + (p.pulados ?? 0))}</b></span>
            <span>Clientes cadastrados: <b>{n(p.clientes_novos)}</b></span>
            <span>Itens sem cadastro: <b>{n(p.itens_sem_cadastro)}</b></span>
            <span>Notas do Tiny lidas: <b>{n(t.notas?.lidas)}</b></span>
            <span>Notas ligadas aos pedidos: <b>{n((t.notas_ligadas?.pela_nota ?? 0) + (t.notas_ligadas?.pelo_valor ?? 0))}</b></span>
          </div>
          )}
          {!!p.itens_sem_cadastro && (
            <p className="text-xs text-slate-500">
              Item sem produto no cadastro entra como “Item do Tiny sem cadastro” (ou “Máquina do Tiny sem cadastro”), com o código e a descrição
              originais no pedido.
            </p>
          )}
          {!!p.total_diferente && (
            <p className="text-xs text-amber-700">
              {n(p.total_diferente)} {pl(Number(p.total_diferente), "pedido ficou", "pedidos ficaram")} com total diferente do Tiny (veja a observação do pedido).
            </p>
          )}
          {!!e.erros?.length && (
            <details className="text-xs text-red-700">
              <summary className="cursor-pointer">{e.erros.length} {pl(e.erros.length, "aviso", "avisos")} (os demais pedidos seguiram)</summary>
              <ul className="mt-1 list-disc pl-5">{e.erros.slice(-15).map((x, i) => <li key={i}>{x.mensagem}</li>)}</ul>
            </details>
          )}
          {e.etapa === "concluida" && e.concluido_em && (
            <p className="text-green-700">Concluída em {new Date(e.concluido_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.</p>
          )}
        </div>
      )}

      {pausa > 0 && <p className="mb-2 text-sm text-amber-700">O Tiny pediu uma pausa (limite de consultas por minuto). Continua em {pausa} s…</p>}
      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}

      {info?.configurado && (
        <div className="flex flex-wrap items-end gap-3">
          {!emAndamento && (
            <Field label="Unidade da conta do Tiny" className="w-60">
              <select className="input" value={unidade} onChange={(ev) => setUnidade(ev.target.value)} disabled={rodando}>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Field>
          )}
          {rodando ? (
            <Button type="button" variant="secondary" onClick={() => { ativo.current = false; setRodando(false); setPausa(0); }}>Pausar</Button>
          ) : emAndamento ? (
            <Button type="button" variant={travada ? "secondary" : undefined} onClick={() => { ativo.current = true; rodar("continuar"); }}>
              {travada ? "Tentar de novo" : "Continuar importação"}
            </Button>
          ) : (
            <Button type="button" disabled={!unidade} onClick={() => { ativo.current = true; rodar("iniciar"); }}>
              {e?.etapa === "concluida" ? "Buscar de novo (só o que mudou)" : "Importar os pedidos do Tiny"}
            </Button>
          )}
          {rodando && <span className="text-sm text-slate-500">Importando… pode continuar usando o ERP em outra aba.</span>}
        </div>
      )}
    </Card>
  );
}
