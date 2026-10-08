import { useEffect, useState, type FormEvent } from "react";
import { DEMO, supabase } from "@/lib/supabase";
import { entrarDemo, USUARIOS_DEMO } from "@/lib/demo";
import { PAPEIS } from "@/lib/permissoes";
import logo from "@/assets/logo.webp";
import { Button, Card, Field } from "@/components/ui";

export default function Login() {
  if (DEMO) return <LoginDemo />;
  return <LoginReal />;
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

function LoginReal() {
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
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

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro("");
    setAviso("");
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setErro(error.message.includes("confirm") ? "Confirme o seu e-mail pelo link que enviamos e tente de novo." : "E-mail ou senha inválidos.");
    } else {
      if (senha.length < 8) {
        setCarregando(false);
        return setErro("A senha precisa ter ao menos 8 caracteres.");
      }
      const { data, error } = await supabase.auth.signUp({
        email, password: senha, options: { data: { nome }, emailRedirectTo: window.location.origin },
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
    <div className="flex min-h-screen items-center justify-center bg-ink bg-[radial-gradient(ellipse_at_top,_rgb(var(--brand-nav)/0.22)_0%,_#071528_60%)] p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center text-center"><img src={logo} alt="" className="mb-3 h-20 w-20 rounded-2xl shadow-pop" /><span className="block text-2xl font-extrabold tracking-tight text-fg">ERP <span className="text-brand">Line</span></span><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">MF Máquinas</span></div>
        <p className="mb-6 text-sm text-slate-500">
          {modo === "criar" ? "Primeiro acesso: crie a conta do administrador" : "Acesso ao ERP"}
        </p>
        <form onSubmit={enviar} className="space-y-4">
          {modo === "criar" && (
            <Field label="Seu nome">
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </Field>
          )}
          <Field label="E-mail">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={modo === "criar" ? "Crie uma senha (mín. 8 caracteres)" : "Senha"}>
            <input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Field>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {aviso && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}
          <Button className="w-full" disabled={carregando}>
            {carregando ? "Aguarde…" : modo === "criar" ? "Criar conta de administrador" : "Entrar"}
          </Button>
        </form>
        {primeiroAcesso && (
          <button className="mt-4 w-full text-center text-sm text-brand hover:underline"
            onClick={() => setModo(modo === "criar" ? "entrar" : "criar")}>
            {modo === "criar" ? "Já criei a conta — entrar" : "Primeiro acesso? Criar conta de administrador"}
          </button>
        )}
      </Card>
    </div>
  );
}
