// Painel do contador → Contabilidade: o escritório (telefone, site, endereço), quem procurar em cada setor — com
// WhatsApp, telefone e e-mail — e os e-mails que chegaram de lá nas caixas do ERP. Financeiro cadastra, muda e
// desativa contatos (nada é apagado). Os nomes ficam só no banco.
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, Mail, MessageCircle, Paperclip, Pencil, Phone, Plus, Search } from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import {
  ROTULO_SETOR, SETORES, buscarSetores, emailsDaLista, linkTelefone, linkWhatsApp, setorDoEmail,
  type ContatoContabil, type DadosEscritorio, type SetorContabil,
} from "@/lib/contabilidade";

type EmailContabil = { id: string; data: string; de_nome: string | null; de_email: string | null; assunto: string | null; previa: string | null; anexos: unknown[]; lido: boolean; setor: SetorContabil | "escritorio"; contato: string | null };
type Form = { id?: string; setor: SetorContabil; nome: string; email: string; whatsapp: string; observacao: string; ativo: boolean };

export function Contabilidade() {
  const { data: cfg } = useConfig();
  const { pode, papel } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { data: contatos = [] } = useRows<ContatoContabil>("contabilidade_contatos", { order: "ordem", ascending: true });
  const { data: emails = [] } = useQuery({
    queryKey: ["emails_da_contabilidade"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("emails_da_contabilidade", { p_limite: 30 });
      if (error) throw error;
      return (data ?? []) as EmailContabil[];
    },
  });
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const grupos = useMemo(() => buscarSetores(contatos, busca), [contatos, busca]);
  const dados = (cfg?.contador_dados ?? {}) as DadosEscritorio;
  const recebemPacote = emailsDaLista(cfg?.contador_email).map((e) => ({ email: e, setor: setorDoEmail(contatos, e)?.setor }));
  const desativados = contatos.filter((c) => !c.ativo);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="rounded-xl bg-sky-100 p-2.5 text-sky-800"><Building2 size={20} aria-hidden /></span>
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-lg font-bold text-fg">{dados.razao || cfg?.contador_nome || "Escritório de contabilidade"}</h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {dados.telefone && <a className="font-semibold text-brand hover:underline" href={linkTelefone(dados.telefone) ?? undefined}><Phone size={13} className="mr-1 inline" aria-hidden />{dados.telefone}</a>}
              {dados.site && <a className="font-semibold text-brand hover:underline" href={`https://${dados.site.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer">{dados.site}</a>}
              {dados.instagram && <span>Instagram: {dados.instagram}</span>}
            </div>
            {dados.endereco && <p className="mt-1 text-sm text-slate-600">{dados.endereco}</p>}
            {recebemPacote.length > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                O pacote do fechamento vai para {recebemPacote.map((r, i) => (
                  <span key={r.email}>{i > 0 ? (i === recebemPacote.length - 1 ? " e " : ", ") : ""}<b className="break-all">{r.email}</b>{r.setor ? ` (${ROTULO_SETOR[r.setor]})` : ""}</span>
                ))}{cfg?.contador_envio_auto ? `, todo dia ${cfg.contador_envio_dia}` : ""}. Muda em Configurações → Contador.
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-64">
          <span className="sr-only">Quem procurar</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input pl-9" placeholder="Quem procurar para… (ex.: férias, guia de ICMS, certificado)" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        {podeEditar && <Button variant="secondary" onClick={() => setForm({ setor: "fiscal", nome: "", email: "", whatsapp: "", observacao: "", ativo: true })}><Plus size={16} /> Contato</Button>}
      </div>

      {!contatos.length && <p className="rounded-xl border border-slate-200 bg-surface p-6 text-center text-sm text-slate-500">Nenhum contato do escritório cadastrado ainda.</p>}
      {contatos.length > 0 && !grupos.length && <p className="rounded-xl border border-slate-200 bg-surface p-6 text-center text-sm text-slate-500">Nada encontrado para “{busca}”. Na dúvida, fale com a recepção.</p>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {grupos.map((g) => (
          <Card key={g.id} className="overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <h3 className="font-bold text-fg">{g.rotulo}</h3>
              {g.paraQue && <p className="text-xs text-slate-600">{g.paraQue}</p>}
              {g.id === "certificado" && papel === "admin" && <Link to="/sobre?aba=monitor" className="text-xs font-semibold text-brand hover:underline">Ver a data de vencimento em Chaves e certificados</Link>}
            </div>
            <ul className="divide-y divide-slate-100">
              {g.contatos.map((c) => {
                const zap = linkWhatsApp(c.whatsapp), tel = linkTelefone(c.whatsapp);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1 basis-48">
                      <div className="font-semibold text-fg">{c.nome}</div>
                      {c.email && <a href={`mailto:${c.email}`} className="block break-all text-xs text-slate-600 hover:text-brand hover:underline">{c.email}</a>}
                      {c.observacao && <div className="text-xs text-amber-800">{c.observacao}</div>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {zap ? (
                        <a href={zap} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#059669] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#047857]" aria-label={`WhatsApp de ${c.nome}`}>
                          <MessageCircle size={14} aria-hidden /> {c.whatsapp}
                        </a>
                      ) : tel ? (
                        <a href={tel} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200" aria-label={`Ligar para ${c.nome}`}>
                          <Phone size={14} aria-hidden /> {c.whatsapp}
                        </a>
                      ) : null}
                      {podeEditar && (
                        <Button variant="ghost" aria-label={`Editar ${c.nome}`} onClick={() => setForm({ id: c.id, setor: c.setor, nome: c.nome, email: c.email ?? "", whatsapp: c.whatsapp ?? "", observacao: c.observacao ?? "", ativo: c.ativo })}>
                          <Pencil size={14} />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
      {podeEditar && desativados.length > 0 && !busca && (
        <p className="text-xs text-slate-500">Desativados ({desativados.length}): {desativados.map((c, i) => (
          <button key={c.id} type="button" className="font-semibold text-brand hover:underline" onClick={() => setForm({ id: c.id, setor: c.setor, nome: c.nome, email: c.email ?? "", whatsapp: c.whatsapp ?? "", observacao: c.observacao ?? "", ativo: c.ativo })}>
            {c.nome}{i < desativados.length - 1 ? ", " : ""}</button>))}
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Mail size={17} className="text-slate-500" aria-hidden />
          <h3 className="flex-1 font-bold text-fg">E-mails recebidos da contabilidade</h3>
          <Link to="/email" className="text-sm font-semibold text-brand hover:underline">Abrir a caixa de e-mail</Link>
        </div>
        {!emails.length ? (
          <p className="p-4 text-sm text-slate-600">
            Nenhum e-mail do escritório nas caixas do ERP ainda. Quando a caixa que recebe as coisas do contador estiver ligada
            (Configurações → Caixa de e-mail), o que chegar do escritório aparece aqui com o setor de quem mandou.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {emails.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="w-20 shrink-0 text-xs text-slate-500">{dataBR(e.data)}</span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-2xs font-semibold text-sky-800">{ROTULO_SETOR[e.setor] ?? e.setor}</span>
                <div className="min-w-0 flex-1 basis-56">
                  <div className={`truncate text-sm ${e.lido ? "text-slate-700" : "font-bold text-fg"}`}>{e.assunto || "(sem assunto)"}</div>
                  <div className="truncate text-xs text-slate-500">{e.contato ?? e.de_nome ?? e.de_email}</div>
                </div>
                {Array.isArray(e.anexos) && e.anexos.length > 0 && <span className="inline-flex items-center gap-1 text-xs text-slate-600"><Paperclip size={13} aria-hidden /> {e.anexos.length} {pl(e.anexos.length, "anexo", "anexos")}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {form && <ContatoModal inicial={form} onClose={() => setForm(null)} />}
    </div>
  );
}

function ContatoModal({ inicial, onClose }: { inicial: Form; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [f, setF] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const linha = { setor: f.setor, nome: f.nome.trim(), email: f.email.trim().toLowerCase() || null, whatsapp: f.whatsapp.trim() || null, observacao: f.observacao.trim() || null, ativo: f.ativo };
      const { error } = f.id ? await supabase.from("contabilidade_contatos").update(linha).eq("id", f.id) : await supabase.from("contabilidade_contatos").insert({ ...linha, ordem: 999 });
      if (error) throw error;
      invalidar("contabilidade_contatos", "emails_da_contabilidade");
      notify(f.id ? (f.ativo ? "Contato atualizado" : "Contato desativado") : "Contato cadastrado");
      onClose();
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }
  return (
    <Modal open onClose={onClose} title={f.id ? "Editar contato da contabilidade" : "Novo contato da contabilidade"}>
      <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2">
        <Field label="Setor">
          <select className="input" value={f.setor} onChange={(e) => set("setor", e.target.value as SetorContabil)}>
            {SETORES.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}
          </select>
        </Field>
        <Field label="Nome"><input className="input" value={f.nome} onChange={(e) => set("nome", e.target.value)} required minLength={2} maxLength={120} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} maxLength={200} /></Field>
        <Field label="WhatsApp ou telefone"><input className="input" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} maxLength={40} placeholder="(19) 9 0000-0000" /></Field>
        <Field label="Observação" className="sm:col-span-2"><input className="input" value={f.observacao} onChange={(e) => set("observacao", e.target.value)} maxLength={300} /></Field>
        {f.id && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-5 w-5" checked={f.ativo} onChange={(e) => set("ativo", e.target.checked)} /> Ainda trabalha no escritório (desmarque para desativar)
          </label>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
