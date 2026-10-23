import { useEffect, useRef, useState } from "react";
import { confirmar } from "@/components/Dialogos";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, chip } from "@/components/ui";
import { notify } from "@/lib/notify";
import { callFunction } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { pl } from "@/lib/format";
import { DecidirRecebidasTiny } from "@/components/DecidirRecebidasTiny";

type Estado = {
  etapa: string; pagina: number; indice: number; unidade_id: string | null;
  totais: Record<string, any>; erros: { quando: string; etapa: string; mensagem: string }[];
  iniciado_em: string | null; concluido_em: string | null;
};
type Resposta = { configurado: boolean; estado: Estado | null; aguardar?: number };
type RespDatas = { pagina: number | null; paginas: number; lidos: number; com_data: number; gravados: number; aguardar?: number; campos?: string[] };
type ProgressoDatas = { pagina: number | null; paginas: number; lidos: number; comData: number; gravados: number; campos?: string[]; fim: boolean };
/** Resposta de uma rodada dos recebimentos (contas já pagas no Tiny) e o acumulado na tela. */
type RespRecebidas = {
  pagina: number | null; indice: number; paginas: number; lidas: number; aguardar?: number; erros?: string[]; campos?: string[];
  criadas?: number; baixadas?: number; ja_existiam?: number; ja_na_venda?: number; com_venda?: number; sem_data?: number; ignoradas?: number;
};
type ProgressoRecebidas = {
  pagina: number | null; indice: number; paginas: number; lidas: number; criadas: number; baixadas: number; jaExistiam: number;
  jaNaVenda: number; comVenda: number; semData: number; ignoradas: number; erros: string[]; campos?: string[]; fim: boolean;
};

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
  const [datas, setDatas] = useState<ProgressoDatas | null>(null);
  const [recebidas, setRecebidas] = useState<ProgressoRecebidas | null>(null);
  const [abaRecebidas, setAbaRecebidas] = useState<"buscar" | "decidir">("buscar");
  const ativo = useRef(true);

  useEffect(() => {
    ativo.current = true;
    callFunction<Resposta>("tiny-importar", { acao: "status" }).then(setInfo).catch((e) => setErro((e as Error).message));
    return () => { ativo.current = false; };
  }, []);
  useEffect(() => { if (!unidade && padrao) setUnidade(padrao); }, [padrao, unidade]);

  async function rodar(inicio: "iniciar" | "continuar", soCadastros = false) {
    setErro("");
    setRodando(true);
    try {
      let r = await callFunction<Resposta>("tiny-importar", inicio === "iniciar"
        ? { acao: "iniciar", unidade_id: unidade, so_cadastros: soCadastros } : { acao: "continuar" });
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
        notify(r.estado.totais?.so_cadastros ? "Cadastros do Tiny atualizados" : "Importação do Tiny concluída");
        ["clientes", "fornecedores", "transportadoras", "produtos", "contas_receber", "contas_pagar", "estoque_unidade"]
          .forEach((t) => qc.invalidateQueries({ queryKey: [t] }));
      }
    } catch (e) {
      if (ativo.current) setErro((e as Error).message);
    } finally {
      if (ativo.current) { setRodando(false); setPausa(0); }
    }
  }

  /** Só a data de cadastro no Tiny dos contatos já importados: é ela que vale como "cliente desde" (não a da importação). */
  async function trazerDatas() {
    setErro("");
    setRodando(true);
    const p: ProgressoDatas = { pagina: 1, paginas: 1, lidos: 0, comData: 0, gravados: 0, fim: false };
    setDatas({ ...p });
    try {
      while (p.pagina && ativo.current) {
        const r: RespDatas = await callFunction<RespDatas>("tiny-importar", { acao: "datas_contatos", pagina: p.pagina });
        p.lidos += r.lidos; p.comData += r.com_data; p.gravados += r.gravados; p.paginas = r.paginas;
        if (r.campos) p.campos = r.campos;
        p.pagina = r.pagina;
        if (ativo.current) setDatas({ ...p });
        if (r.aguardar) {
          for (let s = r.aguardar; s > 0 && ativo.current; s--) { setPausa(s); await espera(1000); }
          setPausa(0);
        }
      }
      if (!p.pagina) {
        p.fim = true;
        setDatas({ ...p });
        notify(p.comData ? `Data de cadastro do Tiny gravada em ${p.gravados} clientes` : "O Tiny não mandou a data de cadastro dos contatos");
        qc.invalidateQueries({ queryKey: ["clientes_desde"] });
        qc.invalidateQueries({ queryKey: ["clientes"] });
      }
    } catch (x) {
      if (ativo.current) setErro((x as Error).message);
    } finally {
      if (ativo.current) { setRodando(false); setPausa(0); }
    }
  }

  /**
   * Contas a receber já pagas no Tiny: entram como recebidas, ligadas à venda e ao cliente, e a conciliação do extrato passa
   * a sugerir o Pix ou depósito de cada uma (sinal e saldo das máquinas inclusive). Pode rodar de novo: não duplica.
   */
  async function trazerRecebidas() {
    setErro("");
    setRodando(true);
    const p: ProgressoRecebidas = {
      pagina: 1, indice: 0, paginas: 1, lidas: 0, criadas: 0, baixadas: 0, jaExistiam: 0, jaNaVenda: 0, comVenda: 0, semData: 0,
      ignoradas: 0, erros: [], fim: false,
    };
    setRecebidas({ ...p });
    try {
      while (p.pagina && ativo.current) {
        const r = await callFunction<RespRecebidas>("tiny-importar", { acao: "recebidas", unidade_id: unidade, pagina: p.pagina, indice: p.indice });
        p.lidas += r.lidas; p.paginas = r.paginas;
        p.criadas += r.criadas ?? 0; p.baixadas += r.baixadas ?? 0; p.jaExistiam += r.ja_existiam ?? 0; p.jaNaVenda += r.ja_na_venda ?? 0;
        p.comVenda += r.com_venda ?? 0; p.semData += r.sem_data ?? 0; p.ignoradas += r.ignoradas ?? 0;
        p.erros = [...p.erros, ...(r.erros ?? [])].slice(-20);
        if (r.campos) p.campos = r.campos;
        p.pagina = r.pagina; p.indice = r.indice;
        if (ativo.current) setRecebidas({ ...p });
        if (r.aguardar) {
          for (let s = r.aguardar; s > 0 && ativo.current; s--) { setPausa(s); await espera(1000); }
          setPausa(0);
        }
      }
      if (!p.pagina) {
        p.fim = true;
        setRecebidas({ ...p });
        notify(`Recebimentos do Tiny: ${p.criadas} ${pl(p.criadas, "conta recebida entrou", "contas recebidas entraram")}${p.baixadas ? `, ${p.baixadas} baixadas` : ""}`);
        ["contas_receber", "extrato_lancamentos", "pedidos"].forEach((tb) => qc.invalidateQueries({ queryKey: [tb] }));
      }
    } catch (x) {
      if (ativo.current) setErro((x as Error).message);
    } finally {
      if (ativo.current) { setRodando(false); setPausa(0); }
    }
  }

  const e = info?.estado;
  const t = e?.totais ?? {};
  const emAndamento = !!e && e.etapa !== "concluida";
  const posicao = ETAPAS.findIndex(([k]) => k === e?.etapa);
  // "Atualizar cadastros do Tiny" só passa pelos contatos
  const etapasVistas = t.so_cadastros ? ETAPAS.slice(0, 1) : ETAPAS;
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
            {etapasVistas.map(([k, rotulo], i) => {
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
          {!!t.produtos?.negativos && <p className="text-xs text-amber-700">{n(t.produtos.negativos)} {pl(n(t.produtos.negativos), "produto", "produtos")} estavam com estoque negativo no Tiny e entraram com estoque zero.</p>}
          {!!e.erros?.length && (
            <details className="text-xs text-red-700">
              <summary className="cursor-pointer">{e.erros.length} {pl(e.erros.length, "registro", "registros")} com erro (os demais seguiram)</summary>
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
            <Button type="button" disabled={!unidade} onClick={async () => {
              // importar de novo sobrescreve no ERP o que veio do Tiny (preço, custo, NCM, categoria, endereços)
              if (e?.etapa === "concluida" && !(await confirmar("Importar de novo do Tiny? Preços, custos, NCM, categorias e endereços voltam para o que está no Tiny, desfazendo o que foi corrigido no ERP.", { perigo: true, ok: "Importar de novo" }))) return;
              ativo.current = true; rodar("iniciar");
            }}>
              {e?.etapa === "concluida" ? "Importar de novo (atualiza)" : "Importar tudo do Tiny"}
            </Button>
          )}
          {!rodando && (
            <Button type="button" variant="secondary" disabled={!unidade} onClick={async () => {
              if (!(await confirmar("Atualizar os cadastros do Tiny? Traz clientes, fornecedores e transportadoras com a data de cadastro no Tiny. Quem já está no ERP é atualizado com o que está no Tiny; cadastro que veio da My Frost só ganha o que estiver vazio. Produtos e contas não mudam.", { ok: "Atualizar cadastros" }))) return;
              ativo.current = true; rodar("iniciar", true);
            }}>
              Atualizar cadastros do Tiny
            </Button>
          )}
          {rodando && <span className="text-sm text-slate-500">Importando… pode continuar usando o ERP em outra aba.</span>}
        </div>
      )}

      {info?.configurado && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
          <p className="mb-2 text-slate-600">
            <b>Data de cadastro no Tiny:</b> os clientes trazidos do Tiny ficaram com a data da importação, e cliente importado não conta como
            novo. Este botão busca no Tiny só a data em que cada contato foi cadastrado lá, sem mudar mais nada.
          </p>
          {datas && (
            <p className="mb-2 text-slate-700">
              {datas.fim ? "Pronto: " : `Página ${datas.pagina ?? datas.paginas} de ${datas.paginas}: `}
              {datas.lidos.toLocaleString("pt-BR")} contatos lidos, {datas.comData.toLocaleString("pt-BR")} com data, {datas.gravados.toLocaleString("pt-BR")} gravadas.
              {datas.fim && !datas.comData && datas.campos && <span className="block text-amber-700">O Tiny não mandou a data de cadastro nesta consulta. Campos que vieram: {datas.campos.join(", ")}.</span>}
            </p>
          )}
          <Button type="button" variant="secondary" disabled={rodando} onClick={() => { ativo.current = true; trazerDatas(); }}>Trazer a data de cadastro do Tiny</Button>
        </div>
      )}

      {info?.configurado && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
          <p className="mb-2 text-slate-600">
            <b>Recebimentos do Tiny:</b> as contas a receber já pagas no Tiny (desde 2025) entram como recebidas, ligadas à venda e ao
            cliente. Aí a conciliação do extrato acha o Pix ou o depósito de cada uma — inclusive o sinal e o saldo das máquinas — e mostra em
            “Com sugestão” para aprovar. Pode rodar de novo: nada é duplicado, e venda que já tem conta no ERP fica como está.
          </p>
          <div className="mb-3 flex gap-1" role="tablist" aria-label="Recebimentos do Tiny">
            {([["buscar", "Buscar"], ["decidir", "Decidir"]] as const).map(([id, rotulo]) => (
              <button key={id} type="button" role="tab" aria-selected={abaRecebidas === id} onClick={() => setAbaRecebidas(id)}
                className={chip(abaRecebidas === id)}>
                {rotulo}
              </button>
            ))}
          </div>
          {abaRecebidas === "decidir" ? <DecidirRecebidasTiny /> : <>
          {recebidas && (
            <div className="mb-2 rounded-lg bg-slate-50 p-3 text-slate-700">
              <p>
                {recebidas.fim ? "Pronto: " : `Página ${recebidas.pagina ?? recebidas.paginas} de ${recebidas.paginas}: `}
                {n(recebidas.lidas)} contas lidas, <b>{n(recebidas.criadas)} entraram como recebidas</b> ({n(recebidas.comVenda)} ligadas a uma venda)
                {recebidas.baixadas ? `, ${n(recebidas.baixadas)} que estavam em aberto foram baixadas` : ""}.
              </p>
              {!!(recebidas.jaNaVenda || recebidas.jaExistiam || recebidas.ignoradas) && (
                <p className="text-xs text-slate-500">
                  Ficaram como estavam: {n(recebidas.jaNaVenda)} de vendas que já têm conta no ERP, {n(recebidas.jaExistiam)} que já tinham vindo do
                  Tiny e {n(recebidas.ignoradas)} sem valor ou data.
                </p>
              )}
              {!!recebidas.semData && (
                <p className="text-xs text-amber-700">
                  {n(recebidas.semData)} {pl(recebidas.semData, "veio", "vieram")} sem a data do pagamento: valeu a do vencimento.
                  {recebidas.campos && ` Campos que o Tiny mandou: ${recebidas.campos.join(", ")}.`}
                </p>
              )}
              {!!recebidas.erros.length && (
                <details className="text-xs text-red-700">
                  <summary className="cursor-pointer">{recebidas.erros.length} {pl(recebidas.erros.length, "conta", "contas")} com erro (as demais seguiram)</summary>
                  <ul className="mt-1 list-disc pl-5">{recebidas.erros.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </details>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Conta sem venda ligada entra na unidade" className="w-64">
              <select className="input" value={unidade} onChange={(ev) => setUnidade(ev.target.value)} disabled={rodando}>
                {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Field>
            <Button type="button" variant="secondary" disabled={rodando || !unidade} onClick={() => { ativo.current = true; trazerRecebidas(); }}>
              Buscar recebimentos do Tiny
            </Button>
          </div>
          </>}
        </div>
      )}
    </Card>
  );
}
