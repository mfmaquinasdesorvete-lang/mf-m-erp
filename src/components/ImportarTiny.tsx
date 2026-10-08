import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field } from "@/components/ui";
import { notify } from "@/lib/notify";
import { callFunction } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";

type Estado = {
  etapa: string; pagina: number; indice: number; unidade_id: string | null;
  totais: Record<string, any>; erros: { quando: string; etapa: string; mensagem: string }[];
  iniciado_em: string | null; concluido_em: string | null;
};
type Resposta = { configurado: boolean; estado: Estado | null; aguardar?: number };

const ETAPAS: [string, string][] = [
  ["contatos", "Clientes, fornecedores e transportadoras"],
  ["produtos", "Produtos e estoque"],
  ["receber_aberto", "Contas a receber em aberto"],
  ["receber_parcial", "Contas a receber parcialmente pagas"],
  ["pagar_aberto", "Contas a pagar em aberto"],
  ["pagar_parcial", "Contas a pagar parcialmente pagas"],
];
const SECRETS = "https://supabase.com/dashboard/project/antfofmwrmkadiavjycg/functions/secrets";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Traz do Tiny / Olist ERP os cadastros, produtos com estoque e contas em aberto (pela API). */
export function ImportarTiny() {
  const { unidades, padrao } = useUnidade();
  const qc = useQueryClient();
  const [info, setInfo] = useState<Resposta | null>(null);
  const [unidade, setUnidade] = useState("");
  const [rodando, setRodando] = useState(false);
  const [pausa, setPausa] = useState(0);
  const [erro, setErro] = useState("");
  const ativo = useRef(true);

  useEffect(() => {
    ativo.current = true;
    callFunction<Resposta>("tiny-importar", { acao: "status" }).then(setInfo).catch((e) => setErro((e as Error).message));
    return () => { ativo.current = false; };
  }, []);
  useEffect(() => { if (!unidade && padrao) setUnidade(padrao); }, [padrao, unidade]);

  async function rodar(inicio: "iniciar" | "continuar") {
    setErro("");
    setRodando(true);
    try {
      let r = await callFunction<Resposta>("tiny-importar", inicio === "iniciar" ? { acao: "iniciar", unidade_id: unidade } : { acao: "continuar" });
      setInfo(r);
      while (ativo.current && r.estado && r.estado.etapa !== "concluida") {
        if (r.aguardar) {
          for (let s = r.aguardar; s > 0 && ativo.current; s--) { setPausa(s); await espera(1000); }
          setPausa(0);
        }
        r = await callFunction<Resposta>("tiny-importar", { acao: "continuar" });
        if (!ativo.current) return;
        setInfo(r);
      }
      if (r.estado?.etapa === "concluida") {
        notify("Importação do Tiny concluída");
        ["clientes", "fornecedores", "transportadoras", "produtos", "contas_receber", "contas_pagar", "estoque_unidade"]
          .forEach((t) => qc.invalidateQueries({ queryKey: [t] }));
      }
    } catch (e) {
      if (ativo.current) setErro((e as Error).message);
    } finally {
      if (ativo.current) { setRodando(false); setPausa(0); }
    }
  }

  const e = info?.estado;
  const t = e?.totais ?? {};
  const emAndamento = !!e && e.etapa !== "concluida";
  const posicao = ETAPAS.findIndex(([k]) => k === e?.etapa);
  const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR");

  return (
    <Card className="p-4">
      <h2 className="mb-1 font-semibold">Importar do Tiny / Olist</h2>
      <p className="mb-3 text-sm text-slate-600">
        Traz do Tiny os clientes, fornecedores e transportadoras, os produtos (com NCM, preços, fotos e estoque) e as contas a receber e a pagar em aberto.
        Pode importar de novo: o que já veio é atualizado, nada é duplicado. O Tiny limita as consultas por minuto, então leva um tempo;
        se fechar a tela, ela continua de onde parou.
      </p>

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
                  {agora && (k === "contatos" || k === "produtos") && t[k]?.paginas ? ` (página ${e.pagina} de ${t[k].paginas})` : ""}
                </li>
              );
            })}
          </ul>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
            <span>Clientes novos: <b>{n(t.contatos?.clientes)}</b></span>
            <span>Fornecedores novos: <b>{n(t.contatos?.fornecedores)}</b></span>
            <span>Transportadoras novas: <b>{n(t.contatos?.transportadoras)}</b></span>
            <span>Cadastros atualizados: <b>{n(t.contatos?.atualizados)}</b></span>
            <span>Produtos novos: <b>{n(t.produtos?.criados)}</b></span>
            <span>Produtos atualizados: <b>{n(t.produtos?.atualizados)}</b></span>
            <span>Produtos com estoque: <b>{n(t.produtos?.com_estoque)}</b></span>
            <span>Contas a receber: <b>{n(t.receber?.criadas)}</b></span>
            <span>Contas a pagar: <b>{n(t.pagar?.criadas)}</b></span>
          </div>
          {!!(t.produtos?.ignorados || t.contatos?.ignorados) && (
            <p className="text-xs text-slate-500">
              Ficaram de fora {n((t.produtos?.ignorados ?? 0) + (t.contatos?.ignorados ?? 0))} registros: serviços, agrupadores de variações
              (cada variação entra como produto), contatos excluídos e contatos que são só vendedor ou funcionário.
            </p>
          )}
          {!!t.produtos?.negativos && <p className="text-xs text-amber-700">{n(t.produtos.negativos)} produto(s) estavam com estoque negativo no Tiny e entraram com estoque zero.</p>}
          {!!e.erros?.length && (
            <details className="text-xs text-red-700">
              <summary className="cursor-pointer">{e.erros.length} registro(s) com erro (os demais seguiram)</summary>
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
            <Field label="Estoque e contas entram na unidade" className="w-60">
              <select className="input" value={unidade} onChange={(ev) => setUnidade(ev.target.value)} disabled={rodando}>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Field>
          )}
          {rodando ? (
            <Button type="button" variant="secondary" onClick={() => { ativo.current = false; setRodando(false); setPausa(0); }}>Pausar</Button>
          ) : emAndamento ? (
            <Button type="button" onClick={() => { ativo.current = true; rodar("continuar"); }}>Continuar importação</Button>
          ) : (
            <Button type="button" disabled={!unidade} onClick={() => { ativo.current = true; rodar("iniciar"); }}>
              {e?.etapa === "concluida" ? "Importar de novo (atualiza)" : "Importar tudo do Tiny"}
            </Button>
          )}
          {rodando && <span className="text-sm text-slate-500">Importando… pode continuar usando o ERP em outra aba.</span>}
        </div>
      )}
    </Card>
  );
}
