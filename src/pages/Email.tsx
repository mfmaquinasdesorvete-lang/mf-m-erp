// Caixa de entrada de e-mail (IMAP) dentro do ERP: ler, responder, ligar ao cliente/fornecedor
// e importar o XML de NF-e que o fornecedor manda em anexo e o extrato do banco (OFX), que entra sozinho
// quando dá para confiar no remetente (ver supabase/functions/_shared/extrato-email.ts).
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Inbox, Landmark, Mail, Paperclip, PenSquare, RefreshCw, Reply, ShoppingCart, Truck, User } from "lucide-react";
import { Button, Field, Modal, PageHeader } from "@/components/ui";
import { BarraFiltros, ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { useRows } from "@/lib/data";
import { callFunction, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { dataBR, pl } from "@/lib/format";
import { ImportarModal, type ContaBancaria } from "./Conciliacao";
import type { ExtratoEmail } from "../../supabase/functions/_shared/extrato-ofx";

type Anexo = { indice: number; nome: string; tipo: string; tamanho: number; nfe: boolean; extrato?: boolean };
type EmailMsg = {
  id: string; conta_id: string; uid: number; de_nome: string | null; de_email: string | null; para: string | null; cc: string | null;
  assunto: string | null; data: string; previa: string | null; texto: string | null; html: string | null; anexos: Anexo[];
  extratos?: ExtratoEmail[];
  lido: boolean; arquivado: boolean; cliente_id: string | null; fornecedor_id: string | null; respondido_em: string | null;
  cliente?: { nome: string } | null; fornecedor?: { nome: string } | null;
};
type ContaEmail = { id: string; nome: string; email: string; sincronizado_em: string | null; erro: string | null };

const quando = (d: string) => {
  const dt = new Date(d), hoje = new Date();
  return dt.toDateString() === hoje.toDateString()
    ? dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};
const kb = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

export default function Email() {
  const qc = useQueryClient();
  const { data: contas = [] } = useRows<ContaEmail>("email_contas", { order: "nome", ascending: true, select: "id, nome, email, sincronizado_em, erro" });
  const [conta, setConta] = useState<string>("");
  const [filtro, setFiltro] = useState<"todos" | "nao_lidos" | "clientes" | "nfe" | "extratos">("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<EmailMsg | null>(null);
  const [novo, setNovo] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  useEffect(() => { if (!conta && contas[0]) setConta(contas[0].id); }, [contas, conta]);

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["emails", conta],
    enabled: !!conta,
    queryFn: async () => {
      const { data, error } = await supabase.from("emails").select("*, cliente:clientes(nome), fornecedor:fornecedores(nome)")
        .eq("conta_id", conta).eq("arquivado", false).order("data", { ascending: false }).limit(200);
      if (error) throw error;
      return data as EmailMsg[];
    },
  });

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return emails.filter((e) =>
      (filtro !== "nao_lidos" || !e.lido) && (filtro !== "clientes" || e.cliente_id) && (filtro !== "nfe" || e.anexos.some((a) => a.nfe)) && (filtro !== "extratos" || e.anexos.some((a) => a.extrato)) &&
      (!b || [e.assunto, e.de_nome, e.de_email, e.previa].some((v) => v?.toLowerCase().includes(b))));
  }, [emails, filtro, busca]);
  const naoLidos = emails.filter((e) => !e.lido).length;
  const contagem = {
    todos: emails.length, nao_lidos: naoLidos, clientes: emails.filter((e) => e.cliente_id).length,
    nfe: emails.filter((e) => e.anexos.some((a) => a.nfe)).length, extratos: emails.filter((e) => e.anexos.some((a) => a.extrato)).length,
  };
  // o e-mail aberto acompanha a lista (ex.: depois de importar o extrato anexo)
  const abertoAtual = aberto ? emails.find((x) => x.id === aberto.id) ?? aberto : null;
  const contaAtual = contas.find((c) => c.id === conta);

  async function atualizar() {
    setAtualizando(true);
    try {
      const r = await callFunction("email-caixa", { acao: "sincronizar", conta_id: conta });
      const n = Object.values(r.resultado ?? {}).find((v) => typeof v === "number") as number | undefined;
      const erro = Object.values(r.resultado ?? {}).find((v) => typeof v === "string") as string | undefined;
      if (erro) notify(erro, "erro"); else notify(n ? `${n} ${pl(n, "e-mail novo", "e-mails novos")}` : "Nenhum e-mail novo");
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: ["email_contas"] });
    } catch (e) { notifyError(e); } finally { setAtualizando(false); }
  }

  async function abrir(e: EmailMsg) {
    setAberto(e);
    if (!e.lido) {
      await supabase.from("emails").update({ lido: true }).eq("id", e.id);
      qc.setQueryData<EmailMsg[]>(["emails", conta], (l) => l?.map((x) => (x.id === e.id ? { ...x, lido: true } : x)));
    }
  }

  if (!contas.length) {
    return (
      <div>
        <PageHeader title="Caixa de e-mail" />
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <Inbox size={40} className="mx-auto text-slate-300" />
          <p className="mt-3 text-slate-600">Nenhuma caixa de e-mail ligada ainda.</p>
          <p className="text-sm text-slate-500">O administrador liga em <b>Configurações → Caixa de e-mail</b> (servidor, usuário e senha do e-mail da empresa).</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Caixa de e-mail" subtitle={contaAtual ? `${contaAtual.email}${contaAtual.sincronizado_em ? ` · atualizado ${quando(contaAtual.sincronizado_em)}` : ""}` : undefined}
        actions={<div className="flex gap-2">
          <Button variant="secondary" onClick={() => setNovo(true)}><PenSquare size={16} /> Escrever</Button>
          <Button onClick={atualizar} disabled={atualizando}><RefreshCw size={16} className={atualizando ? "animate-spin" : ""} /> {atualizando ? "Buscando…" : "Atualizar"}</Button>
        </div>} />
      {contaAtual?.erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Última tentativa falhou: {contaAtual.erro}</p>}

      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar assunto, remetente ou texto…"
        direita={contas.length > 1 && (
          <select className="input w-auto" aria-label="Caixa de e-mail" value={conta} onChange={(e) => { setConta(e.target.value); setAberto(null); }}>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>)}
        nFiltros={filtro !== "todos" ? 1 : 0} onLimpar={() => { setBusca(""); setFiltro("todos"); }} />
      <ChipsSituacao valor={filtro} onChange={setFiltro} rotulo="Mostrar" opcoes={[
        { value: "todos", label: "Todos", n: contagem.todos }, { value: "nao_lidos", label: "Não lidos", n: contagem.nao_lidos },
        { value: "clientes", label: "De clientes", n: contagem.clientes }, { value: "nfe", label: "Com NF-e", n: contagem.nfe }, { value: "extratos", label: "Extratos", n: contagem.extratos },
      ]} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[380px_1fr]">
        <ul className={`divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-surface ${aberto ? "hidden lg:block" : ""}`}>
          {isLoading && <li className="p-6 text-center text-sm text-slate-500">Carregando…</li>}
          {!isLoading && !lista.length && <li className="p-8 text-center text-sm text-slate-500">Nenhum e-mail aqui.</li>}
          {lista.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => abrir(e)}
                className={`flex w-full gap-3 p-3 text-left transition hover:bg-slate-50 ${aberto?.id === e.id ? "bg-brand-light" : ""}`}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.lido ? "bg-transparent" : "bg-brand"}`} aria-label={e.lido ? undefined : "não lido"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${e.lido ? "font-medium text-slate-700" : "font-bold text-fg"}`}>{e.de_nome || e.de_email}</span>
                    <span className="shrink-0 text-xs text-slate-500">{quando(e.data)}</span>
                  </span>
                  <span className={`block truncate text-sm ${e.lido ? "text-slate-600" : "font-semibold text-fg"}`}>{e.assunto}</span>
                  <span className="block truncate text-xs text-slate-500">{e.previa}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {e.cliente && <Etiqueta icon={User} texto={e.cliente.nome} />}
                    {e.fornecedor && <Etiqueta icon={Truck} texto={e.fornecedor.nome} />}
                    {e.anexos.some((a) => a.nfe) && <Etiqueta icon={FileText} texto="NF-e (XML)" destaque />}
                    {e.anexos.some((a) => a.extrato) && <Etiqueta icon={Landmark} texto={rotuloExtrato(e)} destaque />}
                    {!e.anexos.some((a) => a.nfe || a.extrato) && e.anexos.length > 0 && <Etiqueta icon={Paperclip} texto={`${e.anexos.length} ${pl(e.anexos.length, "anexo", "anexos")}`} />}
                    {e.respondido_em && <Etiqueta icon={Reply} texto="respondido" />}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {abertoAtual ? <Leitura e={abertoAtual} onVoltar={() => setAberto(null)} /> : (
          <div className="hidden place-items-center rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-500 lg:grid">
            <div><Mail size={36} className="mx-auto text-slate-300" /><p className="mt-2">Escolha um e-mail para ler</p></div>
          </div>
        )}
      </div>
      {novo && conta && <Escrever contaId={conta} onClose={() => setNovo(false)} />}
    </div>
  );
}

const rotuloExtrato = (e: EmailMsg) => {
  const st = e.extratos ?? [];
  return st.length && st.every((x) => x.status === "importado") ? "Extrato importado" : st.some((x) => x.status === "aguardando") ? "Extrato: conferir" : "Extrato (OFX)";
};

function Etiqueta({ icon: Icon, texto, destaque }: { icon: typeof User; texto: string; destaque?: boolean }) {
  return (
    <span className={`inline-flex max-w-[180px] items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-2xs font-semibold ${destaque ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-600"}`}>
      <Icon size={11} className="shrink-0" /> <span className="truncate">{texto}</span>
    </span>
  );
}

function Leitura({ e, onVoltar }: { e: EmailMsg; onVoltar: () => void }) {
  const { pode } = usePerfil();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [resposta, setResposta] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [html, setHtml] = useState(true);
  const [extrato, setExtrato] = useState<{ arquivo: File; anexo: Anexo; contaId: string } | null>(null);
  const situacao = (a: Anexo) => e.extratos?.find((x) => x.indice === a.indice);

  async function baixar(a: Anexo) {
    setOcupado(`a${a.indice}`);
    try {
      const r = await callFunction("email-caixa", { acao: "anexo", email_id: e.id, indice: a.indice });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.tipo }));
      const link = document.createElement("a");
      link.href = url; link.download = r.nome; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { notifyError(err); } finally { setOcupado(null); }
  }
  async function abrirExtrato(a: Anexo) {
    setOcupado(`x${a.indice}`);
    try {
      const r = await callFunction("email-caixa", { acao: "anexo", email_id: e.id, indice: a.indice });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      setExtrato({ arquivo: new File([bytes], r.nome, { type: r.tipo }), anexo: a, contaId: situacao(a)?.conta_id ?? "" });
    } catch (err) { notifyError(err); } finally { setOcupado(null); }
  }
  async function extratoImportado(a: Anexo, r: { novas: number; repetidas: number; conciliadas: number; conta: string }) {
    // o servidor marca o anexo como importado (a coluna extratos não é gravada direto pela tela)
    const { error } = await supabase.rpc("email_extrato_importado", {
      p_email: e.id, p_indice: a.indice, p_nome: a.nome, p_conta: r.conta || null, p_novas: r.novas, p_repetidas: r.repetidas, p_conciliadas: r.conciliadas,
    });
    if (error) notifyError(error);
    qc.invalidateQueries({ queryKey: ["emails"] });
  }
  async function importar(a: Anexo) {
    setOcupado(`n${a.indice}`);
    try {
      const r = await callFunction("email-caixa", { acao: "importar_nfe", email_id: e.id, indice: a.indice });
      notify(r.ja_existia ? "Esta nota já estava no ERP" : `NF ${r.numero ?? ""} importada${r.processamento === "concluido" ? ": estoque e contas lançados" : ""}`);
      qc.invalidateQueries({ queryKey: ["nfe_recebidas"] });
    } catch (err) { notifyError(err); } finally { setOcupado(null); }
  }
  async function responder() {
    if (!resposta?.trim()) return;
    setOcupado("r");
    try {
      await callFunction("email-caixa", { acao: "responder", email_id: e.id, texto: resposta });
      notify("Resposta enviada");
      setResposta(null);
      qc.invalidateQueries({ queryKey: ["emails"] });
    } catch (err) { notifyError(err); } finally { setOcupado(null); }
  }

  return (
    <article className="cartao min-w-0">
      <div className="border-b border-slate-100 p-4">
        <button type="button" onClick={onVoltar} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand lg:hidden"><ArrowLeft size={16} /> Voltar</button>
        <h2 className="text-lg font-bold leading-snug text-fg">{e.assunto}</h2>
        <div className="mt-1 text-sm text-slate-600"><b className="text-fg">{e.de_nome || e.de_email}</b> {e.de_nome && <span>&lt;{e.de_email}&gt;</span>}</div>
        <div className="text-xs text-slate-500">{new Date(e.data).toLocaleString("pt-BR")}{e.para ? ` · para ${e.para}` : ""}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setResposta(resposta ?? "")}><Reply size={15} /> Responder</Button>
          {e.cliente_id && pode("editar_pedidos") && (
            <Button variant="secondary" onClick={() => navigate("/pedidos", { state: { novo: true, cliente_id: e.cliente_id } })}><ShoppingCart size={15} /> Novo orçamento para {e.cliente?.nome?.split(" ")[0]}</Button>
          )}
        </div>
      </div>

      {e.anexos.length > 0 && (
        <ul className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          {e.anexos.map((a) => (
            <li key={a.indice} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <Paperclip size={15} className="text-slate-400" />
              <span className="max-w-[200px] truncate font-medium">{a.nome}</span>
              <span className="text-xs text-slate-400">{kb(a.tamanho)}</span>
              <button type="button" aria-label={`Baixar ${a.nome}`} disabled={!!ocupado} onClick={() => baixar(a)} className="rounded-lg p-1 text-brand hover:bg-brand-light"><Download size={15} /></button>
              {a.nfe && pode("nfe_recebidas") && (
                <Button variant="secondary" disabled={!!ocupado} onClick={() => importar(a)}>{ocupado === `n${a.indice}` ? "Importando…" : "Dar entrada na NF-e"}</Button>
              )}
              {(a.extrato || /\.csv$/i.test(a.nome)) && pode("editar_financeiro") && situacao(a)?.status !== "importado" && (
                <Button variant="secondary" disabled={!!ocupado} onClick={() => abrirExtrato(a)}>{ocupado === `x${a.indice}` ? "Abrindo…" : "Importar extrato"}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(e.extratos ?? []).length > 0 && (
        <ul className="space-y-1.5 border-b border-slate-100 p-4 text-sm">
          {e.extratos!.map((x) => (
            <li key={x.indice} role="status" className={`rounded-lg px-3 py-2 ${x.status === "importado" ? "bg-emerald-50 text-emerald-900" : x.status === "aguardando" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>
              <b>{x.nome}</b>{x.conta ? ` · ${x.conta}` : ""}{x.periodo ? ` · ${dataBR(x.periodo[0])} a ${dataBR(x.periodo[1])}` : ""}
              <span className="block">
                {x.status === "importado"
                  ? `Importado: ${x.novas ?? 0} ${pl(x.novas ?? 0, "lançamento", "lançamentos")} ${pl(x.novas ?? 0, "novo", "novos")}${x.repetidas ? `, ${x.repetidas} já estavam no ERP` : ""}, ${x.conciliadas ?? 0} ${pl(x.conciliadas ?? 0, "conciliado", "conciliados")} ${pl(x.conciliadas ?? 0, "sozinho", "sozinhos")}.`
                  : x.status === "aguardando" ? `Não entrou sozinho: ${x.motivo}. Confira e use “Importar extrato”.` : `Não deu para ler: ${x.motivo}.`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {extrato && <ImportarExtrato arquivo={extrato.arquivo} contaId={extrato.contaId}
        onImportado={(r) => extratoImportado(extrato.anexo, r)} onClose={() => setExtrato(null)} />}

      {resposta !== null && (
        <div className="border-b border-slate-100 p-4">
          <Field label={`Resposta para ${e.de_email}`}>
            <textarea className="input" rows={5} autoFocus value={resposta} onChange={(ev) => setResposta(ev.target.value)} />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResposta(null)}>Descartar</Button>
            <Button onClick={responder} disabled={ocupado === "r" || !resposta.trim()}>{ocupado === "r" ? "Enviando…" : "Enviar resposta"}</Button>
          </div>
        </div>
      )}

      <div className="p-4">
        {e.html && (
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => setHtml(!html)} className="text-xs font-semibold text-brand">{html ? "Ver só o texto" : "Ver formatado"}</button>
          </div>
        )}
        {e.html && html ? (
          // e-mail formatado numa área isolada: sem scripts, sem acesso ao ERP
          <iframe title="Conteúdo do e-mail" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:15px;color:#1e293b;margin:0;word-wrap:break-word}img{max-width:100%;height:auto}</style>${e.html}`}
            className="h-[60vh] w-full rounded-xl border border-slate-100 bg-white" />
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-700">{e.texto || "(sem texto)"}</pre>
        )}
      </div>
    </article>
  );
}

/** Abre a importação de extrato da tela Bancos e conciliação com o anexo já escolhido. */
function ImportarExtrato({ arquivo, contaId, onImportado, onClose }: {
  arquivo: File; contaId: string; onImportado: (r: { novas: number; repetidas: number; conciliadas: number; conta: string }) => void; onClose: () => void;
}) {
  const { data: bancos = [], isLoading } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  if (isLoading) return null;
  if (!bancos.some((b) => b.ativo)) {
    return (
      <Modal open onClose={onClose} title="Importar extrato bancário">
        <p className="text-sm text-slate-600">Cadastre primeiro a conta em <b>Financeiro → Bancos e conciliação → Nova conta</b>.</p>
      </Modal>
    );
  }
  return <ImportarModal bancos={bancos.filter((b) => b.ativo)} contaInicial={contaId} arquivoInicial={arquivo} onImportado={onImportado} onClose={onClose} />;
}

function Escrever({ contaId, onClose }: { contaId: string; onClose: () => void }) {
  const [m, setM] = useState({ para: "", assunto: "", texto: "" });
  const [ocupado, setOcupado] = useState(false);
  async function enviar() {
    setOcupado(true);
    try {
      await callFunction("email-caixa", { acao: "enviar", conta_id: contaId, ...m });
      notify("E-mail enviado");
      onClose();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  return (
    <Modal open onClose={onClose} title="Novo e-mail">
      <div className="space-y-3">
        <Field label="Para"><input className="input" type="email" value={m.para} onChange={(e) => setM({ ...m, para: e.target.value })} autoFocus /></Field>
        <Field label="Assunto"><input className="input" value={m.assunto} onChange={(e) => setM({ ...m, assunto: e.target.value })} /></Field>
        <Field label="Mensagem"><textarea className="input" rows={8} value={m.texto} onChange={(e) => setM({ ...m, texto: e.target.value })} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={enviar} disabled={ocupado || !m.para}>{ocupado ? "Enviando…" : "Enviar"}</Button>
        </div>
      </div>
    </Modal>
  );
}
