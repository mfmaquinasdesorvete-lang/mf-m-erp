// Sincronização das gravações (pedidos e contas): cada salvar vira uma operação com op_id próprio e só os campos que
// a pessoa mudou (com o valor que ela viu antes). O banco (aplicar_operacao) junta com o que outra pessoa mudou,
// devolve "repetida" se o mesmo op_id chegar de novo e "conflito" quando um campo crítico mudou dos dois lados.
// Enviar não é confirmar: só a resposta do banco, com a versão nova, confirma.
import { supabase } from "./supabase";

export const TABELAS_SINCRONIZADAS = ["pedidos", "contas_receber", "contas_pagar"] as const;
export type TabelaSincronizada = (typeof TABELAS_SINCRONIZADAS)[number];
export const sincronizada = (t: string): t is TabelaSincronizada => (TABELAS_SINCRONIZADAS as readonly string[]).includes(t);

export type Conflito = { campo: string; antes: unknown; seu: unknown; atual: unknown };
export type ResultadoOperacao = {
  status: "aplicada" | "repetida" | "conflito" | "nao_encontrado";
  versao?: number; conflitos?: Conflito[]; sobrescritos?: { campo: string; antes: unknown; atual: unknown }[];
};

/** Campos que nunca vão na operação (calculados, de leitura ou de outra tabela). */
const FORA = new Set(["id", "versao", "created_at", "numero", "created_by", "criado_por", "updated_at", "atualizado_em"]);

const vazio = (v: unknown) => v === null || v === undefined || v === "";
const numero = (v: unknown) => (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) ? Number(v) : null);

/** Mesmo valor para o banco: vazio = vazio, números comparados como número, o resto pelo JSON. */
export function mesmoValor(a: unknown, b: unknown) {
  if (vazio(a) || vazio(b)) return vazio(a) && vazio(b);
  const na = numero(a), nb = numero(b);
  if (na !== null && nb !== null) return na === nb;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Só o que a pessoa mudou: { campo: { antes, depois } }. Objetos e listas junto (rateio, marcadores) vão inteiros. */
export function camposMudados(antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const saida: Record<string, { antes: unknown; depois: unknown }> = {};
  for (const [k, v] of Object.entries(depois)) {
    if (FORA.has(k) || k.startsWith("__") || v === undefined) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v) && !(k in antes)) continue; // junção de outra tabela
    if (!mesmoValor(antes[k], v)) saida[k] = { antes: antes[k] ?? null, depois: v };
  }
  return saida;
}

export class ConflitoEdicao extends Error {
  constructor(public conflitos: Conflito[], public versao: number | undefined) {
    super(`Outra pessoa mudou ${conflitos.map((c) => NOME_CAMPO[c.campo] ?? c.campo).join(", ")} enquanto você editava.`);
  }
}

/** Falha de rede (vale repetir com o mesmo op_id); erro do banco (permissão, regra) não. */
const ehRede = (e: unknown) => e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|network|timeout/i.test(String((e as Error)?.message ?? e));
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Manda uma operação e espera a confirmação. Sem resposta, repete até 3 vezes com o MESMO op_id: o banco aplica uma vez só.
 * "conflito" vira ConflitoEdicao (nada foi gravado); "nao_encontrado" vira erro.
 */
export async function aplicarOperacao(op: {
  tabela: TabelaSincronizada; id: string; versaoBase: number | null | undefined; campos: Record<string, { antes: unknown; depois: unknown }>; opId?: string;
}): Promise<ResultadoOperacao> {
  const opId = op.opId ?? crypto.randomUUID();
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const { data, error } = await supabase.rpc("aplicar_operacao", {
        p_op_id: opId, p_tabela: op.tabela, p_registro: op.id, p_versao_base: op.versaoBase ?? 0, p_campos: op.campos,
      });
      if (error) {
        if (ehRede(error)) throw error;
        throw Object.assign(new Error(error.message), { definitivo: true, original: error });
      }
      const r = data as ResultadoOperacao;
      if (r.status === "conflito") throw new ConflitoEdicao(r.conflitos ?? [], r.versao);
      if (r.status === "nao_encontrado") throw Object.assign(new Error("Este registro foi apagado por outra pessoa."), { definitivo: true });
      return r;
    } catch (e) {
      if (e instanceof ConflitoEdicao || (e as { definitivo?: boolean }).definitivo || !ehRede(e)) throw (e as { original?: unknown }).original ?? e;
      ultimo = e;
      await espera(500 * 2 ** tentativa);
    }
  }
  throw ultimo;
}

/** Nomes dos campos para a pessoa ler no aviso de conflito. */
export const NOME_CAMPO: Record<string, string> = {
  status: "a situação", valor: "o valor", valor_pago: "o valor pago", vencimento: "o vencimento", data_pagamento: "a data de pagamento",
  cliente_id: "o cliente", fornecedor_id: "o fornecedor", unidade_id: "a unidade", desconto: "o desconto", frete: "o frete",
  parcelas: "as parcelas", primeiro_vencimento: "o 1º vencimento", intervalo_dias: "o intervalo das parcelas", forma_pagamento: "a forma de pagamento",
  forma_pagamento_id: "a forma de pagamento", tabela_preco_id: "a tabela de preço", vendedor_id: "o vendedor", comissao_percentual: "a comissão",
  conta_bancaria_id: "a conta bancária", linha_digitavel: "o boleto", chave_pix: "a chave Pix", decisao: "a decisão de pagar", pagar_em: "a data de pagar",
  descricao: "a descrição", observacoes: "as observações",
};

/** Texto de um valor para o aviso (datas e números legíveis). */
export function textoValor(v: unknown) {
  if (vazio(v)) return "(vazio)";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10).split("-").reverse().join("/");
  const n = numero(v);
  if (n !== null) return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** Mensagem do conflito: o que mudou dos dois lados. */
export function mensagemConflito(conflitos: Conflito[]) {
  return conflitos.map((c) => `• ${(NOME_CAMPO[c.campo] ?? c.campo).replace(/^./, (x) => x.toUpperCase())}: agora está ${textoValor(c.atual)}; você colocou ${textoValor(c.seu)}.`).join("\n");
}

/**
 * Grava com versão e resolve conflito perguntando. escolher() recebe os conflitos e devolve true = usar o meu.
 * Usar o meu manda outra operação com o valor atual como "antes"; manter o da outra pessoa tira esses campos.
 */
export async function gravarSincronizado(op: {
  tabela: TabelaSincronizada; id: string; versaoBase: number | null | undefined; antes: Record<string, unknown>; depois: Record<string, unknown>;
  escolher: (conflitos: Conflito[]) => Promise<boolean>;
}): Promise<ResultadoOperacao & { mantidos?: string[] }> {
  const campos = camposMudados(op.antes, op.depois);
  if (!Object.keys(campos).length) return { status: "aplicada", versao: op.versaoBase ?? undefined, conflitos: [], sobrescritos: [] };
  try {
    return await aplicarOperacao({ tabela: op.tabela, id: op.id, versaoBase: op.versaoBase, campos });
  } catch (e) {
    if (!(e instanceof ConflitoEdicao)) throw e;
    const usarMeu = await op.escolher(e.conflitos);
    const ajustados = { ...campos };
    for (const c of e.conflitos) {
      if (usarMeu) ajustados[c.campo] = { antes: c.atual, depois: c.seu };
      else delete ajustados[c.campo];
    }
    const r = await aplicarOperacao({ tabela: op.tabela, id: op.id, versaoBase: e.versao, campos: ajustados });
    return { ...r, mantidos: usarMeu ? [] : e.conflitos.map((c) => c.campo) };
  }
}
