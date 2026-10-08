import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";
import { Badge, Button, Field, Modal, PageHeader, Table } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { PAPEIS, type Papel } from "@/lib/permissoes";

type Usuario = { user_id: string; nome: string; papel: Papel; ativo: boolean; email: string; ultimo_acesso: string | null };

export default function Usuarios() {
  const eu = usePerfil();
  const invalidate = useInvalidate();
  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ["usuarios_erp"],
    queryFn: async () => (await callFunction<{ usuarios: Usuario[] }>("usuarios-admin", { acao: "listar" })).usuarios,
  });
  const [novo, setNovo] = useState(false);
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);

  async function atualizar(u: Usuario, patch: Partial<Usuario>) {
    try {
      await callFunction("usuarios-admin", { acao: "atualizar", user_id: u.user_id, ...patch });
      notify("Usuário atualizado");
      invalidate("usuarios_erp");
    } catch (e) {
      notifyError(e);
    }
  }

  return (
    <div>
      <PageHeader title="Usuários" actions={<Button onClick={() => setNovo(true)}><Plus size={16} /> Novo usuário</Button>} />

      <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {PAPEIS.map((p) => (
          <div key={p.value} className="rounded-md border bg-surface p-3">
            <div className="font-medium">{p.label}</div>
            <div className="text-xs text-slate-500">{p.descricao}</div>
          </div>
        ))}
      </div>

      <Table
        empty={!isLoading && usuarios.length === 0}
        head={<><th className="th">Nome</th><th className="th">E-mail</th><th className="th">Papel</th><th className="th">Situação</th><th className="th">Último acesso</th><th className="th" /></>}
      >
        {usuarios.map((u) => {
          const souEu = u.user_id === eu.user_id;
          return (
            <tr key={u.user_id}>
              <td className="td font-medium">{u.nome}{souEu && <span className="ml-1 text-xs text-slate-400">(você)</span>}</td>
              <td className="td">{u.email}</td>
              <td className="td">
                <select className="input w-auto py-1" value={u.papel} disabled={souEu} onChange={(e) => atualizar(u, { papel: e.target.value as Papel })}>
                  {PAPEIS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </td>
              <td className="td"><Badge value={u.ativo ? "ativo" : "inativo"} /></td>
              <td className="td">{u.ultimo_acesso ? dataBR(u.ultimo_acesso) : "nunca"}</td>
              <td className="td whitespace-nowrap text-right">
                <Button variant="ghost" title="Definir nova senha" onClick={() => setSenhaDe(u)}><KeyRound size={15} /></Button>
                {!souEu && (
                  <Button variant="ghost" className={u.ativo ? "text-red-600" : ""} onClick={() => atualizar(u, { ativo: !u.ativo })}>
                    {u.ativo ? "Desativar" : "Reativar"}
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </Table>

      {novo && <NovoUsuario onClose={() => setNovo(false)} />}
      {senhaDe && <NovaSenha usuario={senhaDe} onClose={() => setSenhaDe(null)} />}
    </div>
  );
}

function NovoUsuario({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ nome: "", email: "", papel: "vendas" as Papel, senha: "" });
  const [salvando, setSalvando] = useState(false);
  const invalidate = useInvalidate();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await callFunction("usuarios-admin", { acao: "criar", ...form });
      notify(`Usuário criado. Passe o e-mail e a senha provisória para ${form.nome.split(" ")[0]}.`);
      invalidate("usuarios_erp");
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Novo usuário">
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2"><input className="input" value={form.nome} onChange={set("nome")} required /></Field>
        <Field label="E-mail" className="sm:col-span-2"><input className="input" type="email" value={form.email} onChange={set("email")} required /></Field>
        <Field label="Papel">
          <select className="input" value={form.papel} onChange={set("papel")}>
            {PAPEIS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Senha provisória (mín. 8)"><input className="input" value={form.senha} onChange={set("senha")} minLength={8} required /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">{PAPEIS.find((p) => p.value === form.papel)?.descricao}. A pessoa pode trocar a senha em “Alterar senha”.</p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>{salvando ? "Criando…" : "Criar usuário"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function NovaSenha({ usuario, onClose }: { usuario: Usuario; onClose: () => void }) {
  const [senha, setSenha] = useState("");
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      await callFunction("usuarios-admin", { acao: "redefinir_senha", user_id: usuario.user_id, senha });
      notify("Senha redefinida");
      onClose();
    } catch (err) {
      notifyError(err);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Nova senha — ${usuario.nome}`}>
      <form onSubmit={salvar} className="space-y-3">
        <Field label="Nova senha (mín. 8)"><input className="input" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} required autoFocus /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
