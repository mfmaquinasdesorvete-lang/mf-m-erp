// Preenchimento automático dos cadastros pelo CNPJ e pelo CEP.
import { buscarCep } from "./cep";
import { buscarCnpj, inscricaoDoEstado, preencherVazios } from "./cnpj";
import { notify } from "./notify";
import { cnpjValido } from "./compliance";

/** Campos do cadastro ← dados da Receita. */
export const MAPA_CNPJ = {
  nome: "nome", nome_fantasia: "nome_fantasia", email: "email", telefone: "telefone", cep: "cep", logradouro: "logradouro",
  numero: "numero", complemento: "complemento", bairro: "bairro", municipio: "municipio", uf: "uf", inscricao_estadual: "inscricao_estadual",
};

/**
 * Busca o CNPJ e devolve o que preencher. Automático: só os campos vazios.
 * Pelo botão de busca (forcar): substitui tudo pelo que está na Receita.
 */
export async function completarPorCnpj(row: Record<string, any>, cnpj: string, campos: string[], forcar = false) {
  if (!cnpjValido(cnpj)) {
    if (forcar) notify("CNPJ inválido: confira os números", "erro");
    return null;
  }
  const achado = await buscarCnpj(cnpj);
  // o endereço da Receita vem em maiúsculas e sem acento: o CEP traz o nome certo da rua e da cidade
  const viaCep = achado?.cep ? await buscarCep(achado.cep) : null;
  const d = achado && viaCep ? { ...achado, logradouro: viaCep.logradouro || achado.logradouro, bairro: viaCep.bairro || achado.bairro, municipio: viaCep.municipio || achado.municipio } : achado;
  if (!d) {
    if (forcar) notify("CNPJ não encontrado na Receita (ou a consulta está fora do ar)", "erro");
    return null;
  }
  const ie = inscricaoDoEstado(d, d.uf);
  const fonte = { ...d, inscricao_estadual: ie } as Record<string, unknown>;
  const mapa = Object.fromEntries(Object.entries(MAPA_CNPJ).filter(([k]) => campos.includes(k)));
  const patch = forcar
    ? Object.fromEntries(Object.entries(mapa).filter(([, o]) => fonte[o]).map(([k, o]) => [k, fonte[o]]))
    : preencherVazios(row, fonte, mapa);
  if (d.situacao && d.situacao !== "ATIVA") notify(`Atenção: CNPJ com situação ${d.situacao} na Receita`, "erro");
  else if (campos.includes("inscricao_estadual") && !ie && !row.inscricao_estadual)
    notify("Dados preenchidos pela Receita. Inscrição estadual não encontrada: confira no SINTEGRA do estado.");
  else notify(ie && campos.includes("inscricao_estadual") ? `Dados preenchidos pela Receita (IE ${ie})` : "Dados preenchidos pela Receita Federal");
  return patch;
}

/** Busca o CEP e devolve logradouro, bairro, município e UF. */
export async function completarPorCep(cep: string, forcar = false) {
  const r = await buscarCep(cep);
  if (!r && forcar) notify("CEP não encontrado", "erro");
  return r;
}
