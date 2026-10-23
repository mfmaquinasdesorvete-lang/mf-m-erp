// Usuários e permissões: quem acessa o ERP, com qual papel (principal + adicionais), unidade, função e contato;
// senha provisória (troca obrigatória no primeiro acesso), vínculo com o cadastro de vendedor e o que cada papel pode.
import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Check, Copy, KeyRound, Megaphone, MessageCircle, Minus, Pencil, Plus, RefreshCw, ScanFace, ShieldCheck } from "lucide-react";
import { FotoUsuario, reduzirFoto } from "@/components/FotoUsuario";
import { useNotificacoes } from "@/components/Notificacoes";
import { PainelAcessos } from "@/components/usuarios/Acessos";
import { quandoAcesso, ultimoPorPessoa, type Acesso } from "@/lib/acessos";
import { Button, Card, Field, Modal, PageHeader, Tabs } from "@/components/ui";
import { Historico } from "@/components/Historico";
import { BarraFiltros, ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { useInvalidate, useRows } from "@/lib/data";
import { dataBR, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { useConfig } from "@/lib/useConfig";
import {
  ACOES_ROTULO, PAPEIS, PAPEIS_ADICIONAIS, PAPEIS_INTERNOS, TELAS_ROTULO, acoesDoPapel, podeVer, rotuloPapel, telasDoPapel, type MenuOculto, type Papel, type Tela,
} from "@/lib/permissoes";
import { grupos, itensForaDoMenu, type Item } from "@/lib/menu";
import { useAbaUrl } from "@/lib/abaUrl";
import { gerarSenha } from "@/lib/senhas";
import { usaRosto } from "@/lib/rosto";
import { erroPortal, textoConvite } from "@/lib/portal";

type Usuario = {
  user_id: string; nome: string; papel: Papel; papeis_extras: Papel[] | null; cargo: string | null; telefone: string | null;
  unidade_id: string | null; ativo: boolean; trocar_senha: boolean | null; created_at?: string; email: string; ultimo_acesso: string | null;
  /** conta master (a dona): abre a Retaguarda e é a única que cria ou muda administradores */
  master?: boolean;
};
type Vendedor = { id: string; nome: string; user_id: string | null; ativo: boolean };
/** Ficha de funcionário (dados completos: documentos, endereço, banco e Pix, admissão) ligada ao login */
type Funcionario = { id: string; nome: string; cargo: string | null; user_id: string | null; ativo: boolean; whatsapp: string | null; pix: string | null };

const COR_PAPEL: Record<Papel, string> = {
  admin: "bg-solido-cinza text-white", vendas: "bg-emerald-100 text-emerald-800", financeiro: "bg-amber-100 text-amber-800",
  tecnico: "bg-sky-100 text-sky-800", contador: "bg-violet-100 text-violet-800", expedicao: "bg-orange-100 text-orange-800",
  marketplace: "bg-rose-100 text-rose-800", compras: "bg-indigo-100 text-indigo-800", giga: "bg-amber-100 text-amber-800",
  representante: "bg-teal-100 text-teal-800",
};
const SITE = typeof window !== "undefined" ? window.location.origin : "https://erp.myfrost.ai";


function quando(v: string | null) {
  if (!v) return "nunca entrou";
  const dias = Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
  return dias <= 0 ? "hoje" : dias === 1 ? "ontem" : dias < 30 ? `há ${dias} dias` : dataBR(v);
}
const fone = (t: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : t ?? "";
};

/** Fotos dos usuários (só o administrador lê as de todos). */
function useFotos() {
  return useQuery({
    queryKey: ["usuarios_erp", "fotos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios_erp").select("user_id, foto").not("foto", "is", null);
      if (error) throw error;
      return new Map((data ?? []).map((x: { user_id: string; foto: string }) => [x.user_id, x.foto]));
    },
  });
}

async function gravarFoto(u: Usuario, foto: string | null) {
  const { error } = await supabase.from("usuarios_erp").update({ foto }).eq("user_id", u.user_id);
  if (error) throw error;
}

/** Bolinha do usuário: toque para pôr ou trocar a foto (no celular abre a câmera ou a galeria). */
function AvatarEditavel({ u, foto }: { u: Usuario; foto?: string | null }) {
  const invalidate = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  async function trocar(arquivo?: File) {
    if (!arquivo) return;
    setOcupado(true);
    try {
      await gravarFoto(u, await reduzirFoto(arquivo));
      notify(`Foto de ${u.nome} salva`);
      invalidate("usuarios_erp");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  return (
    <label className={`group relative shrink-0 cursor-pointer ${ocupado ? "opacity-60" : ""}`} title={foto ? "Trocar a foto" : "Pôr foto"}>
      <FotoUsuario nome={u.nome} foto={foto} tamanho={44} className="bg-slate-100 text-slate-700" />
      {/* câmera cinza e discreta (não é sinal de "online" nem de acesso); no computador só aparece ao passar o mouse */}
      <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-slate-600 text-white ring-2 ring-surface transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"><Camera size={11} aria-hidden /></span>
      <input type="file" accept="image/*" className="sr-only" disabled={ocupado} aria-label={`${foto ? "Trocar a foto" : "Pôr foto"} de ${u.nome}`}
        onChange={(e) => { trocar(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );
}

function ChipPapel({ p, extra }: { p: Papel; extra?: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_PAPEL[p]} ${extra ? "opacity-90" : ""}`}>{extra ? "+ " : ""}{rotuloPapel(p)}</span>;
}

export default function Usuarios() {
  const eu = usePerfil();
  const { novoAviso } = useNotificacoes();
  const { nome: nomeUnidade } = useUnidade();
  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ["usuarios_erp", "admin"],
    queryFn: async () => (await callFunction<{ usuarios: Usuario[] }>("usuarios-admin", { acao: "listar" })).usuarios,
  });
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  const { data: funcionarios = [] } = useRows<Funcionario>("funcionarios", { select: "id, nome, cargo, user_id, ativo, whatsapp, pix", order: "nome", ascending: true });
  const { data: fotos } = useFotos();
  const desdeAcessos = useMemo(() => new Date(Date.now() - 31 * 864e5).toISOString(), []);
  const { data: acessos = [] } = useRows<Acesso>("acessos_usuarios", {
    order: "entrou_em", ascending: false, key: ["30dias"], filtro: (q) => q.gte("entrou_em", desdeAcessos).limit(2000),
  });
  const ultimo = useMemo(() => ultimoPorPessoa(acessos), [acessos]);
  const [aba, setAba] = useAbaUrl<"usuarios" | "permissoes">("usuarios", ["usuarios", "permissoes"] as const);
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

  return (
    <div>
      <PageHeader title="Usuários e permissões" actions={<Button onClick={() => setEditando("novo")}><Plus size={16} aria-hidden /> Novo usuário</Button>} />
      <Tabs value={aba} onChange={setAba} options={[{ value: "usuarios", label: `Usuários (${ativos.length})` }, { value: "permissoes", label: "Perfis: o que cada um vê" }]} />

      {aba === "permissoes" ? <MatrizPermissoes /> : (
        <>
          <PainelAcessos usuarios={usuarios} fotos={fotos} ultimo={ultimo} />
          {(provisoria > 0 || nuncaEntrou > 0 || admins === 1) && (
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              {provisoria > 0 && <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-amber-900">{provisoria} com senha provisória (trocam no próximo acesso)</span>}
              {nuncaEntrou > 0 && <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700">{nuncaEntrou} ainda não entrou</span>}
              {admins === 1 && <span className="rounded-lg bg-sky-50 px-3 py-1.5 text-sky-900">Só 1 administrador ativo: vale ter um segundo, para não ficar sem acesso</span>}
            </div>
          )}
          <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar nome, e-mail, função…" onLimpar={() => { setBusca(""); setFiltro("ativos"); }} nFiltros={filtro !== "ativos" ? 1 : 0} />
          <ChipsSituacao valor={filtro} onChange={setFiltro} opcoes={[
            { value: "ativos", label: "Ativos", n: ativos.length }, { value: "inativos", label: "Inativos", n: usuarios.length - ativos.length }, { value: "todos", label: "Todos", n: usuarios.length },
          ]} />

          <Card>
            {isLoading ? <p className="p-6 text-center text-sm text-slate-500">Carregando…</p> : !lista.length ? <p className="p-6 text-center text-sm text-slate-500">Nenhum usuário {filtro !== "todos" ? filtro.slice(0, -1) : ""}.</p> : (
              <ul className="divide-y divide-slate-100">
                {lista.map((u) => {
                  const souEu = u.user_id === eu.user_id;
                  const vend = vendedores.find((v) => v.user_id === u.user_id);
                  return (
                    <li key={u.user_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${u.ativo ? "" : "opacity-70"}`}>
                      <AvatarEditavel u={u} foto={fotos?.get(u.user_id)} />
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="font-semibold">{u.nome}{souEu && <span className="ml-1 text-xs font-normal text-slate-500">(você)</span>}
                          {u.cargo && <span className="ml-2 text-sm font-normal text-slate-600">· {u.cargo}</span>}</div>
                        <div className="truncate text-sm text-slate-600">{u.email}{u.telefone ? ` · ${fone(u.telefone)}` : ""}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <ChipPapel p={u.papel} />{u.master && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white" title="Conta master: Retaguarda e administradores">master</span>}{(u.papeis_extras ?? []).map((p) => <ChipPapel key={p} p={p} extra />)}
                          <span className="text-xs text-slate-500">· {u.unidade_id ? nomeUnidade(u.unidade_id) : "todas as unidades"}{vend ? ` · vendedor: ${vend.nome}` : ""}</span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-600">
                        {!u.ativo ? <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">inativo</span>
                          : u.trocar_senha ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">senha provisória</span> : null}
                        <div className="mt-0.5">último acesso: {ultimo.get(u.user_id) ? quandoAcesso(ultimo.get(u.user_id)!) : quando(u.ultimo_acesso)}</div>
                      </div>
                      <div className="flex gap-1">
                        {u.telefone && <a className="inline-flex items-center rounded-lg px-2 py-2 text-emerald-700 hover:bg-slate-100" href={whatsappLink(u.telefone, `Olá, ${u.nome.split(" ")[0]}!`)} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${u.nome}`} title="WhatsApp"><MessageCircle size={16} aria-hidden /></a>}
                        {u.ativo && !souEu && <Button variant="ghost" className="!px-2" title="Mandar aviso" aria-label={`Mandar aviso para ${u.nome}`} onClick={() => novoAviso([u.user_id])}><Megaphone size={16} aria-hidden /></Button>}
                        <Button variant="ghost" className="!px-2" title="Definir senha provisória" aria-label={`Nova senha para ${u.nome}`} onClick={() => setSenhaDe(u)}><KeyRound size={16} aria-hidden /></Button>
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

      {editando && <UsuarioModal usuario={editando === "novo" ? null : editando} vendedores={vendedores} funcionarios={funcionarios} admins={admins} onClose={() => setEditando(null)} />}
      {senhaDe && <SenhaModal usuario={senhaDe} onClose={() => setSenhaDe(null)} />}
    </div>
  );
}

/** Cadastro do usuário (novo ou edição). */
function UsuarioModal({ usuario, vendedores, funcionarios, admins, onClose }: { usuario: Usuario | null; vendedores: Vendedor[]; funcionarios: Funcionario[]; admins: number; onClose: () => void }) {
  const eu = usePerfil();
  const { unidades } = useUnidade();
  const invalidate = useInvalidate();
  const souEu = usuario?.user_id === eu.user_id;
  const { data: fotos } = useFotos();
  const foto = usuario ? fotos?.get(usuario.user_id) : undefined;
  const vendAtual = usuario ? vendedores.find((v) => v.user_id === usuario.user_id)?.id ?? "" : "";
  const funcAtual = usuario ? funcionarios.find((x) => x.user_id === usuario.user_id)?.id ?? "" : "";
  const [f, setF] = useState({
    nome: usuario?.nome ?? "", email: usuario?.email ?? "", cargo: usuario?.cargo ?? "", telefone: usuario?.telefone ?? "",
    papel: (usuario?.papel ?? "vendas") as Papel, extras: (usuario?.papeis_extras ?? []) as Papel[], unidade_id: usuario?.unidade_id ?? "",
    ativo: usuario?.ativo ?? true, vendedor_id: vendAtual, funcionario_id: funcAtual, senha: usuario ? "" : gerarSenha(),
  });
  const ficha = funcionarios.find((x) => x.id === f.funcionario_id);
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState<{ nome: string; email: string; senha: string; telefone: string; portal?: boolean } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  // representante externo: só o portal, sem papéis adicionais nem unidade, e sempre ligado a um cadastro de vendedor
  const representante = f.papel === "representante";
  const comExtras = f.papel !== "admin" && f.papel !== "contador" && f.papel !== "giga" && !representante;
  const extras = comExtras ? f.extras.filter((p) => p !== f.papel) : [];
  const vendeTambem = representante || f.papel === "admin" || f.papel === "vendas" || extras.includes("vendas");
  const telasVistas = (Object.keys(TELAS_ROTULO) as Tela[]).filter((t) => podeVer(f.papel, t, extras));
  const ultimoAdmin = !!usuario && usuario.papel === "admin" && usuario.ativo && admins <= 1;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (f.papel !== "admin" && ultimoAdmin) return notifyError(new Error("é preciso manter ao menos um administrador ativo"));
    if (representante && !f.vendedor_id) return notifyError(new Error("escolha o cadastro do representante (Comissões → Vendedores)"));
    setSalvando(true);
    try {
      if (representante) return await salvarRepresentante();
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
      // vínculo com a ficha de funcionário (CPF, endereço, banco e Pix ficam lá, não no login)
      if (userId && f.funcionario_id !== funcAtual) {
        if (funcAtual) await supabase.from("funcionarios").update({ user_id: null }).eq("id", funcAtual);
        if (f.funcionario_id) {
          const { error } = await supabase.from("funcionarios").update({ user_id: userId }).eq("id", f.funcionario_id);
          if (error) throw error;
        }
        invalidate("funcionarios");
      }
      invalidate("usuarios_erp");
      if (!usuario) setCriado({ nome: f.nome, email: f.email.trim().toLowerCase(), senha: f.senha, telefone: f.telefone });
      else { notify("Usuário atualizado"); onClose(); }
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  /**
   * Representante: a função usuarios-admin não conhece o papel novo, então o banco cuida dele.
   * Login novo: guarda o convite (vendedor + e-mail) e cria o login pela mesma função; o gatilho do banco
   * faz o login nascer representante e ligado ao vendedor. Login que já existe: portal_ligar_representante.
   */
  async function salvarRepresentante() {
    const base = { nome: f.nome, cargo: f.cargo, telefone: f.telefone, papeis_extras: [], unidade_id: null };
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      const { error } = await supabase.rpc(fn, args);
      if (error) throw new Error(erroPortal(error.message));
    };
    let userId = usuario?.user_id;
    if (!usuario) {
      await rpc("portal_convidar_representante", { p_vendedor: f.vendedor_id, p_email: f.email });
      // papel "vendas" só passa pela função; o convite troca para representante na mesma gravação
      const r = await callFunction<{ user_id: string }>("usuarios-admin", { acao: "criar", ...base, papel: "vendas", email: f.email, senha: f.senha })
        .catch((e) => { throw new Error(erroPortal((e as Error).message)); });
      userId = r.user_id;
    } else {
      await callFunction("usuarios-admin", {
        acao: "atualizar", user_id: usuario.user_id, ...base,
        ...(f.email.trim().toLowerCase() !== usuario.email ? { email: f.email } : {}),
        ...(f.ativo !== usuario.ativo ? { ativo: f.ativo } : {}),
      });
    }
    // garante o papel e o vínculo (sem efeito se o convite já fez)
    await rpc("portal_ligar_representante", { p_vendedor: f.vendedor_id, p_user: userId });
    invalidate("usuarios_erp", "vendedores");
    if (!usuario) setCriado({ nome: f.nome, email: f.email.trim().toLowerCase(), senha: f.senha, telefone: f.telefone, portal: true });
    else { notify("Representante atualizado"); onClose(); }
  }

  if (criado) return <Modal open onClose={onClose} title={criado.portal ? "Representante convidado" : "Usuário criado"}><Credenciais {...criado} onClose={onClose} /></Modal>;

  return (
    <Modal open onClose={onClose} title={usuario ? `Editar ${usuario.nome}` : "Novo usuário"} wide>
      <form onSubmit={salvar} className="space-y-4">
        {usuario && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <AvatarEditavel u={usuario} foto={foto} />
            <span className="text-slate-600">{foto ? "Toque na foto para trocar." : "Toque na bolinha para pôr a foto (no celular abre a câmera)."}</span>
            {foto && <Button type="button" variant="ghost" onClick={async () => {
              try { await gravarFoto(usuario, null); notify("Foto removida"); invalidate("usuarios_erp"); } catch (e) { notifyError(e); }
            }}>Tirar a foto</Button>}
          </div>
        )}
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

        {representante && (
          <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
            Representante externo: entra só no <b>Portal do representante</b> e vê apenas os próprios pedidos, clientes da carteira e comissões.
            Escolha abaixo o cadastro dele em Comissões → Vendedores.
          </p>
        )}

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
          {!representante && (
            <Field label="Unidade em que trabalha">
              <select className="input" value={f.unidade_id} onChange={(e) => set({ unidade_id: e.target.value })}>
                <option value="">Todas as unidades</option>
                {unidades.filter((u) => u.ativo).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Field>
          )}
          {!representante && (
            <Field label="Ficha de funcionário (documentos, endereço, banco e Pix)">
              <select className="input" value={f.funcionario_id} onChange={(e) => set({ funcionario_id: e.target.value })}>
                <option value="">Não vinculado</option>
                {funcionarios.filter((x) => x.ativo && (!x.user_id || x.user_id === usuario?.user_id)).map((x) => <option key={x.id} value={x.id}>{x.nome}{x.cargo ? ` · ${x.cargo}` : ""}</option>)}
              </select>
              {ficha && <span className="mt-1 block text-xs text-slate-500">{[ficha.whatsapp && `WhatsApp ${ficha.whatsapp}`, ficha.pix ? "Pix cadastrado" : "sem Pix na ficha"].filter(Boolean).join(" · ")} · edite em Funcionários</span>}
            </Field>
          )}
          {vendeTambem && (
            <Field label={representante ? "Cadastro do representante *" : "Cadastro de vendedor (comissões)"}>
              <select className="input" value={f.vendedor_id} onChange={(e) => set({ vendedor_id: e.target.value })} required={representante}>
                <option value="">{representante ? "Escolha…" : "Não vinculado"}</option>
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
          <p className="text-slate-700">{f.papel === "admin" ? "Tudo, inclusive usuários e configurações."
            : representante ? "Só o Portal do representante: os próprios pedidos e orçamentos, os clientes da carteira e as comissões. Nenhum dado da empresa."
            : telasVistas.map((t) => TELAS_ROTULO[t]).join(" · ")}</p>
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
      {pronto ? <Credenciais nome={usuario.nome} email={usuario.email} senha={senha} telefone={usuario.telefone ?? ""} portal={usuario.papel === "representante"} onClose={onClose} /> : (
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
          {!souEu && usaRosto(usuario.papel, usuario.papeis_extras) && <ApagarRosto usuario={usuario} />}
        </form>
      )}
    </Modal>
  );
}

/** Quem perdeu ou trocou o celular: o administrador apaga o rosto e a pessoa cadastra de novo no próximo acesso. */
function ApagarRosto({ usuario }: { usuario: Usuario }) {
  const [feito, setFeito] = useState<number | null>(null);
  const [apagando, setApagando] = useState(false);
  async function apagar() {
    if (!window.confirm(`Apagar o rosto de ${usuario.nome}? No próximo acesso a pessoa cadastra o rosto de novo.`)) return;
    setApagando(true);
    try { setFeito((await callFunction<{ apagados: number }>("usuarios-admin", { acao: "apagar_rosto", user_id: usuario.user_id })).apagados); }
    catch (err) { notifyError(err); }
    finally { setApagando(false); }
  }
  return (
    <div className="mt-2 rounded-lg border border-slate-200 p-3 text-sm">
      <p className="font-semibold text-fg">Perdeu ou trocou o celular?</p>
      <p className="text-xs text-slate-600">Apague o rosto cadastrado: no próximo acesso {usuario.nome.split(" ")[0]} cadastra o rosto no aparelho novo.</p>
      {feito !== null
        ? <p className="mt-2 text-xs font-semibold text-emerald-700">{feito ? `${feito === 1 ? "1 aparelho apagado" : `${feito} aparelhos apagados`}.` : "Não havia rosto cadastrado."}</p>
        : <Button type="button" variant="secondary" className="mt-2" disabled={apagando} onClick={apagar}><ScanFace size={15} aria-hidden /> {apagando ? "Apagando…" : "Apagar o rosto"}</Button>}
    </div>
  );
}

/** Dados de acesso para passar à pessoa (copiar ou WhatsApp). */
function Credenciais({ nome, email, senha, telefone, portal, onClose }: { nome: string; email: string; senha: string; telefone: string; portal?: boolean; onClose: () => void }) {
  const texto = portal ? textoConvite({ nome, email, senha, site: SITE })
    : `Olá, ${nome.split(" ")[0]}! Seu acesso ao ERP da MF Máquinas:\n${SITE}\nE-mail: ${email}\nSenha provisória: ${senha}\nNo primeiro acesso você cria a sua senha pessoal.`;
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
          <a className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-solido-verde px-4 py-2 text-sm font-semibold text-white sm:min-h-0" href={whatsappLink(telefone, texto)} target="_blank" rel="noreferrer">
            <MessageCircle size={15} aria-hidden /> Enviar pelo WhatsApp
          </a>
        )}
        <Button type="button" onClick={onClose}>Concluir</Button>
      </div>
    </div>
  );
}

/**
 * Perfis: o que aparece no menu de cada papel (o administrador marca e desmarca) e o que cada papel pode alterar.
 * Só dá para esconder o que o papel acessa; para liberar dados de outra área, dê um papel adicional à pessoa.
 */
function MatrizPermissoes() {
  const { papel: meuPapel } = usePerfil();
  const editavel = meuPapel === "admin";
  const { data: cfg } = useConfig();
  const invalidate = useInvalidate();
  const perfis = PAPEIS_INTERNOS.filter((p) => p.value !== "admin") as { value: Exclude<Papel, "admin">; label: string }[];
  const salvo = (cfg?.menu_oculto ?? {}) as MenuOculto;
  const [oculto, setOculto] = useState<MenuOculto | null>(null);
  const atual = oculto ?? salvo;
  const mudou = oculto !== null && JSON.stringify(oculto) !== JSON.stringify(salvo);
  const [salvando, setSalvando] = useState(false);
  const acoes = Object.keys(ACOES_ROTULO) as (keyof typeof ACOES_ROTULO)[];
  const faz = useMemo(() => Object.fromEntries(PAPEIS_INTERNOS.map((p) => [p.value, new Set<string>(acoesDoPapel(p.value))])), []);
  const areas = [...grupos.map((g) => ({ ...g, titulo: g.titulo || "Início" })), { id: "outras", titulo: "Outras telas (engrenagem e botões)", itens: itensForaDoMenu }];

  function alternar(p: Exclude<Papel, "admin">, to: string, ver: boolean) {
    const lista = new Set(atual[p] ?? []);
    if (ver) lista.delete(to); else lista.add(to);
    setOculto({ ...atual, [p]: [...lista].sort() });
  }
  function area(p: Exclude<Papel, "admin">, itens: Item[], ver: boolean) {
    const lista = new Set(atual[p] ?? []);
    for (const i of itens) if (telasDoPapel(p).includes(i.tela)) { if (ver) lista.delete(i.to); else lista.add(i.to); }
    setOculto({ ...atual, [p]: [...lista].sort() });
  }
  async function salvar() {
    setSalvando(true);
    const limpo = Object.fromEntries(Object.entries(atual).filter(([, l]) => l && l.length));
    const { error } = await supabase.from("configuracoes").update({ menu_oculto: limpo }).eq("id", 1);
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Perfis salvos: cada pessoa vê a mudança ao abrir ou atualizar o ERP");
    setOculto(null);
    invalidate("configuracoes");
  }

  const Marca = ({ ok }: { ok: boolean }) => ok
    ? <Check size={16} className="mx-auto text-emerald-700" aria-label="sim" />
    : <Minus size={14} className="mx-auto text-slate-300" aria-label="não" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Escolha o que aparece no menu de cada perfil. Desmarcar só esconde a tela; o que cada perfil pode ver e alterar nos dados continua valendo no banco de dados.
        <b> —</b> quer dizer que o perfil não acessa aqueles dados: para liberar, dê um <b>papel adicional</b> à pessoa (aba Usuários).
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="px-4 pt-3 text-left font-semibold">O que aparece no menu</caption>
          <thead className="sticky top-0 bg-surface"><tr className="border-b border-slate-200">
            <th className="th" />
            <th scope="col" className="th text-center">Administrador</th>
            {perfis.map((p) => <th key={p.value} scope="col" className="th text-center">{p.label}</th>)}
          </tr></thead>
          {areas.map((g) => (
            <tbody key={g.id}>
              <tr className="bg-slate-50/80">
                <th scope="rowgroup" className="td text-left text-xs font-bold uppercase tracking-wide text-slate-500">{g.titulo}</th>
                <td className="td" />
                {perfis.map((p) => {
                  const seus = g.itens.filter((i) => telasDoPapel(p.value).includes(i.tela));
                  const todosVisiveis = seus.length > 0 && seus.every((i) => !(atual[p.value] ?? []).includes(i.to));
                  return (
                    <td key={p.value} className="td text-center">
                      {editavel && seus.length > 1 && (
                        <button type="button" onClick={() => area(p.value, g.itens, !todosVisiveis)} className="link-acao text-2xs">
                          {todosVisiveis ? "esconder área" : "mostrar área"}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
              {g.itens.map((i) => (
                <tr key={i.to} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="td text-left font-normal"><span className="inline-flex items-center gap-2"><i.icon size={15} className="text-slate-400" aria-hidden />{i.label}</span></th>
                  <td className="td text-center"><Marca ok /></td>
                  {perfis.map((p) => {
                    const acessa = telasDoPapel(p.value).includes(i.tela);
                    const ve = acessa && !(atual[p.value] ?? []).includes(i.to);
                    return (
                      <td key={p.value} className="td text-center">
                        {!acessa ? <span className="text-slate-300" title="Este perfil não acessa estes dados">—</span>
                          : editavel ? <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={ve} aria-label={`${i.label} para ${p.label}`}
                              onChange={(e) => alternar(p.value, i.to, e.target.checked)} />
                          : <Marca ok={ve} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </Card>
      {editavel && (
        <div className="sticky bottom-24 z-10 flex flex-wrap items-center justify-end gap-2 md:bottom-4">
          {mudou && <span className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Alterações não salvas</span>}
          {mudou && <Button type="button" variant="secondary" onClick={() => setOculto(null)}>Desfazer</Button>}
          <Button type="button" disabled={!mudou || salvando} onClick={salvar}><Check size={16} /> {salvando ? "Salvando…" : "Salvar perfis"}</Button>
        </div>
      )}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="px-4 pt-3 text-left font-semibold">O que pode criar ou alterar</caption>
          <thead><tr className="border-b border-slate-200">
            <th className="th" />{PAPEIS_INTERNOS.map((p) => <th key={p.value} scope="col" className="th text-center">{p.label}</th>)}
          </tr></thead>
          <tbody>
            {acoes.map((k) => (
              <tr key={k} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="td text-left font-normal">{ACOES_ROTULO[k]}</th>
                {PAPEIS_INTERNOS.map((p) => <td key={p.value} className="td text-center"><Marca ok={faz[p.value].has(k)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">Usuários, unidades, configurações e exclusões ficam só com o administrador. O contador só consulta (e fecha o mês).
        O representante externo não entra no ERP: vê só o Portal do representante (os próprios pedidos, clientes e comissões).</p>
    </div>
  );
}
