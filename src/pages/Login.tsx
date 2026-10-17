import { useEffect, useId, useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, LifeBuoy } from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { entrarDemo, USUARIOS_DEMO } from "@/lib/demo";
import { PAPEIS } from "@/lib/permissoes";
import logo from "@/assets/logo.webp";
import { Button, Card, Field } from "@/components/ui";

export default function Login({ linkExpirado = false }: { linkExpirado?: boolean }) {
  if (DEMO) return <LoginDemo />;
  return <LoginReal linkExpirado={linkExpirado} />;
}

/** Prévia: entra direto como um dos perfis, para ver o que cada papel enxerga. */
function LoginDemo() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink bg-[radial-gradient(ellipse_at_top,_rgb(var(--brand-nav)/0.22)_0%,_#071528_60%)] p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-5 flex flex-col items-center text-center"><img src={logo} alt="" className="mb-3 h-20 w-20 rounded-2xl shadow-pop" /><span className="block text-2xl font-extrabold tracking-tight text-fg">ERP <span className="text-brand">Line</span></span><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">MF Máquinas</span></div>
        <p className="mb-5 text-sm text-slate-600">
          Prévia com dados de exemplo. Escolha um perfil para ver as telas que cada pessoa da equipe enxerga.
        </p>
        <div className="grid gap-2">
          {USUARIOS_DEMO.map((u) => {
            const papel = PAPEIS.find((p) => p.value === u.papel)!;
            return (
              <button key={u.user_id} onClick={() => entrarDemo(u.user_id)}
                className="rounded-md border border-slate-200 bg-surface px-4 py-3 text-left transition hover:border-brand hover:bg-brand-light focus:outline-none focus:ring-2 focus:ring-brand/30">
                <div className="font-medium">Entrar como {papel.label}</div>
                <div className="text-xs text-slate-500">{u.nome} · {papel.descricao}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-5 text-xs text-slate-500">Nada é salvo de verdade: ao recarregar a página, tudo volta ao início. As notas fiscais são simuladas.</p>
      </Card>
    </div>
  );
}

/** Link do e-mail de recuperação: volta para cá com ?nova-senha (o Supabase entra com uma sessão temporária). */
export const URL_NOVA_SENHA = () => `${window.location.origin}/?nova-senha=1`;

const MOLDURA = "flex min-h-screen items-center justify-center bg-ink bg-[radial-gradient(ellipse_at_top,_rgb(var(--brand-nav)/0.22)_0%,_#071528_60%)] p-4";

function Marca({ sub }: { sub: string }) {
  return (
    <>
      <div className="mb-5 flex flex-col items-center text-center">
        <img src={logo} alt="" className="mb-3 h-20 w-20 rounded-2xl shadow-pop" />
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">ERP <span className="text-brand">Line</span></h1>
        <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">MF Máquinas</span>
      </div>
      <p className="mb-6 text-sm text-slate-600">{sub}</p>
    </>
  );
}

/** Campo de senha com botão de mostrar/ocultar. */
function CampoSenha({ rotulo, valor, onChange, autoComplete, minLength, descricao }: {
  rotulo: string; valor: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password"; minLength?: number; descricao?: string;
}) {
  const [ver, setVer] = useState(false);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-slate-600">{rotulo}</label>
      <div className="relative">
        <input id={id} className="input pr-11" type={ver ? "text" : "password"} value={valor} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} minLength={minLength} required aria-describedby={descricao ? `${id}-d` : undefined} />
        <button type="button" onClick={() => setVer((v) => !v)} aria-pressed={ver} aria-label={ver ? "Ocultar senha" : "Mostrar senha"} title={ver ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {ver ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
        </button>
      </div>
      {descricao && <p id={`${id}-d`} className="mt-1 text-xs text-slate-500">{descricao}</p>}
    </div>
  );
}

function Mensagens({ erro, aviso }: { erro: string; aviso: string }) {
  return (
    <>
      <div role="alert" aria-live="assertive">{erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{erro}</p>}</div>
      <div role="status" aria-live="polite">{aviso && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}</div>
    </>
  );
}

function AjudaAcesso() {
  return (
    <div className="mt-5 flex gap-2 rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
      <LifeBuoy size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
      <p>
        <b className="text-fg">Não consegue entrar?</b> Use “Esqueci minha senha”. Se o e-mail não chegar ou o acesso estiver bloqueado,
        peça ao administrador do ERP para conferir o seu usuário em <b>Configurações → Usuários</b>.
      </p>
    </div>
  );
}

function LoginReal({ linkExpirado }: { linkExpirado: boolean }) {
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);
  const [modo, setModo] = useState<"entrar" | "criar" | "recuperar">(linkExpirado ? "recuperar" : "entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(linkExpirado ? "O link para criar a senha nova expirou ou já foi usado. Peça outro abaixo." : "");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Sistema recém-instalado (nenhum usuário): oferece criar a conta do administrador.
  useEffect(() => {
    supabase.rpc("erp_sem_usuarios").then(({ data }) => {
      if (data) {
        setPrimeiroAcesso(true);
        setModo("criar");
      }
    });
  }, []);

  const trocar = (m: typeof modo) => { setModo(m); setErro(""); setAviso(""); };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro("");
    setAviso("");
    if (modo === "recuperar") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: URL_NOVA_SENHA() });
      // a mesma resposta para e-mail cadastrado ou não (não revela quem tem acesso)
      if (error && /rate|limit|seconds/i.test(error.message)) setErro("Muitos pedidos seguidos. Espere alguns minutos e tente de novo.");
      else setAviso("Se este e-mail tiver acesso ao ERP, enviamos um link para criar uma senha nova. Confira também a caixa de spam. O link vale por 1 hora.");
    } else if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) setErro(error.message.includes("confirm") ? "Confirme o seu e-mail pelo link que enviamos e tente de novo." : "E-mail ou senha inválidos.");
    } else {
      if (senha.length < 8) {
        setCarregando(false);
        return setErro("A senha precisa ter ao menos 8 caracteres.");
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password: senha, options: { data: { nome }, emailRedirectTo: window.location.origin },
      });
      if (error) setErro(error.message);
      else if (!data.session) {
        setAviso("Conta criada! Abra o e-mail que enviamos, clique no link de confirmação e depois entre com o seu e-mail e senha.");
        setModo("entrar");
      }
    }
    setCarregando(false);
  }

  return (
    <main className={MOLDURA}>
      <Card className="w-full max-w-sm p-6">
        <Marca sub={modo === "criar" ? "Primeiro acesso: crie a conta do administrador" : modo === "recuperar" ? "Esqueceu a senha? Informe o seu e-mail de acesso" : "Acesso ao ERP"} />
        <form onSubmit={enviar} className="space-y-4" noValidate={false}>
          {modo === "criar" && (
            <Field label="Seu nome">
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
            </Field>
          )}
          <Field label="E-mail">
            <input className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </Field>
          {modo !== "recuperar" && (
            <CampoSenha rotulo={modo === "criar" ? "Crie uma senha" : "Senha"} valor={senha} onChange={setSenha}
              autoComplete={modo === "criar" ? "new-password" : "current-password"} minLength={modo === "criar" ? 8 : undefined}
              descricao={modo === "criar" ? "Mínimo de 8 caracteres" : undefined} />
          )}
          <Mensagens erro={erro} aviso={aviso} />
          <Button className="w-full" disabled={carregando}>
            {carregando ? "Aguarde…" : modo === "criar" ? "Criar conta de administrador" : modo === "recuperar" ? "Enviar link para nova senha" : "Entrar"}
          </Button>
        </form>
        {modo === "entrar" && (
          <button type="button" className="mt-4 w-full rounded text-center text-sm font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => trocar("recuperar")}>
            Esqueci minha senha
          </button>
        )}
        {modo === "recuperar" && (
          <button type="button" className="mt-4 w-full rounded text-center text-sm font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => trocar("entrar")}>
            Voltar para entrar
          </button>
        )}
        {primeiroAcesso && modo !== "recuperar" && (
          <button type="button" className="mt-4 w-full rounded text-center text-sm text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={() => trocar(modo === "criar" ? "entrar" : "criar")}>
            {modo === "criar" ? "Já criei a conta — entrar" : "Primeiro acesso? Criar conta de administrador"}
          </button>
        )}
        {!primeiroAcesso && <AjudaAcesso />}
      </Card>
    </main>
  );
}

/** Depois do link do e-mail: cria a senha nova (a sessão temporária do link já está ativa).
 *  obrigatoria: primeiro acesso com a senha provisória (ou redefinida pelo administrador). */
export function NovaSenha({ onPronto, obrigatoria = false }: { onPronto: () => void; obrigatoria?: boolean }) {
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha.length < 8) return setErro("A senha precisa ter ao menos 8 caracteres.");
    if (senha !== repetir) return setErro("As duas senhas não são iguais.");
    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) {
      setErro(/same|different/i.test(error.message) ? "Use uma senha diferente da anterior."
        : /weak|pwned|leaked|compromised/i.test(error.message) ? "Essa senha é fraca ou já apareceu em vazamentos na internet. Escolha outra."
        : /session|expired|jwt/i.test(error.message) ? "O link expirou. Volte e peça um novo em “Esqueci minha senha”." : error.message);
      return;
    }
    if (obrigatoria) {
      const { error: e2 } = await supabase.rpc("marcar_senha_trocada");
      if (e2) { setErro(`A senha foi trocada, mas não deu para registrar a troca: ${e2.message}. No próximo acesso o ERP pode pedir de novo.`); return; }
    }
    setAviso("Senha nova salva. Entrando…");
    if (!obrigatoria) window.history.replaceState(null, "", "/");
    setTimeout(onPronto, 900);
  }

  return (
    <main className={MOLDURA}>
      <Card className="w-full max-w-sm p-6">
        <Marca sub={obrigatoria ? "Troque a senha provisória" : "Crie a sua senha nova"} />
        {obrigatoria && <p className="mb-4 text-sm text-slate-600">Você entrou com uma senha provisória. Crie agora a sua senha pessoal: só você vai saber.</p>}
        <form onSubmit={salvar} className="space-y-4">
          <CampoSenha rotulo="Senha nova" valor={senha} onChange={setSenha} autoComplete="new-password" minLength={8} descricao="Mínimo de 8 caracteres. Evite datas e o nome da empresa." />
          <CampoSenha rotulo="Repita a senha nova" valor={repetir} onChange={setRepetir} autoComplete="new-password" minLength={8} />
          <Mensagens erro={erro} aviso={aviso} />
          <Button className="w-full" disabled={carregando}><KeyRound size={16} /> {carregando ? "Salvando…" : "Salvar senha nova"}</Button>
        </form>
        <button type="button" className="mt-4 w-full rounded text-center text-sm text-slate-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          onClick={async () => { await supabase.auth.signOut(); window.history.replaceState(null, "", "/"); onPronto(); }}>
          {obrigatoria ? "Sair" : "Cancelar"}
        </button>
      </Card>
    </main>
  );
}
