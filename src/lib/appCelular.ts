// Apps de celular do ERP (sem o menu do ERP): qual app cada papel abre pelo celular e a escolha guardada no aparelho.
// A regra de abrir fica em lib/appVendas (abrirAppCelular); o app do financeiro usa lib/appFinanceiro.
export const CHAVE_APP_EXPEDICAO = "mf-erp-abrir-app-expedicao";
export const CHAVE_APP_ASSISTENCIA = "mf-erp-abrir-app-assistencia";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** A OS é deste técnico? O campo técnico é texto livre: vale o nome completo ou o primeiro nome (sem acento). */
export function ehDoTecnico(tecnico: string | null | undefined, nomeUsuario: string | null | undefined) {
  const t = semAcento(tecnico ?? "");
  const n = semAcento(nomeUsuario ?? "");
  if (!t || !n) return false;
  if (t === n || t.includes(n)) return true;
  const primeiro = n.split(/\s+/)[0];
  return primeiro.length >= 3 && t.split(/[\s,/;]+/).includes(primeiro);
}
