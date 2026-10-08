import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownUp, Boxes, FileSpreadsheet, History } from "lucide-react";
import { CrudPage, type FiltroCrud, type OrdemCrud } from "@/components/CrudPage";
import { FotoProduto } from "@/components/FotoProduto";
import { pendenciaCatalogo, urlFotoProduto } from "@/lib/catalogo";
import { Badge, Button, Field, Modal, Table, Tabs } from "@/components/ui";
import { brl, hoje } from "@/lib/format";
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
import { QualidadeProdutos } from "@/components/QualidadeProdutos";
import { ContagemEstoque } from "@/components/ContagemEstoque";
import { DescricaoMudanca, type LinhaAuditoria } from "@/components/Historico";
import { parecidos, resumoMovimentos, sugerirMinimo, UNIDADES, type Movimento } from "@/lib/qualidadeProdutos";

const tipos = [
  { value: "maquina", label: "Máquina" },
  { value: "peca", label: "Peça de reposição" },
  { value: "acessorio", label: "Acessório" },
  { value: "insumo", label: "Insumo" },
];

const TIPOS_PRODUTO: Record<string, string> = { maquina: "Máquinas", peca: "Peças", acessorio: "Acessórios", insumo: "Insumos" };
const txt = (a?: string | null, b?: string | null) => (a ?? "").localeCompare(b ?? "", "pt-BR", { sensitivity: "base" });
const FILTROS_PRODUTO: FiltroCrud<Produto>[] = [
  { label: "Tipo", opcoes: Object.entries(TIPOS_PRODUTO).map(([v, label]) => ({ label, teste: (r: Produto) => r.tipo === v })) },
  { label: "Categoria", valor: (r) => r.categoria },
  { label: "Marca", valor: (r) => r.marca },
  { label: "Estoque", opcoes: [
    { label: "Com estoque", teste: (r) => Number(r.estoque_atual) > 0 },
    { label: "Sem estoque", teste: (r) => Number(r.estoque_atual) <= 0 },
    { label: "No mínimo ou abaixo", teste: (r) => Number(r.estoque_minimo) > 0 && Number(r.estoque_atual) <= Number(r.estoque_minimo) },
  ] },
  { label: "Situação", opcoes: [
    { label: "Ativos", teste: (r) => r.ativo !== false }, { label: "Inativos", teste: (r) => r.ativo === false },
    { label: "Fora de linha", teste: (r) => !!r.fora_de_linha }, { label: "Sob encomenda", teste: (r) => !!r.sob_encomenda },
  ] },
  { label: "Cadastro", opcoes: [
    { label: "Sem código (SKU)", teste: (r) => !String(r.sku ?? "").trim() },
    { label: "Sem categoria", teste: (r) => !String(r.categoria ?? "").trim() },
    { label: "Sem localização", teste: (r) => !String(r.localizacao ?? "").trim() },
    { label: "Sem fornecedor padrão", teste: (r) => !r.fornecedor_padrao_id },
    { label: "Preço abaixo do custo", teste: (r) => Number(r.preco_venda) > 0 && Number(r.preco_custo) > Number(r.preco_venda) },
  ] },
  { label: "Fiscal", opcoes: [
    { label: "Sem NCM válido", teste: (r) => String(r.ncm ?? "").replace(/\D/g, "").length !== 8 },
    { label: "Sem preço de venda", teste: (r) => !Number(r.preco_venda) },
    { label: "Sem custo", teste: (r) => !Number(r.preco_custo) },
  ] },
];
const ORDENS_PRODUTO: OrdemCrud<Produto>[] = [
  { label: "descrição (A–Z)", comparar: (a, b) => txt(a.descricao, b.descricao) },
  { label: "SKU", comparar: (a, b) => txt(a.sku, b.sku) },
  { label: "maior estoque", comparar: (a, b) => Number(b.estoque_atual) - Number(a.estoque_atual) },
  { label: "menor estoque", comparar: (a, b) => Number(a.estoque_atual) - Number(b.estoque_atual) },
  { label: "maior preço", comparar: (a, b) => Number(b.preco_venda) - Number(a.preco_venda) },
  { label: "mais recentes", comparar: (a, b) => Date.parse((b as any).created_at ?? 0) - Date.parse((a as any).created_at ?? 0) },
];

/** Ativa/inativa vários produtos de uma vez (produto com movimentação não pode ser excluído). */
async function situacaoProdutos(ids: string[], ativo: boolean) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("produtos").update({ ativo }).in("id", ids.slice(i, i + 200));
    if (error) throw error;
  }
  return `${ids.length} produto(s) ${ativo ? "ativado(s)" : "inativado(s)"}`;
}

export default function Produtos() {
  const { pode, papel } = usePerfil();
  const [aba, setAba] = useState<"produtos" | "qualidade" | "contagem">("produtos");
  const [editarAgora, setEditarAgora] = useState<Produto | null>(null);
  const { data: movimentos = [] } = useRows<Movimento>("estoque_movimentos", { select: "produto_id, tipo, quantidade, created_at" });
  const { data: codigosForn = [] } = useRows<{ produto_id: string; codigo_fornecedor: string; fator_conversao: number; fornecedor: { nome: string } | null }>(
    "produto_fornecedor", { select: "produto_id, codigo_fornecedor, fator_conversao, fornecedor:fornecedores(nome)", order: "produto_id" });
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
  const baixos = produtos.filter((p) => p.ativo && !p.fora_de_linha && Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) <= Number(p.estoque_minimo));
  const consumo = resumoMovimentos(movimentos, hoje());
  const unidadesUsadas = [...new Set(produtos.map((p) => String(p.unidade ?? "").toUpperCase()))].filter((u) => u && !UNIDADES.some(([c]) => c === u));
  const opcoesUnidade = [...UNIDADES.map(([v, l]) => ({ value: v, label: `${v} - ${l}` })), ...unidadesUsadas.map((u) => ({ value: u, label: `${u} (fora do padrão)` }))];

  return (
    <>
      <Tabs value={aba} onChange={(a) => { setAba(a); setEditarAgora(null); }} options={[
        { value: "produtos", label: "Produtos e estoque" },
        { value: "qualidade", label: "Qualidade do cadastro" },
        ...(pode("movimentar_estoque") ? [{ value: "contagem" as const, label: "Contagem de estoque" }] : []),
      ]} />
      {aba === "qualidade" ? (
        <QualidadeProdutos produtos={produtos} podeEditar={pode("editar_produtos")} onCorrigir={(p) => { setAba("produtos"); setEditarAgora({ ...p }); }} />
      ) : aba === "contagem" ? (
        <ContagemEstoque produtos={produtos} podeEditar={pode("movimentar_estoque")} />
      ) : <>
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
        title="Produtos e estoque"
        readOnly={!pode("editar_produtos")}
        table="produtos"
        order="descricao"
        defaults={{ tipo: "maquina", unidade: "UN", origem: 0, preco_custo: 0, preco_venda: 0, estoque_minimo: 0, estoque_maximo: 0, ativo: true, vendavel: true, sob_encomenda: false, fora_de_linha: false, descricao: "", no_catalogo: false }}
        searchKeys={["descricao", "sku", "ncm", "marca", "modelo", "categoria", "codigo_barras", "codigo_fabricante", "codigos_alternativos"]}
        editarAgora={editarAgora}
        filtros={FILTROS_PRODUTO}
        ordens={ORDENS_PRODUTO}
        podeExcluir={papel === "admin"}
        plural="produtos"
        acoesLote={pode("editar_produtos") ? [
          { label: "Inativar", executar: (ids) => situacaoProdutos(ids, false) },
          { label: "Ativar", executar: (ids) => situacaoProdutos(ids, true) },
        ] : []}
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
            prazo_reposicao_dias: r.prazo_reposicao_dias === "" || r.prazo_reposicao_dias == null ? null : Number(r.prazo_reposicao_dias),
            compra_minima: r.compra_minima === "" || r.compra_minima == null ? null : Number(r.compra_minima),
            motivo_alteracao: String(r.motivo_alteracao ?? "").trim() || null,
          };
        }}
        fields={[
          { name: "descricao", label: "Descrição", span: 3, required: true, placeholder: "Tipo + marca + modelo + característica. Ex.: Motor do batedor WEG 1/2 CV 220V" },
          { name: "sku", label: "Código / SKU (único, não reaproveite)", span: 1 },
          {
            name: "conferencia", label: "Já cadastrados parecidos", type: "custom", span: 4,
            render: (_v, _s, row) => {
              const iguais = parecidos(row, produtos);
              return iguais.length ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Confira antes de criar outro: {iguais.slice(0, 4).map((o) => `${o.descricao}${o.sku ? ` (${o.sku})` : ""}${o.ativo === false ? " · inativo" : ""}`).join("; ")}
                </div>
              ) : <span className="text-xs text-emerald-700">nenhum produto com o mesmo código ou a mesma descrição</span>;
            },
          },
          { name: "tipo", label: "Tipo", type: "select", options: tipos },
          { name: "unidade", label: "Unidade de medida", type: "select", options: opcoesUnidade },
          { name: "categoria", label: "Categoria", span: 1 },
          { name: "localizacao", label: "Localização (depósito/prateleira)", span: 1 },
          { name: "marca", label: "Marca", span: 1 },
          { name: "modelo", label: "Modelo", span: 1 },
          { name: "codigo_fabricante", label: "Código do fabricante", span: 1 },
          { name: "codigo_barras", label: "Código de barras (EAN)" },
          { name: "codigos_alternativos", label: "Códigos alternativos (separados por vírgula)", span: 3, placeholder: "Código antigo, código do Tiny, EAN da caixa…" },
          { name: "garantia_meses", label: "Garantia (meses, vazio = padrão)", type: "number" },
          { name: "secao_compra", label: "Compra e reposição", type: "secao", ajuda: "O estoque mínimo deve cobrir o consumo durante o prazo do fornecedor, com folga para as peças críticas." },
          {
            name: "fornecedor_padrao_id", label: "Fornecedor preferencial", type: "select", span: 2,
            options: [{ value: "", label: "—" }, ...fornecedores.map((f) => ({ value: f.id, label: f.nome }))],
          },
          { name: "prazo_reposicao_dias", label: "Prazo de entrega (dias)", type: "number", span: 1 },
          { name: "compra_minima", label: "Compra mínima (embalagem)", type: "number", span: 1 },
          {
            name: "codigos_fornecedor", label: "Código do item em cada fornecedor (aprendido na entrada da NF-e)", type: "custom", span: 4,
            render: (_v, _s, row) => {
              const lista = codigosForn.filter((c) => c.produto_id === row.id);
              return lista.length
                ? <div className="text-sm text-slate-700">{lista.map((c) => `${c.fornecedor?.nome ?? "fornecedor"}: ${c.codigo_fornecedor}${Number(c.fator_conversao) !== 1 ? ` (1 = ${Number(c.fator_conversao)} ${row.unidade ?? ""})` : ""}`).join(" · ")}</div>
                : <span className="text-xs text-slate-500">nenhum ainda: ao dar entrada de uma NF do fornecedor e vincular o item, o código fica guardado aqui</span>;
            },
          },
          { name: "estoque_minimo", label: "Estoque mínimo", type: "number" },
          { name: "estoque_maximo", label: "Estoque máximo", type: "number" },
          {
            name: "sugestao_minimo", label: "Mínimo sugerido pelo consumo", type: "custom", span: 2,
            render: (_v, _s, row) => {
              const saidas = consumo.get(row.id)?.saidas180 ?? 0;
              const s = sugerirMinimo(saidas, row.prazo_reposicao_dias);
              return s
                ? <span className="text-sm text-slate-700"><b>{s}</b> · consumo de {Math.round((saidas / 6) * 10) / 10}/mês × prazo de {Number(row.prazo_reposicao_dias || 15)} dias + 50% de folga</span>
                : <span className="text-xs text-slate-500">sem saídas nos últimos 180 dias</span>;
            },
          },
          { name: "peso_kg", label: "Peso (kg) p/ frete", type: "number", span: 1 },
          { name: "altura_cm", label: "Altura (cm)", type: "number", span: 1 },
          { name: "largura_cm", label: "Largura (cm)", type: "number", span: 1 },
          { name: "profundidade_cm", label: "Profundidade (cm)", type: "number", span: 1 },
          { name: "secao_preco", label: "Custo e preço", type: "secao", ajuda: "Custo de compra = valor do item na NF do fornecedor (atualizado na entrada). Alterar custo ou preço já preenchido pede o motivo, que fica no histórico." },
          { name: "preco_custo", label: "Custo de compra", type: "number" },
          { name: "preco_venda", label: "Preço de venda", type: "number" },
          { name: "ipi_aliquota", label: "IPI (%) — TIPI do NCM", type: "number", span: 1 },
          {
            name: "margem_info", label: "Margem bruta", type: "custom", span: 1,
            render: (_v, _s, row) => {
              const c = Number(row.preco_custo || 0), v = Number(row.preco_venda || 0);
              if (!c || !v) return <span className="text-xs text-slate-500">—</span>;
              const m = ((v - c) / v) * 100;
              return <span className={`text-sm font-semibold ${m < 0 ? "text-red-600" : m < 20 ? "text-amber-700" : "text-emerald-700"}`}>{m.toFixed(1).replace(".", ",")}%</span>;
            },
          },
          {
            name: "motivo_alteracao", label: "Motivo da alteração (obrigatório ao mudar código, unidade, tipo, custo ou preço já preenchidos)", type: "custom", span: 4,
            render: (v, set, row) => row.id
              ? <input className="input" value={v ?? ""} onChange={(e) => set(e.target.value)} placeholder="Ex.: reajuste do fornecedor na NF 1234" />
              : <span className="text-xs text-slate-500">no cadastro novo não precisa</span>,
          },
          { name: "ativo", label: "Ativo", type: "checkbox", span: 1 },
          { name: "vendavel", label: "Pode vender (aparece no pedido)", type: "checkbox", span: 2 },
          { name: "sob_encomenda", label: "Sob encomenda", type: "checkbox", span: 1 },
          { name: "fora_de_linha", label: "Fora de linha (não compra mais; vende até acabar)", type: "checkbox", span: 2 },
          { name: "kit", label: "É um kit (componentes no botão ▦ da lista)", type: "checkbox", span: 2 },
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
                  <div className="text-xs text-slate-500">{[r.sku, r.marca, r.modelo, r.categoria].filter(Boolean).join(" · ")}{r.vendavel === false && " · não vende"}</div>
                  {(r.ativo === false || r.fora_de_linha) && <span className="text-xs font-semibold text-slate-500">{r.ativo === false ? "inativo" : "fora de linha"}</span>}
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

      </>}

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
  const [documento, setDocumento] = useState("");
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
        produto_id: produto.id, tipo, quantidade: valor, motivo: motivo.trim(), documento: documento.trim() || null,
        numero_serie: serie || null, referencia_tipo: "manual", unidade_id: unidadeId,
      });
      if (error) throw error;
      notify("Estoque atualizado");
      invalidate("produtos", "estoque_movimentos", "estoque_unidade");
      setQuantidade(""); setMotivo(""); setDocumento(""); setSerie("");
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
        <Field label="Motivo (obrigatório)" className="sm:col-span-2">
          <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3}
            placeholder={tipo === "ajuste" ? "Ex.: contagem física da prateleira 3" : tipo === "saida" ? "Ex.: peça danificada, uso interno" : "Ex.: devolução de cliente"} />
        </Field>
        <Field label="Documento de referência"><input className="input" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="NF, pedido, OS…" /></Field>
        <Field label="Nº de série (opcional)"><input className="input" value={serie} onChange={(e) => setSerie(e.target.value)} /></Field>
        {tipo === "ajuste" && <p className="text-xs text-slate-500 sm:col-span-2">Para conferir várias peças de uma vez, use a aba Contagem de estoque: ela mostra as divergências e pede a justificativa de cada uma.</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}

function HistoricoModal({ produto, onClose }: { produto: Produto | null; onClose: () => void }) {
  const { pode } = usePerfil();
  // alterações do cadastro (custo, preço, código…) com quem, quando e o motivo; sem as mudanças de saldo
  const { data: alteracoes = [] } = useQuery({
    queryKey: ["auditoria", "produto", produto?.id],
    enabled: !!produto && pode("editar_produtos"),
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria").select("*").eq("tabela", "produtos").eq("registro_id", produto!.id)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data as LinhaAuditoria[]).filter((l) => l.acao !== "update" || (l.campos ?? []).some((c) => c !== "estoque_atual"));
    },
  });
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
      {alteracoes.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold">Alterações do cadastro (custo, preço, código…)</h3>
          <Table head={<><th className="th">Quando</th><th className="th">Quem</th><th className="th">O que mudou</th><th className="th">Motivo</th></>}>
            {alteracoes.map((l) => (
              <tr key={l.id}>
                <td className="td whitespace-nowrap text-sm">{new Date(l.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="td text-sm">{l.usuario_nome ?? "sistema"}{l.origem === "sistema" && <div className="text-xs text-slate-500">automático</div>}</td>
                <td className="td text-sm"><DescricaoMudanca l={{ ...l, campos: (l.campos ?? []).filter((c) => c !== "estoque_atual") }} /></td>
                <td className="td text-sm text-amber-700">{l.motivo ?? ""}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <h3 className="mb-2 text-sm font-semibold">Movimentações de estoque</h3>
      <Table empty={data.length === 0} head={<><th className="th">Data</th><th className="th">Tipo</th><th className="th text-right">Qtd</th><th className="th">Motivo</th><th className="th">Documento</th><th className="th">Série</th></>}>
        {data.map((m: any) => (
          <tr key={m.id}>
            <td className="td">{new Date(m.created_at).toLocaleString("pt-BR")}</td>
            <td className="td"><Badge value={m.tipo} /><EtiquetaUnidade id={m.unidade_id} /></td>
            <td className="td text-right">{m.tipo === "saida" ? "-" : m.tipo === "entrada" ? "+" : ""}{Number(m.quantidade)}</td>
            <td className="td">{m.motivo}</td>
            <td className="td">{m.documento}</td>
            <td className="td">{m.numero_serie}</td>
          </tr>
        ))}
      </Table>
    </Modal>
  );
}
