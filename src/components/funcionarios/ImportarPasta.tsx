// Importar pasta: escolhe uma pasta do computador organizada como <Pessoa>/<Divisão>/arquivos (ex.: a pasta
// "ERP – Pastas dos funcionários" baixada do Drive) e guarda cada arquivo na pasta da pessoa, na divisão certa.
// Mostra o resumo antes de gravar; o que já está guardado (mesmo nome, pessoa e divisão) não entra de novo.
import { useMemo, useRef, useState } from "react";
import { FolderInput } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { enviarDocumentos } from "@/components/Anexos";
import { useInvalidate } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { pl } from "@/lib/format";
import { PASTAS, planejarImportacao, type ItemImportacao } from "@/lib/pastaFuncionario";

type Pessoa = { id: string; nome: string; apelido: string | null };
type Plano = ReturnType<typeof planejarImportacao> & { arquivos: File[] };

export function ImportarPasta({ pessoas }: { pessoas: Pessoa[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState<{ feitos: number; total: number } | null>(null);
  const invalidar = useInvalidate();

  async function escolher(lista: FileList | null) {
    if (!lista?.length) return;
    setLendo(true);
    try {
      const arquivos = [...lista];
      // o que já está guardado, lido agora do banco (só nome, pessoa e divisão)
      const { data, error } = await supabase.from("documentos").select("entidade_id, nome, pasta").eq("entidade", "funcionario");
      if (error) return notifyError(error);
      const r = planejarImportacao(arquivos.map((f) => ({ caminho: f.webkitRelativePath || f.name })), pessoas, data ?? []);
      setPlano({ ...r, arquivos });
    } finally { setLendo(false); }
  }

  // resumo: por pessoa, quantos arquivos em cada divisão
  const resumo = useMemo(() => {
    const m = new Map<string, { pessoa: string; porPasta: Record<string, number> }>();
    for (const it of plano?.itens ?? []) {
      const r = m.get(it.pessoaId) ?? { pessoa: it.pessoa, porPasta: {} };
      r.porPasta[it.pasta] = (r.porPasta[it.pasta] ?? 0) + 1;
      m.set(it.pessoaId, r);
    }
    return [...m.values()].sort((a, b) => a.pessoa.localeCompare(b.pessoa));
  }, [plano]);

  async function gravar() {
    if (!plano || gravando) return;
    // um envio por pessoa e divisão; se parar no meio, o que já foi fica guardado e importar de novo não repete
    const grupos = new Map<string, ItemImportacao[]>();
    for (const it of plano.itens) grupos.set(`${it.pessoaId}|${it.pasta}`, [...(grupos.get(`${it.pessoaId}|${it.pasta}`) ?? []), it]);
    const total = plano.itens.length;
    let feitos = 0, guardados = 0;
    setGravando({ feitos, total });
    try {
      for (const itens of grupos.values()) {
        guardados += await enviarDocumentos("funcionario", itens[0].pessoaId, itens.map((i) => plano.arquivos[i.indice]), itens[0].pasta);
        feitos += itens.length;
        setGravando({ feitos, total });
      }
      const falhas = total - guardados;
      notify(`${guardados} ${pl(guardados, "arquivo guardado", "arquivos guardados")}${falhas ? `; ${falhas} não ${pl(falhas, "entrou", "entraram")} (veja os avisos)` : ""}`, falhas ? "erro" : undefined);
      setPlano(null);
    } finally {
      setGravando(null);
      invalidar("documentos");
    }
  }

  return (
    <>
      <Button variant="secondary" disabled={lendo} onClick={() => input.current?.click()}>
        <FolderInput size={16} /> {lendo ? "Lendo a pasta…" : "Importar pasta"}
      </Button>
      {/* webkitdirectory: o navegador deixa escolher uma pasta inteira e diz o caminho de cada arquivo */}
      <input ref={input} type="file" multiple className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => { escolher(e.target.files); e.target.value = ""; }} />
      <Modal open={!!plano} onClose={() => !gravando && setPlano(null)} title="Importar pasta" wide>
        {plano && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              A pasta precisa ter uma subpasta por pessoa (com o nome do cadastro ou o apelido) e, dentro, uma por divisão
              (Contrato, Exames, Férias, Holerites, Atestados, Outros). Arquivo fora de uma divisão vai para Outros.
            </p>
            {resumo.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full">
                  <thead className="bg-slate-50 text-left text-xs text-slate-600">
                    <tr><th className="px-3 py-2">Pessoa</th>{PASTAS.map((p) => <th key={p.value} className="px-2 py-2 text-center">{p.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumo.map((r) => (
                      <tr key={r.pessoa}>
                        <td className="px-3 py-1.5 font-semibold text-fg">{r.pessoa}</td>
                        {PASTAS.map((p) => <td key={p.value} className="px-2 py-1.5 text-center">{r.porPasta[p.value] ?? <span className="text-slate-300">—</span>}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="font-semibold text-fg">Nenhum arquivo novo para guardar.</p>}
            {plano.repetidos > 0 && <p className="text-slate-600">{plano.repetidos} {pl(plano.repetidos, "arquivo já estava guardado e fica", "arquivos já estavam guardados e ficam")} de fora.</p>}
            {plano.semPessoa.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                Pastas sem pessoa no cadastro (ficam de fora): {plano.semPessoa.join(", ")}. Cadastre a pessoa em Equipe ou
                renomeie a pasta com o nome do cadastro e importe de novo.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={!!gravando} onClick={() => setPlano(null)}>Cancelar</Button>
              <Button disabled={!plano.itens.length || !!gravando} aria-busy={!!gravando || undefined} onClick={gravar}>
                {gravando ? `Guardando ${gravando.feitos} de ${gravando.total}…` : `Guardar ${plano.itens.length} ${pl(plano.itens.length, "arquivo", "arquivos")}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
