// Conta do Mercado Livre: conectada (situação, unidade, desconectar) ou o passo a passo para conectar.
// As chaves do app e os tokens vão direto para o cofre pela função mercadolivre: o navegador não lê de volta.
import { useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, KeyRound, Link2, Loader2, Unplug } from "lucide-react";
import { Button, Card, Field } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { usePerfil } from "@/lib/auth";
import { useInvalidate } from "@/lib/data";
import { dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import type { ContaML } from "@/lib/mlAnuncios";
import { conectarML, desconectarML, guardarChavesML, useSituacaoML } from "@/lib/useMercadoLivre";

const DEV_ML = "https://developers.mercadolivre.com.br/devcenter";

const ha = (iso: string | null) => {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `há ${h} h` : `em ${dataBR(iso)}`;
};

function Copiar({ texto }: { texto: string }) {
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); notify("Copiado"); } catch { notify(texto); }
  }
  return (
    <span className="mt-1 flex min-w-0 items-center gap-1">
      <code className="num min-w-0 flex-1 break-all rounded-md bg-slate-100 px-2 py-1 text-xs text-fg">{texto}</code>
      <button type="button" onClick={copiar} className="botao-icone p-2" aria-label="Copiar" title="Copiar"><Copy size={14} /></button>
    </span>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-modulo/15 text-sm font-bold text-modulo-texto">{n}</span>
      <div className="min-w-0 flex-1 text-sm text-slate-600"><b className="block text-fg">{titulo}</b>{children}</div>
    </li>
  );
}

export function ContaMercadoLivre({ conta }: { conta: ContaML | null }) {
  const { tem } = usePerfil();
  const admin = tem();
  const { unidades } = useUnidade();
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  const unidade = unidades.find((u) => u.id === conta?.unidade_id)?.codigo ?? "SP";

  async function conectar() {
    setOcupado(true);
    try { await conectarML(); } catch (e) { notifyError(e); setOcupado(false); }
  }
  async function desconectar() {
    if (!(await confirmar("Desconectar a conta do Mercado Livre? As vendas param de entrar e o ERP para de mandar estoque e preço. O que já veio continua no ERP.", { perigo: true, ok: "Desconectar" }))) return;
    setOcupado(true);
    try { await desconectarML(); notify("Conta do Mercado Livre desconectada"); } catch (e) { notifyError(e); } finally {
      setOcupado(false);
      invalidar("ml_contas", "ml_anuncios");
    }
  }

  if (conta) {
    const comErro = conta.status === "erro";
    return (
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-semibold text-fg">
              {comErro ? <AlertTriangle size={17} className="text-red-600" /> : <CheckCircle2 size={17} className="text-emerald-600" />}
              Conta {conta.apelido ?? conta.ml_user_id} {comErro ? "com problema" : "conectada"}
            </h2>
            <p className="text-sm text-slate-500">Conectada em {dataBR(conta.conectado_em)} · estoque e vendas da unidade <b>{unidade}</b> · vendas conferidas {ha(conta.sincronizado_em)}</p>
            {conta.erro && <p className="mt-1 flex items-start gap-1 text-sm font-semibold text-red-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {conta.erro}</p>}
          </div>
          {admin && (
            <div className="flex flex-wrap gap-2">
              <Button variant={comErro ? "primary" : "secondary"} disabled={ocupado} onClick={conectar}>
                {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Conectar de novo
              </Button>
              <Button variant="ghost" disabled={ocupado} onClick={desconectar}><Unplug size={15} /> Desconectar</Button>
            </div>
          )}
        </div>
        {!admin && comErro && <p className="mt-2 text-sm text-slate-600">Peça ao administrador para conectar de novo (aqui, na aba Conta).</p>}
      </Card>
    );
  }
  return <Conectar admin={admin} ocupado={ocupado} onConectar={conectar} />;
}

function Conectar({ admin, ocupado, onConectar }: { admin: boolean; ocupado: boolean; onConectar: () => void }) {
  const { tem } = usePerfil();
  const situacao = useSituacaoML(tem("vendas", "financeiro"));
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<string | null>(null);
  const invalidar = useInvalidate();
  const chaves = !!situacao.data?.chaves || !!retorno;
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const funcoes = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await guardarChavesML(clientId, clientSecret);
      setRetorno(r.retorno);
      setClientId(""); setClientSecret("");
      notify("Chaves do app guardadas. Agora é só clicar em Conectar.");
      invalidar("ml_contas");
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="font-semibold text-fg">Nenhuma conta do Mercado Livre conectada</h2>
      <p className="mb-4 text-sm text-slate-500">
        Conectando, as vendas pagas entram sozinhas no ERP e o ERP passa a mandar o estoque e o preço para os anúncios (quando você ligar, na aba "Envio de estoque e preço").
      </p>
      {!admin && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Só o administrador conecta a conta. Peça para ele abrir esta tela (Vendas → Mercado Livre).</p>}
      {admin && (
        <ol className="space-y-4">
          <Passo n={1} titulo="Crie o app no Mercado Livre">
            <p>Entre no <a href={DEV_ML} target="_blank" rel="noreferrer" className="link-acao inline-flex items-center gap-0.5">Mercado Livre Developers <ExternalLink size={12} /></a> com a conta da empresa e clique em "Criar aplicação". Preencha:</p>
            <p className="mt-2">Endereço de retorno (Redirect URI):</p>
            <Copiar texto={retorno ?? `${site}/mercado-livre/retorno`} />
            {funcoes && (<>
              <p className="mt-2">Notificações (URL de retorno de notificações), com o tópico <b>orders_v2</b>:</p>
              <Copiar texto={`${funcoes}/functions/v1/mercadolivre`} />
            </>)}
            <p className="mt-2">Permissões: <b>leitura e escrita</b> (o ERP lê as vendas e muda estoque e preço dos anúncios).</p>
          </Passo>
          <Passo n={2} titulo="Cole as chaves do app">
            {chaves && <p className="mb-2 flex items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 size={14} /> Chaves guardadas. Para trocar, cole as novas abaixo.</p>}
            <form onSubmit={guardar} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Client ID (só números)">
                <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} inputMode="numeric" autoComplete="off" spellCheck={false} required />
              </Field>
              <Field label="Client Secret">
                <input className="input" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" spellCheck={false} required />
              </Field>
              <Button type="submit" variant="secondary" disabled={salvando}>{salvando ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Guardar chaves</Button>
            </form>
            {retorno && <p className="mt-2 text-xs text-slate-500">Confira se o endereço de retorno no app é exatamente o de cima.</p>}
          </Passo>
          <Passo n={3} titulo="Conecte a conta">
            <p className="mb-2">O Mercado Livre abre, você entra com a conta da empresa, autoriza e volta para cá.</p>
            <Button onClick={onConectar} disabled={ocupado}>{ocupado ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Conectar</Button>
            {!chaves && situacao.isSuccess && <span className="ml-2 text-xs text-slate-500">Guarde antes as chaves (passo 2).</span>}
          </Passo>
        </ol>
      )}
    </Card>
  );
}
