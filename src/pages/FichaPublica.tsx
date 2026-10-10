// Ficha cadastral que o cliente abre pelo link (/ficha/<código>), sem login, em 3 passos:
// confere os dados e o contato, confere o endereço e assina (nome, CPF e desenho). Pronto: mostra o código de
// verificação e deixa baixar o comprovante em PDF.
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, FileDown, Fingerprint, Loader2, MapPin, MessageCircle, PenLine, ShieldCheck, UserRound } from "lucide-react";
import { DEMO, supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import { docFormat, digitos, whatsappLink } from "@/lib/format";
import { erroCampo, formatarDoc, gravar, mostrar, type Mascara } from "@/lib/mascaras";
import { buscarCep } from "@/lib/cep";
import { cpfValido } from "@/lib/compliance";
import { erroAssinante, hashLegivel, ROTULOS_FICHA } from "@/lib/fichaCadastral";
import { Assinatura } from "@/components/Assinatura";
import logo from "@/assets/logo.webp";

type Ficha = {
  status: "pendente" | "assinado" | "cancelado" | "vencido"; termo: string; dados: Record<string, any> | null;
  nome: string | null; assinado_em: string | null; hash: string | null; expira_em: string;
  empresa: { nome: string; razao_social: string | null; cnpj: string | null; whatsapp: string | null; telefone: string | null; email: string | null };
};
type Feito = { hash: string; assinado_em: string; ip: string | null; dados: Record<string, any> | null; nome: string; cpf: string; png: string };

const PASSOS = [
  { titulo: "Seus dados", Icon: UserRound },
  { titulo: "Endereço", Icon: MapPin },
  { titulo: "Assinatura", Icon: PenLine },
];
const CONTATO: [string, string, Mascara | undefined][] = [
  ["whatsapp", "Celular / WhatsApp", "whatsapp"], ["telefone", "Telefone", "telefone"], ["email", "E-mail", "email"], ["email_nfe", "E-mail para receber a nota fiscal", "email"],
];
const ENDERECO: [string, string, string][] = [
  ["logradouro", "Endereço (rua, avenida)", "sm:col-span-4"], ["numero", "Número", "sm:col-span-2"], ["complemento", "Complemento", "sm:col-span-3"],
  ["bairro", "Bairro", "sm:col-span-3"], ["municipio", "Cidade", "sm:col-span-4"], ["uf", "UF", "sm:col-span-2"],
];
const EDITAVEIS = Object.keys(ROTULOS_FICHA);

export default function FichaPublica() {
  const token = useLocation().pathname.split("/")[2] ?? "";
  const { data: f, isLoading } = useQuery({
    queryKey: ["ficha_publica", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ficha_cadastral_publica", { p_token: token });
      if (error) throw error;
      return data as Ficha | null;
    },
    retry: false,
  });
  const [passo, setPasso] = useState(0);
  const [d, setD] = useState<Record<string, any>>({});
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [png, setPng] = useState<string | null>(null);
  const [aceite, setAceite] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [feito, setFeito] = useState<Feito | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!f?.dados) return;
    setD(Object.fromEntries(EDITAVEIS.map((k) => [k, f.dados![k] ?? ""])));
    if (f.dados.tipo_pessoa === "PF") { setNome(f.dados.nome ?? ""); setCpf(digitos(f.dados.cpf_cnpj)); }
  }, [f]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); setErro(null); }, [passo]);
  useEffect(() => { setErro(null); }, [nome, cpf, png, aceite, d]);

  if (isLoading) return <Tela><p className="flex items-center justify-center gap-2 py-24 text-slate-500"><Loader2 className="animate-spin" size={18} /> Carregando a ficha…</p></Tela>;
  if (!f) return <Tela><Aviso titulo="Link não encontrado" texto="Confira o link ou peça um novo para quem atendeu você." /></Tela>;
  const zap = f.empresa.whatsapp || f.empresa.telefone;
  const falar = zap && (
    <a href={whatsappLink(zap, "Olá! Preciso de ajuda com a minha ficha cadastral.")} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      <MessageCircle size={16} className="text-emerald-600" /> Falar com a {f.empresa.nome}
    </a>
  );
  if (f.status === "cancelado" || f.status === "vencido") {
    return <Tela><Cartao empresa={f.empresa.nome}><Aviso titulo={f.status === "vencido" ? "Este link venceu" : "Este link foi cancelado"} texto="Peça um link novo para quem atendeu você." acao={falar} /></Cartao></Tela>;
  }
  if (feito || f.status === "assinado") {
    return (
      <Tela>
        <Cartao empresa={f.empresa.nome}>
          <Concluido nome={feito?.nome ?? f.nome ?? ""} quando={feito?.assinado_em ?? f.assinado_em} hash={feito?.hash ?? f.hash}
            comprovante={feito ? () => baixarComprovante(f, feito).catch(notifyError) : undefined} acao={falar} />
        </Cartao>
      </Tela>
    );
  }

  const dados = f.dados ?? {};
  const pj = dados.tipo_pessoa === "PJ";
  const primeiro = String(dados.nome_fantasia || dados.nome || "").split(" ")[0];
  const setCampo = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));

  async function aoMudarCep(v: string) {
    setCampo("cep", v);
    if (digitos(v).length !== 8) return;
    setBuscandoCep(true);
    const r = await buscarCep(v).catch(() => null);
    setBuscandoCep(false);
    if (r) setD((x) => ({ ...x, logradouro: r.logradouro || x.logradouro, bairro: r.bairro || x.bairro, municipio: r.municipio || x.municipio, uf: r.uf || x.uf }));
  }

  function avancar() {
    if (passo === 0) {
      const errados = CONTATO.filter(([k, , m]) => m && erroCampo(m, d[k]));
      if (errados.length) { setTocados(new Set(errados.map(([k]) => k))); return setErro(`Confira: ${errados.map(([, l]) => l).join(", ")}`); }
      if (!d.whatsapp && !d.telefone) return setErro("Informe pelo menos um telefone ou WhatsApp");
    }
    if (passo === 1) {
      if (erroCampo("cep", d.cep)) return setErro("CEP com 8 números");
      if (!String(d.logradouro ?? "").trim() || !String(d.municipio ?? "").trim() || !/^[A-Za-z]{2}$/.test(String(d.uf ?? ""))) return setErro("Preencha endereço, cidade e UF");
    }
    setErro(null);
    setPasso((p) => p + 1);
  }

  async function assinar() {
    const e = erroAssinante(nome, cpf, cpfValido);
    if (e) return setErro(e);
    if (!png) return setErro("Faça a sua assinatura no quadro");
    if (!aceite) return setErro("Marque que leu e concorda com a declaração");
    setOcupado(true);
    setErro(null);
    try {
      const { data, error } = await supabase.rpc("ficha_cadastral_assinar", {
        p_token: token, p_nome: nome.trim(), p_cpf: cpf, p_png: png, p_dados: d, p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      setFeito({ ...(data as any), nome: nome.trim(), cpf, png });
    } catch (err) {
      setErro((err as Error)?.message ?? "Não foi possível assinar agora. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  const input = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[16px] text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15";

  return (
    <Tela>
      <Cartao empresa={f.empresa.nome}>
        {/* boas-vindas + passos */}
        <div className="px-5 pt-5 sm:px-7">
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">{primeiro ? `Olá, ${primeiro}!` : "Olá!"}</h1>
          <p className="mt-1 text-[15px] text-slate-600">Confira os seus dados e assine a ficha cadastral. Leva 1 minuto.</p>
          <ol className="mt-5 grid grid-cols-3" aria-label="Passos">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === passo ? "step" : undefined}>
                <div className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 rounded ${i === 0 ? "bg-transparent" : i <= passo ? "bg-sky-500" : "bg-slate-200"}`} />
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold transition ${i < passo ? "bg-emerald-500 text-white" : i === passo ? "bg-sky-500 text-white ring-4 ring-sky-100" : "bg-slate-100 text-slate-400"}`}>
                    {i < passo ? <Check size={18} /> : <p.Icon size={18} />}
                  </span>
                  <span className={`h-0.5 flex-1 rounded ${i === PASSOS.length - 1 ? "bg-transparent" : i < passo ? "bg-sky-500" : "bg-slate-200"}`} />
                </div>
                <span className={`text-xs font-semibold ${i === passo ? "text-slate-900" : "text-slate-500"}`}>{p.titulo}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4 px-5 py-6 sm:px-7">
          {passo === 0 && (<>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{pj ? "Empresa" : "Cadastro"}</div>
              <div className="mt-0.5 text-lg font-bold text-slate-900">{dados.nome}</div>
              {dados.nome_fantasia && dados.nome_fantasia !== dados.nome && <div className="text-sm text-slate-600">{dados.nome_fantasia}</div>}
              <div className="mt-1 text-sm text-slate-600">
                {[dados.cpf_cnpj && `${pj ? "CNPJ" : "CPF"} ${docFormat(dados.cpf_cnpj)}`, dados.inscricao_estadual && `IE ${dados.inscricao_estadual}`].filter(Boolean).join(" · ")}
              </div>
              <p className="mt-2 text-xs text-slate-500">Algo errado aqui? Fale com a {f.empresa.nome} antes de assinar.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {CONTATO.map(([k, l, m]) => (
                <label key={k} className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">{l}</span>
                  <input className={`${input} ${tocados.has(k) && m && erroCampo(m, d[k]) ? "!border-red-400" : ""}`} value={mostrar(m, d[k])}
                    type={m === "email" ? "email" : "text"} inputMode={m === "email" ? "email" : "numeric"} autoComplete={m === "email" ? "email" : "tel"}
                    onBlur={() => setTocados((t) => new Set(t).add(k))} onChange={(e) => setCampo(k, gravar(m, e.target.value))}
                    placeholder={m === "email" ? "nome@empresa.com.br" : "(00) 00000-0000"} />
                  {tocados.has(k) && m && erroCampo(m, d[k]) && <span className="mt-1 block text-xs font-semibold text-red-600">{erroCampo(m, d[k])}</span>}
                </label>
              ))}
              {!pj && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Data de nascimento</span>
                  <input className={input} type="date" value={d.data_nascimento ?? ""} onChange={(e) => setCampo("data_nascimento", e.target.value)} />
                </label>
              )}
            </div>
          </>)}

          {passo === 1 && (
            <div className="grid gap-3 sm:grid-cols-6">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">CEP</span>
                <div className="relative">
                  <input className={input} inputMode="numeric" value={mostrar("cep", d.cep)} placeholder="00000-000" onChange={(e) => aoMudarCep(gravar("cep", e.target.value))} />
                  {buscandoCep && <Loader2 size={18} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-sky-500" />}
                </div>
              </label>
              <p className="self-end pb-3 text-xs text-slate-500 sm:col-span-4">Digite o CEP: a rua, o bairro e a cidade vêm sozinhos.</p>
              {ENDERECO.map(([k, l, span]) => (
                <label key={k} className={`block ${span}`}>
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">{l}</span>
                  <input className={input} value={d[k] ?? ""} maxLength={k === "uf" ? 2 : 200}
                    onChange={(e) => setCampo(k, k === "uf" ? e.target.value.replace(/[^a-z]/gi, "").toUpperCase() : e.target.value)} />
                </label>
              ))}
            </div>
          )}

          {passo === 2 && (<>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-[14px] leading-relaxed text-slate-700">
              <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-slate-900"><ShieldCheck size={16} className="text-sky-600" /> Declaração</div>
              {f.termo}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">{pj ? "Seu nome completo (quem assina pela empresa)" : "Seu nome completo"}</span>
                <input className={input} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Seu CPF</span>
                <input className={input} inputMode="numeric" value={formatarDoc(cpf).slice(0, 14)} placeholder="000.000.000-00" onChange={(e) => setCpf(digitos(e.target.value).slice(0, 11))} />
              </label>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Sua assinatura</span>
              <Assinatura valor={png} onChange={setPng} />
            </div>
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 text-[15px] text-slate-700">
              <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-sky-600" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
              Li a declaração e confirmo que os meus dados estão corretos.
            </label>
          </>)}

          {erro && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{erro}</p>}

          <div className="flex gap-2 pt-1">
            {passo > 0 && (
              <button type="button" onClick={() => setPasso((p) => p - 1)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                <ArrowLeft size={18} /> Voltar
              </button>
            )}
            {passo < 2 ? (
              <button type="button" onClick={avancar}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-3 font-bold text-white shadow-sm hover:bg-sky-700">
                Continuar <ArrowRight size={18} />
              </button>
            ) : (
              <button type="button" onClick={assinar} disabled={ocupado}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                {ocupado ? <Loader2 size={18} className="animate-spin" /> : <PenLine size={18} />} {ocupado ? "Registrando…" : "Assinar ficha"}
              </button>
            )}
          </div>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck size={13} /> Assinatura eletrônica com data, hora, IP e código de verificação
          </p>
        </div>
      </Cartao>
    </Tela>
  );
}

async function baixarComprovante(f: Ficha, a: Feito) {
  const { pdfFichaCadastral } = await import("@/lib/pdf");
  const cfg = { nome_fantasia: f.empresa.nome, razao_social: f.empresa.razao_social ?? f.empresa.nome, cnpj: f.empresa.cnpj, whatsapp: f.empresa.whatsapp, telefone: f.empresa.telefone, email: f.empresa.email } as any;
  const blob = await pdfFichaCadastral({
    canal: "link", termo: f.termo, dados: a.dados ?? f.dados, nome: a.nome, cpf: a.cpf, assinatura_png: a.png, ip: a.ip,
    user_agent: navigator.userAgent, assinado_em: a.assinado_em, hash: a.hash, alteracoes: null,
  }, cfg, ROTULOS_FICHA);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ficha-cadastral-assinada.pdf";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Concluido({ nome, quando, hash, comprovante, acao }: { nome: string; quando: string | null; hash: string | null; comprovante?: () => void; acao?: ReactNode }) {
  return (
    <div className="px-5 py-10 text-center sm:px-7">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lg ring-8 ring-emerald-100"><BadgeCheck size={34} /></span>
      <h1 className="mt-5 text-2xl font-extrabold text-slate-900">Ficha assinada!</h1>
      <p className="mt-1 text-[15px] text-slate-600">
        Obrigado{nome ? `, ${nome.split(" ")[0]}` : ""}. Assinada em {quando ? new Date(quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}.
      </p>
      {hash && (
        <div className="mx-auto mt-5 max-w-sm rounded-2xl bg-slate-50 p-4 text-left">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500"><Fingerprint size={14} /> Código de verificação</div>
          <div className="mt-1 break-all font-mono text-xs leading-relaxed text-slate-700">{hashLegivel(hash)}</div>
        </div>
      )}
      <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
        {comprovante && (
          <button type="button" onClick={comprovante} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700">
            <FileDown size={16} /> Baixar comprovante (PDF)
          </button>
        )}
        {acao}
      </div>
    </div>
  );
}

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <h1 className="text-xl font-bold text-slate-900">{titulo}</h1>
      <p className="mt-1 text-slate-600">{texto}</p>
      {acao && <div className="mt-5 flex justify-center">{acao}</div>}
    </div>
  );
}

function Cartao({ empresa, children }: { empresa: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl overflow-hidden rounded-3xl bg-white shadow-xl">
      <header className="flex items-center gap-3 bg-gradient-to-r from-[#071528] to-[#0f2a4d] px-5 py-4 text-white sm:px-7">
        <img src={logo} alt="" className="h-11 w-11 rounded-xl bg-white/10" />
        <div className="min-w-0">
          <div className="truncate text-lg font-extrabold">{empresa}</div>
          <div className="text-xs text-sky-200">Ficha cadastral</div>
        </div>
      </header>
      {children}
    </div>
  );
}

function Tela({ children }: { children: ReactNode }) {
  // página do cliente: sempre clara, independente do tema escolhido no ERP
  useEffect(() => {
    const antes = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "light";
    return () => { if (antes) document.documentElement.dataset.theme = antes; };
  }, []);
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-200 to-slate-100 px-3 py-5 sm:py-10" style={{ colorScheme: "light" }}>
      {DEMO && <button type="button" onClick={() => navigate("/clientes")} className="mx-auto mb-3 block rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">← Prévia: voltar ao ERP</button>}
      {children}
    </div>
  );
}
