import { digitos } from "./format";

/** Busca endereço pelo CEP (ViaCEP; se falhar, BrasilAPI). Retorna null se não encontrar. */
export async function buscarCep(cep: string) {
  const d = digitos(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = await r.json();
    if (!j.erro) return { logradouro: j.logradouro, bairro: j.bairro, municipio: j.localidade, uf: j.uf };
  } catch { /* tenta a outra fonte */ }
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${d}`);
    if (!r.ok) return null;
    const j = await r.json();
    return { logradouro: j.street, bairro: j.neighborhood, municipio: j.city, uf: j.state };
  } catch {
    return null;
  }
}
