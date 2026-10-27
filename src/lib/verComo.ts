// "Ver como" (conta master): a dona usa o ERP com o menu, as telas e os botões de outro papel ou de outra pessoa, sem
// entrar com outro login. É só a aparência: o banco continua lendo com o login dela e, enquanto simula, as gravações
// ficam travadas (ver guardaVerComo), para nada ser salvo em nome errado. Vale só nesta aba (sessionStorage).
import type { Papel } from "./permissoes";

export type VerComo = { papel: Papel; extras: Papel[]; nome: string; user_id?: string; unidade_id?: string | null };

const CHAVE = "erp-ver-como";

export function lerVerComo(): VerComo | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE) ?? "null");
    return v && typeof v.papel === "string" ? { ...v, extras: Array.isArray(v.extras) ? v.extras : [] } : null;
  } catch { return null; }
}

/** Começa a simular e recarrega no início do papel (limpa o que a tela já tinha carregado). */
export function entrarVerComo(v: VerComo) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(v)); } catch { return; }
  window.location.assign("/");
}

/** Volta para a conta de verdade. */
export function sairVerComo(recarregar = true) {
  try { sessionStorage.removeItem(CHAVE); } catch { /* sem armazenamento: nada a limpar */ }
  if (recarregar) window.location.assign("/retaguarda");
}

export const MSG_SO_VER = "Modo \"Ver como\": é só para ver. Volte para a sua conta (faixa no alto) para salvar ou mudar algo.";

// Funções do banco que gravam ou disparam algo, pelo começo do nome; as outras (leituras dos painéis) passam
const RPC_GRAVA = /^(aprovar|reprovar|emitir|cancelar|baixar|lancar|registrar|salvar|gravar|excluir|apagar|criar|gerar|enviar|marcar|desmarcar|pagar|receber|conciliar|desconciliar|ignorar|derrubar|reabrir|concluir|desfazer|atualizar|importar|unificar|anotar|confirmar|definir|mudar|trocar|ligar|desligar|vincular|desvincular|liberar|bloquear|fechar|recalcular|decidir|inserir|adicionar|incluir|remover|alterar|editar|mover|duplicar|restaurar|arquivar|transferir|estornar|devolver|separar|faturar|agendar|programar|iniciar|finalizar|terminar|publicacao|aviso|reivindicar|seguranca_aceitar|vigiar|conferir_pedido|ajustar|aplicar|copiar|corrigir|distribuir|dividir|juntar|limpar|preencher|reservar|resolver|retomar|solicitar|suspender|usar|validar|zerar|abrir|responder|recusar|assinar)/i;

/** O pedido ao Supabase grava algo? (tabela com POST/PATCH/PUT/DELETE, função que grava, Edge Function ou arquivo) */
export function pedidoGrava(url: string, metodo: string) {
  const m = metodo.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  const caminho = new URL(url, "http://x").pathname;
  if (caminho.includes("/rest/v1/rpc/")) return RPC_GRAVA.test(caminho.split("/rest/v1/rpc/")[1] ?? "");
  if (caminho.includes("/rest/v1/")) return true;
  if (caminho.includes("/functions/v1/")) return true;
  if (caminho.includes("/storage/v1/object/")) return !caminho.includes("/object/sign/") && !caminho.includes("/object/list/");
  return false; // login (auth) e o resto passam
}

/** fetch do Supabase: enquanto simula, recusa o que grava com uma mensagem clara. */
export function guardaVerComo(fetcher: typeof fetch): typeof fetch {
  return (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const metodo = init?.method ?? (entrada instanceof Request ? entrada.method : "GET");
    if (lerVerComo() && pedidoGrava(url, metodo)) {
      return Promise.resolve(new Response(JSON.stringify({ message: MSG_SO_VER, error: MSG_SO_VER, code: "VER_COMO" }),
        { status: 403, headers: { "Content-Type": "application/json" } }));
    }
    return fetcher(entrada, init);
  };
}
