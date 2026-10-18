// Configurações → Unidades: matriz SC e filial SP (CNPJ, IE, CNAE e endereço). Os impostos da nota ficam em
// Notas fiscais → Configurações da NF-e.
import { useEffect, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Landmark, Pencil, Search } from "lucide-react";
import { Badge, Button, Field, Modal } from "./ui";
import { useSave } from "@/lib/data";
import { digitos, docFormat } from "@/lib/format";
import { buscarCep } from "@/lib/cep";
import { buscarCnpj, cnaesDoTexto, cnaesEmTexto, conferirComReceita, inscricaoDoEstado, preencherVazios, type ConferenciaCampo, type DadosCnpj } from "@/lib/cnpj";
import { cnaeFormatado } from "../../supabase/functions/_shared/receita";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade, type Unidade } from "@/lib/unidade";

const NUMEROS = ["serie_nfe"] as const;

export function UnidadesConfig() {
  const { unidades } = useUnidade();
  const [editando, setEditando] = useState<Unidade | null>(null);
  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Building2 size={18} className="text-brand" /> Unidades (matriz e filial)</h2>
      <p className="mb-3 text-sm text-slate-600">
        Cada unidade emite NF-e com o próprio CNPJ e tem estoque e financeiro separados. Regime: <b>lucro real</b>.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {unidades.map((u) => {
          const pendente = !u.cnpj || !u.inscricao_estadual || !u.logradouro || !u.cep;
          return (
            <div key={u.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-fg">{u.nome} {u.matriz && <span className="text-xs font-semibold text-slate-500">· matriz</span>}</div>
                  <div className="text-sm text-slate-500">{u.cnpj ? docFormat(u.cnpj) : "CNPJ não informado"} · {[u.municipio, u.uf].filter(Boolean).join("/") || "—"}</div>
                </div>
                {pendente ? <Badge value="pendente" /> : <Badge value="ativo" />}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                ICMS interno {Number(u.icms_aliquota_interna)}% · PIS {Number(u.pis_aliquota)}% · COFINS {Number(u.cofins_aliquota)}% · {u.fabrica ? "fábrica" : "sem fábrica"} · {u.assistencia ? "assistência" : "sem assistência"}
              </div>
              {u.cnae_principal
                ? <div className="mt-1 text-xs text-slate-600">
                    CNAE <b>{u.cnae_principal}</b> {u.cnae_principal_descricao}
                    {!!u.cnaes_secundarios?.length && <span className="text-slate-500"> · +{u.cnaes_secundarios.length} secundário{u.cnaes_secundarios.length > 1 ? "s" : ""}</span>}
                  </div>
                : <div className="mt-1 text-xs font-semibold text-amber-700">CNAE não informado: Editar → Buscar na Receita.</div>}
              {pendente && <div className="mt-1 text-xs font-semibold text-amber-700">Falta CNPJ, IE ou endereço para emitir NF-e.</div>}
              <Button type="button" variant="secondary" className="mt-3" onClick={() => setEditando({ ...u })}><Pencil size={15} /> Editar</Button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Na Focus NFe, cadastre as duas empresas (CNPJ, certificado A1 e numeração). CFOP, CST, alíquotas e IBS/CBS de cada unidade:
        <b> Notas fiscais → Configurações da NF-e</b>.
      </p>
      {editando && <UnidadeModal unidade={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

function UnidadeModal({ unidade, onClose }: { unidade: Unidade; onClose: () => void }) {
  const [u, setU] = useState<Record<string, any>>(unidade);
  const [secundarios, setSecundarios] = useState(() => cnaesEmTexto(unidade.cnaes_secundarios));
  const [buscando, setBuscando] = useState(false);
  const [conferencia, setConferencia] = useState<{ itens: ConferenciaCampo[]; dados: DadosCnpj } | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const save = useSave("unidades");
  const set = (k: string) => (e: { target: { value: string } }) => setU({ ...u, [k]: e.target.value });
  const chk = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={!!u[k]} onChange={(e) => setU({ ...u, [k]: e.target.checked })} /> {label}</label>
  );
  const campo = (k: string, label: string, cls = "", type = "text") => (
    <Field label={label} className={cls}><input className="input" type={type} step={type === "number" ? "any" : undefined} value={u[k] ?? ""} onChange={set(k)} /></Field>
  );

  // CNAE pela Receita: na hora de buscar (botão) troca o que está na tela; ao digitar o CNPJ só preenche o que está vazio
  function aplicarCnae(d: DadosCnpj, trocar: boolean) {
    if (!d.cnae) return false;
    if (!trocar && u.cnae_principal) return false;
    setU((x) => ({ ...x, cnae_principal: d.cnae!.codigo, cnae_principal_descricao: d.cnae!.descricao }));
    setSecundarios(cnaesEmTexto(d.cnaes_secundarios));
    return true;
  }
  async function buscarAtividades(trocar: boolean) {
    if (!u.cnpj) return notifyError("Informe o CNPJ da unidade");
    setBuscando(true);
    try {
      const d = await buscarCnpj(u.cnpj);
      if (!d) return notifyError("A Receita não respondeu agora; tente de novo em um minuto ou digite o CNAE");
      if (!d.cnae) return notifyError("A consulta não trouxe o CNAE; digite o código do cartão CNPJ");
      if (aplicarCnae(d, trocar)) notify(`CNAE preenchido pela Receita Federal (${d.cnaes_secundarios?.length ?? 0} secundários). Confira e salve.`);
    } finally { setBuscando(false); }
  }
  /** Dados da empresa: compara tudo com a Receita e mostra o que está diferente (nada muda sem a pessoa escolher). */
  async function conferir() {
    if (digitos(u.cnpj).length !== 14) return notifyError("Informe o CNPJ da unidade (14 números)");
    setBuscando(true);
    try {
      const d = await buscarCnpj(u.cnpj);
      if (!d) return notifyError("A Receita não respondeu agora; tente de novo em um minuto");
      const linha = { ...u, cnaes_secundarios: cnaesDoTexto(secundarios) };
      const itens = conferirComReceita(linha, d);
      setConferencia({ itens, dados: d });
      setMarcados(new Set(itens.filter((c) => c.sugerir).map((c) => c.campo)));
    } finally { setBuscando(false); }
  }
  function usarMarcados() {
    if (!conferencia) return;
    const d = conferencia.dados;
    const novo: Record<string, any> = {};
    for (const campo of marcados) {
      if (campo === "razao_social") novo.razao_social = d.nome;
      else if (campo === "inscricao_estadual") novo.inscricao_estadual = inscricaoDoEstado(d, u.uf);
      else if (campo === "cnae_principal" && d.cnae) { novo.cnae_principal = d.cnae.codigo; novo.cnae_principal_descricao = d.cnae.descricao; }
      else if (campo === "cnaes_secundarios") setSecundarios(cnaesEmTexto(d.cnaes_secundarios));
      else novo[campo] = (d as Record<string, unknown>)[campo] ?? null;
    }
    setU((x) => ({ ...x, ...novo }));
    setConferencia(null);
    notify(`${marcados.size} ${marcados.size === 1 ? "campo trocado" : "campos trocados"} pelo da Receita. Confira e clique em Salvar.`);
  }

  // unidade ainda sem CNAE: já busca ao abrir
  useEffect(() => { if (!unidade.cnae_principal && unidade.cnpj) void buscarAtividades(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      const { created_at: _c, ...row } = u;
      for (const k of NUMEROS) row[k] = Number(row[k] || 0);
      // CNPJ só com os números (a busca das notas e da Focus compara assim)
      if (row.cnpj) row.cnpj = digitos(row.cnpj);
      row.uf = row.uf?.toUpperCase();
      const linhas = secundarios.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const lista = cnaesDoTexto(secundarios);
      if (lista.length < linhas.length) throw new Error("CNAE secundário: cada linha começa pelo código (ex.: 3314-7/12 Manutenção de máquinas)");
      if (row.cnae_principal && !/^\d{4}-\d\/\d{2}$/.test(cnaeFormatado(row.cnae_principal) ?? "")) throw new Error("CNAE principal: use os 7 números (ex.: 2829-1/99)");
      row.cnae_principal = cnaeFormatado(row.cnae_principal) || null;
      row.cnae_principal_descricao = String(row.cnae_principal_descricao ?? "").trim() || null;
      row.cnaes_secundarios = lista;
      await save.mutateAsync(row);
      notify(`${u.nome} salva`);
      onClose();
    } catch (err) { notifyError(err); }
  }

  return (
    <Modal open wide onClose={onClose} title={`Unidade: ${unidade.nome}`}>
      <form onSubmit={salvar}>
          <section className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900" aria-label="Conferir com a Receita Federal">
            <div className="flex flex-wrap items-center gap-2">
              <Landmark size={18} className="shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 basis-60"><b>Dados da empresa.</b> O ERP consulta a Receita Federal pelo CNPJ e mostra, campo a campo, o que está diferente daqui. Nada muda sem você escolher.</p>
              <Button type="button" variant="secondary" disabled={buscando} onClick={() => void conferir()}><Search size={15} /> {buscando ? "Consultando…" : "Conferir com a Receita"}</Button>
            </div>
            {conferencia && <ResultadoConferencia c={conferencia} marcados={marcados} setMarcados={setMarcados} onUsar={usarMarcados} onFechar={() => setConferencia(null)} />}
          </section>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {campo("nome", "Nome no ERP", "sm:col-span-2")}
            {campo("codigo", "Sigla")}
            {campo("serie_nfe", "Série da NF-e", "", "number")}
            {campo("razao_social", "Razão social", "sm:col-span-2")}
            <Field label="CNPJ (preenche o resto)"><input className="input" value={u.cnpj ?? ""} onChange={set("cnpj")}
              onBlur={async () => { const d = await buscarCnpj(u.cnpj); if (d) { setU((x) => ({ ...x, ...preencherVazios(x, { ...d, inscricao_estadual: inscricaoDoEstado(d) }, { inscricao_estadual: "inscricao_estadual",  razao_social: "nome", logradouro: "logradouro", numero: "numero", complemento: "complemento", bairro: "bairro", municipio: "municipio", uf: "uf", cep: "cep", telefone: "telefone", email: "email" }) })); aplicarCnae(d, false); notify("Dados preenchidos pela Receita Federal"); } }} /></Field>
            {campo("inscricao_estadual", "Inscrição estadual")}
            {campo("inscricao_municipal", "Inscrição municipal")}
            <div className="rounded-lg border border-slate-200 p-3 sm:col-span-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">Atividades (CNAE)</span>
                <Button type="button" variant="secondary" disabled={buscando} onClick={() => void buscarAtividades(true)}>
                  <Search size={15} /> {buscando ? "Buscando…" : "Buscar na Receita"}
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {campo("cnae_principal", "CNAE principal")}
                {campo("cnae_principal_descricao", "Descrição", "sm:col-span-3")}
                <Field label="CNAEs secundários (um por linha: código e descrição)" className="sm:col-span-4">
                  <textarea className="input min-h-[6rem]" value={secundarios} onChange={(e) => setSecundarios(e.target.value)} placeholder="3314-7/12 Manutenção e reparação de máquinas" />
                </Field>
              </div>
            </div>
            <Field label="CEP"><input className="input" value={u.cep ?? ""} onChange={set("cep")}
              onBlur={async () => { const r = await buscarCep(u.cep); if (r) setU((x) => ({ ...x, ...r })); }} /></Field>
            {campo("logradouro", "Logradouro", "sm:col-span-2")}
            {campo("numero", "Número")}
            {campo("complemento", "Complemento")}
            {campo("bairro", "Bairro")}
            {campo("municipio", "Município")}
            {campo("uf", "UF")}
            {campo("telefone", "Telefone")}
            {campo("whatsapp", "WhatsApp")}
            {campo("email", "E-mail", "sm:col-span-2")}
            <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 sm:col-span-4">
              Pix, banco e InfinitePay (link de pagamento e taxas) desta unidade ficam em <b>Configurações → Recebimentos e taxas</b>.
            </p>
            <div className="flex flex-wrap gap-5 sm:col-span-4">{chk("fabrica", "Fabrica máquinas aqui")}{chk("assistencia", "Faz assistência técnica")}{chk("ativo", "Ativa")}</div>
            <p className="text-xs text-slate-500 sm:col-span-4">CFOP, CST, alíquotas e IBS/CBS desta unidade: Notas fiscais → Configurações da NF-e.</p>
          </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/** O que a Receita tem x o que está no ERP: os diferentes com a caixinha para trocar; os iguais num resumo. */
function ResultadoConferencia({ c, marcados, setMarcados, onUsar, onFechar }: {
  c: { itens: ConferenciaCampo[]; dados: DadosCnpj }; marcados: Set<string>; setMarcados: (s: Set<string>) => void; onUsar: () => void; onFechar: () => void;
}) {
  const diferentes = c.itens.filter((x) => !x.igual), iguais = c.itens.filter((x) => x.igual);
  const ativa = /ATIVA/i.test(c.dados.situacao ?? "");
  const marcar = (campo: string, sim: boolean) => { const n = new Set(marcados); if (sim) n.add(campo); else n.delete(campo); setMarcados(n); };
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-surface p-3 text-fg">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {c.dados.situacao && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ativa ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>Situação na Receita: {c.dados.situacao}</span>}
        <span className="text-slate-600"><b className="text-emerald-700">{iguais.length} iguais</b> · <b className={diferentes.length ? "text-amber-700" : "text-emerald-700"}>{diferentes.length} diferentes</b></span>
      </div>
      {!ativa && c.dados.situacao && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">O CNPJ não está ativo na Receita: a NF-e é recusada. Fale com o contador.</p>}
      {diferentes.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {diferentes.map((x) => (
            <li key={x.campo} className="grid gap-1 px-3 py-2 sm:grid-cols-[auto_9rem_1fr_1fr] sm:items-start sm:gap-3">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={marcados.has(x.campo)} onChange={(e) => marcar(x.campo, e.target.checked)} aria-label={`Trocar ${x.rotulo} pelo da Receita`} />
              <b className="text-sm">{x.rotulo}</b>
              <span className="min-w-0 break-words text-sm"><span className="block text-[11px] font-semibold uppercase text-slate-500">No ERP</span>{x.erp || <i className="text-slate-400">vazio</i>}</span>
              <span className="min-w-0 break-words text-sm"><span className="block text-[11px] font-semibold uppercase text-slate-500">Na Receita</span>{x.receita}</span>
            </li>
          ))}
        </ul>
      ) : <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} aria-hidden /> Tudo igual à Receita.</p>}
      {iguais.length > 0 && <p className="text-xs text-slate-500">Iguais: {iguais.map((x) => x.rotulo).join(", ")}.</p>}
      <p className="text-xs text-slate-500">Telefone, e-mail e complemento vêm desmarcados: a empresa pode usar outros de propósito. Inscrição municipal e série da NF-e não estão na Receita.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onFechar}>Fechar</Button>
        {diferentes.length > 0 && <Button type="button" disabled={!marcados.size} onClick={onUsar}>Usar os {marcados.size} marcados</Button>}
      </div>
    </div>
  );
}
