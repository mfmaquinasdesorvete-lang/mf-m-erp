// Usuários e permissões: quem acessa o ERP, com qual papel (principal + adicionais), unidade, função e contato;
// senha provisória (troca obrigatória no primeiro acesso), vínculo com o cadastro de vendedor e o que cada papel pode.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound, MessageCircle, Minus, Pencil, Plus, RefreshCw, Search, ShieldCheck, Smartphone } from "lucide-react";
import { Button, Card, Field, Modal, PageHeader, Tabs } from "@/components/ui";
import { Historico } from "@/components/Historico";
import { useInvalidate, useRows } from "@/lib/data";
import { dataBR, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { useConfig } from "@/lib/useConfig";
import {
  ACOES_ROTULO, PAPEIS, PAPEIS_ADICIONAIS, TELAS_ROTULO, acoesDoPapel, podeVer, rotuloPapel, telasDoPapel, type Papel, type Tela,
} from "@/lib/permissoes";

type Usuario = {
  user_id: string; nome: string; papel: Papel; papeis_extras: Papel[] | null; cargo: string | null; telefone: string | null;
  unidade_id: string | null; ativo: boolean; trocar_senha: boolean | null; created_at?: string; email: string; ultimo_acesso: string | null;
};
type Vendedor = { id: string; nome: string; user_id: string | null; ativo: boolean };
type CodigoUsuario = { user_id: string; fatores: number; desde: string | null };
type Evento = { id: number; created_at: string; usuario_nome: string | null; acao: string; entidade: string; registro_nome: string | null; campos: string[] | null };

/** Quem tem o login em duas etapas e quais papéis são obrigados (Segurança do acesso). */
function useDuasEtapas() {
  const { data: codigos = [] } = useQuery({
    queryKey: ["usuarios_mfa"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_mfa");
      return error ? [] : (data ?? []) as CodigoUsuario[];
    },
  });
  const { data: cfg } = useConfig();
  const papeis: Papel[] = cfg?.mfa_papeis ?? [];
  return {
    papeis,
    fatoresDe: (id: string) => codigos.find((c) => c.user_id === id)?.fatores ?? 0,
    exige: (u: { papel: Papel; papeis_extras?: Papel[] | null }) => papeis.includes(u.papel) || (u.papeis_extras ?? []).some((p) => papeis.includes(p)),
  };
}

const COR_PAPEL: Record<Papel, string> = {
  admin: "bg-solido-cinza text-white", vendas: "bg-emerald-100 text-emerald-800", financeiro: "bg-amber-100 text-amber-800",
  tecnico: "bg-sky-100 text-sky-800", contador: "bg-violet-100 text-violet-800",
};
const SITE = typeof window !== "undefined" ? window.location.origin : "https://erp.myfrost.ai";

/** Senha provisória fácil de ditar: 3 blocos sem letras parecidas (ex.: kfrm-4827-tpzw). */
function gerarSenha() {
  const letras = "abcdefghjkmnpqrstuvwxyz", nums = "23456789";
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  const pega = (s: string, i: number) => s[r[i] % s.length];
  return [0, 1, 2, 3].map((i) => pega(letras, i)).join("") + "-" + [4, 5, 6, 7].map((i) => pega(nums, i)).join("") + "-" + [8, 9, 10, 11].map((i) => pega(letras, i)).join("");
}

function quando(v: string | null) {
  if (!v) return "nunca entrou";
  const dias = Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : dias < 30 ? `há ${dias} dias` : dataBR(v);
}
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
const fone = (t: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t ?? "";
};

function ChipPapel({ p, extra }: { p: Papel; extra?: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_PAPEL[p]} ${extra ? "opacity-90" : ""}`}>{extra ? "+ " : ""}{rotuloPapel(p)}</span>;
}

export default function Usuarios() {
  const eu = usePerfil();
  const { nome: nomeUnidade } = useUnidade();
  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ["usuarios_erp", "admin"],
    queryFn: async () => (await callFunction<{ usuarios: Usuario[] }>("usuarios-admin", { acao: "listar" })).usuarios,
  });
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const [aba, setAba] = useState<"usuarios" | "permissoes" | "seguranca">("usuarios");
  const duas = useDuasEtapas();
  const invalidate = useInvalidate();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [editando, setEditando] = useState<Usuario | "novo" | null>(null);
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);

  const lista = usuarios
    .filter((u) => (filtro === "todos" ? true : filtro === "ativos" ? u.ativo : !u.ativo))
    .filter((u) => !busca.trim() || `${u.nome} ${u.email} ${u.cargo ?? ""} ${u.telefone ?? ""} ${rotuloPapel(u.papel)}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const ativos = usuarios.filter((u) => u.ativo);
  const provisoria = ativos.filter((u) => u.trocar_senha).length;
  const nuncaEntrou = ativos.filter((u) => !u.ultimo_acesso).length;
  const admins = ativos.filter((u) => u.papel === "admin").length;
  const faltaCodigo = ativos.filter((u) => duas.exige(u) && !duas.fatoresDe(u.user_id)).length;

  async function zerarCodigo(u: Usuario) {
    if (!confirm(`Zerar o login em duas etapas de ${u.nome}? No próximo acesso ${u.nome.split(" ")[0]} cadastra o código de novo (use quando a pessoa perdeu ou trocou de celular).`)) return;
    const { error } = await supabase.rpc("zerar_mfa", { p_user: u.user_id });
    if (error) return notifyError(error);
    notify("Login em duas etapas zerado");
    invalidate("usuarios_mfa", "eventos_seguranca");
  }

  return (
    <div>
      <PageHeader title="Usuários e permissões" actions={<Button onClick={() => setEditando("novo")}><Plus size={16} aria-hidden /> Novo usuário</Button>} />
      <Tabs value={aba} onChange={setAba} options={[{ value: "usuarios", label: `Usuários (${ativos.length})` }, { value: "permissoes", label: "O que cada papel pode" }, { value: "seguranca", label: "Segurança do acesso" }]} />

      {aba === "permissoes" ? <MatrizPermissoes /> : aba === "seguranca" ? <SegurancaAcesso usuarios={ativos} /> : (
        <>
          {(provisoria > 0 || nuncaEntrou > 0 || admins === 1 || faltaCodigo > 0) && (
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              {provisoria > 0 && <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-900">{provisoria} com senha provisória (trocam no próximo acesso)</span>}
              {nuncaEntrou > 0 && <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">{nuncaEntrou} ainda não entrou</span>}
              {admins === 1 && <span className="rounded-lg bg-sky-50 px-3 py-1.5 text-sky-900">Só 1 administrador ativo: vale ter um segundo, para não ficar sem acesso</span>}
              {faltaCodigo > 0 && <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-900">{faltaCodigo} ainda sem o login em duas etapas (cadastram no próximo acesso)</span>}
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-0 sm:max-w-sm sm:flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="input pl-9" placeholder="Buscar nome, e-mail, função…" aria-label="Buscar usuário" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm" role="group" aria-label="Situação">
              {(["ativos", "inativos", "todos"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
                  className={`rounded-md px-3 py-1 font-semibold ${filtro === f ? "bg-modulo-escuro text-white" : "text-slate-600 hover:bg-slate-100"}`}>{f}</button>
              ))}
            </div>
          </div>

          <Card>
            {isLoading ? <p className="p-6 text-center text-sm text-slate-500">Carregando…</p> : !lista.length ? <p className="p-6 text-center text-sm text-slate-500">Nenhum usuário {filtro !== "todos" ? filtro.slice(0, -1) : ""}.</p> : (
              <ul className="divide-y divide-slate-100">
                {lista.map((u) => {
                  const souEu = u.user_id === eu.user_id;
                  const vend = vendedores.find((v) => v.user_id === u.user_id);
                  return (
                    <li key={u.user_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${u.ativo ? "" : "opacity-70"}`}>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700" aria-hidden>{iniciais(u.nome)}</span>
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="font-semibold">{u.nome}{souEu && <span className="ml-1 text-xs font-normal text-slate-500">(você)</span>}
                          {u.cargo && <span className="ml-2 text-sm font-normal text-slate-600">· {u.cargo}</span>}</div>
                        <div className="truncate text-sm text-slate-600">{u.email}{u.telefone ? ` · ${fone(u.telefone)}` : ""}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <ChipPapel p={u.papel} />{(u.papeis_extras ?? []).map((p) => <ChipPapel key={p} p={p} extra />)}
                          <span className="text-xs text-slate-500">· {u.unidade_id ? nomeUnidade(u.unidade_id) : "todas as unidades"}{vend ? ` · vendedor: ${vend.nome}` : ""}</span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-600">
                        {!u.ativo ? <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">inativo</span>
                          : u.trocar_senha ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">senha provisória</span> : null}
                        {u.ativo && (duas.fatoresDe(u.user_id) > 0
                          ? <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-800"><ShieldCheck size={12} aria-hidden /> duas etapas</span>
                          : duas.exige(u) ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">falta o código</span> : null)}
                        <div className="mt-0.5">último acesso: {quando(u.ultimo_acesso)}</div>
                      </div>
                      <div className="flex gap-1">
                        {u.telefone && <a className="inline-flex items-center rounded-lg px-2 py-2 text-emerald-700 hover:bg-slate-100" href={whatsappLink(u.telefone, `Olá, ${u.nome.split(" ")[0]}!`)} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${u.nome}`} title="WhatsApp"><MessageCircle size={16} aria-hidden /></a>}
                        <Button variant="ghost" className="!px-2" title="Definir senha provisória" aria-label={`Nova senha para ${u.nome}`} onClick={() => setSenhaDe(u)}><KeyRound size={16} aria-hidden /></Button>
                        {duas.fatoresDe(u.user_id) > 0 && (
                          <Button variant="ghost" className="!px-2" title="Zerar o login em duas etapas (perdeu ou trocou de celular)" aria-label={`Zerar o login em duas etapas de ${u.nome}`} onClick={() => zerarCodigo(u)}><Smartphone size={16} aria-hidden /></Button>
                        )}
                        <Button variant="secondary" onClick={() => setEditando(u)} aria-label={`Editar ${u.nome}`}><Pencil size={15} aria-hidden /> Editar</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      {editando && <UsuarioModal usuario={editando === "novo" ? null : editando} vendedores={vendedores} admins={admins} onClose={() => setEditando(null)} />}
      {senhaDe && <SenhaModal usuario={senhaDe} onClose={() => setSenhaDe(null)} />}
    </div>
  );
}

/** Cadastro do usuário (novo ou edição). */
function UsuarioModal({ usuario, vendedores, admins, onClose }: { usuario: Usuario | null; vendedores: Vendedor[]; admins: number; onClose: () => void }) {
  const eu = usePerfil();
  const { unidades } = useUnidade();
  const invalidate = useInvalidate();
  const souEu = usuario?.user_id === eu.user_id;
  const vendAtual = usuario ? vendedores.find((v) => v.user_id === usuario.user_id)?.id ?? "" : "";
  const [f, setF] = useState({
    nome: usuario?.nome ?? "", email: usuario?.email ?? "", cargo: usuario?.cargo ?? "", telefone: usuario?.telefone ?? "",
    papel: (usuario?.papel ?? "vendas") as Papel, extras: (usuario?.papeis_extras ?? []) as Papel[], unidade_id: usuario?.unidade_id ?? "",
    ativo: usuario?.ativo ?? true, vendedor_id: vendAtual, senha: usuario ? "" : gerarSenha(),
  });
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState<{ nome: string; email: string; senha: string; telefone: string } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const comExtras = f.papel !== "admin" && f.papel !== "contador";
  const extras = comExtras ? f.extras.filter((p) => p !== f.papel) : [];
  const vendeTambem = f.papel === "admin" || f.papel === "vendas" || extras.includes("vendas");
  const telasVistas = (Object.keys(TELAS_ROTULO) as Tela[]).filter((t) => podeVer(f.papel, t, extras));
  const ultimoAdmin = !!usuario && usuario.papel === "admin" && usuario.ativo && admins <= 1;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (f.papel !== "admin" && ultimoAdmin) return notifyError(new Error("é preciso manter ao menos um administrador ativo"));
    setSalvando(true);
    try {
      const dados = { nome: f.nome, cargo: f.cargo, telefone: f.telefone, papel: f.papel, papeis_extras: extras, unidade_id: f.unidade_id || null };
      let userId = usuario?.user_id;
      if (!usuario) {
        const r = await callFunction<{ user_id: string }>("usuarios-admin", { acao: "criar", ...dados, email: f.email, senha: f.senha });
        userId = r.user_id;
      } else {
        await callFunction("usuarios-admin", {
          acao: "atualizar", user_id: usuario.user_id, ...dados,
          ...(f.email.trim().toLowerCase() !== usuario.email ? { email: f.email } : {}),
          ...(!souEu && f.ativo !== usuario.ativo ? { ativo: f.ativo } : {}),
        });
      }
      // vínculo com o cadastro de vendedor (comissões e "meus pedidos")
      if (userId && f.vendedor_id !== vendAtual) {
        if (vendAtual) await supabase.from("vendedores").update({ user_id: null }).eq("id", vendAtual);
        if (f.vendedor_id) {
          const { error } = await supabase.from("vendedores").update({ user_id: userId }).eq("id", f.vendedor_id);
          if (error) throw error;
        }
        invalidate("vendedores");
      }
      invalidate("usuarios_erp");
      if (!usuario) setCriado({ nome: f.nome, email: f.email.trim().toLowerCase(), senha: f.senha, telefone: f.telefone });
      else { notify("Usuário atualizado"); onClose(); }
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  if (criado) return <Modal open onClose={onClose} title="Usuário criado"><Credenciais {...criado} onClose={onClose} /></Modal>;

  return (
    <Modal open onClose={onClose} title={usuario ? `Editar ${usuario.nome}` : "Novo usuário"} wide>
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome *"><input className="input" value={f.nome} onChange={(e) => set({ nome: e.target.value })} required maxLength={120} autoComplete="off" /></Field>
          <Field label="E-mail de acesso *"><input className="input" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} required autoComplete="off" /></Field>
          <Field label="Função (cargo)"><input className="input" value={f.cargo} placeholder="ex.: vendedora, técnico de campo" maxLength={80} onChange={(e) => set({ cargo: e.target.value })} /></Field>
          <Field label="Telefone / WhatsApp"><input className="input" inputMode="tel" value={f.telefone} placeholder="(48) 99999-9999" onChange={(e) => set({ telefone: e.target.value })} /></Field>
        </div>
        {usuario && f.email.trim().toLowerCase() !== usuario.email && <p className="text-xs text-amber-800">O acesso passa a ser pelo e-mail novo (a senha continua a mesma).</p>}

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-600">Papel principal</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PAPEIS.map((p) => (
              <label key={p.value} className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm ${f.papel === p.value ? "border-modulo bg-slate-50 ring-1 ring-modulo" : "border-slate-200"} ${souEu && p.value !== "admin" ? "cursor-not-allowed opacity-60" : ""}`}>
                <input type="radio" name="papel" className="mt-0.5" checked={f.papel === p.value} disabled={souEu && p.value !== "admin"} onChange={() => set({ papel: p.value })} />
                <span><b>{p.label}</b><span className="block text-xs text-slate-600">{p.descricao}</span></span>
              </label>
            ))}
          </div>
          {souEu && <p className="mt-1 text-xs text-slate-500">Você não pode tirar o seu próprio acesso de administrador.</p>}
          {ultimoAdmin && !souEu && <p className="mt-1 text-xs text-slate-500">É o único administrador ativo: o papel não pode mudar.</p>}
        </fieldset>

        {comExtras && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-slate-600">Papéis adicionais (a pessoa também faz)</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {PAPEIS_ADICIONAIS.filter((p) => p !== f.papel).map((p) => (
                <label key={p} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={extras.includes(p)}
                  onChange={(e) => set({ extras: e.target.checked ? [...extras, p] : extras.filter((x) => x !== p) })} /> {rotuloPapel(p)}</label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Unidade em que trabalha">
            <select className="input" value={f.unidade_id} onChange={(e) => set({ unidade_id: e.target.value })}>
              <option value="">Todas as unidades</option>
              {unidades.filter((u) => u.ativo).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
          {vendeTambem && (
            <Field label="Cadastro de vendedor (comissões)">
              <select className="input" value={f.vendedor_id} onChange={(e) => set({ vendedor_id: e.target.value })}>
                <option value="">Não vinculado</option>
                {vendedores.filter((v) => v.ativo && (!v.user_id || v.user_id === usuario?.user_id)).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </Field>
          )}
        </div>

        {!usuario && (
          <Field label="Senha provisória (a pessoa troca no primeiro acesso)">
            <span className="flex gap-2">
              <input className="input font-mono" value={f.senha} onChange={(e) => set({ senha: e.target.value })} minLength={8} required autoComplete="off" />
              <Button type="button" variant="secondary" onClick={() => set({ senha: gerarSenha() })} title="Gerar outra"><RefreshCw size={15} aria-hidden /> Gerar</Button>
            </span>
          </Field>
        )}

        {usuario && !souEu && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={f.ativo} disabled={ultimoAdmin} onChange={(e) => set({ ativo: e.target.checked })} />
            Acesso liberado <span className="text-xs text-slate-500">(desmarque para bloquear a entrada; o histórico fica guardado)</span>
          </label>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><ShieldCheck size={15} aria-hidden /> Com esse acesso, vê:</div>
          <p className="text-slate-700">{f.papel === "admin" ? "Tudo, inclusive usuários e configurações." : telasVistas.map((t) => TELAS_ROTULO[t]).join(" · ")}</p>
        </div>

        {usuario && <Historico tabela="usuarios_erp" id={usuario.user_id} />}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>{salvando ? "Salvando…" : usuario ? "Salvar" : "Criar usuário"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Senha provisória nova (a pessoa troca no próximo acesso). */
function SenhaModal({ usuario, onClose }: { usuario: Usuario; onClose: () => void }) {
  const eu = usePerfil();
  const invalidate = useInvalidate();
  const [senha, setSenha] = useState(gerarSenha);
  const [pronto, setPronto] = useState(false);
  const souEu = usuario.user_id === eu.user_id;
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      await callFunction("usuarios-admin", { acao: "redefinir_senha", user_id: usuario.user_id, senha });
      invalidate("usuarios_erp");
      if (souEu) { notify("Senha alterada"); onClose(); } else setPronto(true);
    } catch (err) { notifyError(err); }
  }
  return (
    <Modal open onClose={onClose} title={`Nova senha · ${usuario.nome}`}>
      {pronto ? <Credenciais nome={usuario.nome} email={usuario.email} senha={senha} telefone={usuario.telefone ?? ""} onClose={onClose} /> : (
        <form onSubmit={salvar} className="space-y-3">
          <Field label={souEu ? "Sua nova senha (mín. 8)" : "Senha provisória (mín. 8)"}>
            <span className="flex gap-2">
              <input className="input font-mono" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} required autoFocus autoComplete="off" />
              <Button type="button" variant="secondary" onClick={() => setSenha(gerarSenha())}><RefreshCw size={15} aria-hidden /> Gerar</Button>
            </span>
          </Field>
          {!souEu && <p className="text-xs text-slate-600">{usuario.nome.split(" ")[0]} entra com ela e cria uma senha pessoal no mesmo momento.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button>Salvar senha</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Dados de acesso para passar à pessoa (copiar ou WhatsApp). */
function Credenciais({ nome, email, senha, telefone, onClose }: { nome: string; email: string; senha: string; telefone: string; onClose: () => void }) {
  const texto = `Olá, ${nome.split(" ")[0]}! Seu acesso ao ERP da MF Máquinas:\n${SITE}\nE-mail: ${email}\nSenha provisória: ${senha}\nNo primeiro acesso você cria a sua senha pessoal.`;
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { notifyError(new Error("não deu para copiar: selecione o texto e copie")); }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">Passe estes dados para {nome.split(" ")[0]}. A senha é provisória: no primeiro acesso a pessoa cria a própria.</p>
      <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{texto}</pre>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={copiar}>{copiado ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copiado ? "Copiado" : "Copiar"}</Button>
        {telefone.replace(/\D/g, "").length >= 10 && (
          <a className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-solido-verde px-3.5 py-2 text-sm font-semibold text-white sm:min-h-0" href={whatsappLink(telefone, texto)} target="_blank" rel="noreferrer">
            <MessageCircle size={15} aria-hidden /> Enviar pelo WhatsApp
          </a>
        )}
        <Button type="button" onClick={onClose}>Concluir</Button>
      </div>
    </div>
  );
}

const TEMPOS = [15, 30, 60, 120, 240, 480, 0];
const ACOES_SEGURANCA: Record<string, string> = {
  ver_sigilo: "viu os dados sigilosos de", alterar_sigilo: "alterou dados sigilosos de", zerar_duas_etapas: "zerou o login em duas etapas de",
};
const CAMPOS_SIGILO: Record<string, string> = {
  cpf: "CPF", rg: "RG", pis: "PIS", ctps: "CTPS", cnh: "CNH", banco: "banco", agencia: "agência", conta: "conta", pix: "Pix",
};

/** Quem precisa do login em duas etapas, a saída por falta de uso e o registro de quem viu dado sigiloso. */
function SegurancaAcesso({ usuarios }: { usuarios: Usuario[] }) {
  const eu = usePerfil();
  const { data: cfg } = useConfig();
  const duas = useDuasEtapas();
  const invalidate = useInvalidate();
  const [papeis, setPapeis] = useState<Papel[] | null>(null);
  const [minutos, setMinutos] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const escolhidos = papeis ?? duas.papeis;
  const tempo = minutos ?? Number(cfg?.sessao_minutos ?? 30);
  const banco = cfg ? "mfa_papeis" in cfg : true;
  const { data: eventos = [] } = useQuery({
    queryKey: ["eventos_seguranca"],
    queryFn: async () => {
      const { data, error } = await supabase.from("eventos_seguranca").select("id, created_at, usuario_nome, acao, entidade, registro_nome, campos")
        .order("created_at", { ascending: false }).limit(100);
      return error ? [] : (data ?? []) as Evento[];
    },
  });
  const obrigados = usuarios.filter((u) => escolhidos.includes(u.papel) || (u.papeis_extras ?? []).some((p) => escolhidos.includes(p)));

  async function salvar() {
    const euObrigado = escolhidos.includes(eu.papel) || (eu.papeis_extras ?? []).some((p) => escolhidos.includes(p));
    const euSemCodigo = !duas.fatoresDe(eu.user_id);
    if (euObrigado && euSemCodigo && !confirm("O seu papel passa a exigir o código. Ao salvar, o ERP pede para você cadastrar o código no celular agora. Continuar?")) return;
    setSalvando(true);
    const { error } = await supabase.from("configuracoes").update({ mfa_papeis: escolhidos, sessao_minutos: tempo }).eq("id", 1);
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Segurança do acesso salva");
    invalidate("configuracoes");
    setPapeis(null);
    setMinutos(null);
    if (euObrigado && euSemCodigo) window.location.reload();
  }

  return (
    <div className="space-y-4">
      {!banco && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Falta atualizar o banco de dados para salvar estas opções.</p>}
      <Card className="space-y-4 p-4">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold text-fg"><Smartphone size={16} aria-hidden /> Login em duas etapas obrigatório para</h3>
          <p className="mb-2 text-sm text-slate-600">Além da senha, a pessoa digita o código de 6 números do app autenticador do celular. Quem não tem o código cadastrado é levado a cadastrar no próximo acesso.</p>
          <div className="flex flex-wrap gap-3 text-sm">
            {PAPEIS.map((p) => (
              <label key={p.value} className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={escolhidos.includes(p.value)}
                  onChange={(e) => setPapeis(e.target.checked ? [...escolhidos, p.value] : escolhidos.filter((x) => x !== p.value))} /> {p.label}
              </label>
            ))}
          </div>
          {obrigados.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {obrigados.map((u) => (
                <li key={u.user_id} className={`rounded-full px-2 py-0.5 font-semibold ${duas.fatoresDe(u.user_id) ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                  {u.nome.split(" ")[0]}: {duas.fatoresDe(u.user_id) ? "ativado" : "cadastra no próximo acesso"}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">Qualquer pessoa pode ativar por conta própria no menu do usuário (Senha e login em duas etapas). Perdeu o celular: use o botão do celular na lista de usuários para zerar.</p>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-fg">Sair do ERP depois de</span>
            <select className="input w-auto" value={tempo} onChange={(e) => setMinutos(Number(e.target.value))}>
              {TEMPOS.map((m) => <option key={m} value={m}>{m === 0 ? "nunca" : m < 60 ? `${m} minutos` : `${m / 60} hora${m > 60 ? "s" : ""}`}</option>)}
            </select>
            <span className="text-slate-600">sem uso</span>
          </label>
          <p className="mt-1 text-xs text-slate-500">Avisa 1 minuto antes. Vale para o computador e o celular (um ERP esquecido aberto fecha sozinho).</p>
        </div>
        <div className="flex justify-end">
          <Button disabled={salvando || !banco || (papeis === null && minutos === null)} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-1 font-semibold text-fg">Registro de segurança</h3>
        <p className="mb-3 text-sm text-slate-600">Quem viu ou alterou os dados sigilosos dos funcionários (CPF, documentos, conta e Pix) e quem zerou o login em duas etapas. Ninguém altera nem apaga este registro.</p>
        {!eventos.length ? <p className="text-sm text-slate-500">Nada registrado ainda.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex flex-wrap gap-x-2 py-2">
                <span className="num whitespace-nowrap text-slate-500">{new Date(ev.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="min-w-0"><b>{ev.usuario_nome ?? "—"}</b> {ACOES_SEGURANCA[ev.acao] ?? ev.acao} <b>{ev.registro_nome ?? "—"}</b>
                  {ev.campos?.length ? <span className="text-slate-500"> ({ev.campos.map((c) => CAMPOS_SIGILO[c] ?? c).join(", ")})</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Tabela: telas que cada papel vê e o que pode alterar. */
function MatrizPermissoes() {
  const telas = Object.keys(TELAS_ROTULO) as Tela[];
  const acoes = Object.keys(ACOES_ROTULO) as (keyof typeof ACOES_ROTULO)[];
  const vis = useMemo(() => Object.fromEntries(PAPEIS.map((p) => [p.value, new Set<string>(telasDoPapel(p.value))])), []);
  const faz = useMemo(() => Object.fromEntries(PAPEIS.map((p) => [p.value, new Set<string>(acoesDoPapel(p.value))])), []);
  const Marca = ({ ok }: { ok: boolean }) => ok
    ? <Check size={16} className="mx-auto text-emerald-700" aria-label="sim" />
    : <Minus size={14} className="mx-auto text-slate-300" aria-label="não" />;
  const Tabela = ({ titulo, linhas, rotulo, tem }: { titulo: string; linhas: string[]; rotulo: (k: string) => string; tem: (p: Papel, k: string) => boolean }) => (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="px-4 pt-3 text-left font-semibold">{titulo}</caption>
        <thead><tr className="border-b border-slate-200">
          <th className="th" />{PAPEIS.map((p) => <th key={p.value} scope="col" className="th text-center">{p.label}</th>)}
        </tr></thead>
        <tbody>
          {linhas.map((k) => (
            <tr key={k} className="border-b border-slate-100 last:border-0">
              <th scope="row" className="td text-left font-normal">{rotulo(k)}</th>
              {PAPEIS.map((p) => <td key={p.value} className="td text-center"><Marca ok={tem(p.value, k)} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Cada pessoa tem um <b>papel principal</b> e pode ter <b>papéis adicionais</b> (vendas, financeiro, técnico): as permissões se somam.
        O banco de dados aplica as mesmas regras, então ninguém faz pelo sistema o que o papel não permite.
      </p>
      <Tabela titulo="Telas que vê" linhas={telas} rotulo={(k) => TELAS_ROTULO[k as Tela]} tem={(p, k) => vis[p].has(k)} />
      <Tabela titulo="O que pode criar ou alterar" linhas={acoes} rotulo={(k) => ACOES_ROTULO[k as keyof typeof ACOES_ROTULO]} tem={(p, k) => faz[p].has(k)} />
      <p className="text-xs text-slate-500">Usuários, unidades, configurações e exclusões ficam só com o administrador. O contador só consulta (e fecha o mês).</p>
    </div>
  );
}
