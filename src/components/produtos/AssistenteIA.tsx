// "Preencher com IA" no cadastro do produto (Auto-Fill e Elaborator): a partir do nome, da foto e do PDF do fornecedor,
// sugere título, palavras-chave, textos de venda, categoria, marca, modelo, campos técnicos e canais. A pessoa vê o que
// muda campo a campo, marca o que quer e o formulário é preenchido; só grava ao salvar o produto.
import { useRef, useState } from "react";
import { AlertTriangle, FileText, Image as Imagem, Sparkles, X } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { callFunction } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { urlFotoProduto } from "@/lib/catalogo";
import { linhasDaSugestao, sugestaoLocal, valorParaForm, type LinhaAuto, type SugestaoIA } from "@/lib/autoFill";
import type { ProdutoAnuncio } from "@/lib/marketplace";
import { CAMPOS_MEDIDA, LIMITE_ARQUIVO, TIPOS_IMAGEM } from "../../../supabase/functions/_shared/ia-produto";

type Arquivo = { nome: string; tipo: string; base64: string; url?: string };
type Resultado = { sugestao: SugestaoIA; origem: "ia" | "regras"; motivo?: string; modelo?: string };

const CONF: Record<string, string> = { alta: "bg-emerald-100 text-emerald-800", media: "bg-amber-100 text-amber-800", baixa: "bg-rose-100 text-rose-800" };
const NOME_CONF: Record<string, string> = { alta: "confiança alta", media: "confiança média", baixa: "conferir" };

function lerArquivo(f: File): Promise<Arquivo> {
  return new Promise((ok, falhou) => {
    const r = new FileReader();
    r.onload = () => ok({ nome: f.name, tipo: f.type, base64: String(r.result).split(",")[1] ?? "", url: f.type.startsWith("image/") ? String(r.result) : undefined });
    r.onerror = () => falhou(r.error);
    r.readAsDataURL(f);
  });
}

/** Texto curto de um valor para mostrar na comparação. */
function mostrar(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "object" && x ? `${(x as any).nome}: ${(x as any).valor}` : String(x))).join(" · ") : "—";
  return String(v);
}

export function AssistenteIA({ row, setCampo, produtos, garantiaPadrao }: {
  row: Record<string, any>; setCampo: (campo: string, valor: unknown) => void;
  produtos: { id?: string; descricao: string; categoria?: string | null }[]; garantiaPadrao: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [usarFoto, setUsarFoto] = useState(true);
  const [foto, setFoto] = useState<Arquivo | null>(null);
  const [pdf, setPdf] = useState<Arquivo | null>(null);
  const [gerando, setGerando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [linhas, setLinhas] = useState<(LinhaAuto & { marcada: boolean })[]>([]);
  const inFoto = useRef<HTMLInputElement>(null);
  const inPdf = useRef<HTMLInputElement>(null);
  const nome = String(row.descricao ?? "").trim();

  async function escolher(f: File | undefined, tipo: "foto" | "pdf") {
    if (!f) return;
    if (f.size > LIMITE_ARQUIVO) return notify(`${f.name}: maior que 8 MB`, "erro");
    if (tipo === "foto" && !(TIPOS_IMAGEM as readonly string[]).includes(f.type)) return notify("A foto precisa ser JPG, PNG, WEBP ou GIF", "erro");
    if (tipo === "pdf" && f.type !== "application/pdf") return notify("O arquivo precisa ser PDF (ficha técnica, catálogo ou manual)", "erro");
    const a = await lerArquivo(f);
    if (tipo === "foto") setFoto(a); else setPdf(a);
  }

  async function gerar() {
    setGerando(true);
    const produto = {
      descricao: nome, tipo: row.tipo, sku: row.sku, marca: row.marca, modelo: row.modelo, categoria: row.categoria, codigo_fabricante: row.codigo_fabricante,
      titulo_anuncio: row.titulo_anuncio, descricao_catalogo: row.descricao_catalogo, descricao_anuncio: row.descricao_anuncio,
      palavras_chave: Array.isArray(row.palavras_chave) ? row.palavras_chave : String(row.palavras_chave ?? "").split(",").map((x) => x.trim()).filter(Boolean),
      especificacoes: row.especificacoes, garantia_meses: row.garantia_meses === "" ? null : row.garantia_meses, no_catalogo: row.no_catalogo, vendavel: row.vendavel,
      ncm: row.ncm || null, ...Object.fromEntries(CAMPOS_MEDIDA.map((c) => [c, row[c] === "" || row[c] == null ? null : Number(row[c])])),
    };
    let r: Resultado;
    try {
      const d = await callFunction<{ sugestao: SugestaoIA; modelo: string }>("ia-produto", {
        produto,
        ...(foto ? { imagem: { tipo: foto.tipo, base64: foto.base64 } } : usarFoto && row.foto_caminho ? { foto_caminho: row.foto_caminho } : {}),
        ...(pdf ? { documento: { nome: pdf.nome, base64: pdf.base64 } } : {}),
      });
      r = { sugestao: d.sugestao, origem: "ia", modelo: d.modelo };
    } catch (e) {
      // IA desligada ou fora do ar: as regras do ERP fazem o que dá (sem ler foto nem PDF)
      r = { sugestao: sugestaoLocal({ ...row, palavras_chave: produto.palavras_chave } as ProdutoAnuncio, produtos, garantiaPadrao), origem: "regras", motivo: (e as Error).message };
    }
    setRes(r);
    setLinhas(linhasDaSugestao(row, r.sugestao));
    setGerando(false);
  }

  function aplicar() {
    const marcadas = linhas.filter((l) => l.marcada);
    for (const l of marcadas) setCampo(l.campo, valorParaForm(l));
    notify(marcadas.length ? `${marcadas.length} ${marcadas.length === 1 ? "campo preenchido" : "campos preenchidos"}: confira e salve o produto` : "Nada marcado");
    fechar();
  }
  function fechar() { setAberto(false); setRes(null); setLinhas([]); setFoto(null); setPdf(null); }

  const fotoAtual = foto?.url ?? (usarFoto && row.foto_caminho ? urlFotoProduto(row.foto_caminho) : null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
        <Sparkles size={18} className="shrink-0 text-violet-700" aria-hidden />
        <span className="min-w-0 flex-1 text-sm text-violet-900">Escreveu o nome? A IA preenche palavras-chave, textos de venda, categoria, campos técnicos, código do fabricante, NCM, peso e medidas (pode mandar foto e PDF do fornecedor).</span>
        <Button type="button" onClick={() => setAberto(true)} disabled={nome.length < 2} title={nome.length < 2 ? "Escreva o nome do produto primeiro" : undefined}>
          <Sparkles size={15} /> Preencher com IA
        </Button>
      </div>
      {aberto && (
        <Modal open onClose={fechar} title="Preencher com IA" wide>
          {!res ? (
            <div className="space-y-4 text-sm">
              <p className="text-slate-600">A IA lê o nome <b className="text-fg">{nome}</b>, os campos já preenchidos e, se você mandar, a foto e o PDF. Ela só sugere: você escolhe o que entra e salva o produto.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center gap-2 font-semibold text-fg"><Imagem size={16} aria-hidden /> Foto</div>
                  {fotoAtual ? <img src={fotoAtual} alt="" className="mb-2 h-28 w-full rounded-lg bg-slate-50 object-contain" /> : <p className="mb-2 text-xs text-slate-500">Sem foto: a IA usa só o texto.</p>}
                  <div className="flex flex-wrap gap-2">
                    {row.foto_caminho && !foto && (
                      <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={usarFoto} onChange={(e) => setUsarFoto(e.target.checked)} /> usar a foto principal</label>
                    )}
                    <input ref={inFoto} type="file" accept={TIPOS_IMAGEM.join(",")} className="hidden" onChange={(e) => escolher(e.target.files?.[0], "foto")} />
                    <Button type="button" variant="secondary" onClick={() => inFoto.current?.click()}>{foto ? "Trocar foto" : "Enviar outra foto"}</Button>
                    {foto && <button type="button" className="link-discreto text-xs" onClick={() => setFoto(null)}>tirar</button>}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center gap-2 font-semibold text-fg"><FileText size={16} aria-hidden /> PDF do fornecedor</div>
                  <p className="mb-2 text-xs text-slate-500">{pdf ? pdf.nome : "Ficha técnica, catálogo ou manual: a IA tira medidas, voltagem e compatibilidade de lá."}</p>
                  <input ref={inPdf} type="file" accept="application/pdf" className="hidden" onChange={(e) => escolher(e.target.files?.[0], "pdf")} />
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => inPdf.current?.click()}>{pdf ? "Trocar PDF" : "Enviar PDF"}</Button>
                    {pdf && <button type="button" className="link-discreto text-xs" onClick={() => setPdf(null)}>tirar</button>}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={fechar}>Cancelar</Button>
                <Button type="button" onClick={gerar} disabled={gerando}><Sparkles size={15} /> {gerando ? "Pensando…" : "Gerar sugestões"}</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${res.origem === "ia" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}>
                  {res.origem === "ia" ? "Sugestões da IA" : "Sugestões pelas regras do ERP"}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${res.sugestao.status === "pronto" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {res.sugestao.status === "pronto" ? "pronto para anunciar" : "rascunho: falta conferir"}
                </span>
              </div>
              {res.origem === "regras" && (
                <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  A IA não respondeu ({res.motivo}). Estas sugestões vêm das regras do ERP, que não leem foto nem PDF.</p>
              )}
              {res.sugestao.conferir.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <b>Conferir antes de salvar:</b>
                  <ul className="mt-1 list-disc pl-4">{res.sugestao.conferir.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
              )}
              {!linhas.length ? <p className="rounded-lg bg-emerald-50 px-3 py-3 text-emerald-900">O cadastro já está igual ao que a IA sugere. Nada a mudar.</p> : (
                <>
                  <div className="flex items-center gap-3 text-xs">
                    <button type="button" className="link-acao" onClick={() => setLinhas(linhas.map((l) => ({ ...l, marcada: true })))}>marcar todos</button>
                    <button type="button" className="link-acao" onClick={() => setLinhas(linhas.map((l) => ({ ...l, marcada: false })))}>desmarcar</button>
                    <span className="text-slate-500">{linhas.filter((l) => l.marcada).length} de {linhas.length} marcados</span>
                  </div>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {linhas.map((l, i) => (
                      <li key={l.campo} className="p-3">
                        <label className="flex cursor-pointer gap-2.5">
                          <input type="checkbox" className="mt-1" checked={l.marcada} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, marcada: e.target.checked } : x)))} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <b className="text-fg">{l.nome}</b>
                              {l.confianca && <span className={`rounded-full px-1.5 py-0.5 text-2xs font-bold ${CONF[l.confianca]}`}>{NOME_CONF[l.confianca]}</span>}
                              {l.aviso && <span className="text-2xs font-semibold text-amber-700">{l.aviso}</span>}
                            </span>
                            <span className="mt-1 block whitespace-pre-line break-words text-fg">{mostrar(l.sugerido)}</span>
                            {mostrar(l.atual) !== "—" && <span className="mt-1 block break-words text-xs text-slate-500 line-through decoration-slate-300">antes: {mostrar(l.atual).slice(0, 240)}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => { setRes(null); setLinhas([]); }}><X size={15} /> Gerar de novo</Button>
                <Button type="button" variant="secondary" onClick={fechar}>Cancelar</Button>
                <Button type="button" onClick={aplicar} disabled={!linhas.some((l) => l.marcada)}>Usar os marcados</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
