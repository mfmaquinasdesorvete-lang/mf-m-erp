// Segurança do banco, lida das migrações (supabase/migrations): toda função "security definer" roda com o dono do
// banco e passa por cima das regras de linha (RLS), então precisa fixar o search_path e conferir quem chama.
// Matriz completa em supabase/PERMISSOES.md.
import { describe, expect, it } from "vitest";

/** Texto de cada migração pelo nome do arquivo (o Vite lê na hora do teste) */
const MIGRACOES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob("../../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>)
    .map(([caminho, sql]) => [caminho.split("/").pop()!, sql]),
);
const ARQUIVOS = Object.keys(MIGRACOES).sort();

type Funcao = { arquivo: string; corpo: string; atributos: string; gatilho: boolean; definer: boolean };

/** Última definição de cada função + quem ficou sem acesso (revoke/grant na ordem das migrações) */
function lerMigracoes() {
  const funcoes = new Map<string, Funcao>();
  const fechadaAuth = new Map<string, boolean>();
  const abertaAnon = new Map<string, boolean>();
  const RX_FUNCAO = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*returns\s+([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\4\$/gi;
  const RX_ACESSO = /\b(grant|revoke)\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+(?:public\.)?(\w+)[^;]*?\b(to|from)\s+([^;]+);/gi;
  for (const arquivo of ARQUIVOS) {
    const sql = MIGRACOES[arquivo];
    // funções e permissões na ordem em que aparecem no arquivo
    const eventos: { pos: number; aplicar: () => void }[] = [];
    for (const m of sql.matchAll(RX_FUNCAO)) {
      const fim = m.index! + m[0].length;
      const depois = sql.slice(fim, fim + 400).split(";")[0];
      const atributos = `${m[3]} ${depois}`.toLowerCase();
      eventos.push({ pos: m.index!, aplicar: () => funcoes.set(m[1].toLowerCase(), {
        arquivo, corpo: m[5], atributos, gatilho: /^\s*trigger\b/i.test(m[3]), definer: atributos.includes("security definer"),
      }) });
    }
    for (const m of sql.matchAll(RX_ACESSO)) {
      const nome = m[2].toLowerCase();
      const papeis = m[4].toLowerCase();
      const grant = m[1].toLowerCase() === "grant";
      eventos.push({ pos: m.index!, aplicar: () => {
        if (/\bauthenticated\b/.test(papeis)) fechadaAuth.set(nome, !grant);
        if (/\banon\b/.test(papeis)) abertaAnon.set(nome, grant);
      } });
    }
    for (const e of eventos.sort((a, b) => a.pos - b.pos)) e.aplicar();
  }
  return { funcoes, fechadaAuth, abertaAnon };
}

const { funcoes, fechadaAuth, abertaAnon } = lerMigracoes();

/** Conferências de quem chama que valem (papel do ERP, contador, o próprio usuário, vendedor do portal) */
const CONFERE = /exigir_papel|tem_(?:algum_)?papel|is_erp_\w+|e_contador|pode_\w+|auth\.uid\(\)|auth\.role\(\)|portal_meu_vendedor|portal_vendedor_exigido|projeto_pode|metas_meus/i;

/** Páginas públicas: o visitante (anon) chama pelo token do link */
const PUBLICAS: Record<string, string> = {
  area_cliente: "área do cliente pelo token",
  area_cliente_link: "área do cliente pelo link com o nome (parte sorteada no fim)",
  cotacao_publica: "fornecedor abre a cotação pelo token",
  cotacao_responder: "fornecedor responde a cotação pelo token",
  cotacao_recusar: "fornecedor recusa a cotação pelo token",
  ficha_cadastral_publica: "cliente abre a ficha cadastral pelo token",
  ficha_cadastral_assinar: "cliente assina a ficha cadastral pelo token",
  maquina_publica: "página da máquina pelo token",
  proposta_publica: "cliente abre a proposta pelo token",
  proposta_responder: "cliente aprova ou recusa a proposta pelo token",
  loja_dados: "vitrine da loja (produtos e preços públicos)",
  erp_sem_usuarios: "tela de login: diz só se o ERP ainda não tem usuário (primeira instalação)",
  erp_interesse: "página /conheca: o visitante deixa o contato (só grava, com limite por hora)",
};

/** Ajudantes de leitura para quem está logado: devolvem um número, um nome ou um sim/não, sem dado sigiloso */
const AJUDANTES: Record<string, string> = {
  aprovar_cotacao_envio: "repassa para aprovar_frete_envio, que confere o papel",
  clientes_fornecedores: "lista de quem é cliente e fornecedor ao mesmo tempo (só ids)",
  desconto_maximo: "desconto máximo do canal/forma de pagamento",
  dono_do_sku: "nome do produto que já usa o SKU (aviso de repetido)",
  envio_tem_anexo: "sim/não: o envio tem comprovante",
  fornecedor_bloqueio: "motivo do bloqueio do fornecedor (aviso antes de pagar)",
  frequencia_coleta: "frequência de coleta da transportadora",
  kit_composicao: "componentes do kit para a baixa de estoque",
  margem_alvo_produto: "margem alvo do produto",
  nome_transportadora: "nome da transportadora",
  pendencias_conta: "pendências de uma conta antes da aprovação",
  pendencias_conta_dados: "pendências de uma conta antes da aprovação",
  preco_sugerido: "preço sugerido pelo custo e pela margem",
  preco_tabela: "preço do produto na tabela",
  rateio_valido: "sim/não: o rateio fecha 100%",
  rosto_vigente: "sim/não: o login com o rosto já é obrigatório (data em configuracoes)",
  termo_ficha_cadastral: "texto do termo da ficha cadastral",
  unidade_matriz: "id da unidade matriz",
};

const definers = [...funcoes].filter(([, f]) => f.definer);

describe("funções security definer (banco)", () => {
  it("as migrações têm as funções do ERP", () => {
    expect(definers.length).toBeGreaterThan(300);
  });

  it("todas fixam o search_path", () => {
    const sem = definers.filter(([, f]) => !/search_path/.test(f.atributos) && !/set_config\(\s*'search_path'/i.test(f.corpo)).map(([n]) => n);
    expect(sem).toEqual([]);
  });

  it("todas conferem quem chama, ou são gatilho, só do servidor, página pública ou ajudante justificado", () => {
    const soltas = definers
      .filter(([n, f]) => !f.gatilho && !CONFERE.test(f.corpo) && !fechadaAuth.get(n) && !PUBLICAS[n] && !AJUDANTES[n])
      .map(([n, f]) => `${n} (${f.arquivo})`);
    expect(soltas).toEqual([]);
  });

  it("só as páginas públicas ficam liberadas para o visitante sem login (anon)", () => {
    const abertas = [...abertaAnon].filter(([n, aberta]) => aberta && funcoes.get(n)?.definer && !PUBLICAS[n]).map(([n]) => n);
    expect(abertas).toEqual([]);
  });

  it("os ajudantes sem conferência ficam fechados para o visitante (anon)", () => {
    const abertos = Object.keys(AJUDANTES).filter((n) => funcoes.get(n)?.definer && !CONFERE.test(funcoes.get(n)!.corpo) && abertaAnon.get(n) !== false);
    expect(abertos).toEqual([]);
  });

  it("as listas do teste não têm nome velho (função que sumiu ou deixou de ser security definer)", () => {
    const velhos = [...Object.keys(PUBLICAS), ...Object.keys(AJUDANTES)].filter((n) => !funcoes.get(n)?.definer);
    expect(velhos).toEqual([]);
  });
});

describe("permissões das tabelas (banco)", () => {
  const depois = ARQUIVOS.filter((f) => f >= "20261017173100");
  it("nenhuma migração nova devolve ao visitante (anon) gravação nas tabelas", () => {
    const grava = depois.filter((f) => /grant\s+[^;]*\b(insert|update|delete|truncate|all)\b[^;]*\bon\s+(?!function)[^;]*\bto\s+[^;]*\banon\b/i.test(MIGRACOES[f]));
    expect(grava).toEqual([]);
  });
});
