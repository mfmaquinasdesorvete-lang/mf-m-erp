// My Frost Sorveterias · as unidades licenciadas: cartões com endereço, modelo, contrato, máquinas e o que custou montar
// cada uma; a ficha da unidade junta tudo (dados, contrato com os arquivos, máquinas, custos de montar e o que ela já
// pagou). Só o dono vê (no banco, cada linha é de quem a criou) e os arquivos ficam na pasta licenciado/<dono>/…, que
// ninguém mais do ERP abre. MF ≠ My Frost: nada daqui vai para o DRE, a conciliação ou o contador da MF.
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Ban, FileText, Image as Imagem, MapPin, Paperclip, Pencil, Phone, Plus, Search, Store, Trash2, Undo2, Wrench } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { numeroBR } from "@/lib/fichaCadastral";
import { usePerfil } from "@/lib/auth";
import {
  CATEGORIAS_CUSTO, CONTRATOS, SITUACOES_LOJA, SITUACOES_MAQUINA, corDaLoja, enderecoCompleto, faltaNaFicha, linkMapa, nomeCategoria,
  nomeModelo, nomeTipo, resumoUnidade, valePagamento,
  type ArquivoLoja, type CustoLoja, type Loja, type MaquinaLoja, type PagamentoLoja, type SituacaoLoja,
} from "@/lib/licenciados";

const ROSA = "#c2185b";
const LIMITE = 20 * 1024 * 1024;
const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const docBR = (d: string | null) => !d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

type Dados = { lojas: Loja[]; custos: CustoLoja[]; maquinas: MaquinaLoja[]; pagamentos: PagamentoLoja[]; arquivos: ArquivoLoja[] };
type FiltroSit = "andamento" | "fechando" | "encerrada" | "todas";

function ChipContrato({ l }: { l: Loja }) {
  const c = CONTRATOS.find((x) => x.id === (l.contrato ?? "sem"))!;
  const vencido = l.contrato === "assinado" && l.contrato_vence_em && l.contrato_vence_em < hoje();
  return <span className="rounded-full px-2 py-0.5 text-2xs font-bold text-white" style={{ background: vencido ? "#b91c1c" : c.cor }}>{vencido ? "Contrato vencido" : c.nome}</span>;
}

/** Cartões das unidades, com filtro por situação e busca. */
export function UnidadesLista({ dados, onAbrir, onNova }: { dados: Dados; onAbrir: (l: Loja) => void; onNova: () => void }) {
  const [filtro, setFiltro] = useState<FiltroSit>("andamento");
  const [busca, setBusca] = useState("");
  const naFiltro = (s: SituacaoLoja, f: FiltroSit) => f === "todas" || (f === "andamento" ? !["fechando", "encerrada"].includes(s) : s === f);
  const t = sem(busca.trim());
  const lista = dados.lojas.filter((l) => naFiltro(l.situacao, filtro) && (!t || sem([l.nome, l.cidade, l.uf, l.responsavel, l.endereco, l.documento].join(" ")).includes(t)));
  const n = (f: FiltroSit) => dados.lojas.filter((l) => naFiltro(l.situacao, f)).length;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Situação das unidades">
          {([["andamento", "Funcionando"], ["fechando", "Vai fechar"], ["encerrada", "Encerradas"], ["todas", "Todas"]] as const).map(([f, r]) => (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
              className={`rounded-lg px-2.5 py-1.5 text-sm font-semibold ${filtro === f ? "bg-surface text-fg shadow-card" : "text-slate-600 hover:text-fg"}`}>{r} <span className="num opacity-70">{n(f)}</span></button>
          ))}
        </div>
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input w-full pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar unidade, cidade ou responsável" aria-label="Buscar unidade" />
        </label>
        <Button className="ml-auto" onClick={onNova}><Store size={16} /> Nova unidade</Button>
      </div>
      {!lista.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhuma unidade aqui.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lista.map((l) => {
          const r = resumoUnidade(l.id, dados.custos, dados.maquinas, dados.pagamentos);
          const sit = SITUACOES_LOJA.find((s) => s.id === l.situacao);
          const falta = faltaNaFicha(l);
          return (
            <button key={l.id} type="button" onClick={() => onAbrir(l)}
              className={`overflow-hidden rounded-2xl border border-slate-200 bg-surface text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop ${l.situacao === "encerrada" ? "opacity-70" : ""}`}>
              <div className="p-3.5 text-white" style={{ background: `linear-gradient(135deg, ${corDaLoja(l.cor)}, #0f172a)` }}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-base font-bold leading-tight">{l.nome}</div>
                    <div className="truncate text-xs opacity-85">{[nomeModelo(l.modelo), [l.cidade, l.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "cidade não informada"}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-2xs font-bold">{sit?.nome}</span>
                </div>
                <dl className="mt-2 space-y-0.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-xs">
                  {[["Custo de montar", brl(r.custo)], ["Recebido", brl(r.recebido)], ["Máquinas na loja", String(r.maquinas)]].map(([rot, v]) => (
                    <div key={rot} className="flex items-baseline justify-between gap-2"><dt className="opacity-85">{rot}</dt><dd className="num font-bold">{v}</dd></div>
                  ))}
                </dl>
              </div>
              <div className="space-y-1 p-3 text-xs text-slate-600">
                {l.endereco ? <p className="flex gap-1.5"><MapPin size={13} className="mt-0.5 shrink-0" aria-hidden /><span className="line-clamp-2">{enderecoCompleto(l)}</span></p>
                  : <p className="flex gap-1.5 text-amber-800"><MapPin size={13} className="mt-0.5 shrink-0" aria-hidden />Sem endereço da loja</p>}
                <p className="flex flex-wrap items-center gap-1.5">
                  <ChipContrato l={l} />
                  {l.inicio && <span>aberta em {dataBR(l.inicio)}</span>}
                </p>
                {falta.length > 0 && <p className="text-amber-800">Falta: {falta.join(", ")}</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A ficha da unidade: dados, contrato e arquivos, máquinas, custos de montar e o que ela já pagou. */
export function FichaUnidade({ loja: l, dados, onClose, onEditar }: { loja: Loja; dados: Dados; onClose: () => void; onEditar: () => void }) {
  const { user_id } = usePerfil();
  const invalidar = useInvalidate();
  const r = resumoUnidade(l.id, dados.custos, dados.maquinas, dados.pagamentos);
  const maquinas = dados.maquinas.filter((m) => m.loja_id === l.id);
  const custos = dados.custos.filter((c) => c.loja_id === l.id).sort((a, b) => b.data.localeCompare(a.data));
  const pags = dados.pagamentos.filter((p) => p.loja_id === l.id && valePagamento(p)).sort((a, b) => b.data.localeCompare(a.data));
  const arquivos = dados.arquivos.filter((a) => a.loja_id === l.id);
  const [maq, setMaq] = useState<Partial<MaquinaLoja> | null>(null);
  const [custo, setCusto] = useState<Partial<CustoLoja> | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [tipoArq, setTipoArq] = useState<ArquivoLoja["tipo"]>("contrato");
  const input = useRef<HTMLInputElement>(null);
  const mapa = linkMapa(l);

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return;
    setEnviando(true);
    let n = 0;
    for (const f of [...lista]) {
      if (f.size > LIMITE) { notify(`${f.name}: maior que 20 MB`, "erro"); continue; }
      const limpo = f.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);
      const caminho = `licenciado/${user_id}/${l.id}/${crypto.randomUUID()}-${limpo}`;
      const { error } = await supabase.storage.from("documentos").upload(caminho, f, { contentType: f.type || "application/octet-stream" });
      if (error) { notifyError(error); continue; }
      const { error: e2 } = await supabase.from("licenciados_arquivos").insert({ loja_id: l.id, tipo: tipoArq, nome: f.name, caminho, tamanho: f.size, mime: f.type || null });
      if (e2) { await supabase.storage.from("documentos").remove([caminho]); notifyError(e2); continue; }
      n++;
    }
    setEnviando(false);
    if (input.current) input.current.value = "";
    if (n) notify(`${n} ${pl(n, "arquivo guardado", "arquivos guardados")}`);
    invalidar("licenciados_arquivos");
  }
  async function abrir(a: ArquivoLoja) {
    const { data, error } = await supabase.storage.from("documentos").createSignedUrl(a.caminho, 600);
    if (error || !data?.signedUrl) return notifyError(error ?? new Error("não foi possível abrir"));
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function apagar(a: ArquivoLoja) {
    if (!(await confirmar(`Apagar "${a.nome}"?`, { perigo: true }))) return;
    const { error } = await supabase.from("licenciados_arquivos").delete().eq("id", a.id);
    if (error) return notifyError(error);
    await supabase.storage.from("documentos").remove([a.caminho]);
    invalidar("licenciados_arquivos");
  }
  async function gravar(tabela: "licenciados_maquinas" | "licenciados_custos", linha: Record<string, unknown>) {
    const { id, ...resto } = linha;
    const { error } = id ? await supabase.from(tabela).update(resto).eq("id", id as string) : await supabase.from(tabela).insert({ ...resto, loja_id: l.id });
    if (error) return notifyError(error);
    notify("Salvo");
    invalidar(tabela);
    setMaq(null); setCusto(null);
  }

  return (
    <Modal open onClose={onClose} title={l.nome} wide>
      <div className="space-y-4 text-sm">
        <div className="overflow-hidden rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${corDaLoja(l.cor)}, #0f172a)` }}>
          <div className="flex flex-wrap items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold leading-tight">{l.nome}</div>
              <div className="text-xs opacity-85">{[nomeModelo(l.modelo), SITUACOES_LOJA.find((s) => s.id === l.situacao)?.nome, l.inicio && `aberta em ${dataBR(l.inicio)}`].filter(Boolean).join(" · ")}</div>
            </div>
            <Button variant="secondary" onClick={onEditar}><Pencil size={15} /> Editar dados</Button>
          </div>
          <div className="grid grid-cols-2 border-t border-white/20 sm:grid-cols-4">
            {[["Custo de montar", brl(r.custo)], ["Recebido (líquido)", brl(r.recebido)], [r.saldo >= 0 ? "Já voltou" : "Falta voltar", brl(Math.abs(r.saldo))], ["Máquinas", String(r.maquinas)]].map(([rot, v], i) => (
              <div key={rot} className={`px-4 py-2 ${i % 2 ? "border-l border-white/20" : ""} ${i >= 2 ? "border-t border-white/20 sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}>
                <div className="text-xs opacity-80">{rot}</div><div className="num font-bold">{v}</div>
              </div>
            ))}
          </div>
        </div>

        <section aria-label="Dados e endereço" className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
          <div><div className="text-xs font-semibold text-slate-500">Endereço</div>
            {l.endereco ? <div className="text-fg">{enderecoCompleto(l)}{mapa && <> · <a href={mapa} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">ver no mapa</a></>}</div>
              : <div className="text-amber-800">Falta o endereço da loja</div>}</div>
          <div><div className="text-xs font-semibold text-slate-500">Responsável</div><div className="text-fg">{l.responsavel || "—"}{l.documento ? ` · ${docBR(l.documento)}` : ""}</div></div>
          <div><div className="text-xs font-semibold text-slate-500">Contato</div>
            <div className="flex flex-wrap items-center gap-x-2 text-fg">{l.telefone ? <a className="inline-flex items-center gap-1 underline" href={`https://wa.me/55${l.telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"><Phone size={13} aria-hidden />{l.telefone}</a> : "—"}
              {l.email && <span>{l.email}</span>}</div></div>
          <div><div className="text-xs font-semibold text-slate-500">E-mail da My Frost</div><div className="break-all text-fg">{l.email_institucional || "—"}</div></div>
          {l.observacoes && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-2 text-xs text-slate-600 sm:col-span-2">{l.observacoes}</p>}
        </section>

        <section aria-label="Contrato" className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-fg">Contrato</h3><ChipContrato l={l} />
            <span className="text-xs text-slate-500">{[l.contrato_assinado_em && `assinado em ${dataBR(l.contrato_assinado_em)}`, l.contrato_vence_em && `vence em ${dataBR(l.contrato_vence_em)}`,
              l.valor_combinado != null && `licença ${brl(l.valor_combinado)}`, l.mensalidade != null && `mensalidade ${brl(l.mensalidade)}`].filter(Boolean).join(" · ")}</span>
          </div>
          {l.contrato_obs && <p className="mb-2 whitespace-pre-line text-xs text-slate-600">{l.contrato_obs}</p>}
          <ul className="mb-2 space-y-1">
            {arquivos.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                {a.mime?.startsWith("image/") ? <Imagem size={15} className="shrink-0 text-sky-600" aria-hidden /> : <FileText size={15} className="shrink-0 text-brand" aria-hidden />}
                <button type="button" onClick={() => abrir(a)} className="min-w-0 flex-1 truncate text-left font-semibold text-fg hover:underline">{a.nome}</button>
                <span className="shrink-0 text-2xs text-slate-500">{a.tipo} · {dataBR(a.criado_em.slice(0, 10))}</span>
                <button type="button" onClick={() => apagar(a)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Apagar ${a.nome}`}><Trash2 size={14} /></button>
              </li>
            ))}
            {!arquivos.length && <li className="text-xs text-slate-500">Nenhum arquivo ainda (contrato assinado, ficha do licenciado, documentos).</li>}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input h-9 w-auto" value={tipoArq} onChange={(e) => setTipoArq(e.target.value as ArquivoLoja["tipo"])} aria-label="Tipo do arquivo">
              {(["contrato", "ficha", "documento", "foto", "outro"] as const).map((t) => <option key={t} value={t}>{t === "ficha" ? "ficha do licenciado" : t}</option>)}
            </select>
            <input ref={input} type="file" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
            <Button variant="secondary" disabled={enviando} onClick={() => input.current?.click()}><Paperclip size={15} /> {enviando ? "Enviando…" : "Anexar arquivo"}</Button>
            <span className="text-2xs text-slate-500">Só você abre estes arquivos.</span>
          </div>
        </section>

        <section aria-label="Máquinas da unidade" className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2"><h3 className="mr-auto font-bold text-fg">Máquinas <span className="text-slate-500">({maquinas.length})</span></h3>
            <Button variant="secondary" onClick={() => setMaq({ situacao: "na_loja", data_compra: l.inicio ?? hoje() })}><Plus size={15} /> Máquina</Button></div>
          <ul className="divide-y divide-slate-100">
            {maquinas.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <Wrench size={14} className="shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block font-semibold text-fg">{m.descricao}</span>
                  <span className="text-xs text-slate-500">{[m.numero_serie && `nº ${m.numero_serie}`, m.data_compra && `comprada em ${dataBR(m.data_compra)}`, SITUACOES_MAQUINA.find((s) => s.id === m.situacao)?.nome].filter(Boolean).join(" · ")}</span></span>
                {m.valor != null && <span className="num font-semibold">{brl(m.valor)}</span>}
                <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setMaq(m)} aria-label={`Editar ${m.descricao}`}><Pencil size={14} /></button>
              </li>
            ))}
            {!maquinas.length && <li className="py-1 text-xs text-slate-500">Nenhuma máquina cadastrada.</li>}
          </ul>
        </section>

        <section aria-label="Custos de montar" className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center gap-2"><h3 className="mr-auto font-bold text-fg">Custos de montar <span className="num text-slate-500">· {brl(r.custo)}</span></h3>
            <Button variant="secondary" onClick={() => setCusto({ data: hoje(), categoria: "maquinas" })}><Plus size={15} /> Custo</Button></div>
          {r.porCategoria.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">{r.porCategoria.map((k) => <span key={k.id} className="rounded-full bg-pink-50 px-2 py-0.5 text-xs font-semibold text-[#9d174d]">{k.nome} <span className="num">{brl(k.valor)}</span></span>)}</div>
          )}
          <ul className="divide-y divide-slate-100">
            {custos.map((c) => (
              <li key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 ${c.anulado ? "opacity-50 line-through" : ""}`}>
                <span className="num w-20 shrink-0 text-xs text-slate-500">{dataBR(c.data)}</span>
                <span className="min-w-0 flex-1"><span className="font-semibold text-fg">{nomeCategoria(c.categoria)}</span>{c.descricao && <span className="text-slate-600"> · {c.descricao}</span>}</span>
                <span className="num font-semibold">{brl(c.valor)}</span>
                {!c.anulado && <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setCusto(c)} aria-label="Editar custo"><Pencil size={14} /></button>}
                <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => gravar("licenciados_custos", { id: c.id, anulado: !c.anulado })}
                  aria-label={c.anulado ? "Voltar o custo" : "Anular o custo"} title={c.anulado ? "Voltar" : "Anular (lançado errado)"}>{c.anulado ? <Undo2 size={14} /> : <Ban size={14} />}</button>
              </li>
            ))}
            {!custos.length && <li className="py-1 text-xs text-slate-500">Nenhum custo lançado. Ex.: máquinas, quiosque 3×5, insumos iniciais, PDV, montagem, uniformes, cardápio e inauguração.</li>}
          </ul>
        </section>

        <section aria-label="Pagamentos da unidade" className="rounded-xl border border-slate-200 p-3">
          <h3 className="mb-1 font-bold text-fg">O que a unidade pagou <span className="num text-slate-500">· {brl(r.recebido)} líquido</span></h3>
          <ul className="divide-y divide-slate-100">
            {pags.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-1.5"><span className="num w-20 shrink-0 text-xs text-slate-500">{dataBR(p.data)}</span>
                <span className="min-w-0 flex-1 truncate">{nomeTipo(p.tipo)}{p.descricao ? ` · ${p.descricao}` : ""}</span><span className="num font-semibold text-emerald-700">{brl(p.valor)}</span></li>
            ))}
            {!pags.length && <li className="py-1 text-xs text-slate-500">Nenhum pagamento ligado a esta unidade (aba Pagamentos).</li>}
          </ul>
        </section>
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Fechar</Button></div>
      </div>
      {maq && <MaquinaModal maq={maq} onClose={() => setMaq(null)} onGravar={(x) => gravar("licenciados_maquinas", x)} />}
      {custo && <CustoModal custo={custo} onClose={() => setCusto(null)} onGravar={(x) => gravar("licenciados_custos", x)} />}
    </Modal>
  );
}

function MaquinaModal({ maq, onClose, onGravar }: { maq: Partial<MaquinaLoja>; onClose: () => void; onGravar: (x: Record<string, unknown>) => void }) {
  const [m, setM] = useState({ ...maq, valor_txt: maq.valor != null ? String(maq.valor).replace(".", ",") : "" });
  const set = (k: string, v: unknown) => setM((x) => ({ ...x, [k]: v }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onGravar({ id: maq.id, descricao: String(m.descricao ?? "").trim(), numero_serie: String(m.numero_serie ?? "").trim() || null, data_compra: m.data_compra || null,
      valor: numeroBR(m.valor_txt), situacao: m.situacao ?? "na_loja", observacao: String(m.observacao ?? "").trim() || null });
  };
  return (
    <Modal open onClose={onClose} title={maq.id ? "Editar máquina" : "Máquina da unidade"}>
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Máquina (modelo)" className="sm:col-span-2"><input className="input" required minLength={2} maxLength={160} value={m.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex.: Máquina de sorvete soft 2 sabores" autoFocus /></Field>
        <Field label="Nº de série"><input className="input" maxLength={60} value={m.numero_serie ?? ""} onChange={(e) => set("numero_serie", e.target.value)} /></Field>
        <Field label="Data da compra"><input className="input" type="date" value={m.data_compra ?? ""} onChange={(e) => set("data_compra", e.target.value)} /></Field>
        <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={m.valor_txt} onChange={(e) => set("valor_txt", e.target.value)} placeholder="opcional" /></Field>
        <Field label="Situação"><select className="input" value={m.situacao ?? "na_loja"} onChange={(e) => set("situacao", e.target.value)}>{SITUACOES_MAQUINA.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Field>
        <Field label="Observação" className="sm:col-span-2"><input className="input" maxLength={500} value={m.observacao ?? ""} onChange={(e) => set("observacao", e.target.value)} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}

function CustoModal({ custo, onClose, onGravar }: { custo: Partial<CustoLoja>; onClose: () => void; onGravar: (x: Record<string, unknown>) => void }) {
  const [c, setC] = useState({ ...custo, valor_txt: custo.valor != null ? String(custo.valor).replace(".", ",") : "" });
  const set = (k: string, v: unknown) => setC((x) => ({ ...x, [k]: v }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const valor = numeroBR(c.valor_txt);
    if (!(valor && valor > 0)) return notifyError(new Error("Informe o valor."));
    onGravar({ id: custo.id, data: c.data, categoria: c.categoria ?? "outros", descricao: String(c.descricao ?? "").trim() || null, valor, observacao: String(c.observacao ?? "").trim() || null });
  };
  return (
    <Modal open onClose={onClose} title={custo.id ? "Editar custo" : "Custo de montar a unidade"}>
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="O quê"><select className="input" value={c.categoria ?? "outros"} onChange={(e) => set("categoria", e.target.value)}>{CATEGORIAS_CUSTO.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}</select></Field>
        <Field label="Data"><input className="input" type="date" required value={c.data ?? ""} onChange={(e) => set("data", e.target.value)} /></Field>
        <Field label="Valor (R$)"><input className="input" inputMode="decimal" required value={c.valor_txt} onChange={(e) => set("valor_txt", e.target.value)} placeholder="0,00" autoFocus /></Field>
        <Field label="Descrição"><input className="input" maxLength={300} value={c.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex.: quiosque 3×5 m, 2 máquinas…" /></Field>
        <Field label="Observação" className="sm:col-span-2"><input className="input" maxLength={500} value={c.observacao ?? ""} onChange={(e) => set("observacao", e.target.value)} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}

/** Aba Custos de montar: todas as unidades, com o total por categoria e por unidade. */
export function CustosAba({ dados, onAbrir }: { dados: Dados; onAbrir: (l: Loja) => void }) {
  const validos = dados.custos.filter((c) => !c.anulado);
  const total = validos.reduce((t, c) => t + Number(c.valor), 0);
  const porLoja = useMemo(() => dados.lojas.map((l) => ({ l, r: resumoUnidade(l.id, dados.custos, dados.maquinas, dados.pagamentos) }))
    .filter((x) => x.r.custo > 0 || x.r.recebido > 0).sort((a, b) => b.r.custo - a.r.custo), [dados]);
  const cats = CATEGORIAS_CUSTO.map((k) => ({ ...k, valor: validos.filter((c) => c.categoria === k.id).reduce((t, c) => t + Number(c.valor), 0) })).filter((k) => k.valor > 0);
  return (
    <div className="space-y-4">
      {/* rosa da marca com letra branca: igual nos dois temas */}
      <div className="rounded-2xl p-4 text-white shadow-card" style={{ background: `linear-gradient(135deg, ${ROSA}, #6d0d33)` }}>
        <div className="text-sm font-semibold opacity-90">Quanto custou montar as unidades</div>
        <div className="num text-2xl font-bold">{brl(total)}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{cats.map((k) => <span key={k.id} className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">{k.nome} <span className="num">{brl(k.valor)}</span></span>)}</div>
        {!cats.length && <p className="mt-1 text-sm opacity-90">Abra uma unidade e lance os custos de montar (máquinas, quiosque, insumos, PDV, montagem, uniformes, comunicação, inauguração).</p>}
      </div>
      {porLoja.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface">
          {porLoja.map(({ l, r }) => (
            <li key={l.id}><button type="button" onClick={() => onAbrir(l)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-slate-50">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDaLoja(l.cor) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-semibold text-fg">{l.nome}</span>
              <span className="num text-xs text-slate-500">custo {brl(r.custo)} · recebido {brl(r.recebido)}</span>
              <span className={`num font-bold ${r.saldo >= 0 ? "text-emerald-700" : "text-red-700"}`}>{r.saldo >= 0 ? "+" : "−"}{brl(Math.abs(r.saldo))}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Aba Máquinas: todas as máquinas das unidades, com a data da compra. */
export function MaquinasAba({ dados, onAbrir }: { dados: Dados; onAbrir: (l: Loja) => void }) {
  const lojaDe = (id: string) => dados.lojas.find((l) => l.id === id);
  const lista = [...dados.maquinas].sort((a, b) => (b.data_compra ?? "").localeCompare(a.data_compra ?? ""));
  if (!lista.length) return <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhuma máquina cadastrada. Abra uma unidade e use "+ Máquina" (modelo, nº de série e data da compra).</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-surface">
      {lista.map((m) => {
        const l = lojaDe(m.loja_id);
        return (
          <li key={m.id}><button type="button" onClick={() => l && onAbrir(l)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-slate-50">
            <Wrench size={14} className="shrink-0" style={{ color: corDaLoja(l?.cor) }} aria-hidden />
            <span className="min-w-0 flex-1"><span className="block font-semibold text-fg">{m.descricao}</span><span className="text-xs text-slate-500">{l?.nome ?? "—"}{m.numero_serie ? ` · nº ${m.numero_serie}` : ""}</span></span>
            <span className="text-xs text-slate-600">{m.data_compra ? `comprada em ${dataBR(m.data_compra)}` : "sem data da compra"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-bold text-slate-700">{SITUACOES_MAQUINA.find((s) => s.id === m.situacao)?.nome}</span>
          </button></li>
        );
      })}
    </ul>
  );
}

