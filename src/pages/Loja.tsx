// Loja virtual (pública): vitrine, carrinho, conta do cliente e pedidos.
//   /loja                 produtos
//   /loja/:id             página do produto (também é o link do catálogo do WhatsApp)
//   /loja/carrinho        carrinho e finalizar pedido
//   /loja/conta           entrar, criar conta e cadastro (CPF/CNPJ, endereço)
//   /loja/pedidos         meus pedidos
// O pedido entra no ERP como orçamento (origem "loja") e aparece na hora para a equipe.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft, CheckCircle2, ImageOff, LogOut, MapPin, MessageCircle, Minus, Package, Plus, Share2, ShieldCheck, ShoppingCart, Trash2, User,
} from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, whatsappLink } from "@/lib/format";
import { buscarCep } from "@/lib/cep";
import { buscarCnpj, preencherVazios } from "@/lib/cnpj";
import { DISPONIBILIDADE, urlFotoProduto, urlLoja, type DadosLoja, type ProdutoLoja } from "@/lib/catalogo";
import logo from "@/assets/logo.webp";

const FILTROS = [
  { id: "", rotulo: "Tudo" },
  { id: "maquina", rotulo: "Máquinas" },
  { id: "acessorio", rotulo: "Acessórios" },
  { id: "peca", rotulo: "Peças" },
  { id: "insumo", rotulo: "Insumos" },
];

// ---------------------------------------------------------------------
// Carrinho (fica no aparelho do cliente)
// ---------------------------------------------------------------------
type ItemCarrinho = { id: string; quantidade: number };
const CHAVE_CARRINHO = "erp-line-carrinho";
const lerCarrinho = (): ItemCarrinho[] => { try { return JSON.parse(localStorage.getItem(CHAVE_CARRINHO) ?? "[]"); } catch { return []; } };
function useCarrinho() {
  const [itens, setItens] = useState<ItemCarrinho[]>(lerCarrinho);
  const gravar = (novo: ItemCarrinho[]) => { setItens(novo); try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(novo)); } catch { /* sem armazenamento */ } };
  return {
    itens,
    adicionar: (id: string, q = 1) => gravar(itens.some((i) => i.id === id) ? itens.map((i) => (i.id === id ? { ...i, quantidade: Math.min(99, i.quantidade + q) } : i)) : [...itens, { id, quantidade: q }]),
    alterar: (id: string, q: number) => gravar(q <= 0 ? itens.filter((i) => i.id !== id) : itens.map((i) => (i.id === id ? { ...i, quantidade: Math.min(99, q) } : i))),
    limpar: () => gravar([]),
  };
}
type Carrinho = ReturnType<typeof useCarrinho>;

function useSessao() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [recuperando, setRecuperando] = useState(false);
  useEffect(() => {
    // Na prévia a sessão da equipe é ignorada aqui, para mostrar a loja como o cliente vê
    const daLoja = (s: Session | null) => (!DEMO || s?.user.user_metadata?.tipo === "cliente_loja" ? s : null);
    supabase.auth.getSession().then(({ data }) => setSessao(daLoja(data.session)));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => { setSessao(daLoja(s)); if (evento === "PASSWORD_RECOVERY") setRecuperando(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  return { sessao, recuperando, setRecuperando };
}

export default function Loja() {
  const { pathname } = useLocation();
  const parte = pathname.split("/")[2] || "";
  const [filtro, setFiltro] = useState("");
  const carrinho = useCarrinho();
  const auth = useSessao();
  const { data, isLoading, error } = useQuery({
    queryKey: ["loja"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("loja_dados");
      if (error) throw error;
      return data as DadosLoja;
    },
  });
  const empresa = data?.empresa;
  const pagina = ["carrinho", "conta", "pedidos"].includes(parte) ? parte : parte ? "produto" : "vitrine";
  const produto = pagina === "produto" ? data?.produtos.find((p) => p.id === parte) : null;
  const filtros = useMemo(() => FILTROS.filter((f) => !f.id || data?.produtos.some((p) => p.tipo === f.id)), [data]);
  const lista = (data?.produtos ?? []).filter((p) => !filtro || p.tipo === filtro);
  const qtdCarrinho = carrinho.itens.reduce((s, i) => s + i.quantidade, 0);

  useEffect(() => {
    document.title = produto ? `${produto.nome} · ${empresa?.nome ?? ""}` : `${empresa?.nome ?? "Loja"} · Loja`;
    window.scrollTo(0, 0);
  }, [produto, empresa, pagina]);

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-20 border-b border-ink-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Link to="/loja" className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="" className="h-10 w-10 rounded-xl" />
            <span className="truncate text-lg font-bold text-white">{empresa?.nome ?? "Loja"}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link to="/loja/conta" className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-white hover:bg-white/10" aria-label="Minha conta">
              <User size={20} /> <span className="hidden sm:inline">{auth.sessao ? "Minha conta" : "Entrar"}</span>
            </Link>
            <Link to="/loja/carrinho" className="relative inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg" aria-label="Carrinho">
              <ShoppingCart size={19} /> <span className="hidden sm:inline">Carrinho</span>
              {qtdCarrinho > 0 && <span className="num grid h-5 min-w-[20px] place-items-center rounded-full bg-white px-1 text-[11px] font-bold text-ink">{qtdCarrinho}</span>}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        {isLoading && <p className="py-20 text-center text-slate-500">Carregando…</p>}
        {error && <p className="py-20 text-center text-slate-500">Não foi possível abrir a loja agora.</p>}

        {data && pagina === "produto" && !produto && (
          <div className="py-20 text-center">
            <p className="mb-4 text-slate-500">Este produto não está mais na loja.</p>
            <Link to="/loja" className="font-semibold text-brand">Ver todos os produtos</Link>
          </div>
        )}
        {produto && <PaginaProduto p={produto} empresa={empresa!} carrinho={carrinho} />}

        {data && pagina === "vitrine" && (
          <>
            <section className="mb-6">
              <h1 className="text-2xl font-bold sm:text-3xl">Loja</h1>
              {empresa?.texto && <p className="mt-1 max-w-2xl text-[16px] text-slate-600">{empresa.texto}</p>}
            </section>
            {filtros.length > 2 && (
              <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
                {filtros.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${filtro === f.id ? "bg-brand text-brand-fg" : "border border-slate-200 bg-surface text-slate-600"}`}>
                    {f.rotulo}
                  </button>
                ))}
              </div>
            )}
            {lista.length ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {lista.map((p) => (
                  <div key={p.id} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-card">
                    <Link to={`/loja/${p.id}`}><Foto p={p} /></Link>
                    <div className="flex flex-1 flex-col p-3 sm:p-4">
                      <Disponivel p={p} />
                      <Link to={`/loja/${p.id}`} className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-snug hover:underline">{p.nome}</Link>
                      <div className="num mt-auto pt-2 text-lg font-extrabold">{brl(p.preco)}</div>
                      {p.disponibilidade !== "out of stock" && (
                        <button type="button" onClick={() => { carrinho.adicionar(p.id); notify("Adicionado ao carrinho"); }}
                          className="mt-2 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-brand px-3 text-sm font-bold text-brand hover:bg-brand-light">
                          <Plus size={16} /> Carrinho
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="py-16 text-center text-slate-500">Nenhum produto por aqui ainda.</p>}
          </>
        )}

        {data && pagina === "carrinho" && <PaginaCarrinho dados={data} carrinho={carrinho} sessao={auth.sessao} />}
        {pagina === "conta" && <PaginaConta auth={auth} />}
        {pagina === "pedidos" && <PaginaPedidos sessao={auth.sessao} empresa={empresa} />}

        {empresa && (
          <footer className="mt-12 flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500">
            {(empresa.endereco || empresa.municipio) && (
              <span className="flex items-start gap-2"><MapPin size={16} className="mt-0.5 shrink-0" />
                {[empresa.endereco, [empresa.municipio, empresa.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}</span>
            )}
            <span className="flex items-center gap-4">
              {empresa.whatsapp && <a href={whatsappLink(empresa.whatsapp, "Olá! Vim pela loja do site.")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-emerald-700"><MessageCircle size={15} /> WhatsApp</a>}
              <Link to="/" className="text-xs text-slate-400 hover:underline">Área da equipe</Link>
            </span>
          </footer>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------
function PaginaProduto({ p, empresa, carrinho }: { p: ProdutoLoja; empresa: DadosLoja["empresa"]; carrinho: Carrinho }) {
  const [qtd, setQtd] = useState(1);
  const navigate = useNavigate();
  const disponivel = p.disponibilidade !== "out of stock";
  return (
    <article>
      <Link to="/loja" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft size={16} /> Todos os produtos</Link>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Foto p={p} grande />
        <div>
          <Disponivel p={p} />
          <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">{p.nome}</h1>
          {p.sku && <div className="mt-1 text-sm text-slate-500">Código {p.sku}</div>}
          <div className="num mt-4 text-3xl font-extrabold">{brl(p.preco)}</div>
          <p className="mt-4 whitespace-pre-line text-[16px] leading-relaxed text-slate-700">{p.descricao?.trim() || p.nome}</p>
          {p.tipo === "maquina" && p.garantia_meses ? (
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700"><ShieldCheck size={18} /> Garantia de {p.garantia_meses} meses e assistência técnica própria</p>
          ) : null}
          {disponivel && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Quantidade valor={qtd} onChange={setQtd} />
              <button type="button" onClick={() => { carrinho.adicionar(p.id, qtd); navigate("/loja/carrinho"); }}
                className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-base font-bold text-brand-fg">
                <ShoppingCart size={20} /> Comprar
              </button>
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {empresa.whatsapp && (
              <a href={whatsappLink(empresa.whatsapp, `Olá! Tenho interesse em: ${p.nome}${p.sku ? ` (cód. ${p.sku})` : ""}.\n${urlLoja(p.id)}`)} target="_blank" rel="noreferrer"
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 font-bold text-[#06301a]">
                <MessageCircle size={19} /> Tirar dúvidas no WhatsApp
              </a>
            )}
            <button type="button" onClick={() => compartilhar(p)}
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 font-semibold text-slate-700">
              <Share2 size={18} /> Compartilhar
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function Quantidade({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-300">
      <button type="button" aria-label="Menos" onClick={() => onChange(Math.max(1, valor - 1))} className="grid h-11 w-11 place-items-center text-slate-600"><Minus size={16} /></button>
      <span className="num w-8 text-center font-bold">{valor}</span>
      <button type="button" aria-label="Mais" onClick={() => onChange(Math.min(99, valor + 1))} className="grid h-11 w-11 place-items-center text-slate-600"><Plus size={16} /></button>
    </div>
  );
}

// ---------------------------------------------------------------------
function PaginaCarrinho({ dados, carrinho, sessao }: { dados: DadosLoja; carrinho: Carrinho; sessao: Session | null | undefined }) {
  const navigate = useNavigate();
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ numero: number; total: number } | null>(null);
  const cadastro = useCadastro(sessao);
  const linhas = carrinho.itens.map((i) => ({ ...i, p: dados.produtos.find((p) => p.id === i.id) })).filter((l) => l.p) as (ItemCarrinho & { p: ProdutoLoja })[];
  const total = linhas.reduce((s, l) => s + l.quantidade * l.p.preco, 0);

  async function finalizar() {
    if (!sessao) return navigate("/loja/conta", { state: { voltar: "/loja/carrinho" } });
    if (!cadastro.data) return navigate("/loja/conta", { state: { voltar: "/loja/carrinho" } });
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc("loja_criar_pedido", { p_itens: linhas.map((l) => ({ produto_id: l.id, quantidade: l.quantidade })), p_observacoes: obs || null });
      if (error) throw error;
      setFeito(data as { numero: number; total: number });
      carrinho.limpar();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }

  if (feito) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
        <h1 className="mt-3 text-2xl font-bold">Pedido #{feito.numero} recebido!</h1>
        <p className="mt-2 text-[16px] text-slate-600">Total dos produtos: <b className="num text-fg">{brl(feito.total)}</b>. Nossa equipe vai confirmar o frete e a forma de pagamento com você pelo WhatsApp.</p>
        <div className="mt-6 flex flex-col gap-2">
          {dados.empresa.whatsapp && (
            <a href={whatsappLink(dados.empresa.whatsapp, `Olá! Acabei de fazer o pedido #${feito.numero} pelo site.`)} target="_blank" rel="noreferrer"
              className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 font-bold text-[#06301a]"><MessageCircle size={20} /> Falar agora no WhatsApp</a>
          )}
          <Link to="/loja/pedidos" className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 font-semibold">Ver meus pedidos</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">Carrinho</h1>
      {linhas.length ? (
        <>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-surface">
            {linhas.map((l) => (
              <li key={l.id} className="flex items-center gap-3 p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl"><Foto p={l.p} /></div>
                <div className="min-w-0 flex-1">
                  <Link to={`/loja/${l.id}`} className="line-clamp-2 font-semibold leading-snug">{l.p.nome}</Link>
                  <div className="num text-sm text-slate-500">{brl(l.p.preco)} cada</div>
                  <div className="mt-2 flex items-center gap-2">
                    <Quantidade valor={l.quantidade} onChange={(n) => carrinho.alterar(l.id, n)} />
                    <button type="button" aria-label="Remover" onClick={() => carrinho.alterar(l.id, 0)} className="rounded-lg p-2 text-red-600"><Trash2 size={17} /></button>
                  </div>
                </div>
                <div className="num shrink-0 text-right font-bold">{brl(l.quantidade * l.p.preco)}</div>
              </li>
            ))}
          </ul>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-600">Observações (voltagem, prazo, endereço de entrega diferente…)</span>
            <textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </label>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-surface p-4">
            <div className="flex items-baseline justify-between"><span className="text-slate-600">Produtos</span><span className="num text-2xl font-extrabold">{brl(total)}</span></div>
            <p className="mt-1 text-sm text-slate-500">Frete e forma de pagamento são combinados com a nossa equipe depois do pedido.</p>
            {sessao && cadastro.data === null && <p className="mt-2 text-sm font-semibold text-amber-700">Falta completar o seu cadastro (CPF/CNPJ e endereço).</p>}
            <button type="button" disabled={enviando} onClick={finalizar}
              className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-base font-bold text-brand-fg disabled:opacity-60">
              {enviando ? "Enviando…" : !sessao ? "Entrar e finalizar o pedido" : cadastro.data ? "Finalizar pedido" : "Completar cadastro"}
            </button>
          </div>
        </>
      ) : (
        <div className="py-16 text-center">
          <ShoppingCart size={40} className="mx-auto text-slate-300" />
          <p className="mt-3 text-slate-500">Seu carrinho está vazio.</p>
          <Link to="/loja" className="mt-4 inline-block font-semibold text-brand">Ver produtos</Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
function useCadastro(sessao: Session | null | undefined) {
  return useQuery({
    queryKey: ["loja", "cadastro", sessao?.user.id],
    enabled: !!sessao,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("loja_meu_cadastro");
      if (error) throw error;
      return (data ?? null) as Record<string, any> | null;
    },
  });
}

function PaginaConta({ auth }: { auth: ReturnType<typeof useSessao> }) {
  const { sessao, recuperando, setRecuperando } = auth;
  const navigate = useNavigate();
  const voltar = (useLocation().state as any)?.voltar as string | undefined;
  const cadastro = useCadastro(sessao);

  if (sessao === undefined) return <p className="py-16 text-center text-slate-500">Carregando…</p>;
  if (recuperando) return <NovaSenha onPronto={() => setRecuperando(false)} />;
  if (!sessao) return <Entrar />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Minha conta</h1>
          <p className="text-sm text-slate-500">{sessao.user.email}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/loja/pedidos" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"><Package size={16} /> Meus pedidos</Link>
          <button type="button" onClick={() => supabase.auth.signOut()} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"><LogOut size={16} /> Sair</button>
        </div>
      </div>
      {cadastro.isLoading ? <p className="text-slate-500">Carregando…</p> : (
        <FormCadastro inicial={cadastro.data ?? null} onSalvo={() => { cadastro.refetch(); if (voltar) navigate(voltar); }} voltarParaCarrinho={!!voltar} />
      )}
    </div>
  );
}

function Campo({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-sm font-semibold text-slate-600">{label}</span>{children}</label>;
}

function Entrar() {
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true); setAviso("");
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error(error.message.includes("Invalid") ? "E-mail ou senha incorretos" : error.message);
      } else {
        if (senha.length < 8) throw new Error("A senha precisa ter ao menos 8 caracteres");
        const { data, error } = await supabase.auth.signUp({
          email, password: senha,
          options: { data: { tipo: "cliente_loja", nome }, emailRedirectTo: `${window.location.origin}/loja/conta` },
        });
        if (error) throw error;
        if (!data.session) setAviso("Conta criada! Enviamos um link para o seu e-mail: confirme e depois entre aqui.");
      }
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  async function esqueci() {
    if (!email) return notify("Digite o seu e-mail primeiro", "erro");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/loja/conta` });
    if (error) return notifyError(error);
    setAviso("Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.");
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-bold">{modo === "entrar" ? "Entrar" : "Criar conta"}</h1>
      <p className="mb-4 text-slate-600">{modo === "entrar" ? "Para fazer e acompanhar os seus pedidos." : "Leva 1 minuto. Depois é só completar o endereço."}</p>
      <form onSubmit={enviar} className="space-y-3 rounded-2xl border border-slate-200 bg-surface p-4">
        {modo === "criar" && <Campo label="Seu nome"><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" /></Campo>}
        <Campo label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Campo>
        <Campo label="Senha"><input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete={modo === "entrar" ? "current-password" : "new-password"} /></Campo>
        {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}
        <button disabled={ocupado} className="inline-flex min-h-[50px] w-full items-center justify-center rounded-xl bg-brand font-bold text-brand-fg disabled:opacity-60">
          {ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar minha conta"}
        </button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <button type="button" onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")} className="font-semibold text-brand">
            {modo === "entrar" ? "Ainda não tenho conta" : "Já tenho conta"}
          </button>
          {modo === "entrar" && <button type="button" onClick={esqueci} className="text-slate-500 hover:underline">Esqueci a senha</button>}
        </div>
      </form>
    </div>
  );
}

function NovaSenha({ onPronto }: { onPronto: () => void }) {
  const [senha, setSenha] = useState("");
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return notify("A senha precisa ter ao menos 8 caracteres", "erro");
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return notifyError(error);
    notify("Senha alterada");
    onPronto();
  }
  return (
    <form onSubmit={salvar} className="mx-auto max-w-md space-y-3 rounded-2xl border border-slate-200 bg-surface p-4">
      <h1 className="text-xl font-bold">Criar nova senha</h1>
      <Campo label="Nova senha"><input className="input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus /></Campo>
      <button className="inline-flex min-h-[50px] w-full items-center justify-center rounded-xl bg-brand font-bold text-brand-fg">Salvar</button>
    </form>
  );
}

function FormCadastro({ inicial, onSalvo, voltarParaCarrinho }: { inicial: Record<string, any> | null; onSalvo: () => void; voltarParaCarrinho: boolean }) {
  const qc = useQueryClient();
  const [c, setC] = useState<Record<string, any>>(inicial ?? {});
  const [ocupado, setOcupado] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value });
  const pj = (c.cpf_cnpj ?? "").replace(/\D/g, "").length === 14;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("loja_salvar_cadastro", { p: c });
      if (error) throw error;
      notify("Cadastro salvo");
      qc.invalidateQueries({ queryKey: ["loja", "cadastro"] });
      onSalvo();
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  return (
    <form onSubmit={salvar} className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-surface p-4 sm:grid-cols-4">
      <div className="sm:col-span-4">
        <h2 className="text-lg font-bold">{inicial ? "Meus dados" : "Complete o seu cadastro"}</h2>
        <p className="text-sm text-slate-500">Usamos para a nota fiscal e a entrega. Empresa: digite o CNPJ que o resto se preenche.</p>
      </div>
      <Campo label="CPF ou CNPJ" className="sm:col-span-2">
        <input className="input" inputMode="numeric" value={c.cpf_cnpj ?? ""} onChange={set("cpf_cnpj")} required
          onBlur={async () => { const d = await buscarCnpj(c.cpf_cnpj); if (d) setC((x) => ({ ...x, ...preencherVazios(x, d, { nome: "nome", telefone: "telefone", cep: "cep", logradouro: "logradouro", numero: "numero", complemento: "complemento", bairro: "bairro", municipio: "municipio", uf: "uf" }) })); }} />
      </Campo>
      {pj && <Campo label="Inscrição estadual (se tiver)" className="sm:col-span-2"><input className="input" value={c.inscricao_estadual ?? ""} onChange={set("inscricao_estadual")} /></Campo>}
      <Campo label={pj ? "Razão social" : "Nome completo"} className="sm:col-span-4"><input className="input" value={c.nome ?? ""} onChange={set("nome")} required /></Campo>
      <Campo label="WhatsApp" className="sm:col-span-2"><input className="input" inputMode="tel" value={c.whatsapp ?? ""} onChange={set("whatsapp")} required /></Campo>
      <Campo label="Telefone (opcional)" className="sm:col-span-2"><input className="input" inputMode="tel" value={c.telefone ?? ""} onChange={set("telefone")} /></Campo>
      <Campo label="CEP"><input className="input" inputMode="numeric" value={c.cep ?? ""} onChange={set("cep")} required
        onBlur={async () => { const r = await buscarCep(c.cep ?? ""); if (r) setC((x) => ({ ...x, ...r })); }} /></Campo>
      <Campo label="Rua / avenida" className="sm:col-span-3"><input className="input" value={c.logradouro ?? ""} onChange={set("logradouro")} required /></Campo>
      <Campo label="Número"><input className="input" value={c.numero ?? ""} onChange={set("numero")} required /></Campo>
      <Campo label="Complemento"><input className="input" value={c.complemento ?? ""} onChange={set("complemento")} /></Campo>
      <Campo label="Bairro" className="sm:col-span-2"><input className="input" value={c.bairro ?? ""} onChange={set("bairro")} required /></Campo>
      <Campo label="Cidade" className="sm:col-span-3"><input className="input" value={c.municipio ?? ""} onChange={set("municipio")} required /></Campo>
      <Campo label="UF"><input className="input" maxLength={2} value={c.uf ?? ""} onChange={set("uf")} required /></Campo>
      <button disabled={ocupado} className="inline-flex min-h-[50px] items-center justify-center rounded-xl bg-brand font-bold text-brand-fg disabled:opacity-60 sm:col-span-4">
        {ocupado ? "Salvando…" : voltarParaCarrinho ? "Salvar e voltar ao carrinho" : "Salvar"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------
const SITUACAO_PEDIDO: Record<string, { rotulo: string; tom: string }> = {
  orcamento: { rotulo: "Recebido · aguardando confirmação", tom: "bg-amber-50 text-amber-800" },
  aprovado: { rotulo: "Confirmado", tom: "bg-sky-50 text-sky-700" },
  faturado: { rotulo: "Nota fiscal emitida", tom: "bg-indigo-50 text-indigo-700" },
  entregue: { rotulo: "Entregue", tom: "bg-emerald-50 text-emerald-700" },
  cancelado: { rotulo: "Cancelado", tom: "bg-red-50 text-red-700" },
};

function PaginaPedidos({ sessao, empresa }: { sessao: Session | null | undefined; empresa?: DadosLoja["empresa"] }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["loja", "pedidos", sessao?.user.id],
    enabled: !!sessao,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("loja_meus_pedidos");
      if (error) throw error;
      return (data ?? []) as { numero: number; data: string; status: string; total: number; frete: number; rastreio: string | null; itens: { descricao: string; quantidade: number; valor: number }[] }[];
    },
  });
  if (sessao === null) return <div className="py-16 text-center"><p className="mb-3 text-slate-500">Entre na sua conta para ver os pedidos.</p><Link to="/loja/conta" className="font-semibold text-brand">Entrar</Link></div>;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">Meus pedidos</h1>
      {isLoading ? <p className="text-slate-500">Carregando…</p> : data.length ? (
        <ul className="space-y-3">
          {data.map((p) => {
            const s = SITUACAO_PEDIDO[p.status] ?? SITUACAO_PEDIDO.orcamento;
            return (
              <li key={p.numero} className="rounded-2xl border border-slate-200 bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-bold">Pedido #{p.numero}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.tom}`}>{s.rotulo}</span>
                </div>
                <div className="text-sm text-slate-500">{dataBR(p.data)}</div>
                <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
                  {(p.itens ?? []).map((i, k) => <li key={k} className="flex justify-between gap-3"><span>{Number(i.quantidade)}× {i.descricao}</span><span className="num">{brl(i.valor)}</span></li>)}
                </ul>
                <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 font-bold"><span>Total{Number(p.frete) ? " (com frete)" : ""}</span><span className="num">{brl(p.total)}</span></div>
                {p.rastreio && <div className="mt-1 text-sm">Rastreio: <b>{p.rastreio}</b></div>}
                {empresa?.whatsapp && p.status !== "cancelado" && (
                  <a href={whatsappLink(empresa.whatsapp, `Olá! Sobre o meu pedido #${p.numero}.`)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><MessageCircle size={15} /> Falar sobre este pedido</a>
                )}
              </li>
            );
          })}
        </ul>
      ) : <div className="py-16 text-center"><p className="text-slate-500">Você ainda não fez pedidos.</p><Link to="/loja" className="mt-3 inline-block font-semibold text-brand">Ver produtos</Link></div>}
    </div>
  );
}

// ---------------------------------------------------------------------
function Foto({ p, grande }: { p: ProdutoLoja; grande?: boolean }) {
  return (
    <div className={`grid aspect-square place-items-center overflow-hidden bg-white ${grande ? "rounded-2xl border border-slate-200" : ""}`}>
      {p.foto ? <img src={urlFotoProduto(p.foto)} alt={p.nome} loading="lazy" className="h-full w-full object-contain" /> : <ImageOff size={grande ? 48 : 28} className="text-slate-300" />}
    </div>
  );
}

function Disponivel({ p }: { p: ProdutoLoja }) {
  const d = DISPONIBILIDADE[p.disponibilidade] ?? DISPONIBILIDADE["out of stock"];
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${d.tom}`}>{d.rotulo}</span>;
}

async function compartilhar(p: ProdutoLoja) {
  const url = urlLoja(p.id);
  try {
    if (navigator.share) await navigator.share({ title: p.nome, text: `${p.nome} · ${brl(p.preco)}`, url });
    else { await navigator.clipboard.writeText(url); notify("Link copiado"); }
  } catch { /* cancelado */ }
}
