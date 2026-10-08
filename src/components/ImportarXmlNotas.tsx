// Notas fiscais → Importar XML: lê os XML (soltos ou dentro do .zip que o Tiny exporta) e manda em lotes.
//  - emitidas: notas que a MF emitiu em outro sistema; entram só como registro (com o XML para o contador).
//  - recebidas: notas de fornecedor; as anteriores ao início do ERP ficam como histórico (sem contas e sem estoque),
//    as mais novas seguem o fluxo normal (contas a pagar e entrada no estoque).
import { useState } from "react";
import { unzipSync } from "fflate";
import { CheckCircle2, FileArchive } from "lucide-react";
import { Button, Modal } from "./ui";
import { callFunction } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { dataBR } from "@/lib/format";
import { notifyError } from "@/lib/notify";

export type TipoImportacao = "emitidas" | "recebidas";
type Resultado = {
  arquivo: string; situacao: "importada" | "atualizada" | "cancelada" | "ignorada" | "erro";
  numero?: string; mensagem?: string; processamento?: string; cancelada?: boolean;
};
type Arquivo = { nome: string; xml: string };
const LOTE = 25;
const ehEvento = (a: Arquivo) => /<procEventoNFe[\s>]/.test(a.xml);

/** XML soltos e os de dentro dos .zip; eventos (cancelamentos) por último, depois das notas. */
async function lerArquivos(arquivos: File[]): Promise<Arquivo[]> {
  const texto = new TextDecoder("utf-8");
  const lidos: Arquivo[] = [];
  for (const f of arquivos) {
    if (/\.zip$/i.test(f.name)) {
      const conteudo = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => /\.xml$/i.test(e.name) });
      for (const [nome, dados] of Object.entries(conteudo)) lidos.push({ nome: nome.split("/").pop()!, xml: texto.decode(dados) });
    } else if (/\.xml$/i.test(f.name)) {
      lidos.push({ nome: f.name, xml: await f.text() });
    }
  }
  return lidos.sort((a, b) => Number(ehEvento(a)) - Number(ehEvento(b)));
}

const TEXTOS = {
  emitidas: {
    titulo: "Importar NF-e emitidas (Tiny ou outro sistema)",
    explica: <>Traz para a lista as notas que a MF já emitiu em outro sistema, com o XML (vai no pacote do contador).
      No Tiny, em <b>Notas fiscais</b>, filtre o período, selecione as notas e baixe os <b>XML</b> (vem um arquivo .zip).
      Pode mandar o .zip inteiro ou os XML soltos, inclusive os de cancelamento.</>,
    rodape: "As notas entram só como registro: não baixam estoque, não lançam contas a receber e não avisam o cliente.",
  },
  recebidas: {
    titulo: "Importar NF-e de fornecedores (XML)",
    explica: <>Mande o XML que o fornecedor enviou ou o <b>.zip</b> com as notas de entrada exportadas do Tiny.
      Quem já está no ERP é atualizado, não duplica; o fornecedor que faltar é cadastrado pelo CNPJ.</>,
    rodape: "",
  },
};

export function ImportarXmlNotas({ tipo, onClose }: { tipo: TipoImportacao; onClose: () => void }) {
  const { data: config } = useConfig();
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [feitos, setFeitos] = useState(0);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const invalidar = useInvalidate();
  const desde = config?.recebidas_processar_desde as string | undefined;
  const t = TEXTOS[tipo];

  async function escolher(lista: FileList | null) {
    if (!lista?.length) return;
    setOcupado("ler");
    try { setArquivos(await lerArquivos(Array.from(lista))); } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  async function importar() {
    if (!arquivos) return;
    setOcupado("importar");
    const todos: Resultado[] = [];
    try {
      for (let i = 0; i < arquivos.length; i += LOTE) {
        const lote = arquivos.slice(i, i + LOTE);
        const xmls = lote.map((a) => a.xml);
        const r = tipo === "emitidas"
          ? await callFunction<{ resultados: Omit<Resultado, "arquivo">[] }>("nfe-consultar", { acao: "importar_xml", xmls })
          : await callFunction<{ resultados: Omit<Resultado, "arquivo">[] }>("nfe-recebidas-sync", { acao: "importar_xmls", xmls });
        r.resultados.forEach((x, j) => todos.push({ ...x, arquivo: lote[j].nome }));
        setFeitos(Math.min(arquivos.length, i + LOTE));
      }
    } catch (e) {
      notifyError(e); // o que já entrou fica: importar de novo só atualiza
    } finally {
      setOcupado("");
      if (todos.length) setResultados(todos);
      invalidar("notas_fiscais", "nfe_recebidas", "fornecedores", "contas_pagar");
    }
  }

  if (resultados) {
    const ok = resultados.filter((r) => ["importada", "atualizada", "cancelada"].includes(r.situacao));
    const conta = (f: (r: Resultado) => boolean) => ok.filter(f).length;
    const problemas = resultados.filter((r) => r.situacao === "ignorada" || r.situacao === "erro");
    const historico = conta((r) => r.processamento === "ignorada" && !r.cancelada);
    const processadas = conta((r) => !!r.processamento && r.processamento !== "ignorada");
    return (
      <Modal open onClose={onClose} title="Importação concluída">
        <div className="space-y-3 text-[15px]">
          <p className="flex items-center gap-2 font-semibold text-emerald-700">
            <CheckCircle2 size={22} /> {conta((r) => r.situacao === "importada")} nota(s) nova(s) na lista.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            {conta((r) => r.situacao === "atualizada") > 0 && <li>{conta((r) => r.situacao === "atualizada")} já estavam no ERP e foram atualizadas</li>}
            {conta((r) => r.situacao === "cancelada" || !!r.cancelada) > 0 && <li>{conta((r) => r.situacao === "cancelada" || !!r.cancelada)} canceladas (marcadas assim)</li>}
            {tipo === "recebidas" && historico > 0 && (
              <li>{historico} emitidas antes do início do ERP{desde ? ` (${dataBR(desde)})` : ""} entraram como <b>histórico</b>: não geram contas a pagar nem entrada no estoque (já foram lançadas no Tiny)</li>
            )}
            {tipo === "recebidas" && processadas > 0 && <li>{processadas} recentes seguiram o fluxo normal (contas a pagar e estoque): confira a coluna Processamento</li>}
            {problemas.length > 0 && <li className="text-amber-700">{problemas.length} arquivo(s) não entraram:</li>}
          </ul>
          {problemas.length > 0 && (
            <ul className="max-h-48 space-y-0.5 overflow-auto rounded-lg border border-slate-200 p-2 text-xs text-slate-600">
              {problemas.slice(0, 100).map((r, i) => <li key={i}>{r.numero ? `NF ${r.numero}` : r.arquivo}: {r.mensagem}</li>)}
            </ul>
          )}
          <p className="text-sm text-slate-500">Importar os mesmos arquivos de novo não duplica.</p>
          <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
    );
  }

  const eventos = arquivos?.filter(ehEvento).length ?? 0;
  const notas = (arquivos?.length ?? 0) - eventos;
  return (
    <Modal open onClose={ocupado === "importar" ? () => undefined : onClose} title={t.titulo}>
      {!arquivos ? (
        <div className="space-y-4">
          <p className="text-[15px] text-slate-700">{t.explica}</p>
          {tipo === "recebidas" && desde && (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
              Notas emitidas antes de <b>{dataBR(desde)}</b> (início do ERP) entram como histórico: ficam na lista e no pacote do contador,
              mas <b>não</b> lançam contas a pagar nem estoque, porque isso já foi feito no Tiny.
            </p>
          )}
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
            <FileArchive size={36} className="text-brand" />
            <span className="font-semibold">{ocupado ? "Lendo os arquivos…" : "Escolher .zip ou XML"}</span>
            <input type="file" accept=".zip,.xml,application/zip,text/xml,application/xml" multiple className="hidden" onChange={(e) => escolher(e.target.files)} />
          </label>
          {t.rodape && <p className="text-xs text-slate-500">{t.rodape}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px] text-slate-700">
            {arquivos.length ? <>Encontrados <b>{notas}</b> XML de nota{eventos ? <> e <b>{eventos}</b> de evento (cancelamento)</> : null}.</> : "Nenhum XML encontrado nos arquivos."}
          </p>
          {ocupado === "importar" && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand transition-all" style={{ width: `${(feitos / arquivos.length) * 100}%` }} /></div>
              <p className="mt-1 text-xs text-slate-500">{feitos} de {arquivos.length}… pode levar alguns minutos; deixe esta janela aberta.</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setArquivos(null)} disabled={!!ocupado}>Outros arquivos</Button>
            <Button onClick={importar} disabled={!!ocupado || !arquivos.length}>{ocupado ? "Importando…" : `Importar ${arquivos.length} arquivo(s)`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
