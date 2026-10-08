import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownUp, Boxes, FileSpreadsheet, History } from "lucide-react";
import { CrudPage } from "@/components/CrudPage";
import { FotoProduto } from "@/components/FotoProduto";
import { pendenciaCatalogo, urlFotoProduto } from "@/lib/catalogo";
import { Badge, Button, Field, Modal, Table } from "@/components/ui";
import { brl } from "@/lib/format";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import type { Produto } from "@/lib/types";
import { usePerfil } from "@/lib/auth";
import { CampoUnidade, EtiquetaUnidade, useUnidade } from "@/lib/unidade";
import { ImportarProdutos } from "@/components/ImportarProdutos";
import { KitComponentesModal } from "@/components/KitComponentes";
import { estoqueKit } from "@/lib/kits";
import type { KitComponente } from "@/lib/types";

const tipos = [
  { value: "maquina", label: "Máquina" },
  { value: "peca", label: "Peça de reposição" },
  { value: "acessorio", label: "Acessório" },
  { value: "insumo", label: "Insumo" },
];

export default function Produtos() {
  const { pode } = usePerfil();
  const { data: fornecedores = [] } = useRows<{ id: string; nome: string }>("fornecedores", { order: "nome", ascending: true });
  const [movimentar, setMovimentar] = useState<Produto | null>(null);
  const [historico, setHistorico] = useState<Produto | null>(null);
  const [importar, setImportar] = useState(false);
  const [kitAberto, setKitAberto] = useState<Produto | null>(null);
  const { data: comps = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const { data: produtos = [] } = useRows<Produto>("produtos", { order: "descricao", ascending: true });
  const { unidades, atual } = useUnidade();
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const saldo = (p: string, u: string) => Number(saldos.find((s) => s.produto_id === p && s.unidade_id === u)?.quantidade ?? 0);
  const baixos = produtos.filter((p) => p.ativo && Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) <= Number(p.estoque_minimo));

  return (
    <>
      {baixos.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>
            <b>{baixos.length} item(ns) no estoque mínimo ou abaixo:</b>{" "}
            {baixos.slice(0, 6).map((p) => `${p.descricao} (${Number(p.estoque_atual)})`).join(", ")}
            {baixos.length > 6 && "…"}
          </span>
        </div>
      )}

      <CrudPage<Produto>
        anexos="produto"
        title="Estoque — máquinas e peças"
        readOnly={!pode("editar_produtos")}
        table="produtos"
        order="descricao"
        defaults={{ tipo: "maquina", unidade: "UN", origem: 0, preco_custo: 0, preco_venda: 0, estoque_minimo: 0, estoque_maximo: 0, ativo: true, vendavel: true, sob_encomenda: false, descricao: "", no_catalogo: false }}
        searchKeys={["descricao", "sku", "ncm", "marca", "categoria", "codigo_barras"]}
        exportExtra={(r) => ({ "Estoque total": Number(r.estoque_atual), ...Object.fromEntries(unidades.map((u) => [`Estoque ${u.codigo}`, saldo(r.id, u.id)])) })}
        extraActions={pode("editar_produtos") && <Button variant="secondary" onClick={() => setImportar(true)}><FileSpreadsheet size={16} /> Importar do Tiny</Button>}
        beforeSave={(r) => {
          // estoque_atual só muda por movimentação, nunca pela edição do cadastro
          const { estoque_atual: _ignorado, ...resto } = r;
          return {
            ...resto,
            origem: Number(r.origem),
            preco_custo: Number(r.preco_custo || 0),
            preco_venda: Number(r.preco_venda || 0),
            estoque_minimo: Number(r.estoque_minimo || 0),
            estoque_maximo: Number(r.estoque_maximo || 0),
            garantia_meses: r.garantia_meses === "" || r.garantia_meses == null ? null : Number(r.garantia_meses),
            ipi_aliquota: r.ipi_aliquota === "" || r.ipi_aliquota == null ? null : Number(r.ipi_aliquota),
            ...Object.fromEntries(["peso_kg", "altura_cm", "largura_cm", "profundidade_cm"].map((k) => [k, r[k] === "" || r[k] == null ? null : Number(r[k])])),
            fornecedor_padrao_id: r.fornecedor_padrao_id || null,
            foto_caminho: r.foto_caminho || null,
          };
        }}
        fields={[
          { name: "descricao", label: "Descrição", span: 3, required: true },
          { name: "sku", label: "Código / SKU", span: 1 },
          { name: "tipo", label: "Tipo", type: "select", options: tipos },
          { name: "unidade", label: "Unidade", span: 1 },
          { name: "localizacao", label: "Localização", span: 1 },
          { name: "marca", label: "Marca", span: 1 },
          { name: "categoria", label: "Categoria", span: 1 },
          { name: "codigo_barras", label: "Código de barras (EAN)" },
          { name: "garantia_meses", label: "Garantia (meses, vazio = padrão)", type: "number" },
          {
            name: "fornecedor_padrao_id", label: "Fornecedor padrão (para pedir peças)", type: "select", span: 4,
            options: [{ value: "", label: "—" }, ...fornecedores.map((f) => ({ value: f.id, label: f.nome }))],
          },
          { name: "peso_kg", label: "Peso (kg) p/ frete", type: "number", span: 1 },
          { name: "altura_cm", label: "Altura (cm)", type: "number", span: 1 },
          { name: "largura_cm", label: "Largura (cm)", type: "number", span: 1 },
          { name: "profundidade_cm", label: "Profundidade (cm)", type: "number", span: 1 },
          { name: "preco_custo", label: "Preço de custo", type: "number" },
          { name: "preco_venda", label: "Preço de venda", type: "number" },
          { name: "ipi_aliquota", label: "IPI (%) — TIPI do NCM", type: "number", span: 1 },
          { name: "estoque_minimo", label: "Estoque mínimo", type: "number" },
          { name: "estoque_maximo", label: "Estoque máximo", type: "number" },
          { name: "ativo", label: "Ativo", type: "checkbox", span: 1 },
          { name: "vendavel", label: "Pode vender (aparece no pedido)", type: "checkbox", span: 2 },
          { name: "sob_encomenda", label: "Sob encomenda", type: "checkbox", span: 1 },
          { name: "kit", label: "É um kit (componentes no botão ▦ da lista)", type: "checkbox", span: 4 },
          { name: "observacoes", label: "Observações internas", type: "textarea", span: 4 },
          { name: "secao_catalogo", label: "Catálogo do WhatsApp e vitrine", type: "secao", ajuda: "Produtos marcados aparecem no catálogo do WhatsApp e na vitrine, com foto e preço de venda." },
          { name: "no_catalogo", label: "Mostrar no catálogo", type: "checkbox", span: 1 },
          { name: "foto_caminho", label: "Foto", type: "custom", span: 3, render: (v, set) => <FotoProduto valor={v} onChange={set} /> },
          { name: "descricao_catalogo", label: "Texto de venda (o cliente lê no WhatsApp)", type: "textarea", span: 4 },
          { name: "secao_fiscal", label: "Dados fiscais (NF-e)", type: "secao" },
          { name: "ncm", label: "NCM (8 dígitos)", span: 1 },
          { name: "cest", label: "CEST", span: 1 },
          { name: "cfop", label: "CFOP (vazio = padrão)", span: 1 },
          { name: "icms_situacao", label: "CSOSN/CST (vazio = padrão)", span: 1 },
          {
            name: "origem", label: "Origem da mercadoria", type: "select", span: 4,
            options: [
              { value: 0, label: "0 - Nacional" },
              { value: 1, label: "1 - Estrangeira (importação direta)" },
              { value: 2, label: "2 - Estrangeira (adquirida no mercado interno)" },
              { value: 3, label: "3 - Nacional, conteúdo de importação > 40% e ≤ 70%" },
              { value: 4, label: "4 - Nacional, processos produtivos básicos" },
              { value: 5, label: "5 - Nacional, conteúdo de importação ≤ 40%" },
              { value: 6, label: "6 - Estrangeira (importação direta), sem similar nacional" },
              { value: 7, label: "7 - Estrangeira (mercado interno), sem similar nacional" },
              { value: 8, label: "8 - Nacional, conteúdo de importação > 70%" },
            ],
          },
        ]}
        columns={[
          {
            label: "Produto",
            render: (r) => (
              <div className="flex items-center gap-3">
                {r.foto_caminho && <img src={urlFotoProduto(r.foto_caminho)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
                <div className="min-w-0">
                  <div className="font-medium">{r.descricao}</div>
                  <div className="text-xs text-slate-500">{[r.sku, r.marca, r.categoria].filter(Boolean).join(" · ")}{r.vendavel === false && " · não vende"}</div>
                  {r.no_catalogo && (pendenciaCatalogo({ foto: r.foto_caminho, preco: r.preco_venda })
                    ? <span className="text-xs font-semibold text-amber-700">catálogo: {pendenciaCatalogo({ foto: r.foto_caminho, preco: r.preco_venda })}</span>
                    : <span className="text-xs font-semibold text-emerald-700">no catálogo ✓</span>)}
                </div>
              </div>
            ),
          },
          { label: "Tipo", render: (r) => tipos.find((t) => t.value === r.tipo)?.label },
          { label: "Venda", render: (r) => brl(r.preco_venda), className: "text-right" },
          {
            label: "Estoque",
            className: "text-right",
            render: (r) => {
              if (r.kit) {
                const montaveis = estoqueKit(r.id, comps, (id) => (atual ? saldo(id, atual) : Number(produtos.find((p) => p.id === id)?.estoque_atual ?? 0)));
                return <span><span className="font-semibold">{montaveis} kit(s)</span><span className="block text-xs text-slate-500">pelos componentes</span></span>;
              }
              const qtd = atual ? saldo(r.id, atual) : Number(r.estoque_atual);
              return (
                <span>
                  <span className={(qtd < 0 || (Number(r.estoque_minimo) > 0 && qtd <= Number(r.estoque_minimo))) ? "font-semibold text-red-600" : "font-semibold"}>{qtd} {r.unidade}</span>
                  {!atual && unidades.length > 1 && (
                    <span className="block whitespace-nowrap text-xs text-slate-500">{unidades.map((u) => `${u.codigo} ${saldo(r.id, u.id)}`).join(" · ")}</span>
                  )}
                </span>
              );
            },
          },
          { label: "NCM", render: (r) => r.ncm ?? <span className="text-red-500">sem NCM</span> },
        ]}
        rowActions={(r) => (
          <>
            {pode("movimentar_estoque") && (
              <Button variant="ghost" title="Movimentar estoque" onClick={() => setMovimentar(r)}><ArrowDownUp size={16} /></Button>
            )}
            <Button variant="ghost" title="Histórico" onClick={() => setHistorico(r)}><History size={16} /></Button>
            {r.kit && <Button variant="ghost" title="Componentes do kit" onClick={() => setKitAberto(r)}><Boxes size={16} /></Button>}
          </>
        )}
      />

      <MovimentoModal produto={movimentar} onClose={() => setMovimentar(null)} />
      <HistoricoModal produto={historico} onClose={() => setHistorico(null)} />
      {importar && <ImportarProdutos onClose={() => setImportar(false)} />}
      {kitAberto && <KitComponentesModal kit={kitAberto} podeEditar={pode("editar_produtos")} onClose={() => setKitAberto(null)} />}
    </>
  );
}

function MovimentoModal({ produto, onClose }: { produto: Produto | null; onClose: () => void }) {
  const [tipo, setTipo] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [serie, setSerie] = useState("");
  const invalidate = useInvalidate();
  const { padrao, nome } = useUnidade();
  const [unidadeId, setUnidadeId] = useState<string | null>(padrao);
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const saldoAqui = Number(saldos.find((s) => s.produto_id === produto?.id && s.unidade_id === unidadeId)?.quantidade ?? 0);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!produto) return;
    try {
      const qtd = Number(quantidade);
      // Ajuste informa o saldo final desejado; gravamos a diferença.
      const valor = tipo === "ajuste" ? qtd - saldoAqui : qtd;
      if (!valor) return notify("Nada a ajustar", "erro");
      const { error } = await supabase.from("estoque_movimentos").insert({
        produto_id: produto.id, tipo, quantidade: valor, motivo: motivo || null,
        numero_serie: serie || null, referencia_tipo: "manual", unidade_id: unidadeId,
      });
      if (error) throw error;
      notify("Estoque atualizado");
      invalidate("produtos", "estoque_movimentos", "estoque_unidade");
      setQuantidade(""); setMotivo(""); setSerie("");
      onClose();
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <Modal open={!!produto} onClose={onClose} title={`Movimentar: ${produto?.descricao ?? ""}`}>
      <p className="mb-3 text-sm text-slate-600">Saldo em {nome(unidadeId)}: <b>{saldoAqui} {produto?.unidade}</b></p>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><CampoUnidade value={unidadeId} onChange={setUnidadeId} label="Unidade" /></div>
        <Field label="Tipo">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
            <option value="entrada">Entrada (compra, devolução)</option>
            <option value="saida">Saída (perda, uso interno)</option>
            <option value="ajuste">Ajuste de inventário (saldo final)</option>
          </select>
        </Field>
        <Field label={tipo === "ajuste" ? "Saldo correto" : "Quantidade"}>
          <input className="input" type="number" step="any" min={tipo === "ajuste" ? 0 : 0.001} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
        </Field>
        <Field label="Nº de série (opcional)"><input className="input" value={serie} onChange={(e) => setSerie(e.target.value)} /></Field>
        <Field label="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}

function HistoricoModal({ produto, onClose }: { produto: Produto | null; onClose: () => void }) {
  const { data = [] } = useQuery({
    queryKey: ["estoque_movimentos", produto?.id],
    enabled: !!produto,
    queryFn: async () => {
      const { data, error } = await supabase.from("estoque_movimentos")
        .select("*").eq("produto_id", produto!.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Modal open={!!produto} onClose={onClose} title={`Histórico: ${produto?.descricao ?? ""}`} wide>
      <Table empty={data.length === 0} head={<><th className="th">Data</th><th className="th">Tipo</th><th className="th text-right">Qtd</th><th className="th">Motivo</th><th className="th">Série</th></>}>
        {data.map((m: any) => (
          <tr key={m.id}>
            <td className="td">{new Date(m.created_at).toLocaleString("pt-BR")}</td>
            <td className="td"><Badge value={m.tipo} /><EtiquetaUnidade id={m.unidade_id} /></td>
            <td className="td text-right">{m.tipo === "saida" ? "-" : m.tipo === "entrada" ? "+" : ""}{Number(m.quantidade)}</td>
            <td className="td">{m.motivo}</td>
            <td className="td">{m.numero_serie}</td>
          </tr>
        ))}
      </Table>
    </Modal>
  );
}
