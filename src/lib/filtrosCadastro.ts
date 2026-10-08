// Filtros e ordenações comuns das listas de cadastro (clientes, fornecedores, transportadoras).
import type { FiltroCrud, OrdemCrud } from "@/components/CrudPage";

type Cadastro = {
  nome: string; nome_fantasia?: string | null; codigo?: number | null; created_at?: string;
  uf?: string | null; municipio?: string | null; cep?: string | null; logradouro?: string | null;
  email?: string | null; whatsapp?: string | null; telefone?: string | null;
};

const dias = (n: number) => Date.now() - n * 864e5;
const criado = (r: Cadastro) => (r.created_at ? Date.parse(r.created_at) : 0);
const texto = (a?: string | null, b?: string | null) => (a ?? "").localeCompare(b ?? "", "pt-BR", { sensitivity: "base" });

export const filtrosLocal = <T extends Cadastro>(): FiltroCrud<T>[] => [
  { label: "UF", valor: (r) => r.uf?.toUpperCase() },
  { label: "Cidade", valor: (r) => r.municipio },
];

/** O que falta no cadastro (para completar) — `doc` é o campo de CPF/CNPJ da tabela. */
export const filtroCompletude = <T extends Cadastro>(doc: (r: T) => string | null | undefined, extras: { label: string; teste: (r: T) => boolean }[] = []): FiltroCrud<T> => ({
  label: "Cadastro",
  opcoes: [
    { label: "Sem CPF/CNPJ", teste: (r) => !doc(r) },
    { label: "Sem WhatsApp e telefone", teste: (r) => !r.whatsapp && !r.telefone },
    { label: "Sem e-mail", teste: (r) => !r.email },
    { label: "Sem endereço", teste: (r) => !r.cep || !r.logradouro },
    ...extras,
  ],
});

export const filtroCadastradoEm = <T extends Cadastro>(): FiltroCrud<T> => ({
  label: "Cadastrado",
  opcoes: [
    { label: "Últimos 7 dias", teste: (r) => criado(r) >= dias(7) },
    { label: "Últimos 30 dias", teste: (r) => criado(r) >= dias(30) },
    { label: "Últimos 90 dias", teste: (r) => criado(r) >= dias(90) },
    { label: "Este ano", teste: (r) => criado(r) >= new Date(new Date().getFullYear(), 0, 1).getTime() },
  ],
});

export const ordensCadastro = <T extends Cadastro>(): OrdemCrud<T>[] => [
  { label: "nome (A–Z)", comparar: (a, b) => texto(a.nome, b.nome) },
  { label: "nome (Z–A)", comparar: (a, b) => texto(b.nome, a.nome) },
  { label: "fantasia (A–Z)", comparar: (a, b) => texto(a.nome_fantasia || a.nome, b.nome_fantasia || b.nome) },
  { label: "código", comparar: (a, b) => Number(a.codigo ?? 0) - Number(b.codigo ?? 0) },
  { label: "mais recentes", comparar: (a, b) => criado(b) - criado(a) },
  { label: "cidade", comparar: (a, b) => texto(a.municipio, b.municipio) || texto(a.nome, b.nome) },
];
