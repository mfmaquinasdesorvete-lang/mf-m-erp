import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { buscar } from "../../../supabase/functions/_shared/ia-busca-consulta";
import { etiquetasBusca, normalizarBusca } from "../../../supabase/functions/_shared/ia-busca";

/** Cliente do Supabase que não vai à rede: guarda os endereços montados e responde com a lista dada. */
function clienteFalso(resposta: unknown[] = []) {
  const urls: string[] = [];
  const db = createClient("https://exemplo.supabase.co", "chave", {
    auth: { persistSession: false },
    global: { fetch: async (u: RequestInfo | URL) => { urls.push(decodeURIComponent(String(u))); return new Response(JSON.stringify(resposta), { status: 200, headers: { "content-type": "application/json" } }); } },
  });
  return { db, urls };
}
const filtros = (b: Record<string, unknown>) => normalizarBusca({ entendi: "x", ...b }, "pergunta");

describe("ia-busca: o que a IA devolve", () => {
  it("campos fora do formato viram null e a UF fica em maiúsculas", () => {
    const f = normalizarBusca({ entidade: "maquinas", uf: "sp", de: "01/09/2026", garantia: "talvez", valor_min: "100", ordem: "maior_valor" }, "máquinas em SP");
    expect(f.entidade).toBe("maquinas");
    expect(f.uf).toBe("SP");
    expect(f.de).toBeNull();
    expect(f.garantia).toBeNull();
    expect(f.valor_min).toBeNull();
    expect(f.ordem).toBe("maior_valor");
    expect(f.entendi).toContain("máquinas em SP");
  });
  it("entidade desconhecida cai em vendas e as etiquetas descrevem os filtros", () => {
    const f = normalizarBusca({ entidade: "planetas", texto: "Queen", uf: "MG", de: "2026-09-01", preventiva: "vencida" }, "p");
    expect(f.entidade).toBe("vendas");
    expect(etiquetasBusca(f)).toEqual(['"Queen"', "MG", "de 01/09/2026", "preventiva vencida"]);
  });
});

describe("ia-busca: as consultas montadas", () => {
  it("vendas: cliente pelo nome e estado (embutido obrigatório), situação, período e maior valor", async () => {
    const { db, urls } = clienteFalso();
    await buscar(db, filtros({ entidade: "vendas", texto: "gelato", uf: "SP", situacao: "entregue", de: "2026-01-01", ate: "2026-01-31", ordem: "maior_valor" }));
    const u = urls[0];
    expect(u).toContain("/pedidos?");
    expect(u).toContain("cliente:clientes!inner(");
    expect(u).toContain("cliente.or=(nome.ilike.%gelato%,nome_fantasia.ilike.%gelato%)");
    expect(u).toContain("cliente.uf=eq.SP");
    expect(u).toContain("status=eq.entregue");
    expect(u).toContain("created_at=gte.2026-01-01");
    expect(u).toContain("created_at=lt.2026-02-01");
    expect(u).toContain("order=valor_total.desc.nullslast");
  });
  it("máquinas: garantia vencendo em 30 dias e sem preventiva", async () => {
    const { db, urls } = clienteFalso();
    await buscar(db, filtros({ entidade: "maquinas", garantia: "vence_30", preventiva: "sem" }));
    expect(urls[0]).toContain("/equipamentos?");
    expect(urls[0]).toMatch(/garantia_ate=gte\.\d{4}-\d{2}-\d{2}&garantia_ate=lte\./);
    expect(urls[0]).toContain("proxima_preventiva=is.null");
  });
  it("contas vencidas = abertas com vencimento antes de hoje; texto procura o fornecedor pelo nome", async () => {
    const { db, urls } = clienteFalso([{ id: "f1" }]);
    await buscar(db, filtros({ entidade: "pagar", texto: "Visus, (teste)", situacao: "vencido" }));
    expect(urls[0]).toContain("/fornecedores?");
    expect(urls[0]).toContain("%Visus+teste%"); // vírgula e parênteses saem do texto
    expect(urls[1]).toContain("/contas_pagar?");
    expect(urls[1]).toContain("fornecedor_id.in.(f1)");
    expect(urls[1]).toContain("status=eq.aberto");
    expect(urls[1]).toMatch(/vencimento=lt\.\d{4}-\d{2}-\d{2}/);
  });
  it("clientes parados: compraram antes da data e não depois", async () => {
    const { db, urls } = clienteFalso();
    const r = await buscar(db, filtros({ entidade: "clientes", sem_compra_desde: "2026-04-01" }));
    expect(r).toEqual([]);
    expect(urls.some((u) => u.includes("created_at=gte.2026-04-01"))).toBe(true);
    expect(urls.some((u) => u.includes("created_at=lt.2026-04-01"))).toBe(true);
  });
  it("produtos abaixo do mínimo: o filtro final compara estoque com mínimo", async () => {
    const { db } = clienteFalso([
      { id: "a", descricao: "Bico", estoque_atual: 1, estoque_minimo: 5, sku: "B1", tipo: "peca", preco_venda: 10 },
      { id: "b", descricao: "Motor", estoque_atual: 9, estoque_minimo: 5, sku: "M1", tipo: "peca", preco_venda: 10 },
    ]);
    const r = await buscar(db, filtros({ entidade: "produtos", estoque: "abaixo_minimo" }));
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });
});
