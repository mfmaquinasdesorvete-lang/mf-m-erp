// Cadastro de clientes em ordem: etiquetas (CNPJ/IE baixada, endereço diferente da Receita, também fornecedor),
// painel "Arrumar cadastro" (WhatsApp pelo celular, conferência com a Receita, repetidos, fornecedores na lista)
// e unificação de cadastros repetidos.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, Copy, MapPin, MessageCircle, Merge, RefreshCw, ShieldAlert, Truck } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, docFormat } from "@/lib/format";
import { formatarTelefone } from "@/lib/mascaras";
import type { Cliente, Fornecedor } from "@/lib/types";
import { possiveisDuplicados, type DadosReceita } from "../../../supabase/functions/_shared/receita";

type ComEtiquetas = { tags?: string[] | null; receita_situacao?: string | null };
const tem = (c: ComEtiquetas, t: string) => (c.tags ?? []).includes(t);
const ROTULO_IE: Record<string, string> = { ativa: "IE ativa", baixada: "IE baixada", nao_encontrada: "IE não encontrada na Receita", sem_ie: "sem IE na Receita" };

/** Ícones ao lado do nome na lista (clientes e fornecedores). */
export function EtiquetasCliente({ c }: { c: ComEtiquetas }) {
  const itens: { Icon: typeof ShieldAlert; texto: string; cor: string; titulo: string }[] = [];
  if (tem(c, "cnpj_irregular")) itens.push({ Icon: ShieldAlert, texto: `CNPJ ${String(c.receita_situacao ?? "irregular").toLowerCase()}`, cor: "bg-red-100 text-red-800", titulo: "Situação do CNPJ na Receita: não está ativo" });
  if (tem(c, "ie_baixada")) itens.push({ Icon: AlertTriangle, texto: "IE baixada", cor: "bg-amber-100 text-amber-800", titulo: "A inscrição estadual está baixada/inativa: confira antes de emitir nota como contribuinte" });
  if (tem(c, "endereco_receita")) itens.push({ Icon: MapPin, texto: "2 endereços", cor: "bg-sky-100 text-sky-800", titulo: "O endereço do cadastro é diferente do endereço na Receita (os dois ficam na ficha)" });
  if (tem(c, "fornecedor")) itens.push({ Icon: Truck, texto: "fornecedor", cor: "bg-purple-100 text-purple-800", titulo: "Também é fornecedor da MF" });
  if (!itens.length) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {itens.map(({ Icon, texto, cor, titulo }) => (
        <span key={texto} title={titulo} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${cor}`}>
          <Icon size={11} aria-hidden /> {texto}
        </span>
      ))}
    </div>
  );
}

/** Painel para arrumar o cadastro inteiro. */
export function ArrumarCadastro({ clientes, onClose, onUnificar }: { clientes: Cliente[]; onClose: () => void; onUnificar: (ids: string[]) => void }) {
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verRepetidos, setVerRepetidos] = useState(false);
  const situacao = useQuery({ queryKey: ["clientes_receita"], queryFn: () => callFunction<any>("clientes-receita", { acao: "situacao" }), refetchInterval: 60_000 });
  const forn = useQuery({ queryKey: ["clientes_fornecedores"], queryFn: async () => {
    const { data, error } = await supabase.rpc("clientes_fornecedores");
    if (error) throw error;
    return (data ?? []) as { id: string; codigo: number | null; nome: string; cpf_cnpj: string; motivo: string; tem_movimento: boolean; ja_e_fornecedor: boolean }[];
  } });
  const repetidos = useMemo(() => possiveisDuplicados(clientes), [clientes]);
  const semWhats = clientes.filter((c) => !c.whatsapp).length;

  async function executar(chave: string, f: () => Promise<string>) {
    setOcupado(chave);
    try { notify(await f()); } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }

  const s = situacao.data;
  return (
    <Modal open wide onClose={onClose} title="Arrumar o cadastro de clientes">
      <div className="space-y-5 text-sm">
        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-fg"><MessageCircle size={16} className="text-emerald-600" /> WhatsApp</h3>
          <p className="mb-2 text-slate-600">{semWhats} cliente(s) sem WhatsApp. O ERP copia o celular do campo telefone (e corrige celular antigo sem o 9). Daqui pra frente isso já é automático ao salvar.</p>
          <Button type="button" disabled={!!ocupado} onClick={() => executar("whats", async () => {
            const { data, error } = await supabase.rpc("preencher_whatsapp_cadastros");
            if (error) throw error;
            invalidar("clientes", "fornecedores", "transportadoras");
            return `WhatsApp preenchido: ${data.clientes} cliente(s), ${data.fornecedores} fornecedor(es), ${data.transportadoras} transportadora(s)`;
          })}>{ocupado === "whats" ? "Preenchendo…" : "Preencher WhatsApp pelo celular"}</Button>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-fg"><Building2 size={16} className="text-brand" /> Conferência com a Receita</h3>
          <p className="mb-2 text-slate-600">
            O ERP confere sozinho cada CNPJ (3 por minuto, limite das consultas públicas): situação do CNPJ, inscrição estadual, endereço, telefone e e-mail.
            Preenche só o que está vazio. Se o endereço for diferente, os dois ficam e o cliente ganha a etiqueta <b>2 endereços</b>.
          </p>
          {s ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Numero rotulo="CNPJs conferidos" valor={`${s.conferidos} de ${s.com_cnpj}`} />
              <Numero rotulo="CNPJ baixado/inapto" valor={s.irregulares} tom={s.irregulares ? "ruim" : undefined} />
              <Numero rotulo="IE baixada" valor={s.ie_baixada} tom={s.ie_baixada ? "atencao" : undefined} />
              <Numero rotulo="Endereço diferente" valor={s.endereco_diferente} />
            </div>
          ) : <p className="text-slate-500">{situacao.isError ? "Não consegui ver o andamento agora." : "Carregando…"}</p>}
          {s && s.conferidos < s.com_cnpj && <p className="mt-2 text-xs text-slate-500">Faltam {s.com_cnpj - s.conferidos}: cerca de {tempo(Math.ceil((s.com_cnpj - s.conferidos) / 3))}. Pode fechar esta tela.</p>}
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-fg"><Copy size={16} className="text-amber-600" /> Possíveis cadastros repetidos</h3>
          <p className="mb-2 text-slate-600">Mesmo nome (MEI com o CNPJ no nome conta), mesmo CPF/CNPJ, mesmo WhatsApp/telefone ou mesmo e-mail: {repetidos.length} grupo(s).</p>
          {repetidos.length > 0 && <Button type="button" variant="secondary" onClick={() => setVerRepetidos(!verRepetidos)}>{verRepetidos ? "Esconder" : "Ver os grupos"}</Button>}
          {verRepetidos && (
            <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {repetidos.map((g) => (
                <li key={g[0].id} className="flex flex-wrap items-center gap-3 p-2.5">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    {g.map((c) => <div key={c.id} className="truncate"><b>{c.nome}</b> <span className="text-xs text-slate-500">{[docFormat(c.cpf_cnpj), c.whatsapp && formatarTelefone(c.whatsapp), c.email, c.municipio].filter(Boolean).join(" · ")}</span></div>)}
                  </div>
                  <Button type="button" variant="secondary" onClick={() => onUnificar(g.map((c) => c.id))}><Merge size={15} /> Unificar</Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-fg"><Truck size={16} className="text-purple-600" /> Fornecedores na lista de clientes</h3>
          <p className="mb-2 text-slate-600">
            Quem tem o CNPJ de um fornecedor ou transportadora, ou emitiu nota fiscal para a MF. Ao tirar: vira fornecedor (se ainda não for);
            quem nunca comprou sai da lista de clientes; quem já comprou fica, com a etiqueta <b>fornecedor</b>.
          </p>
          {forn.data?.length ? (
            <>
              <ul className="mb-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {forn.data.map((f) => (
                  <li key={f.id} className="flex flex-wrap justify-between gap-2 p-2">
                    <span className="min-w-0"><b>{f.nome}</b> <span className="text-xs text-slate-500">{docFormat(f.cpf_cnpj)} · {f.motivo}</span></span>
                    <span className={`text-xs font-semibold ${f.tem_movimento ? "text-purple-700" : "text-slate-500"}`}>{f.tem_movimento ? "já comprou: fica com etiqueta" : "sai da lista"}</span>
                  </li>
                ))}
              </ul>
              <Button type="button" disabled={!!ocupado} onClick={() => {
                if (!confirm(`Tirar ${forn.data!.length} fornecedor(es) da lista de clientes?`)) return;
                executar("forn", async () => {
                  const { data, error } = await supabase.rpc("retirar_fornecedores_clientes", { p_ids: forn.data!.map((f) => f.id) });
                  if (error) throw error;
                  invalidar("clientes", "fornecedores", "clientes_fornecedores");
                  return `${data.retirados} saíram da lista de clientes, ${data.mantidos_com_etiqueta} ficaram com a etiqueta e ${data.fornecedores_criados} fornecedor(es) foram criados`;
                });
              }}>{ocupado === "forn" ? "Tirando…" : `Tirar ${forn.data.length} da lista de clientes`}</Button>
            </>
          ) : <p className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={16} /> {forn.isLoading ? "Procurando…" : "Nenhum fornecedor na lista de clientes."}</p>}
        </section>
      </div>
    </Modal>
  );
}

/** Painel para arrumar o cadastro de fornecedores: WhatsApp, conferência com a Receita, o que falta e repetidos. */
export function ArrumarFornecedores({ onClose }: { onClose: () => void }) {
  const invalidar = useInvalidate();
  // mesma consulta da lista de fornecedores (fica em cache)
  const { data: fornecedores = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verRepetidos, setVerRepetidos] = useState(false);
  const situacao = useQuery({ queryKey: ["fornecedores_receita"], queryFn: () => callFunction<any>("clientes-receita", { acao: "situacao", tabela: "fornecedores" }), refetchInterval: 60_000 });
  // os repetidos usam o mesmo critério dos clientes (o CNPJ do fornecedor fica em "cnpj")
  const repetidos = useMemo(() => possiveisDuplicados(fornecedores.map((f) => ({ ...f, cpf_cnpj: f.cnpj }))), [fornecedores]);
  const faltando = [
    { rotulo: "sem CNPJ", n: fornecedores.filter((f) => digitosDoc(f.cnpj).length !== 14).length },
    { rotulo: "sem WhatsApp", n: fornecedores.filter((f) => !f.whatsapp).length },
    { rotulo: "sem e-mail", n: fornecedores.filter((f) => !f.email).length },
    { rotulo: "sem endereço", n: fornecedores.filter((f) => !f.logradouro || !f.municipio).length },
  ];

  async function executar(chave: string, f: () => Promise<string>) {
    setOcupado(chave);
    try { notify(await f()); } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }

  const s = situacao.data;
  return (
    <Modal open wide onClose={onClose} title="Arrumar o cadastro de fornecedores">
      <div className="space-y-5 text-sm">
        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-fg"><Building2 size={16} className="text-brand" /> Conferência com a Receita</h3>
          <p className="mb-2 text-slate-600">
            O ERP confere sozinho cada CNPJ de fornecedor (depois dos clientes, 3 por minuto): situação do CNPJ, inscrição estadual, endereço, telefone e e-mail.
            Preenche só o que está vazio. Se o endereço for diferente, os dois ficam e o fornecedor ganha a etiqueta <b>2 endereços</b>.
          </p>
          {s ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Numero rotulo="CNPJs conferidos" valor={`${s.conferidos} de ${s.com_cnpj}`} />
              <Numero rotulo="CNPJ baixado/inapto" valor={s.irregulares} tom={s.irregulares ? "ruim" : undefined} />
              <Numero rotulo="IE baixada" valor={s.ie_baixada} tom={s.ie_baixada ? "atencao" : undefined} />
              <Numero rotulo="Endereço diferente" valor={s.endereco_diferente} />
            </div>
          ) : <p className="text-slate-500">{situacao.isError ? "Não consegui ver o andamento agora." : "Carregando…"}</p>}
          {s && s.conferidos < s.com_cnpj && <p className="mt-2 text-xs text-slate-500">Faltam {s.com_cnpj - s.conferidos}. Corre sozinho; pode fechar esta tela. Na lista, o botão <b>Receita</b> confere um fornecedor na hora.</p>}
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-fg"><AlertTriangle size={16} className="text-amber-600" /> O que ainda falta no cadastro</h3>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {faltando.map((f) => <Numero key={f.rotulo} rotulo={f.rotulo} valor={f.n} tom={f.n ? "atencao" : undefined} />)}
          </div>
          <p className="mb-2 text-slate-600">Use os filtros da lista (Receita, WhatsApp, Completude) para achar cada grupo. O WhatsApp sai do celular do campo telefone:</p>
          <Button type="button" disabled={!!ocupado} onClick={() => executar("whats", async () => {
            const { data, error } = await supabase.rpc("preencher_whatsapp_cadastros");
            if (error) throw error;
            invalidar("clientes", "fornecedores", "transportadoras");
            return `WhatsApp preenchido: ${data.fornecedores} fornecedor(es), ${data.transportadoras} transportadora(s), ${data.clientes} cliente(s)`;
          })}><MessageCircle size={15} /> {ocupado === "whats" ? "Preenchendo…" : "Preencher WhatsApp pelo celular"}</Button>
        </section>

        <section className="rounded-xl border border-slate-200 p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-fg"><Copy size={16} className="text-amber-600" /> Possíveis cadastros repetidos</h3>
          <p className="mb-2 text-slate-600">Mesmo nome, mesmo CNPJ, mesmo WhatsApp/telefone ou mesmo e-mail: {repetidos.length} grupo(s). Confira e deixe um só (as notas de compra continuam ligadas pelo CNPJ).</p>
          {repetidos.length > 0 && <Button type="button" variant="secondary" onClick={() => setVerRepetidos(!verRepetidos)}>{verRepetidos ? "Esconder" : "Ver os grupos"}</Button>}
          {verRepetidos && (
            <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {repetidos.map((g) => (
                <li key={g[0].id} className="space-y-0.5 p-2.5">
                  {g.map((f) => <div key={f.id} className="truncate"><b>{f.nome}</b> <span className="text-xs text-slate-500">{[docFormat(f.cnpj), f.whatsapp && formatarTelefone(f.whatsapp), f.email, f.municipio].filter(Boolean).join(" · ")}</span></div>)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

const digitosDoc = (v?: string | null) => String(v ?? "").replace(/\D/g, "");

const tempo = (min: number) => (min < 60 ? `${min} minuto(s)` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`);

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: string | number; tom?: "ruim" | "atencao" }) {
  const cor = tom === "ruim" ? "text-red-700" : tom === "atencao" ? "text-amber-700" : "text-fg";
  return <div className="rounded-lg bg-slate-50 p-2.5"><div className="text-xs text-slate-500">{rotulo}</div><div className={`text-lg font-bold ${cor}`}>{valor}</div></div>;
}

/** Une cadastros repetidos: escolhe o principal; o resto (pedidos, contas, notas, OS…) passa para ele. */
export function UnificarClientes({ clientes, onClose }: { clientes: Cliente[]; onClose: () => void }) {
  const invalidar = useInvalidate();
  // sugestão: o que tem CPF/CNPJ e mais dados preenchidos
  const pontos = (c: Cliente) => (c.cpf_cnpj ? 5 : 0) + ["whatsapp", "email", "logradouro", "municipio", "inscricao_estadual", "nome_fantasia"].filter((k) => (c as any)[k]).length;
  const [principal, setPrincipal] = useState(() => [...clientes].sort((a, b) => pontos(b) - pontos(a))[0]?.id);
  const [ocupado, setOcupado] = useState(false);

  async function unificar() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("unificar_clientes", { p_manter: principal, p_outros: clientes.filter((c) => c.id !== principal).map((c) => c.id) });
      if (error) throw error;
      notify(`${data} cadastro(s) unificado(s): pedidos, contas, notas e atendimentos estão agora no principal`);
      invalidar("clientes", "ficha_cliente");
      onClose();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <Modal open wide onClose={onClose} title={`Unificar ${clientes.length} cadastros`}>
      <p className="mb-3 text-sm text-slate-600">
        Escolha o cadastro que fica. Pedidos, contas, notas, ordens de serviço, equipamentos, atendimentos, e-mails e anexos dos outros passam para ele;
        o que só os outros tinham (CPF/CNPJ, e-mail, WhatsApp, endereço…) completa o principal. Os outros cadastros são apagados.
      </p>
      <ul className="space-y-2">
        {clientes.map((c) => (
          <li key={c.id}>
            <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${principal === c.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
              <input type="radio" name="principal" className="mt-1 h-4 w-4" checked={principal === c.id} onChange={() => setPrincipal(c.id)} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-fg">{c.codigo ? `${c.codigo} · ` : ""}{c.nome}</span>
                {c.nome_fantasia && <span className="text-slate-500"> ({c.nome_fantasia})</span>}
                <span className="block text-xs text-slate-500">
                  {[docFormat(c.cpf_cnpj) || "sem CPF/CNPJ", c.whatsapp ? `WhatsApp ${formatarTelefone(c.whatsapp)}` : null, c.email,
                    [c.logradouro, c.numero].filter(Boolean).join(", "), [c.municipio, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                </span>
                {principal === c.id && <span className="mt-1 block text-xs font-semibold text-brand">Este fica</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={ocupado || !principal || clientes.length < 2} onClick={unificar}><Merge size={16} /> {ocupado ? "Unificando…" : "Unificar"}</Button>
      </div>
    </Modal>
  );
}

/** Na ficha: o que a Receita diz e os dois endereços, com a escolha de qual vale. */
export function ReceitaCliente({ c }: { c: Cliente }) {
  return <ReceitaCadastro registro={c} tabela="clientes" />;
}

/** Quadro da Receita para cliente ou fornecedor (o fornecedor guarda o CNPJ em "cnpj"). */
export function ReceitaCadastro({ registro: inicial, tabela }: { registro: Cliente | (Omit<Cliente, "cpf_cnpj"> & { cnpj?: string | null }); tabela: "clientes" | "fornecedores" }) {
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState(false);
  // abre com o registro da lista; depois de conferir, lê de novo do banco
  const { data: atual } = useQuery({
    queryKey: ["ficha_cliente", tabela, inicial.id, "receita"],
    queryFn: async () => (await supabase.from(tabela).select("*").eq("id", inicial.id).maybeSingle()).data as Cliente | null,
  });
  const c = { ...inicial, ...(atual ?? {}) } as Cliente & { cnpj?: string | null };
  const r = c.receita as DadosReceita | null | undefined;
  const cnpj = String((tabela === "clientes" ? c.cpf_cnpj : c.cnpj) ?? "").replace(/\D/g, "").length === 14;
  if (!cnpj) return null;

  async function conferir() {
    setOcupado(true);
    try {
      await callFunction("clientes-receita", tabela === "clientes" ? { acao: "um", cliente_id: c.id } : { acao: "um", fornecedor_id: c.id });
      notify("Conferido na Receita");
      invalidar(tabela, "ficha_cliente");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  async function escolher(usarReceita: boolean) {
    setOcupado(true);
    try {
      const tags = (c.tags ?? []).filter((t) => t !== "endereco_receita");
      const e = r?.endereco;
      const { error } = await supabase.from(tabela).update(usarReceita && e
        ? { tags, cep: e.cep, logradouro: e.logradouro, numero: e.numero, complemento: e.complemento, bairro: e.bairro, municipio: e.municipio, uf: e.uf }
        : { tags }).eq("id", c.id);
      if (error) throw error;
      notify(usarReceita ? "Endereço da Receita aplicado" : "Mantido o endereço do cadastro");
      invalidar(tabela, "ficha_cliente");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const end = (e: Partial<DadosReceita["endereco"]>) => [[e.logradouro, e.numero].filter(Boolean).join(", "), e.complemento, e.bairro, [e.municipio, e.uf].filter(Boolean).join("/"), e.cep && `CEP ${e.cep}`].filter(Boolean).join(" · ") || "—";
  const irregular = (c.tags ?? []).includes("cnpj_irregular");
  return (
    <div className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Building2 size={16} className="text-brand" /> Receita Federal</h3>
        <Button type="button" variant="ghost" disabled={ocupado} onClick={conferir}><RefreshCw size={14} /> {ocupado ? "Conferindo…" : "Conferir agora"}</Button>
      </div>
      {!c.receita_em ? <p className="text-slate-500">Ainda não conferido (a conferência automática passa por todos os CNPJs).</p> : (
        <div className="mt-1 space-y-1.5">
          <p>
            CNPJ: <b className={irregular ? "text-red-700" : "text-emerald-700"}>{c.receita_situacao ?? "—"}</b>
            {c.ie_situacao && <> · <span className={c.ie_situacao === "baixada" ? "font-semibold text-amber-700" : ""}>{ROTULO_IE[c.ie_situacao] ?? c.ie_situacao}</span></>}
            <span className="text-xs text-slate-500"> · conferido em {dataBR(c.receita_em)}{r?.fonte ? ` (${r.fonte})` : ""}</span>
          </p>
          {r && (c.tags ?? []).includes("endereco_receita") && (
            <div className="rounded-lg bg-sky-50 p-2.5">
              <div className="mb-1 font-semibold text-sky-900">Dois endereços</div>
              <div><span className="text-xs text-slate-500">No cadastro:</span> {end(c)}</div>
              <div><span className="text-xs text-slate-500">Na Receita:</span> {end(r.endereco)}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={ocupado} onClick={() => escolher(true)}>Usar o da Receita</Button>
                <Button type="button" variant="ghost" disabled={ocupado} onClick={() => escolher(false)}>Manter o do cadastro</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
