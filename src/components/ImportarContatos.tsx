// Clientes / Fornecedores → Importar: lê a planilha (do Tiny, de outro sistema ou exportada daqui),
// mostra o resumo e cadastra tudo de uma vez. Quem já existe (mesmo CPF/CNPJ) é atualizado, não duplica.
import { useState } from "react";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button, Modal } from "./ui";
import { lerPlanilhaContatos, type LeituraContatos, type TipoContato } from "@/lib/importarContatos";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notifyError } from "@/lib/notify";

const ROTULO: Record<TipoContato, string> = { cliente: "clientes", fornecedor: "fornecedores", transportadora: "transportadoras" };
const CAMPO: Record<string, string> = {
  id_externo: "ID do Tiny", nome: "nome / razão social", fantasia: "fantasia", tipo_pessoa: "tipo de pessoa", cpf_cnpj: "CPF/CNPJ",
  ie: "inscrição estadual", contribuinte: "contribuinte", email: "e-mail", fone: "telefone", celular: "celular/WhatsApp", cep: "CEP",
  endereco: "endereço", numero: "número", complemento: "complemento", bairro: "bairro", cidade: "cidade", uf: "UF", obs: "observações",
  tipos: "tipo de contato", situacao: "situação",
};
type Resultado = { clientes: number; fornecedores: number; transportadoras: number; atualizados: number };
const LOTE = 500;

export function ImportarContatos({ tipo, onClose }: { tipo: TipoContato; onClose: () => void }) {
  const [leitura, setLeitura] = useState<LeituraContatos | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const invalidar = useInvalidate();

  async function abrir(arquivo?: File) {
    if (!arquivo) return;
    setOcupado("ler");
    try { setLeitura(await lerPlanilhaContatos(arquivo, tipo)); } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  async function importar() {
    if (!leitura) return;
    setOcupado("importar");
    const total: Resultado = { clientes: 0, fornecedores: 0, transportadoras: 0, atualizados: 0 };
    let feitos = 0;
    try {
      for (let i = 0; i < leitura.itens.length; i += LOTE) {
        const { data, error } = await supabase.rpc("importar_contatos", { p_itens: leitura.itens.slice(i, i + LOTE) });
        if (error) throw error;
        for (const k of Object.keys(total) as (keyof Resultado)[]) total[k] += Number((data as Resultado)?.[k] ?? 0);
        feitos = Math.min(leitura.itens.length, i + LOTE);
        setProgresso(feitos);
      }
      setResultado(total);
    } catch (e) {
      notifyError(e);
      if (feitos) setResultado(total); // o que já entrou fica (importar de novo não duplica)
    } finally {
      setOcupado("");
      invalidar("clientes", "fornecedores", "transportadoras");
    }
  }

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Importação concluída">
        <div className="space-y-3 text-[15px]">
          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={22} /> Cadastros importados.</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            {resultado.clientes > 0 && <li>{resultado.clientes} clientes novos</li>}
            {resultado.fornecedores > 0 && <li>{resultado.fornecedores} fornecedores novos</li>}
            {resultado.transportadoras > 0 && <li>{resultado.transportadoras} transportadoras novas</li>}
            <li>{resultado.atualizados} cadastros que já existiam foram atualizados</li>
          </ul>
          <p className="text-sm text-slate-500">Importar a mesma planilha de novo só atualiza, sem duplicar.</p>
          <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
    );
  }

  const itens = leitura?.itens ?? [];
  const contar = (f: (i: LeituraContatos["itens"][number]) => boolean) => itens.filter(f).length;
  const porTipo = (["cliente", "fornecedor", "transportadora"] as TipoContato[])
    .map((t) => [t, contar((i) => i.tipos.includes(t))] as const).filter(([, n]) => n > 0);

  return (
    <Modal open onClose={onClose} title={`Importar ${ROTULO[tipo]}`} wide>
      {!leitura ? (
        <div className="space-y-4">
          <p className="text-[15px] text-slate-700">
            Escolha uma planilha do Excel (.xlsx, .xls) ou .csv com os {ROTULO[tipo]}. Serve a exportação do Tiny
            (<b>Cadastros → Clientes e Fornecedores → ⋯ → Exportar</b>), de outro sistema ou a do botão <b>Exportar</b> daqui.
            As colunas são reconhecidas pelo nome: nome ou razão social, fantasia, CPF/CNPJ, inscrição estadual, e-mail, telefone, celular,
            CEP, endereço, número, bairro, cidade, UF e observações.
          </p>
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
            <FileSpreadsheet size={36} className="text-brand" />
            <span className="font-semibold">{ocupado ? "Lendo a planilha…" : "Escolher planilha (.xls, .xlsx ou .csv)"}</span>
            <input type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Cadastros", itens.length], ["Com CPF/CNPJ", contar((i) => i.cpf_cnpj.length >= 11)], ["Com e-mail", contar((i) => !!i.email)], ["Com WhatsApp/telefone", contar((i) => !!(i.celular || i.fone))]].map(([r, v]) => (
              <div key={r} className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-fg">{v}</div><div className="text-xs text-slate-500">{r}</div></div>
            ))}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {porTipo.length > 1 && <li>Pela coluna de tipo: {porTipo.map(([t, n]) => `${n} ${ROTULO[t]}`).join(", ")}.</li>}
            <li>Colunas reconhecidas: {leitura.colunas.map((c) => CAMPO[c.campo] ?? c.campo).join(", ")}.</li>
            {contar((i) => !i.cpf_cnpj) > 0 && <li className="text-amber-700">{contar((i) => !i.cpf_cnpj)} sem CPF/CNPJ: entram pelo nome. Complete antes de emitir NF-e.</li>}
            {leitura.ignorados.length > 0 && (
              <li className="text-slate-500">
                Não entram {leitura.ignorados.length}: {leitura.ignorados.slice(0, 5).map((x) => `linha ${x.linha} (${x.motivo})`).join("; ")}
                {leitura.ignorados.length > 5 ? "…" : ""}
              </li>
            )}
            <li className="text-slate-500">Quem já está no ERP com o mesmo CPF/CNPJ é atualizado, não duplica.</li>
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {ocupado === "importar" && <span className="text-sm text-slate-500">{progresso} de {itens.length}…</span>}
            <Button variant="secondary" onClick={() => setLeitura(null)} disabled={!!ocupado}>Outra planilha</Button>
            <Button onClick={importar} disabled={!!ocupado || !itens.length}>{ocupado ? "Importando…" : `Importar ${itens.length} cadastros`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
