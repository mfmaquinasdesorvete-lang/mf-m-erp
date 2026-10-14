// Configurações → Descontos: o máximo por tipo de venda (balcão, WhatsApp, telefone…) e forma de pagamento, a senha de
// aprovação de cada administrador e o histórico de quem pediu e quem aprovou. Acima do máximo, o PDV e o pedido pedem
// a senha de um administrador.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { CANAIS_DESCONTO, FORMAS_DESCONTO, pctTexto, rotuloRegra, type RegraDesconto } from "@/lib/descontos";
import { Bloco, CabecalhoSecao, secaoPorId } from "./comum";
import { confirmar } from "@/components/Dialogos";

type Aprovacao = {
  id: string; contexto: string; percentual: number; maximo_percentual: number | null; canal: string | null; forma_pagamento: string | null;
  aprovado_por_nome: string | null; solicitado_por_nome: string | null; motivo: string | null; criado_em: string; usado_em: string | null;
  pedido?: { numero: number } | null;
};
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const ordemCanal = Object.keys(CANAIS_DESCONTO), ordemForma = Object.keys(FORMAS_DESCONTO);

export function ConfigDescontos() {
  const s = secaoPorId("descontos")!;
  const { papel } = usePerfil();
  const admin = papel === "admin";
  const invalidar = useInvalidate();
  const { data: regras = [], isLoading } = useRows<RegraDesconto>("regras_desconto", { order: "canal", ascending: true });
  const { data: aprovacoes = [] } = useRows<Aprovacao>("aprovacoes_desconto", { select: "*, pedido:pedidos(numero)", order: "criado_em", ascending: false });
  const lista = useMemo(() => [...regras].sort((a, b) => ordemCanal.indexOf(a.canal) - ordemCanal.indexOf(b.canal) || ordemForma.indexOf(a.forma_pagamento) - ordemForma.indexOf(b.forma_pagamento)), [regras]);
  const [nova, setNova] = useState({ canal: "todos", forma_pagamento: "qualquer", maximo: "" });
  const [ocupado, setOcupado] = useState(false);

  async function rodar(acao: () => PromiseLike<{ error: unknown }>, ok: string) {
    setOcupado(true);
    try {
      const { error } = await acao();
      if (error) throw error;
      notify(ok);
      invalidar("regras_desconto");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  const pct = (v: string) => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null; };

  function adicionar(e: FormEvent) {
    e.preventDefault();
    const m = pct(nova.maximo);
    if (m === null || nova.maximo === "") return notify("Desconto máximo: de 0 a 100%", "erro");
    if (regras.some((r) => r.canal === nova.canal && r.forma_pagamento === nova.forma_pagamento)) return notify("Já existe regra para esse tipo de venda e pagamento: mude o máximo na lista", "erro");
    rodar(() => supabase.from("regras_desconto").insert({ canal: nova.canal, forma_pagamento: nova.forma_pagamento, maximo_percentual: m }), "Regra de desconto criada")
      .then(() => setNova((x) => ({ ...x, maximo: "" })));
  }

  return (
    <div className="max-w-4xl">
      <CabecalhoSecao s={s} />
      <div className="space-y-5">
        <Bloco titulo="Desconto máximo por tipo de venda" descricao={<>Acima do máximo, o PDV e o pedido pedem a senha de aprovação de um administrador.
          Vale a regra mais específica: tipo de venda + pagamento, depois só o tipo de venda, depois só o pagamento, depois "Todas as vendas". Sem regra, não há limite.</>}>
          {isLoading ? <p className="text-sm text-slate-500">Carregando…</p> : !lista.length ? (
            <p className="mb-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">Nenhuma regra ainda: hoje não há limite de desconto. Comece por "Todas as vendas · Qualquer pagamento".</p>
          ) : (
            <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {lista.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  <span className={`min-w-0 flex-1 font-medium ${r.ativo ? "text-fg" : "text-slate-400 line-through"}`}>{rotuloRegra(r.canal, r.forma_pagamento)}{r.forma_pagamento === "qualquer" && r.canal !== "todos" ? " · qualquer pagamento" : ""}</span>
                  <label className="flex items-center gap-1.5 text-sm">
                    <span className="text-slate-500">até</span>
                    <input className="input w-20 py-1 text-right" inputMode="decimal" defaultValue={String(r.maximo_percentual).replace(".", ",")} disabled={!admin || ocupado}
                      key={`${r.id}-${r.maximo_percentual}`} aria-label={`Desconto máximo de ${rotuloRegra(r.canal, r.forma_pagamento)}`}
                      onBlur={(e) => { const m = pct(e.target.value); if (m !== null && m !== Number(r.maximo_percentual)) rodar(() => supabase.from("regras_desconto").update({ maximo_percentual: m, updated_at: new Date().toISOString() }).eq("id", r.id), "Máximo atualizado"); }} />
                    <span className="text-slate-500">%</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={r.ativo} disabled={!admin || ocupado}
                      onChange={(e) => rodar(() => supabase.from("regras_desconto").update({ ativo: e.target.checked }).eq("id", r.id), e.target.checked ? "Regra ligada" : "Regra desligada")} />
                    ativa
                  </label>
                  {admin && (
                    <Button type="button" variant="ghost" className="!min-h-0 !px-2" aria-label={`Apagar a regra ${rotuloRegra(r.canal, r.forma_pagamento)}`} disabled={ocupado}
                      onClick={async () => (await confirmar("Apagar esta regra?")) && rodar(() => supabase.from("regras_desconto").delete().eq("id", r.id), "Regra apagada")}><Trash2 size={16} /></Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {admin ? (
            <form onSubmit={adicionar} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end">
              <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Tipo de venda</span>
                <select className="input" value={nova.canal} onChange={(e) => setNova({ ...nova, canal: e.target.value })}>
                  {Object.entries(CANAIS_DESCONTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Pagamento</span>
                <select className="input" value={nova.forma_pagamento} onChange={(e) => setNova({ ...nova, forma_pagamento: e.target.value })}>
                  {Object.entries(FORMAS_DESCONTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Máximo (%)</span>
                <input className="input text-right" inputMode="decimal" placeholder="10" value={nova.maximo} onChange={(e) => setNova({ ...nova, maximo: e.target.value.replace(/[^\d,.]/g, "").slice(0, 6) })} /></label>
              <Button disabled={ocupado}><Plus size={16} /> Adicionar</Button>
            </form>
          ) : <p className="text-sm text-slate-500">Só o administrador muda as regras.</p>}
        </Bloco>

        {admin && <SenhaAprovacao />}

        <Bloco titulo="Aprovações recentes" descricao="Cada desconto acima do máximo que foi aprovado: quem pediu, quem aprovou e em qual venda.">
          {!aprovacoes.length ? <p className="text-sm text-slate-500">Nenhuma aprovação ainda.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {aprovacoes.slice(0, 50).map((a) => (
                <li key={a.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2 [overflow-wrap:anywhere]">
                  <span className="whitespace-nowrap text-slate-500">{quando(a.criado_em)}</span>
                  <b>{pctTexto(Number(a.percentual))}</b>
                  {a.maximo_percentual != null && <span className="text-slate-500">(máx. {pctTexto(Number(a.maximo_percentual))})</span>}
                  <span>{a.contexto === "pdv" ? "PDV" : "Pedido"}{a.pedido?.numero ? ` #${a.pedido.numero}` : ""} · {rotuloRegra(a.canal ?? "todos", a.forma_pagamento)}</span>
                  <span className="text-slate-600">aprovado por {a.aprovado_por_nome ?? "—"}{a.solicitado_por_nome ? `, pedido por ${a.solicitado_por_nome}` : ""}</span>
                  {a.contexto === "pdv" && !a.usado_em && <span className="text-xs text-slate-400">(não usada)</span>}
                  {a.motivo && <span className="w-full text-slate-500">Motivo: {a.motivo}</span>}
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
    </div>
  );
}

function SenhaAprovacao() {
  const [tem, setTem] = useState<boolean | null>(null);
  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { supabase.rpc("tem_senha_aprovacao").then(({ data }) => setTem(!!data)); }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 6) return notify("A senha de aprovação precisa de pelo menos 6 caracteres", "erro");
    if (senha !== conf) return notify("As duas senhas não são iguais", "erro");
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("definir_senha_aprovacao", { p_senha: senha });
      if (error) throw error;
      setTem(true); setSenha(""); setConf("");
      notify("Senha de aprovação salva");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <Bloco titulo={<span className="inline-flex items-center gap-2"><KeyRound size={18} aria-hidden /> Minha senha de aprovação</span>}
      descricao={<>Use uma senha diferente da de entrar no ERP. Ela é digitada só na hora de aprovar um desconto e não fica salva na tela.
        {tem === true ? " Você já tem uma: preencha abaixo só para trocar." : tem === false ? " Você ainda não tem: crie para poder aprovar descontos." : ""}</>}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">{tem ? "Nova senha de aprovação" : "Senha de aprovação"}</span>
          <input className="input" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
        <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Repita a senha</span>
          <input className="input" type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} /></label>
        <Button disabled={ocupado || !senha}>{tem ? "Trocar senha" : "Criar senha"}</Button>
      </form>
    </Bloco>
  );
}
