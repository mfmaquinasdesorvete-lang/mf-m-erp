// Estoque → Importar do Tiny: lê a planilha de produtos exportada do Tiny / Olist ERP,
// mostra o resumo e cadastra tudo de uma vez (fornecedores, vínculos e saldo inicial).
import { useState } from "react";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button, Modal } from "./ui";
import { lerPlanilha, type Leitura } from "@/lib/importarTiny";
import { callFunction, supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { brl } from "@/lib/format";
import { CampoUnidade, useUnidade } from "@/lib/unidade";

const TIPO: Record<string, string> = { maquina: "máquinas", peca: "peças", acessorio: "acessórios", insumo: "insumos" };
type Resultado = { criados: number; atualizados: number; fornecedores_criados: number; com_estoque: number; negativos: number };

export function ImportarProdutos({ onClose }: { onClose: () => void }) {
  const { unidades } = useUnidade();
  const [unidadeId, setUnidadeId] = useState<string | null>(unidades.find((u) => u.matriz)?.id ?? unidades[0]?.id ?? null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [lancarEstoque, setLancarEstoque] = useState(true);
  const [ocupado, setOcupado] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [fotos, setFotos] = useState<{ copiadas: number; falharam: number } | null>(null);
  const { data: existentes = [] } = useRows<{ id: string; id_externo: string | null; sku: string | null }>("produtos", { order: "descricao", ascending: true });
  const invalidar = useInvalidate();

  async function abrir(arquivo?: File) {
    if (!arquivo) return;
    setOcupado("ler");
    try { setLeitura(await lerPlanilha(arquivo)); } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  async function importar() {
    if (!leitura) return;
    setOcupado("importar");
    try {
      const { data, error } = await supabase.rpc("importar_produtos", { p_itens: leitura.itens, p_unidade: unidadeId, p_lancar_estoque: lancarEstoque });
      if (error) throw error;
      setResultado(data as Resultado);
      invalidar("produtos", "estoque_unidade", "estoque_movimentos", "fornecedores", "produto_fornecedor");
      if (leitura.itens.some((i) => i.foto)) copiarFotos();
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  // Traz as fotos do Tiny para o ERP aos poucos (o catálogo deixa de depender do sistema antigo)
  async function copiarFotos() {
    let total = { copiadas: 0, falharam: 0 };
    for (let i = 0; i < 20; i++) {
      try {
        const r = await callFunction<{ copiadas: number; falharam: number; restantes: number }>("produtos-fotos", {});
        total = { copiadas: total.copiadas + r.copiadas, falharam: total.falharam + r.falharam };
        setFotos(total);
        if (!r.copiadas || !r.restantes) break;
      } catch { break; }
    }
    invalidar("produtos");
  }

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Importação concluída">
        <div className="space-y-3 text-[15px]">
          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={22} /> {resultado.criados} produtos novos, {resultado.atualizados} atualizados.</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            {resultado.fornecedores_criados > 0 && <li>{resultado.fornecedores_criados} fornecedores cadastrados (complete CNPJ e WhatsApp em Fornecedores).</li>}
            <li>Saldo inicial lançado em {resultado.com_estoque} produtos.</li>
            {resultado.negativos > 0 && <li className="text-amber-700">{resultado.negativos} produtos estavam com estoque negativo no Tiny e entraram com zero. Confira na contagem.</li>}
            {fotos && <li>Fotos copiadas para o ERP: {fotos.copiadas}{fotos.falharam ? ` (${fotos.falharam} não abriram; continuam pelo link)` : ""}.</li>}
          </ul>
          <p className="text-sm text-slate-500">Importar a mesma planilha de novo atualiza os cadastros, sem duplicar e sem mexer no estoque.</p>
          <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
    );
  }

  const itens = leitura?.itens ?? [];
  const jaExiste = (i: Leitura["itens"][number]) => existentes.some((p) => (i.id_externo && p.id_externo === i.id_externo) || (i.sku && p.sku === i.sku));
  const novos = itens.filter((i) => !jaExiste(i)).length;
  const porTipo = Object.entries(itens.reduce<Record<string, number>>((a, i) => ({ ...a, [i.tipo]: (a[i.tipo] ?? 0) + 1 }), {}));
  const comEstoque = itens.filter((i) => i.estoque > 0);
  const contar = (f: (i: Leitura["itens"][number]) => boolean) => itens.filter(f).length;

  return (
    <Modal open onClose={onClose} title="Importar produtos do Tiny / Olist" wide>
      {!leitura ? (
        <div className="space-y-4">
          <p className="text-[15px] text-slate-700">
            No Tiny, vá em <b>Cadastros → Produtos → ⋯ → Exportar planilha</b> e escolha o arquivo aqui. Entram descrição, SKU, NCM, CEST,
            origem, preços, estoque, mínimo e máximo, localização, EAN, marca, categoria, garantia, peso e medidas, foto, texto de venda e
            fornecedor (com o código dele, para as notas de compra já entrarem ligadas).
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
            {[["Produtos", itens.length], ["Novos", novos], ["Já no ERP (atualiza)", itens.length - novos], ["Com estoque", comEstoque.length]].map(([r, v]) => (
              <div key={r} className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-fg">{v}</div><div className="text-xs text-slate-500">{r}</div></div>
            ))}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>{porTipo.map(([t, n]) => `${n} ${TIPO[t]}`).join(", ")}. O tipo pode ser trocado depois no cadastro.</li>
            <li>Valor do estoque (custo): <b className="num">{brl(comEstoque.reduce((s, i) => s + i.estoque * i.preco_custo, 0))}</b></li>
            {contar((i) => i.estoque < 0) > 0 && <li className="text-amber-700">{contar((i) => i.estoque < 0)} com estoque negativo no Tiny: entram com zero.</li>}
            {contar((i) => i.ncm.length !== 8) > 0 && <li className="text-amber-700">{contar((i) => i.ncm.length !== 8)} sem NCM válido: preencha antes de emitir NF-e.</li>}
            {contar((i) => !i.vendavel) > 0 && <li>{contar((i) => !i.vendavel)} marcados no Tiny como "não vende" (matéria-prima): não aparecem no pedido.</li>}
            {contar((i) => i.kit) > 0 && <li>{contar((i) => i.kit)} kits: entram marcados como kit; cadastre os componentes em Estoque → botão Componentes.</li>}
            <li>{contar((i) => !!i.foto)} com foto · {contar((i) => !!i.fornecedor)} com fornecedor · {contar((i) => !!i.descricao_catalogo)} com texto de venda</li>
            {leitura.ignorados.length > 0 && <li className="text-slate-500">Não entram: {leitura.ignorados.map((x) => x.descricao).join(", ")} ({leitura.ignorados[0].motivo}).</li>}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoUnidade value={unidadeId} onChange={setUnidadeId} label="Estoque do Tiny entra na unidade" />
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={lancarEstoque} onChange={(e) => setLancarEstoque(e.target.checked)} />
              Lançar o estoque como saldo inicial (só produtos novos)
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setLeitura(null)}>Outra planilha</Button>
            <Button onClick={importar} disabled={!!ocupado || !itens.length || !unidadeId}>{ocupado ? "Importando…" : `Importar ${itens.length} produtos`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
