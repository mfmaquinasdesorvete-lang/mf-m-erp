// Mercado Livre na tela (parte pura, com testes): tipos dos anúncios, o plano de envio de cada um e os textos.
// O cálculo (estoque disponível, preço, trava) é o mesmo da função mercadolivre: fica em
// supabase/functions/_shared/ml-anuncios.ts e chega aqui pelo re-export abaixo. Leitura e ações: useMercadoLivre.ts.
import {
  configDaConta, planejarEnvio, situacaoAnuncio, SITUACOES,
  type AnuncioCalculo, type ConfigEnvio, type PlanoEnvio, type Situacao,
} from "../../supabase/functions/_shared/ml-anuncios";

export {
  anunciosDoItem, caminhoAnuncio, centavos, configDaConta, estoqueDisponivel, planejarEnvio, precoAEnviar, reais,
  situacaoAnuncio, SITUACOES, travaPreco, variacaoPreco,
} from "../../supabase/functions/_shared/ml-anuncios";
export type { AnuncioCalculo, ConfigEnvio, PlanoEnvio, Situacao } from "../../supabase/functions/_shared/ml-anuncios";

export type ContaML = {
  id: string; ml_user_id: number | null; apelido: string | null; unidade_id: string | null; status: "ativa" | "erro" | "desligada"; erro: string | null;
  token_expira_em: string | null; conectado_em: string; sincronizado_em: string | null; ultimas_novas: number;
  enviar_estoque?: boolean; enviar_preco?: boolean; preco_tabela_id?: string | null; preco_ajuste?: number | null;
  estoque_seguranca?: number | null; estoque_maximo?: number | null; trava_preco?: number | null;
  /** o ERP emite a NF-e das vendas (e manda o XML para o Mercado Livre); falso enquanto outro sistema emite */
  emitir_nfe?: boolean;
};

/** Uma linha de ml_anuncios_lista: o anúncio, o produto ligado e o que já foi enviado. */
export type LinhaAnuncio = AnuncioCalculo & {
  anuncio_id: string; ml_item_id: string; variation_id: string | null; titulo: string | null; sku: string | null;
  produto: string | null; produto_sku: string | null;
  estoque_enviado_em: string | null; preco_enviado_em: string | null;
  estoque_ml: number | null; status_ml: string | null; lido_em: string | null;
  preco_pendente: number | null; preco_pendente_de: number | null; aprovado_em: string | null;
  erro: string | null; erro_em: string | null; conferido_em: string | null;
  na_fila: boolean; fila_motivo: string | null; fila_desde: string | null;
};
export type AnuncioComPlano = LinhaAnuncio & { plano: PlanoEnvio; situacao: Situacao };

const DESLIGADO: ConfigEnvio = { enviar_estoque: false, enviar_preco: false };

export const nomeSituacao = (s: Situacao) => SITUACOES.find((x) => x.id === s)?.nome ?? s;
export const corSituacao = (s: Situacao) => SITUACOES.find((x) => x.id === s)?.cor ?? "bg-slate-100 text-slate-700";

/** Página do anúncio no Mercado Livre. */
export const linkAnuncio = (id: string) => `https://produto.mercadolivre.com.br/${id.replace(/^([A-Z]{3})(\d)/, "$1-$2")}`;

/** Põe o plano (o que vai ser enviado) e a situação em cada anúncio. */
export function comPlano(linhas: LinhaAnuncio[], conta: ContaML | null): AnuncioComPlano[] {
  const cfg = conta ? configDaConta(conta) : null;
  return linhas.map((a) => {
    const plano = planejarEnvio(cfg ?? DESLIGADO, a);
    return { ...a, plano, situacao: situacaoAnuncio(cfg, a, plano) };
  });
}

/** Resumo de um envio para o aviso da tela: "3 enviados · 1 esperando aprovação · 2 com erro". */
export function textoResumoEnvio(r: { enviados?: number; em_dia?: number; aguardando?: number; erros?: number; restam?: number; parou?: string; aviso?: string } | null | undefined) {
  if (!r) return "Nada para enviar";
  if (r.aviso) return r.aviso.charAt(0).toUpperCase() + r.aviso.slice(1);
  const partes: string[] = [];
  const n = (v: number | undefined) => Number(v ?? 0);
  if (n(r.enviados)) partes.push(`${n(r.enviados)} ${n(r.enviados) === 1 ? "anúncio atualizado" : "anúncios atualizados"}`);
  if (n(r.em_dia)) partes.push(`${n(r.em_dia)} já em dia`);
  if (n(r.aguardando)) partes.push(`${n(r.aguardando)} esperando aprovação do preço`);
  if (n(r.erros)) partes.push(`${n(r.erros)} com erro`);
  if (n(r.restam)) partes.push(`${n(r.restam)} ainda na fila`);
  const texto = partes.length ? partes.join(" · ") : "Nada para enviar";
  return r.parou ? `${texto}. Parou: ${r.parou}` : texto;
}

/** Quantas unidades o anúncio vende juntas, pelo título ("4 Un", "Kit com 3", "c/ 10 peças", "Pacote 2"); 1 quando não diz. */
export function quantidadeNoTitulo(titulo: string | null | undefined): number {
  const t = String(titulo ?? "").toLowerCase();
  const m = t.match(/(?:kit|pacote|pct|caixa|cx|jogo)\s*(?:com|c\/|de)?\s*(\d{1,3})\b/) ?? t.match(/\b(\d{1,3})\s*(?:un|und|unid|unidades?|p[cç]s|pe[cç]as|pares)\b/);
  const n = m ? Number(m[1]) : 1;
  return n >= 2 && n <= 500 ? n : 1;
}
