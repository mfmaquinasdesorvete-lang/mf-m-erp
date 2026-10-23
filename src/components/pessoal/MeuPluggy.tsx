// Meu Pluggy no painel pessoal: liga cada conta do banco (conectada no meu.pluggy.ai) a uma conta do painel, e o
// extrato entra sozinho uma vez por dia pela função pessoal-pluggy. Nada de senha do banco no ERP: a chave da Pluggy
// fica só nos secrets do Supabase e o Item ID (não é segredo) é copiado do Dashboard da Pluggy.
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Plug, RefreshCw } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataHoraBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { somarDiasPessoal, type ContaPessoal } from "@/lib/pessoal";

type Conexao = { id: string; conta_id: string; instituicao: string | null; nome_externo: string | null; desde: string; ativa: boolean; sincronizado_em: string | null; ultimas_novas: number | null; saldo_banco: number | null; erro: string | null };
type ContaExt = { id: string; nome: string; tipo: string; saldo: number | null };

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("pessoal-pluggy", { body: corpo });
  if (error || data?.error) {
    const ctx = (error as { context?: Response } | null)?.context;
    const j = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
    throw new Error(data?.error ?? j?.error ?? error?.message ?? "o Meu Pluggy não respondeu");
  }
  return data as T;
}

export function MeuPluggy({ contas, ultimoDe, onClose }: { contas: ContaPessoal[]; ultimoDe: (contaId: string) => string | null; onClose: () => void }) {
  const invalidar = useInvalidate();
  const { data: conexoes = [] } = useRows<Conexao>("pessoal_conexoes", { order: "criado_em", ascending: true });
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [item, setItem] = useState("");
  const [lendo, setLendo] = useState(false);
  const [banco, setBanco] = useState<{ instituicao: string | null; contas: ContaExt[] } | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [desde, setDesde] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => { chamar<{ configurado: boolean }>({ acao: "status" }).then((r) => setConfigurado(r.configurado), () => setConfigurado(false)); }, []);

  async function verContas() {
    setLendo(true);
    try {
      const r = await chamar<{ instituicao: string | null; contas: ContaExt[] }>({ acao: "contas", item_id: item.trim() });
      setBanco(r);
      if (!r.contas.length) notify("Nenhuma conta neste banco do Meu Pluggy");
    } catch (e) { notifyError(e); } finally { setLendo(false); }
  }
  async function ligar(c: ContaExt) {
    const destino = escolha[c.id] ?? "";
    const contaId = destino && destino !== "nova" ? destino : null;
    // conta que já tem extrato: busca do dia do último lançamento (o que já está não entra de novo)
    const padrao = contaId ? (ultimoDe(contaId) ?? somarDiasPessoal(hoje(), -90)) : somarDiasPessoal(hoje(), -90);
    setOcupado(c.id);
    try {
      const r = await chamar<{ novas?: number; ja_estavam?: number; erro?: string }>({
        acao: "ligar", item_id: item.trim(), conta_externa_id: c.id, conta_id: contaId, nova: contaId ? undefined : { nome: c.nome }, desde: desde[c.id] || padrao,
      });
      if (r.erro) throw new Error(r.erro);
      notify(`Ligada: ${r.novas ?? 0} ${pl(r.novas ?? 0, "lançamento novo", "lançamentos novos")}${r.ja_estavam ? ` (${r.ja_estavam} já estavam)` : ""}`);
      invalidar("pessoal_conexoes", "pessoal_contas", "pessoal_lancamentos");
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }
  async function buscar(id?: string) {
    setOcupado(id ?? "todas");
    try {
      const r = await chamar<{ resultado: Record<string, { novas?: number; erro?: string }> }>({ acao: "sincronizar", conexao_id: id });
      const v = Object.values(r.resultado ?? {});
      const erro = v.find((x) => x.erro)?.erro;
      if (erro) notifyError(new Error(erro));
      else notify(`${v.reduce((t, x) => t + (x.novas ?? 0), 0)} lançamentos novos`);
      invalidar("pessoal_conexoes", "pessoal_lancamentos");
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }
  async function ligarDesligar(c: Conexao) {
    const { error } = await supabase.from("pessoal_conexoes").update({ ativa: !c.ativa }).eq("id", c.id);
    if (error) return notifyError(error);
    invalidar("pessoal_conexoes");
  }
  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "conta";

  return (
    <Modal open onClose={onClose} title="Meu Pluggy: extrato automático" wide>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">O <b>Meu Pluggy</b> é o Open Finance gratuito para uso pessoal. Os bancos que você conectou lá (Nubank, Itaú, BV, Mercado Pago…) mandam o extrato para cá <b>uma vez por dia</b>, sem repetir o que já entrou pelo OFX ou PDF.</p>

        {configurado === false && (
          <ol className="list-decimal space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 pl-7 text-amber-900">
            <li>Entre no <a className="font-semibold underline" href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">Dashboard da Pluggy</a> com a <b>mesma conta</b> do Meu Pluggy e crie uma aplicação.</li>
            <li>Na aplicação, abra <b>Demo → Conectar conta</b>, escolha <b>MeuPluggy</b> (não o banco) e entre com a conta do Meu Pluggy. Cada banco vira um item.</li>
            <li>Copie o <b>Client ID</b> e o <b>Client Secret</b> da aplicação e cadastre no Supabase (Edge Functions → Secrets) como <code>PLUGGY_PESSOAL_CLIENT_ID</code> e <code>PLUGGY_PESSOAL_CLIENT_SECRET</code>. Não cole aqui nem mande por mensagem.</li>
            <li>Volte aqui, cole o <b>Item ID</b> de cada banco (Demo → Itens conectados) e ligue as contas.</li>
          </ol>
        )}
        {configurado && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Item ID do banco (Dashboard da Pluggy → Demo → Itens conectados)" className="min-w-0 flex-1 basis-72">
              <input className="input font-mono text-xs" value={item} onChange={(e) => { setItem(e.target.value); setBanco(null); }} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </Field>
            <Button onClick={verContas} disabled={lendo || item.trim().length < 36}>{lendo ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Ver as contas</Button>
          </div>
        )}
        {banco && (
          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-3 py-2 font-bold text-fg">{banco.instituicao ?? "Banco"}</div>
            <ul className="divide-y divide-slate-100">
              {banco.contas.map((c) => {
                const ligada = conexoes.find((x) => x.nome_externo === c.nome && x.ativa);
                return (
                  <li key={c.id} className="flex flex-wrap items-end gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 basis-48"><b>{c.nome}</b><span className="block text-xs text-slate-500">{c.tipo === "CREDIT" ? "cartão de crédito" : "conta"}{c.saldo != null && ` · ${c.tipo === "CREDIT" ? "fatura" : "saldo"} ${brl(c.saldo)}`}{ligada && " · já ligada"}</span></span>
                    <Field label="Lançar na conta do painel">
                      <select className="input" value={escolha[c.id] ?? ""} onChange={(e) => setEscolha({ ...escolha, [c.id]: e.target.value })}>
                        <option value="">Criar conta nova</option>
                        {contas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                      </select>
                    </Field>
                    <Field label="Buscar desde"><input type="date" className="input w-auto" value={desde[c.id] ?? ""} max={hoje()} onChange={(e) => setDesde({ ...desde, [c.id]: e.target.value })} /></Field>
                    <Button onClick={() => ligar(c)} disabled={!!ocupado}>{ocupado === c.id ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Ligar</Button>
                  </li>
                );
              })}
            </ul>
            <p className="px-3 pb-2 text-xs text-slate-500">Sem data, a conta que já tem extrato busca do dia do último lançamento; a nova, dos últimos 90 dias. A conta nova começa com o saldo de hoje do banco.</p>
          </div>
        )}

        {conexoes.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2"><h3 className="font-bold text-fg">Contas ligadas</h3>
              <Button variant="secondary" onClick={() => buscar()} disabled={!!ocupado || !configurado}>{ocupado === "todas" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Buscar agora</Button></div>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {conexoes.map((c) => (
                <li key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${c.ativa ? "" : "opacity-50"}`}>
                  <span className="min-w-0 flex-1 basis-56"><b>{c.instituicao ?? "Banco"}</b> · {c.nome_externo} → <b>{nomeConta(c.conta_id)}</b>
                    <span className="block text-xs text-slate-500">{c.sincronizado_em ? `última busca ${dataHoraBR(c.sincronizado_em)} · ${c.ultimas_novas ?? 0} novos` : "ainda não buscou"}{c.saldo_banco != null && ` · no banco: ${brl(c.saldo_banco)}`}</span>
                    {c.erro && <span className="block text-xs text-red-700">{c.erro}</span>}</span>
                  <button type="button" className="link-acao text-xs" onClick={() => buscar(c.id)} disabled={!!ocupado || !c.ativa}>Buscar</button>
                  <button type="button" className="text-xs font-semibold text-slate-600 hover:underline" onClick={() => ligarDesligar(c)}>{c.ativa ? "Desligar" : "Ligar de novo"}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <a className="inline-flex items-center gap-1 text-xs text-brand hover:underline" href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">Abrir o Meu Pluggy <ExternalLink size={12} /></a>
      </div>
    </Modal>
  );
}
