// Telas do login em duas etapas: cadastrar o código no app do celular, digitar o código ao entrar
// e "Minhas duas etapas" (ver, trocar de celular, desligar quando o papel não obriga).
import { useEffect, useId, useState, type FormEvent } from "react";
import { Copy, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR } from "@/lib/format";
import { chaveEmBlocos, confirmarCodigo, fatoresCadastrados, iniciarCadastro, removerCodigos, type Fator, type NovoCodigo } from "@/lib/duasEtapas";
import { Button, Card } from "./ui";
import { Marca, MOLDURA } from "@/pages/Login";

/** Campo de 6 números (o celular abre o teclado numérico e sugere o código recebido). */
function CampoCodigo({ valor, onChange, autoFocus }: { valor: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-600">Código de 6 números do app</label>
      <input id={id} className="input text-center font-mono text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code"
        pattern="[0-9 ]*" maxLength={7} placeholder="000000" value={valor} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 6))} required />
    </div>
  );
}

/** Cadastro: QR code + chave, depois confirma com o primeiro código. */
export function CadastroCodigo({ onPronto, onCancelar }: { onPronto: () => void; onCancelar?: () => void }) {
  const [novo, setNovo] = useState<NovoCodigo | null>(null);
  const [erro, setErro] = useState("");
  const [codigo, setCodigo] = useState("");
  const [conferindo, setConferindo] = useState(false);

  useEffect(() => {
    let vivo = true;
    iniciarCadastro().then((n) => vivo && setNovo(n)).catch((e) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => { vivo = false; };
  }, []);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!novo) return;
    setConferindo(true);
    setErro("");
    try {
      await confirmarCodigo(novo.factorId, codigo);
      notify("Login em duas etapas ativado");
      onPronto();
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setCodigo("");
    } finally { setConferindo(false); }
  }

  return (
    <form onSubmit={confirmar} className="space-y-4 text-sm text-slate-700">
      <ol className="list-decimal space-y-1 pl-5">
        <li>Instale no celular um app autenticador: <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> ou <b>Authy</b> (gratuitos).</li>
        <li>No app, toque em <b>+</b> e leia o QR code abaixo. No próprio celular, use o botão “Abrir no app autenticador”.</li>
        <li>Digite o código de 6 números que aparece no app.</li>
      </ol>
      {!novo && !erro && <p className="text-slate-500">Gerando o QR code…</p>}
      {novo && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-start">
          {/* o QR code precisa de fundo claro para a câmera ler, mesmo no tema escuro */}
          <img src={novo.qr} alt="QR code para o app autenticador" className="h-40 w-40 shrink-0 rounded-lg bg-white p-2" />
          <div className="min-w-0 space-y-2 text-center sm:text-left">
            <a href={novo.uri} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-brand hover:bg-slate-50 sm:hidden">
              <Smartphone size={16} /> Abrir no app autenticador
            </a>
            <div>
              <span className="block text-xs text-slate-500">Sem câmera? Digite esta chave no app:</span>
              <span className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <code className="break-all rounded bg-slate-100 px-2 py-1 font-mono text-[13px] text-fg">{chaveEmBlocos(novo.chave)}</code>
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                  onClick={() => navigator.clipboard?.writeText(novo.chave).then(() => notify("Chave copiada"), () => null)}>
                  <Copy size={13} /> copiar
                </button>
              </span>
            </div>
            <p className="text-xs text-slate-500">Guarde esta chave num lugar seguro (por exemplo, impressa no cofre): com ela dá para pôr o código num celular novo.</p>
          </div>
        </div>
      )}
      <CampoCodigo valor={codigo} onChange={setCodigo} autoFocus={!!novo} />
      <div role="alert" aria-live="assertive">{erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}</div>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancelar && <Button type="button" variant="secondary" onClick={onCancelar}>Cancelar</Button>}
        <Button disabled={!novo || conferindo || codigo.length !== 6}><ShieldCheck size={16} /> {conferindo ? "Conferindo…" : "Confirmar e ativar"}</Button>
      </div>
    </form>
  );
}

/** Entrada: digita o código do app (quem já cadastrou). */
function DigitarCodigo({ onPronto }: { onPronto: () => void }) {
  const [fatores, setFatores] = useState<Fator[] | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [conferindo, setConferindo] = useState(false);
  useEffect(() => { fatoresCadastrados().then(setFatores).catch((e) => setErro(e instanceof Error ? e.message : String(e))); }, []);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!fatores?.length) return;
    setConferindo(true);
    setErro("");
    // mais de um celular cadastrado: tenta em cada um
    let ultimo: unknown = null;
    for (const f of fatores) {
      try { await confirmarCodigo(f.id, codigo); setConferindo(false); onPronto(); return; } catch (err) { ultimo = err; }
    }
    setConferindo(false);
    setCodigo("");
    setErro(ultimo instanceof Error ? ultimo.message : String(ultimo));
  }

  return (
    <form onSubmit={confirmar} className="space-y-4">
      <p className="text-sm text-slate-600">Abra o app autenticador do seu celular e digite o código do <b>ERP Line</b>.</p>
      <CampoCodigo valor={codigo} onChange={setCodigo} autoFocus />
      <div role="alert" aria-live="assertive">{erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}</div>
      <Button className="w-full" disabled={!fatores?.length || conferindo || codigo.length !== 6}><ShieldCheck size={16} /> {conferindo ? "Conferindo…" : "Entrar"}</Button>
      <p className="text-xs text-slate-500">Perdeu ou trocou de celular? Peça ao administrador para <b>zerar o seu login em duas etapas</b> em Usuários. No próximo acesso você cadastra o código de novo.</p>
    </form>
  );
}

/** Tela cheia antes de entrar no ERP. */
export function TelaDuasEtapas({ modo, onPronto }: { modo: "verificar" | "cadastrar"; onPronto: () => void }) {
  return (
    <main className={MOLDURA}>
      <Card className={`w-full p-6 ${modo === "cadastrar" ? "max-w-lg" : "max-w-sm"}`}>
        <Marca sub={modo === "verificar" ? "Login em duas etapas" : "Ative o login em duas etapas"} />
        {modo === "cadastrar" && (
          <p className="mb-4 text-sm text-slate-600">
            Para proteger os dados da empresa, o seu acesso pede, além da senha, um código que muda a cada 30 segundos no seu celular.
            Faça isso uma vez só; depois é digitar o código ao entrar.
          </p>
        )}
        {modo === "verificar" ? <DigitarCodigo onPronto={onPronto} /> : <CadastroCodigo onPronto={onPronto} />}
        <button type="button" className="mt-4 flex w-full items-center justify-center gap-1.5 rounded text-center text-sm text-slate-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          onClick={() => supabase.auth.signOut()}>
          <LogOut size={14} /> Sair
        </button>
      </Card>
    </main>
  );
}

/** Menu do usuário (Senha e segurança): situação, trocar de celular e desligar (só quando o papel não obriga). */
export function PainelDuasEtapas() {
  const [fatores, setFatores] = useState<Fator[] | null>(null);
  const [obrigatorio, setObrigatorio] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const carregar = () => fatoresCadastrados().then(setFatores).catch(notifyError);
  useEffect(() => {
    carregar();
    supabase.rpc("mfa_exigido").then(({ data }) => setObrigatorio(!!data));
  }, []);

  async function novoCadastrado() {
    // trocou de celular: os códigos antigos deixam de valer
    const antigos = (fatores ?? []).map((f) => f.id);
    if (antigos.length) await removerCodigos(antigos).catch(notifyError);
    setCadastrando(false);
    carregar();
  }

  async function desligar() {
    if (!fatores?.length || !confirm("Desligar o login em duas etapas? A entrada volta a pedir só a senha.")) return;
    setOcupado(true);
    try { await removerCodigos(fatores.map((f) => f.id)); notify("Login em duas etapas desligado"); carregar(); } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const ativo = !!fatores?.length;
  if (cadastrando) return <CadastroCodigo onPronto={novoCadastrado} onCancelar={() => setCadastrando(false)} />;
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p>Além da senha, a entrada pede o código de 6 números do app autenticador do celular. Quem descobrir a sua senha não entra sem o seu celular.</p>
      {fatores === null ? <p className="text-slate-500">Carregando…</p> : ativo ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-green-900">
          <b>Ativado</b> desde {dataBR(fatores[0].created_at.slice(0, 10))}.
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <b>Desligado.</b> {obrigatorio ? "O seu papel exige: ative agora." : "Recomendado para quem mexe no financeiro e nos cadastros."}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {ativo && !obrigatorio && <Button variant="secondary" disabled={ocupado} onClick={desligar}>Desligar</Button>}
        <Button variant={ativo ? "secondary" : "primary"} onClick={() => setCadastrando(true)}>
          <Smartphone size={16} /> {ativo ? "Trocar de celular" : "Ativar"}
        </Button>
      </div>
      {ativo && <p className="text-xs text-slate-500">Trocar de celular: cadastre o celular novo; o código do antigo deixa de valer.</p>}
    </div>
  );
}
