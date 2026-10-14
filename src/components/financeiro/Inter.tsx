// Banco Inter (API PJ): ligar a conta com o app do Inter (Client ID, Client Secret e o zip do certificado),
// ver saldo e situação, atualizar na hora, trocar credenciais (certificado vence) e desligar.
// As credenciais vão direto para a função inter, que confere no Inter e guarda no cofre: o navegador não lê de volta.
import { useState, type FormEvent } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { AlertTriangle, CheckCircle2, KeyRound, Landmark, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";

export type ConexaoInter = {
  id: string; conta_bancaria_id: string; conta_corrente: string | null; status: "ativa" | "erro" | "desligada"; erro: string | null;
  desde: string; sincronizado_em: string | null; ultimas_novas: number; saldo: number | null; saldo_em: string | null; certificado_validade: string | null;
};
type ContaErp = { id: string; nome: string; banco: string; ativo: boolean; saldo_inicial_data: string };
type Resultado = { novas?: number; conciliadas?: number; saldo?: number | null; erro?: string };

const ha = (iso: string | null) => {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `em ${dataBR(iso)}`;
};
const diasAte = (iso: string | null) => (iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 864e5) : null);

export function InterPainel({ contas }: { contas: ContaErp[] }) {
  const { tem } = usePerfil();
  const admin = tem();
  const invalidar = useInvalidate();
  const { data: todas = [] } = useRows<ConexaoInter>("inter_conexoes");
  const conexoes = todas.filter((c) => c.status !== "desligada" && contas.some((b) => b.id === c.conta_bancaria_id));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [form, setForm] = useState<{ conexao?: ConexaoInter } | null>(null);
  const nomeErp = (id: string) => contas.find((b) => b.id === id)?.nome ?? "—";

  async function atualizar(c: ConexaoInter) {
    setOcupado(c.id);
    try {
      const r = await callFunction<{ resultado: Record<string, Resultado> }>("inter", { acao: "sincronizar", conexao_id: c.id });
      const x = r.resultado?.[c.id];
      if (x?.erro) throw new Error(x.erro);
      notify(x?.novas ? `${x.novas} lançamento(s) novo(s)${x.conciliadas ? `, ${x.conciliadas} conciliado(s) sozinho(s)` : ""}` : "Extrato em dia: nada novo no Inter");
    } catch (e) { notifyError(e); } finally {
      setOcupado(null);
      invalidar("inter_conexoes", "extrato_lancamentos", "contas_receber", "contas_pagar");
    }
  }
  async function desligar(c: ConexaoInter) {
    if (!confirm(`Parar de buscar o extrato de ${nomeErp(c.conta_bancaria_id)} pela API do Inter? Os lançamentos que já vieram continuam no ERP e as credenciais guardadas são apagadas.`)) return;
    setOcupado(c.id);
    try {
      await callFunction("inter", { acao: "desligar", conexao_id: c.id });
      notify("Inter desligado nesta conta");
    } catch (e) { notifyError(e); } finally {
      setOcupado(null);
      invalidar("inter_conexoes");
    }
  }

  const livres = contas.filter((b) => b.ativo && b.banco !== "caixa" && !conexoes.some((c) => c.conta_bancaria_id === b.id));
  return (
    <Card className="mb-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold text-fg"><Landmark size={17} className="text-orange-600" /> Banco Inter (API)</h2>
          <p className="text-sm text-slate-500">
            Extrato e saldo direto do Inter, de 4 em 4 horas, sem arquivo e sem Open Finance. O que tiver par certo já é conciliado.
          </p>
        </div>
        {admin && <Button onClick={() => setForm({})} disabled={!livres.length}><KeyRound size={16} /> Ligar conta do Inter</Button>}
      </div>
      {!admin && !conexoes.length && <p className="mt-2 text-sm text-slate-500">O administrador liga a conta com as credenciais do app do Inter.</p>}

      {conexoes.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
          {conexoes.map((c) => {
            const vence = diasAte(c.certificado_validade);
            return (
              <li key={c.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-fg">{nomeErp(c.conta_bancaria_id)}</div>
                  <div className="text-xs text-slate-500">Inter{c.conta_corrente ? ` · conta ${c.conta_corrente}` : ""} · desde {dataBR(c.desde)}</div>
                  {c.erro && <div className={`mt-1 flex items-start gap-1 text-xs ${c.status === "erro" ? "font-semibold text-red-700" : "text-amber-700"}`}><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {c.erro}</div>}
                  {vence != null && vence <= 30 && (
                    <div className="mt-1 flex items-start gap-1 text-xs font-semibold text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      Certificado {vence < 0 ? "vencido" : `vence em ${vence} dia(s)`}: gere outro no app do Inter e use "Trocar credenciais".
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-600">
                  <div className="flex items-center gap-1">
                    {c.status === "ativa" ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-red-600" />}
                    atualizado {ha(c.sincronizado_em)}{c.ultimas_novas ? ` · ${c.ultimas_novas} novo(s)` : ""}
                  </div>
                  {c.saldo != null && <div>Saldo disponível: <b className="num">{brl(c.saldo)}</b>{c.saldo_em ? ` (${ha(c.saldo_em)})` : ""}</div>}
                  {c.certificado_validade && <div>Certificado até {dataBR(c.certificado_validade)}</div>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button variant="secondary" disabled={ocupado === c.id} onClick={() => atualizar(c)}>
                    {ocupado === c.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Atualizar agora
                  </Button>
                  {admin && <Button variant="ghost" disabled={ocupado === c.id} onClick={() => setForm({ conexao: c })}><KeyRound size={15} /> Trocar credenciais</Button>}
                  {admin && <Button variant="ghost" title="Desligar o Inter nesta conta" aria-label="Desligar" disabled={ocupado === c.id} onClick={() => desligar(c)}><Unplug size={15} /></Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {form && <LigarInter contas={form.conexao ? contas.filter((b) => b.id === form.conexao!.conta_bancaria_id) : livres} conexao={form.conexao}
        onClose={() => setForm(null)} onPronto={() => { setForm(null); invalidar("inter_conexoes", "extrato_lancamentos", "contas_receber", "contas_pagar"); }} />}
    </Card>
  );
}

/** Lê o zip baixado no Inter (ou os dois arquivos soltos) e separa o certificado e a chave. */
async function lerArquivos(arquivos: FileList): Promise<{ cert?: string; key?: string; nomes: string[] }> {
  const out: { cert?: string; key?: string; nomes: string[] } = { nomes: [] };
  const guardar = (nome: string, conteudo: string) => {
    if (/-----BEGIN CERTIFICATE-----/.test(conteudo)) { out.cert = conteudo; out.nomes.push(nome); }
    else if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(conteudo)) { out.key = conteudo; out.nomes.push(nome); }
  };
  for (const f of Array.from(arquivos)) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (/\.zip$/i.test(f.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
      const itens = unzipSync(bytes);
      for (const [nome, dados] of Object.entries(itens)) if (/\.(crt|key|pem|cer)$/i.test(nome)) guardar(nome.split("/").pop()!, strFromU8(dados));
    } else guardar(f.name, new TextDecoder().decode(bytes));
  }
  return out;
}

function LigarInter({ contas, conexao, onClose, onPronto }: { contas: ContaErp[]; conexao?: ConexaoInter; onClose: () => void; onPronto: () => void }) {
  const [conta, setConta] = useState(conexao?.conta_bancaria_id ?? (contas.find((b) => b.banco === "inter") ?? contas[0])?.id ?? "");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [arquivos, setArquivos] = useState<{ cert?: string; key?: string; nomes: string[] } | null>(null);
  const [contaCorrente, setContaCorrente] = useState(conexao?.conta_corrente ?? "");
  const [desde, setDesde] = useState(conexao?.desde ?? (() => { const d = new Date(Date.now() - 30 * 864e5); return d.toISOString().slice(0, 10); })());
  const [ocupado, setOcupado] = useState(false);
  const troca = !!conexao;
  const faltaArquivo = !troca && (!arquivos?.cert || !arquivos?.key);

  async function escolher(fs: FileList | null) {
    if (!fs?.length) return setArquivos(null);
    try {
      const r = await lerArquivos(fs);
      setArquivos(r);
      if (!r.cert || !r.key) notify(`Não achei ${!r.cert ? "o certificado (.crt)" : "a chave (.key)"} nos arquivos escolhidos. Escolha o zip baixado no Inter ou os dois arquivos.`, "erro");
    } catch (e) { notifyError(e); }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await callFunction<{ novas?: number; conciliadas?: number; saldo?: number | null; erro?: string }>("inter", {
        acao: "ligar", conexao_id: conexao?.id, conta_bancaria_id: conta, client_id: clientId, client_secret: clientSecret,
        cert: arquivos?.cert ?? "", key: arquivos?.key ?? "", conta_corrente: contaCorrente, desde,
      });
      if (r.erro) notify(`Conta ligada, mas a primeira busca falhou: ${r.erro}`, "erro");
      else notify(`Inter ligado${r.saldo != null ? ` · saldo ${brl(r.saldo)}` : ""}${r.novas ? ` · ${r.novas} lançamento(s) trazido(s)` : ""}`);
      onPronto();
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  return (
    <Modal open onClose={onClose} title={troca ? "Trocar credenciais do Inter" : "Ligar conta do Inter"}>
      <form onSubmit={enviar} className="space-y-3 text-sm">
        {!troca && (
          <ol className="list-decimal space-y-1 rounded-lg bg-slate-50 p-3 pl-7 text-slate-600">
            <li>No Internet Banking do Inter (empresa): <b>Soluções para sua empresa → Nova integração</b>, com a permissão de <b>extrato e saldo</b>.</li>
            <li>Baixe o <b>zip</b> com o certificado e a chave e copie o <b>Client ID</b> e o <b>Client Secret</b>.</li>
            <li>Escolha aqui a conta do ERP, cole as duas chaves e envie o zip. O ERP confere no Inter antes de guardar.</li>
          </ol>
        )}
        {troca && <p className="rounded-lg bg-slate-50 p-3 text-slate-600">Preencha só o que mudou. Ex.: quando o certificado vence, gere outro no app do Inter e envie o zip novo; o resto fica como está.</p>}
        <Field label="Conta do ERP">
          <select className="input" value={conta} onChange={(e) => setConta(e.target.value)} disabled={troca} required>
            {contas.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </Field>
        {!contas.length && <p className="text-amber-800">Cadastre primeiro a conta (botão "Nova conta", banco "Banco Inter") com a unidade certa (SC ou SP).</p>}
        <Field label={`Client ID${troca ? " (deixe em branco para manter)" : ""}`}>
          <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} required={!troca} />
        </Field>
        <Field label={`Client Secret${troca ? " (deixe em branco para manter)" : ""}`}>
          <input className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" spellCheck={false} required={!troca} />
        </Field>
        <Field label={`Certificado do app (zip do Inter, ou os arquivos .crt e .key)${troca ? " — só se mudou" : ""}`}>
          <input className="input" type="file" multiple accept=".zip,.crt,.key,.pem,.cer" onChange={(e) => escolher(e.target.files)} />
        </Field>
        {arquivos && (
          <p className={arquivos.cert && arquivos.key ? "text-emerald-700" : "text-red-700"}>
            {arquivos.cert && arquivos.key ? `Certificado e chave encontrados (${arquivos.nomes.join(", ")}).` : "Faltou o certificado (.crt) ou a chave (.key)."}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Conta corrente (só se o app enxergar mais de uma)">
            <input className="input" inputMode="numeric" value={contaCorrente} onChange={(e) => setContaCorrente(e.target.value)} placeholder="opcional" />
          </Field>
          <Field label="Trazer o extrato desde">
            <input className="input" type="date" value={desde} max={hoje()} onChange={(e) => setDesde(e.target.value)} required />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={ocupado || !conta || faltaArquivo || (troca && arquivos != null && (!arquivos.cert || !arquivos.key))}>
            {ocupado ? <><Loader2 size={16} className="animate-spin" /> Conferindo no Inter…</> : troca ? "Salvar" : "Ligar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
