// Configurações → Caixa de e-mail: liga a caixa da empresa (IMAP para ler, SMTP para responder).
import { useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Inbox, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Field, Modal } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { callFunction } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { PAPEL_ROTULO } from "@/lib/avisos";
import { useUnidade } from "@/lib/unidade";
import { PROVEDORES, provedorPorDominio, type Provedor } from "../../supabase/functions/_shared/email-diagnostico";

type Conta = {
  id?: string; nome: string; email: string; imap_host: string; imap_porta: number; smtp_host: string | null; smtp_porta: number;
  usuario: string; senha?: string; unidade_id: string | null; papeis: string[]; ativo: boolean; sincronizado_em?: string | null; erro?: string | null;
};

export function EmailConfig() {
  const { data: contas = [] } = useRows<Conta>("email_contas", { order: "nome", ascending: true,
    select: "id, nome, email, imap_host, imap_porta, smtp_host, smtp_porta, usuario, unidade_id, papeis, ativo, sincronizado_em, erro" });
  const [editando, setEditando] = useState<Conta | null>(null);
  const invalidar = useInvalidate();

  async function remover(c: Conta) {
    if (!confirm(`Desligar a caixa ${c.email} do ERP? Os e-mails já baixados somem do ERP (continuam no servidor).`)) return;
    try { await callFunction("email-caixa", { acao: "remover_conta", conta_id: c.id }); invalidar("email_contas", "emails"); notify("Caixa removida"); }
    catch (e) { notifyError(e); }
  }

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Inbox size={18} className="text-brand" /> Caixa de e-mail</h2>
      <p className="mb-3 text-sm text-slate-600">
        Ligue o e-mail da empresa (ex.: comercial@) para ler e responder dentro do ERP. E-mails de clientes e fornecedores são reconhecidos
        sozinhos, e o XML de NF-e que chega em anexo dá entrada com um clique. Busca e-mails novos a cada 5 minutos.
      </p>
      {contas.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {contas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-fg">{c.nome} <span className="font-normal text-slate-500">· {c.email}</span></div>
                <div className="text-xs text-slate-500">
                  Quem vê: {["admin", ...c.papeis].map((p) => PAPEL_ROTULO[p]).join(", ")}
                  {c.sincronizado_em ? ` · atualizado ${new Date(c.sincronizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                </div>
                {c.erro && <div className="text-xs text-red-600">{c.erro}</div>}
              </div>
              {c.ativo ? <Badge value={c.erro ? "erro" : "ativo"} /> : <Badge value="inativo" />}
              <Button type="button" variant="secondary" onClick={() => setEditando({ ...c, senha: "" })}><Pencil size={15} /> Editar</Button>
              <Button type="button" variant="ghost" className="!text-red-600" onClick={() => remover(c)} aria-label="Remover"><Trash2 size={15} /></Button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="secondary" onClick={() => setEditando({ nome: "Comercial", email: "", imap_host: "", imap_porta: 993, smtp_host: "", smtp_porta: 465, usuario: "", senha: "", unidade_id: null, papeis: ["vendas", "financeiro"], ativo: true })}>
        <Plus size={16} /> Ligar uma caixa de e-mail
      </Button>
      {editando && <ContaModal conta={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

function ContaModal({ conta, onClose }: { conta: Conta; onClose: () => void }) {
  const [c, setC] = useState<Conta>(conta);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [provedor, setProvedor] = useState<Provedor | null>(() => provedorPorDominio(conta.email.split("@")[1] ?? "") ?? PROVEDORES.find((p) => p.imap === conta.imap_host) ?? null);
  const { unidades } = useUnidade();
  const invalidar = useInvalidate();
  // servidores que o próprio ERP preencheu: trocam quando o e-mail muda; o que a pessoa digitou fica
  const auto = useRef({ imap: "", smtp: "" });
  const set = (k: keyof Conta) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value });

  function aplicar(p: Provedor | null) {
    setProvedor(p);
    if (!p) return;
    setC((x) => {
      const trocaImap = !x.imap_host || x.imap_host === auto.current.imap;
      const trocaSmtp = !x.smtp_host || x.smtp_host === auto.current.smtp;
      if (trocaImap) auto.current.imap = p.imap;
      if (trocaSmtp) auto.current.smtp = p.smtp;
      return {
        ...x,
        ...(trocaImap ? { imap_host: p.imap, imap_porta: p.imap_porta } : {}),
        ...(trocaSmtp ? { smtp_host: p.smtp, smtp_porta: p.smtp_porta === 587 ? 465 : p.smtp_porta } : {}),
      };
    });
  }

  function aoDigitarEmail(email: string) {
    setC((x) => ({ ...x, email, usuario: x.usuario && x.usuario !== x.email ? x.usuario : email }));
    const p = provedorPorDominio(email.split("@")[1] ?? "");
    if (p) aplicar(p);
  }

  /** Ao sair do campo: descobre o provedor pelo domínio (registro MX), ex.: e-mail da empresa no Google ou na Hostinger. */
  async function descobrirServidor() {
    const dominio = c.email.split("@")[1] ?? "";
    if (!dominio.includes(".") || provedorPorDominio(dominio)) return;
    try {
      const r = await callFunction<{ provedor: Provedor | null }>("email-caixa", { acao: "sugerir_servidor", email: c.email });
      aplicar(r.provedor ?? PROVEDORES.find((p) => p.id === "hostinger")!);
    } catch { /* sem sugestão: a pessoa preenche */ }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      await callFunction("email-caixa", { acao: "salvar_conta", conta: c });
      notify("Caixa ligada! Os e-mails aparecem em alguns instantes.");
      invalidar("email_contas");
      callFunction("email-caixa", { acao: "sincronizar" }).then(() => invalidar("emails", "email_contas")).catch(() => null);
      onClose();
    } catch (err) {
      setErro((err as Error).message);
    } finally { setOcupado(false); }
  }

  return (
    <Modal open onClose={onClose} title={c.id ? `Caixa: ${c.email}` : "Ligar caixa de e-mail"}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label="Nome (aparece no ERP)" className="sm:col-span-2"><input className="input" value={c.nome} onChange={set("nome")} required /></Field>
        <Field label="E-mail" className="sm:col-span-2"><input className="input" type="email" value={c.email} onChange={(e) => aoDigitarEmail(e.target.value)} onBlur={descobrirServidor} required /></Field>
        <Field label="Usuário (normalmente o próprio e-mail)" className="sm:col-span-2"><input className="input" value={c.usuario} onChange={set("usuario")} required /></Field>
        <Field label={c.id ? "Senha (vazio = manter a atual)" : "Senha do e-mail"} className="sm:col-span-2">
          <input className="input" type="password" value={c.senha ?? ""} onChange={set("senha")} required={!c.id} autoComplete="new-password" />
        </Field>
        <Field label="Servidor de entrada (IMAP)" className="sm:col-span-3"><input className="input" value={c.imap_host} onChange={set("imap_host")} required /></Field>
        <Field label="Porta"><input className="input" type="number" value={c.imap_porta} onChange={set("imap_porta")} /></Field>
        <Field label="Servidor de envio (SMTP)" className="sm:col-span-3"><input className="input" value={c.smtp_host ?? ""} onChange={set("smtp_host")} /></Field>
        <Field label="Porta"><input className="input" type="number" value={c.smtp_porta} onChange={set("smtp_porta")} /></Field>
        {unidades.length > 1 && (
          <Field label="Unidade" className="sm:col-span-2">
            <select className="input" value={c.unidade_id ?? ""} onChange={set("unidade_id")}>
              <option value="">Todas</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Quem vê esta caixa (além do admin)</span>
          <div className="flex flex-wrap gap-3 pt-1">
            {["vendas", "financeiro", "tecnico"].map((p) => (
              <label key={p} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={c.papeis.includes(p)}
                  onChange={(e) => setC({ ...c, papeis: e.target.checked ? [...c.papeis, p] : c.papeis.filter((x) => x !== p) })} /> {PAPEL_ROTULO[p]}
              </label>
            ))}
          </div>
        </div>
        {provedor ? (
          <div className="flex gap-2 rounded-lg bg-sky-50 p-2.5 text-sm text-sky-900 sm:col-span-4">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span><b>{provedor.nome}.</b> {provedor.dica}</span>
          </div>
        ) : (
          <p className="text-xs text-slate-500 sm:col-span-4">
            Hostinger: imap.hostinger.com (993) e smtp.hostinger.com (465). Gmail: imap.gmail.com e smtp.gmail.com com uma <b>senha de app</b>.
          </p>
        )}
        <p className="text-xs text-slate-500 sm:col-span-4">
          Ao salvar, o ERP entra na caixa e testa o envio (sem mandar nada). A porta de envio é a 465 (SSL): a 587 é bloqueada no servidor do ERP.
          A senha fica guardada só no servidor do ERP; o navegador nunca vê.
        </p>
        {erro && (
          <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800 sm:col-span-4">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{erro}</span>
          </div>
        )}
        <div className="flex justify-end gap-2 sm:col-span-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={ocupado}>{ocupado ? "Testando acesso…" : "Salvar e testar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
