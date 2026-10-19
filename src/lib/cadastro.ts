// Preenchimento automático dos cadastros pelo CNPJ e pelo CEP.
import { buscarCep } from "./cep";
import { buscarCnpj, inscricaoDoEstado, preencherVazios } from "./cnpj";
import { notify } from "./notify";
import { cnpjValido } from "./compliance";
import { nomeProprio, separarNomeMei } from "../../supabase/functions/_shared/receita";

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
  // MEI: "52.431.268 BRUNO JOSE SALM" vira "Bruno Jose Salm" (o original vai para as observações ao salvar)
  const mei = separarNomeMei(d.nome);
  const fonte = { ...d, nome: nomeProprio(mei.nome), nome_fantasia: d.nome_fantasia ? nomeProprio(d.nome_fantasia) : d.nome_fantasia, inscricao_estadual: ie } as Record<string, unknown>;
  const mapa = Object.fromEntries(Object.entries(MAPA_CNPJ).filter(([k]) => campos.includes(k)));
  const patch = forcar
    ? Object.fromEntries(Object.entries(mapa).filter(([, o]) => fonte[o]).map(([k, o]) => [k, fonte[o]]))
    // IE com o próprio CNPJ (erro comum de digitação) conta como vazia: a da Receita/SINTEGRA entra no lugar
    : preencherVazios(ieDoCnpj(row.inscricao_estadual, cnpj) ? { ...row, inscricao_estadual: "" } : row, fonte, mapa);
  if (mei.original && "nome" in patch && !String(row.observacoes ?? "").includes(mei.original)) {
    patch.observacoes = [String(row.observacoes ?? "").trim(), `Razão social na Receita: ${mei.original}`].filter(Boolean).join("\n");
  }
  if (d.situacao && d.situacao !== "ATIVA") notify(`Atenção: CNPJ com situação ${d.situacao} na Receita`, "erro");
  else if (campos.includes("inscricao_estadual") && !ie && !row.inscricao_estadual)
    notify("Dados preenchidos pela Receita. Inscrição estadual não encontrada: confira no SINTEGRA do estado.");
  else notify(ie && campos.includes("inscricao_estadual") ? `Dados preenchidos pela Receita (IE ${ie})` : "Dados preenchidos pela Receita Federal");
  return patch;
}

/** A "inscrição estadual" digitada é, na verdade, o CNPJ do cliente. */
export const ieDoCnpj = (ie: unknown, cnpj: unknown) => {
  const i = String(ie ?? "").replace(/\D/g, "");
  return !!i && i === String(cnpj ?? "").replace(/\D/g, "");
};

/**
 * Botão "Buscar IE": consulta o CNPJ (CNPJá e CNPJ.ws, que trazem o SINTEGRA) e devolve a inscrição estadual ativa
 * no estado do cliente, já marcando o cliente como contribuinte. Sem IE na consulta, explica onde conferir.
 */
export async function buscarIe(cnpj: string | null | undefined, uf: string | null | undefined): Promise<Record<string, unknown> | null> {
  if (!cnpjValido(cnpj ?? "")) { notify("Para buscar a IE, preencha antes o CNPJ do cliente", "erro"); return null; }
  const d = await buscarCnpj(cnpj);
  if (!d) { notify("A consulta do CNPJ está fora do ar agora: tente de novo em 1 minuto", "erro"); return null; }
  const estado = uf || d.uf;
  const ie = inscricaoDoEstado(d, estado);
  if (!ie) {
    const outras = (d.inscricoes ?? []).filter((i) => i.numero);
    notify(outras.length
      ? `Nenhuma IE ativa em ${estado ?? "estado do cliente"}: ${outras.map((i) => `${i.uf} ${i.numero}${i.ativa ? "" : " (baixada)"}`).join(", ")}. Confira no SINTEGRA.`
      : `A consulta não trouxe inscrição estadual. Se a SEFAZ diz que o cliente é contribuinte, peça a IE a ele ou consulte o SINTEGRA de ${estado ?? "seu estado"}.`, "erro");
    return null;
  }
  notify(`IE ${ie} (${estado}) encontrada: cliente marcado como contribuinte. Toque em Salvar.`);
  return { inscricao_estadual: ie, contribuinte_icms: 1 };
}

/** Busca o CEP e devolve logradouro, bairro, município e UF. */
export async function completarPorCep(cep: string, forcar = false) {
  const r = await buscarCep(cep);
  if (!r && forcar) notify("CEP não encontrado", "erro");
  return r;
}
