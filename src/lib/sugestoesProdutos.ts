// Correções sugeridas para o cadastro de produtos (public.produto_sugestoes): o ERP procura todo dia nas notas de
// fornecedor, ordens de compra, preços dos fornecedores, fichas técnicas e regras; a análise feita à parte também entra aqui.
// Nada muda sozinho: quem cuida do cadastro aplica ou ignora.
import { brl } from "./format";

export type CampoSugestao = "ncm" | "preco_custo" | "categoria" | "marca" | "codigo_barras" | "tipo" | "descricao";
export type Confianca = "alta" | "media" | "baixa" | "conferir";
export type Sugestao = {
  id: string; produto_id: string; campo: CampoSugestao; valor: string | null; valor_anterior?: string | null;
  fonte: string; confianca: Confianca; detalhe: string | null; situacao: "pendente" | "aplicada" | "ignorada" | "vencida";
  motivo?: string | null; criado_em: string; decidido_nome?: string | null; decidido_em?: string | null;
};
type ProdutoCampos = { ncm?: string | null; preco_custo?: number | null; categoria?: string | null; marca?: string | null; codigo_barras?: string | null; tipo?: string | null; descricao?: string | null };

export const CAMPOS: { id: CampoSugestao; nome: string; cor: string }[] = [
  { id: "ncm", nome: "NCM", cor: "bg-violet-100 text-violet-900 ring-violet-300" },
  { id: "preco_custo", nome: "Custo", cor: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  { id: "categoria", nome: "Categoria", cor: "bg-sky-100 text-sky-900 ring-sky-300" },
  { id: "marca", nome: "Marca", cor: "bg-orange-100 text-orange-900 ring-orange-300" },
  { id: "codigo_barras", nome: "Código de barras", cor: "bg-slate-100 text-slate-800 ring-slate-300" },
  { id: "tipo", nome: "Tipo", cor: "bg-pink-100 text-pink-900 ring-pink-300" },
  { id: "descricao", nome: "Descrição", cor: "bg-yellow-100 text-yellow-900 ring-yellow-300" },
];
export const NOME_CAMPO = Object.fromEntries(CAMPOS.map((c) => [c.id, c.nome])) as Record<CampoSugestao, string>;

export const CONFIANCAS: { id: Confianca; nome: string; cor: string; ponto: string }[] = [
  { id: "alta", nome: "Confiança alta", cor: "bg-emerald-100 text-emerald-900 ring-emerald-300", ponto: "bg-emerald-500" },
  { id: "media", nome: "Confiança média", cor: "bg-amber-100 text-amber-900 ring-amber-300", ponto: "bg-amber-500" },
  { id: "baixa", nome: "Confiança baixa", cor: "bg-slate-100 text-slate-800 ring-slate-300", ponto: "bg-slate-400" },
  { id: "conferir", nome: "Só conferir", cor: "bg-rose-100 text-rose-900 ring-rose-300", ponto: "bg-rose-500" },
];

export const NOME_FONTE: Record<string, string> = {
  nota_fornecedor: "nota do fornecedor", pedido_compra: "ordem de compra", fornecimento: "preço do fornecedor", ficha_tecnica: "ficha técnica",
  produto_parecido: "produto parecido", regra: "regra do ERP", analise: "análise do cadastro",
};

const NOME_TIPO: Record<string, string> = { maquina: "Máquina", peca: "Peça", componente: "Componente", servico: "Serviço", insumo: "Insumo", acessorio: "Acessório", kit: "Kit" };

/** Valor do campo para mostrar (NCM com pontos, custo em reais, tipo por extenso). */
export function mostrarValor(campo: CampoSugestao, v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const s = String(v);
  if (campo === "ncm") return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : s;
  if (campo === "preco_custo") return Number(s) > 0 ? brl(Number(s)) : "—";
  if (campo === "tipo") return NOME_TIPO[s] ?? s;
  return s;
}

/** Valor que o produto tem hoje no campo da sugestão. */
export function valorAtual(campo: CampoSugestao, p: ProdutoCampos | undefined): string | number | null {
  if (!p) return null;
  const v = p[campo];
  return campo === "preco_custo" ? (Number(v) > 0 ? Number(v) : null) : (v ?? null);
}

/** Dá para aplicar com um toque? "Só conferir" não traz valor: abre o cadastro. */
export const aplicavel = (s: Pick<Sugestao, "valor" | "situacao">) => s.situacao === "pendente" && s.valor != null && s.valor !== "";

/** NCM que não é de confiança alta pede o contador antes de emitir nota. */
export const pedeContador = (s: Pick<Sugestao, "campo" | "confianca">) => s.campo === "ncm" && s.confianca !== "alta";
