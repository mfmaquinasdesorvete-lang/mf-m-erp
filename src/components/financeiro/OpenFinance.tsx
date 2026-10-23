// Extrato automático pelo Open Finance (Pluggy): conectar a conta do banco, ver a situação de cada conexão,
// atualizar na hora, reconectar quando o consentimento vence e desligar.
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, KeyRound, Landmark, Loader2, PlugZap, RefreshCw, Unplug } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { DEMO, callFunction } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { confirmar } from "@/components/Dialogos";

export type ConexaoOF = {
  id: string; item_id: string; conta_externa_id: string; conta_bancaria_id: string; instituicao: string | null; conta_externa_nome: string | null;
  status: "ativa" | "erro" | "desligada"; status_provedor: string | null; erro: string | null; desde: string; sincronizado_em: string | null;
  ultimas_novas: number; saldo: number | null; saldo_em: string | null; consentimento_ate: string | null;
};
type ContaErp = { id: string; nome: string; ativo: boolean; saldo_inicial_data: string };
type ContaExterna = { id: string; nome: string; tipo: string; saldo: number | null };

const ha = (iso: string | null) => {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `em ${dataBR(iso)}`;
};

/** Abre a janela da Pluggy (o consentimento é feito no app/site do banco) e devolve o id da conexão. */
async function abrirJanela(token: string, atualizar?: string): Promise<string | null> {
  if (DEMO) return atualizar ?? "00000000-0000-4000-8000-00000000d3e0";
  const { PluggyConnect } = await import("pluggy-connect-sdk");
  return new Promise((resolve, reject) => {
    let feito = false;
    const janela = new PluggyConnect({
      connectToken: token, updateItem: atualizar, language: "pt", countries: ["BR"],
      onSuccess: ({ item }) => { feito = true; resolve(item.id); },
      onError: (e) => { feito = true; reject(new Error(e.message || "o banco não concluiu a conexão")); },
      onClose: () => { if (!feito) resolve(null); },
    });
    janela.init().catch(reject);
  });
}

export function OpenFinancePainel({ contas }: { contas: ContaErp[] }) {
  const { tem } = usePerfil();
  const admin = tem();
  const invalidar = useInvalidate();
  const { data: st, refetch } = useQuery({
    queryKey: ["openfinance_status"],
    queryFn: () => callFunction<{ configurado: boolean; origem: string | null }>("openfinance", { acao: "status" }),
    retry: false,
  });
  const { data: todas = [] } = useRows<ConexaoOF>("openfinance_conexoes");
  const conexoes = todas.filter((c) => c.status !== "desligada" && contas.some((b) => b.id === c.conta_bancaria_id));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [conectar, setConectar] = useState(false);
  const [chaves, setChaves] = useState(false);
  const nomeErp = (id: string) => contas.find((b) => b.id === id)?.nome ?? "—";

  async function acao(id: string, fn: () => Promise<unknown>, ok?: string) {
    setOcupado(id);
    try {
      await fn();
      if (ok) notify(ok);
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(null);
      invalidar("openfinance_conexoes", "extrato_lancamentos", "contas_receber", "contas_pagar");
    }
  }
  const atualizar = (c: ConexaoOF) => acao(c.id, async () => {
    const r = await callFunction<{ resultado: Record<string, { novas?: number; conciliadas?: number; erro?: string; aviso?: string }> }>("openfinance", { acao: "sincronizar", conexao_id: c.id, atualizar: true });
    const x = r.resultado?.[c.id];
    if (x?.erro) throw new Error(x.erro);
    notify(x?.novas ? `${x.novas} ${pl(x.novas, "lançamento", "lançamentos")} ${pl(x.novas, "novo", "novos")}${x.conciliadas ? `, ${x.conciliadas} ${pl(x.conciliadas, "conciliado", "conciliados")} ${pl(x.conciliadas, "sozinho", "sozinhos")}` : ""}` : "Extrato em dia: nada novo no banco");
  });
  const reconectar = (c: ConexaoOF) => acao(c.id, async () => {
    const { token } = await callFunction<{ token: string }>("openfinance", { acao: "token", item_id: c.item_id });
    if (!(await abrirJanela(token, c.item_id))) return;
    await callFunction("openfinance", { acao: "sincronizar", conexao_id: c.id, atualizar: true });
  }, "Conexão renovada");
  const desligar = async (c: ConexaoOF) => {
    if (!(await confirmar(`Parar de buscar o extrato de ${nomeErp(c.conta_bancaria_id)} pelo Open Finance? Os lançamentos que já vieram continuam no ERP.`))) return;
    acao(c.id, () => callFunction("openfinance", { acao: "desligar", conexao_id: c.id }), "Open Finance desligado nesta conta");
  };

  if (!st) return null;
  return (
    <Card className="mb-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold text-fg"><PlugZap size={17} className="text-modulo-texto" /> Extrato automático (Open Finance)</h2>
          <p className="text-sm text-slate-500">
            {st.configurado
              ? "O banco manda os lançamentos sozinho, de 4 em 4 horas, sem importar arquivo. O que tiver par certo já é conciliado."
              : "Conecte a conta do banco uma vez e os lançamentos chegam sozinhos, sem importar arquivo."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {st.configurado && <Button onClick={() => setConectar(true)} disabled={!contas.some((b) => b.ativo)}><Landmark size={16} /> Conectar banco</Button>}
          {admin && <Button variant={st.configurado ? "ghost" : "primary"} onClick={() => setChaves(true)}><KeyRound size={16} /> {st.configurado ? "Chaves" : "Ligar o Open Finance"}</Button>}
        </div>
      </div>

      {!st.configurado && !admin && <p className="mt-2 text-sm text-amber-800">Peça ao administrador para ligar o Open Finance (chaves da Pluggy).</p>}

      {conexoes.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {conexoes.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-fg">{nomeErp(c.conta_bancaria_id)}</div>
                <div className="text-xs text-slate-500">{[c.instituicao, c.conta_externa_nome].filter(Boolean).join(" · ")} · desde {dataBR(c.desde)}</div>
                {c.erro && <div className={`mt-1 flex items-start gap-1 text-xs ${c.status === "erro" ? "font-semibold text-red-700" : "text-amber-700"}`}><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {c.erro}</div>}
              </div>
              <div className="text-xs text-slate-600">
                <div className="flex items-center gap-1">
                  {c.status === "ativa" ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-red-600" />}
                  atualizado {ha(c.sincronizado_em)}{c.ultimas_novas ? ` · ${c.ultimas_novas} ${pl(c.ultimas_novas, "novo", "novos")}` : ""}
                </div>
                {c.saldo != null && <div>Saldo no banco: <b className="num">{brl(c.saldo)}</b>{c.saldo_em ? ` (${ha(c.saldo_em)})` : ""}</div>}
                {c.consentimento_ate && <div>Consentimento até {dataBR(c.consentimento_ate)}</div>}
              </div>
              <div className="flex flex-wrap gap-1">
                {c.status === "erro"
                  ? <Button variant="secondary" disabled={ocupado === c.id} onClick={() => reconectar(c)}><PlugZap size={15} /> Reconectar</Button>
                  : <Button variant="secondary" disabled={ocupado === c.id} onClick={() => atualizar(c)}>
                      {ocupado === c.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Atualizar agora
                    </Button>}
                <Button variant="ghost" title="Desligar o Open Finance nesta conta" aria-label="Desligar" disabled={ocupado === c.id} onClick={() => desligar(c)}><Unplug size={15} /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {conectar && <ConectarBanco contas={contas.filter((b) => b.ativo)} ocupadas={new Set(conexoes.map((c) => c.conta_bancaria_id))}
        existentes={[...new Map(conexoes.filter((c) => c.status !== "erro").map((c) => [c.item_id, { item_id: c.item_id, instituicao: c.instituicao }])).values()]}
        onClose={() => setConectar(false)} onPronto={() => { setConectar(false); invalidar("openfinance_conexoes", "extrato_lancamentos", "contas_receber", "contas_pagar"); }} />}
      {chaves && <ChavesPluggy origem={st.origem} onClose={() => setChaves(false)} onPronto={() => { setChaves(false); refetch(); }} />}
    </Card>
  );
}

function ConectarBanco({ contas, ocupadas, existentes, onClose, onPronto }: {
  contas: ContaErp[]; ocupadas: Set<string>; existentes: { item_id: string; instituicao: string | null }[]; onClose: () => void; onPronto: () => void;
}) {
  const livres = contas.filter((b) => !ocupadas.has(b.id));
  // conexão que já existe (ex.: Meu Pluggy traz todas as contas numa conexão só): liga outra conta do ERP sem abrir a janela
  const [usar, setUsar] = useState<string>(existentes[0]?.item_id ?? "");
  const [conta, setConta] = useState(livres[0]?.id ?? contas[0]?.id ?? "");
  const inicioErp = contas.find((b) => b.id === conta)?.saldo_inicial_data;
  const [desde, setDesde] = useState("");
  const [etapa, setEtapa] = useState<"escolher" | "janela" | "conta">("escolher");
  const [item, setItem] = useState<string | null>(null);
  const [externas, setExternas] = useState<{ instituicao: string | null; contas: ContaExterna[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const dataDesde = desde || (inicioErp && inicioErp > somar(hoje(), -365) ? inicioErp : somar(hoje(), -30));

  async function ligar(itemId: string, contaExterna: string) {
    const r = await callFunction<{ novas?: number; conciliadas?: number; erro?: string }>("openfinance", {
      acao: "ligar", item_id: itemId, conta_externa_id: contaExterna, conta_bancaria_id: conta, desde: dataDesde,
    });
    if (r.erro) notify(`Conta ligada, mas a primeira busca falhou: ${r.erro}`, "erro");
    else notify(`Conta ligada: ${r.novas ?? 0} ${pl(r.novas ?? 0, "lançamento", "lançamentos")} ${pl(r.novas ?? 0, "trazido", "trazidos")}${r.conciliadas ? `, ${r.conciliadas} já ${pl(r.conciliadas, "conciliado", "conciliados")}` : ""}`);
    onPronto();
  }

  async function abrir(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      let id = usar || null;
      if (!id) {
        const { token } = await callFunction<{ token: string }>("openfinance", { acao: "token" });
        setEtapa("janela");
        id = await abrirJanela(token);
        if (!id) { setEtapa("escolher"); return; }
      }
      setItem(id);
      const r = await callFunction<{ instituicao: string | null; contas: ContaExterna[] }>("openfinance", { acao: "contas", item_id: id });
      const doBanco = r.contas.filter((a) => a.tipo === "BANK");
      if (!usar && doBanco.length === 1) return await ligar(id, doBanco[0].id);
      setExternas(r);
      setEtapa("conta");
    } catch (er) {
      notifyError(er);
      setEtapa("escolher");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Conectar banco pelo Open Finance">
      {etapa === "escolher" && (
        <form onSubmit={abrir} className="space-y-3 text-sm">
          <Field label="Conta do ERP que vai receber o extrato">
            <select className="input" value={conta} onChange={(e) => setConta(e.target.value)} required>
              {contas.map((b) => <option key={b.id} value={b.id}>{b.nome}{ocupadas.has(b.id) ? " (já conectada: troca a conexão)" : ""}</option>)}
            </select>
          </Field>
          {existentes.length > 0 && (
            <fieldset className="space-y-1.5 rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-xs font-semibold text-slate-600">De onde vêm os lançamentos</legend>
              {existentes.map((x) => (
                <label key={x.item_id} className="flex items-start gap-2">
                  <input type="radio" className="mt-1" checked={usar === x.item_id} onChange={() => setUsar(x.item_id)} />
                  <span>Da conexão que já está ligada{x.instituicao ? ` (${x.instituicao})` : ""}: escolho a conta em seguida, sem abrir o banco de novo</span>
                </label>
              ))}
              <label className="flex items-start gap-2">
                <input type="radio" className="mt-1" checked={!usar} onChange={() => setUsar("")} />
                <span>Nova conexão (abre a janela da Pluggy)</span>
              </label>
            </fieldset>
          )}
          <Field label="Trazer lançamentos desde">
            <input type="date" className="input" value={dataDesde} max={hoje()} min={somar(hoje(), -365)} onChange={(e) => setDesde(e.target.value)} />
            <span className="mt-1 block text-xs text-slate-500">Sugestão: a data do saldo inicial da conta no ERP. O banco manda até 12 meses.</span>
          </Field>
          {!usar && <ol className="list-decimal space-y-1 rounded-lg bg-slate-50 p-3 pl-7 text-slate-600">
            <li>Abre a janela da Pluggy (parceira autorizada do Open Finance).</li>
            <li>Escolha o banco e confirme o CNPJ da empresa. Sem plano pago: escolha <b>MeuPluggy</b> e entre com a conta do meu.pluggy.ai (vêm todas as contas que já estão lá).</li>
            <li>O app ou site do banco abre para você autorizar (só leitura do extrato e do saldo; ninguém consegue mexer no dinheiro).</li>
            <li>Pronto: o ERP traz os lançamentos e concilia o que tiver par certo.</li>
          </ol>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button disabled={ocupado || !conta}>{ocupado ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />} {usar ? "Escolher a conta" : "Abrir Open Finance"}</Button>
          </div>
        </form>
      )}
      {etapa === "janela" && <p className="flex items-center gap-2 py-6 text-sm text-slate-600"><Loader2 size={18} className="animate-spin" /> Conclua a autorização na janela do banco…</p>}
      {etapa === "conta" && externas && item && (
        <div className="space-y-3 text-sm">
          <p>{externas.instituicao ?? "O banco"} mandou {externas.contas.length > 1 ? "mais de uma conta" : "esta conta"}. Qual é a <b>{contas.find((b) => b.id === conta)?.nome}</b>? (o saldo ajuda a reconhecer)</p>
          <ul className="space-y-2">
            {externas.contas.map((a) => (
              <li key={a.id}>
                <button type="button" disabled={ocupado} onClick={async () => { setOcupado(true); try { await ligar(item, a.id); } catch (e) { notifyError(e); } finally { setOcupado(false); } }}
                  className="cartao flex w-full items-center justify-between gap-3 p-3 text-left hover:border-brand">
                  <span><b className="text-fg">{a.nome}</b><span className="block text-xs text-slate-500">{a.tipo === "CREDIT" ? "Cartão de crédito" : "Conta"}</span></span>
                  {a.saldo != null && <span className="num font-semibold">{brl(a.saldo)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function ChavesPluggy({ origem, onClose, onPronto }: { origem: string | null; onClose: () => void; onPronto: () => void }) {
  const [id, setId] = useState("");
  const [segredo, setSegredo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      await callFunction("openfinance", { acao: "configurar", client_id: id, client_secret: segredo });
      notify("Chaves conferidas na Pluggy e guardadas no cofre");
      onPronto();
    } catch (er) {
      notifyError(er);
    } finally {
      setOcupado(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Ligar o Open Finance (Pluggy)">
      <form onSubmit={salvar} className="space-y-3 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-slate-600">
          <li>Crie a conta em <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer" className="text-brand underline">dashboard.pluggy.ai</a> (parceira autorizada do Open Finance).</li>
          <li>Em <b>Aplicações</b>, abra a aplicação e copie o <b>Client ID</b> e o <b>Client Secret</b>.</li>
          <li>Cole aqui. O ERP confere na Pluggy e guarda no cofre do servidor: ninguém consegue ler depois, nem pela tela.</li>
        </ol>
        <p className="rounded-lg bg-sky-50 p-2.5 text-sky-900">
          <b>Sem plano pago:</b> conecte os bancos em <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer" className="underline">meu.pluggy.ai</a> (grátis) e,
          em Conectar banco, escolha <b>MeuPluggy</b>. A aplicação que já vem pronta no dashboard serve.
        </p>
        {origem === "secret" && <p className="rounded-lg bg-amber-50 p-2.5 text-amber-900">As chaves estão nos secrets do Supabase (PLUGGY_CLIENT_ID/SECRET) e valem acima destas.</p>}
        {origem === "cofre" && <p className="rounded-lg bg-emerald-50 p-2.5 text-emerald-900">Já há chaves guardadas. Preencha só para trocar.</p>}
        <Field label="Client ID"><input className="input font-mono" value={id} onChange={(e) => setId(e.target.value)} required autoComplete="off" spellCheck={false} /></Field>
        <Field label="Client Secret"><input className="input font-mono" type="password" value={segredo} onChange={(e) => setSegredo(e.target.value)} required autoComplete="new-password" /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={ocupado}>{ocupado ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Conferir e guardar</Button>
        </div>
      </form>
    </Modal>
  );
}

function somar(data: string, dias: number) {
  return new Date(new Date(`${data}T12:00:00`).getTime() + dias * 864e5).toISOString().slice(0, 10);
}
