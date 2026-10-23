// "Enviar XML dos CT-e": os CT-e antigos (a SEFAZ só distribui os últimos 3 meses) entram pelo XML que a
// transportadora (portal ou e-mail) ou o contador mandam. Aceita vários .xml ou um .zip; cada um é lido aqui
// (_shared/cte-xml.ts) e gravado pela mesma rotina da busca automática (importar_cte_xml → salvar_cte_sefaz).
import { useRef, useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { notify } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { dadosSalvarCte, lerCte } from "../../../supabase/functions/_shared/cte-xml";

type Resumo = { lidos: number; gravados: number; erros: string[] };

async function xmlsDosArquivos(arquivos: File[]) {
  const xmls: { nome: string; xml: string }[] = [];
  for (const f of arquivos) {
    if (/\.zip$/i.test(f.name)) {
      const conteudo = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => /\.xml$/i.test(e.name) });
      for (const [nome, bytes] of Object.entries(conteudo)) xmls.push({ nome, xml: strFromU8(bytes) });
    } else if (/\.xml$/i.test(f.name)) xmls.push({ nome: f.name, xml: await f.text() });
  }
  return xmls;
}

export function ImportarCteXml() {
  const invalidar = useInvalidate();
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [r, setR] = useState<Resumo | null>(null);

  async function enviar(arquivos: File[]) {
    if (!arquivos.length) return;
    setEnviando(true); setR(null);
    const res: Resumo = { lidos: 0, gravados: 0, erros: [] };
    try {
      for (const { nome, xml } of await xmlsDosArquivos(arquivos)) {
        // XML de nota ou de evento no meio do pacote: pula sem contar como erro
        if (!/<(\w+:)?infCte\b/.test(xml)) continue;
        res.lidos++;
        try {
          const lido = lerCte(xml);
          const { error } = await supabase.rpc("importar_cte_xml", { p_dados: dadosSalvarCte(lido, xml, "autorizado") });
          if (error) throw error;
          res.gravados++;
        } catch (e) { res.erros.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      setR(res);
      if (res.gravados) invalidar("ctes", "cte_faturas");
      notify(res.lidos ? `${res.gravados} de ${res.lidos} CT-e gravados` : "Nenhum CT-e nos arquivos", res.erros.length || !res.lidos ? "erro" : undefined);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "erro");
    } finally {
      setEnviando(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept=".xml,.zip" multiple className="hidden" onChange={(e) => enviar([...(e.target.files ?? [])])} />
      <Button type="button" variant="secondary" onClick={() => ref.current?.click()} disabled={enviando} carregando={enviando}
        title="CT-e antigos: XML ou ZIP do portal da transportadora ou do contador (a SEFAZ só guarda os últimos 3 meses)">
        <Upload size={15} /> {enviando ? "Gravando os CT-e…" : "Enviar XML dos CT-e"}
      </Button>
      {r && (
        <div className="text-xs text-slate-600">
          {r.gravados} de {r.lidos} CT-e gravados (o que já existia foi completado, sem repetir).
          {r.erros.length > 0 && <ul className="mt-1 list-disc pl-4 text-red-700">{r.erros.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
