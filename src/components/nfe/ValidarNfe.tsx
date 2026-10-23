// Validador de NF-e na tela: abre com o XML de uma nota (emitida ou recebida) ou com arquivos XML que a pessoa escolhe.
// As regras ficam em src/lib/validadorNfe.ts; aqui só a janela, o selo da lista e a gravação do último resultado.
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCode2, FileSearch, ListChecks, PenLine, ShieldCheck, Upload, XCircle } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Achado, Grupo, Nivel, ResultadoValidacao } from "@/lib/validadorNfe";

const GRUPOS: { id: Grupo; titulo: string; dica: string; Icone: typeof FileCode2 }[] = [
  { id: "estrutura", titulo: "Estrutura oficial", dica: "XML conferido com os esquemas (XSD) do Portal Nacional da NF-e", Icone: FileCode2 },
  { id: "assinatura", titulo: "Assinatura digital", dica: "o XML não foi mexido depois de assinado e o certificado é da empresa", Icone: PenLine },
  { id: "protocolo", titulo: "Autorização da SEFAZ", dica: "protocolo de autorização desta chave e deste conteúdo", Icone: ShieldCheck },
  { id: "regras", titulo: "Regras de rejeição", dica: "chave, CFOP, NCM, GTIN, totais e pagamento (Manual de Orientação do Contribuinte)", Icone: ListChecks },
];

const COR: Record<Nivel, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  alerta: "border-amber-200 bg-amber-50 text-amber-800",
  erro: "border-red-200 bg-red-50 text-red-800",
};
const TITULO: Record<Nivel, string> = { ok: "Nota válida", alerta: "Válida, com alertas", erro: "Nota com erros" };

function IconeNivel({ n, size = 16 }: { n: Nivel; size?: number }) {
  if (n === "ok") return <CheckCircle2 size={size} className="shrink-0 text-emerald-600" />;
  if (n === "alerta") return <AlertTriangle size={size} className="shrink-0 text-amber-600" />;
  return <XCircle size={size} className="shrink-0 text-red-600" />;
}

/** Selo pequeno da lista: a última validação da chave. */
export function SeloValidacao({ nivel, quando }: { nivel?: Nivel; quando?: string }) {
  if (!nivel) return null;
  const rotulo = { ok: "validada", alerta: "alertas", erro: "com erros" }[nivel];
  return (
    <span title={`Validador de NF-e: ${TITULO[nivel].toLowerCase()}${quando ? ` (${new Date(quando).toLocaleDateString("pt-BR")})` : ""}`}
      className={`mt-0.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-semibold ${COR[nivel]}`}>
      <IconeNivel n={nivel} size={11} /> {rotulo}
    </span>
  );
}

/** Mapa chave → última validação, para os selos das listas. */
export function useValidacoes() {
  const { data = [] } = useRows<{ chave: string; nivel: Nivel; validado_em: string }>("nfe_validacoes", { select: "chave,nivel,validado_em", order: "validado_em" });
  return new Map(data.map((v) => [v.chave, v]));
}

async function validar(xml: string, situacaoErp?: string | null) {
  const { validarNfe } = await import("@/lib/validadorNfe");
  return validarNfe(xml, { situacaoErp });
}

function Resultado({ r, nome }: { r: ResultadoValidacao; nome?: string }) {
  return (
    <div className="space-y-3">
      <div className={`flex items-start gap-3 rounded-2xl border p-3 ${COR[r.nivel]}`}>
        <IconeNivel n={r.nivel} size={26} />
        <div className="min-w-0">
          <p className="font-display text-base font-bold">{TITULO[r.nivel]}</p>
          <p className="text-sm">
            {[r.numero && `NF ${r.numero}`, r.emitente, r.valor != null && brl(r.valor)].filter(Boolean).join(" · ") || nome}
          </p>
          {r.chave && <p className="break-all font-mono text-2xs opacity-80">{r.chave}</p>}
        </div>
      </div>
      {GRUPOS.map(({ id, titulo, dica, Icone }) => {
        const itens = r.achados.filter((a) => a.grupo === id);
        if (!itens.length) return null;
        const pior: Nivel = itens.some((a) => a.nivel === "erro") ? "erro" : itens.some((a) => a.nivel === "alerta") ? "alerta" : "ok";
        return (
          <section key={id} className="cartao p-3">
            <header className="mb-2 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-slate-600"><Icone size={16} /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{titulo}</p><p className="truncate text-2xs text-slate-500">{dica}</p></div>
              <IconeNivel n={pior} size={18} />
            </header>
            <ul className="space-y-1.5">
              {itens.map((a: Achado, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <IconeNivel n={a.nivel} size={15} />
                  <span className="min-w-0 flex-1 break-words">{a.texto}</span>
                  {a.codigo && a.nivel !== "ok" && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-2xs text-slate-600" title="Código de rejeição da SEFAZ">{a.codigo}</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Janela do validador. Com `obterXml`, valida a nota aberta; sem ele, a pessoa escolhe um ou mais arquivos XML.
 * `situacaoErp` é o que o ERP já sabe da SEFAZ (ex.: nota recebida cancelada pelo fornecedor).
 */
export function ValidarNfe({ obterXml, situacaoErp, onClose }: { obterXml?: () => Promise<string | null>; situacaoErp?: string | null; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [resultados, setResultados] = useState<{ nome: string; r: ResultadoValidacao }[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar(lista: { nome: string; xml: string }[]) {
    setOcupado(true); setErro(null);
    try {
      const saida: { nome: string; r: ResultadoValidacao }[] = [];
      for (const { nome, xml } of lista) saida.push({ nome, r: await validar(xml, situacaoErp) });
      setResultados(saida);
      // guarda o último resultado de cada chave (selo da lista); quem só lê (contador) não grava
      const linhas = saida.filter((s) => s.r.chave).map((s) => ({ chave: s.r.chave, nivel: s.r.nivel, achados: s.r.achados, validado_em: new Date().toISOString() }));
      if (linhas.length) {
        const { error } = await supabase.from("nfe_validacoes").upsert(linhas);
        if (!error) invalidate("nfe_validacoes");
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => {
    if (!obterXml) return;
    setOcupado(true);
    obterXml().then((xml) => {
      if (xml) return rodar([{ nome: "nota", xml }]);
      setErro("Não achei o XML desta nota.");
      setOcupado(false);
    }, (e) => { setErro((e as Error).message); setOcupado(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function escolher(files: FileList | null) {
    if (!files?.length) return;
    rodar(await Promise.all(Array.from(files).map(async (f) => ({ nome: f.name, xml: await f.text() }))));
  }

  return (
    <Modal open onClose={onClose} title="Validador de NF-e" wide>
      <div className="space-y-4">
        {!obterXml && (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-brand">
            <Upload size={26} className="text-slate-400" />
            <span className="text-sm font-semibold">Escolher XML de NF-e</span>
            <span className="text-xs text-slate-500">um ou vários arquivos .xml (emitidas ou de fornecedores)</span>
            <input type="file" accept=".xml,text/xml,application/xml" multiple className="sr-only" onChange={(e) => escolher(e.target.files)} />
          </label>
        )}
        {ocupado && <p className="flex items-center gap-2 text-sm text-slate-500"><FileSearch size={16} className="animate-pulse" /> Conferindo com as regras da SEFAZ…</p>}
        {erro && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
        {resultados.length > 1 && (
          <p className="text-sm text-slate-600">
            {resultados.length} notas: {resultados.filter((x) => x.r.nivel === "ok").length} válidas · {resultados.filter((x) => x.r.nivel === "alerta").length} com alertas · {resultados.filter((x) => x.r.nivel === "erro").length} com erros
          </p>
        )}
        {resultados.map(({ nome, r }, i) => resultados.length > 1
          ? <details key={i} open={r.nivel === "erro"} className="rounded-2xl border border-slate-200 p-2"><summary className="flex cursor-pointer items-center gap-2 p-1 text-sm font-semibold"><IconeNivel n={r.nivel} /> {r.numero ? `NF ${r.numero}` : nome} <span className="font-normal text-slate-500">{r.emitente}</span></summary><div className="mt-2"><Resultado r={r} nome={nome} /></div></details>
          : <Resultado key={i} r={r} nome={nome} />)}
        <p className="text-2xs text-slate-500">
          Regras: esquemas oficiais da NF-e 4.00 (pacote PL_010, com a Reforma), assinatura XMLDSig e Manual de Orientação do Contribuinte.
          A situação atual na SEFAZ (ex.: cancelamento depois da autorização) vem do que o ERP recebeu da SEFAZ pela Focus.
        </p>
        <div className="flex justify-end gap-2">
          {!obterXml && resultados.length > 0 && <Button variant="secondary" onClick={() => setResultados([])}>Validar outros</Button>}
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}
