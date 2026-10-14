import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco falso em memória no lugar do Supabase: guarda as tabelas, registra cada operação (na ordem) e deixa
// simular erro de rede numa operação ("insert:os_itens" etc.).
const banco = vi.hoisted(() => {
  type Linha = Record<string, unknown>;
  type Resposta = { data: unknown; error: { message: string } | null };
  type Op = "select" | "insert" | "update" | "delete";
  const estado = {
    tabelas: {} as Record<string, Linha[]>,
    log: [] as { op: Op; tabela: string; filtro?: string; dados?: unknown }[],
    falhas: {} as Record<string, string>,
    seq: 0,
    numero: 1500,
  };

  class Consulta implements PromiseLike<Resposta> {
    private op: Op = "select";
    private colunas = "*";
    private retorno: string | null = null;
    private dados: Linha | Linha[] | null = null;
    private filtros: { texto: string; ok: (l: Linha) => boolean }[] = [];
    private unico = false;
    constructor(private tabela: string) {}

    select(colunas = "*") {
      if (this.op === "select") this.colunas = colunas;
      else this.retorno = colunas;
      return this;
    }
    insert(dados: Linha | Linha[]) { this.op = "insert"; this.dados = dados; return this; }
    update(dados: Linha) { this.op = "update"; this.dados = dados; return this; }
    delete() { this.op = "delete"; return this; }
    eq(coluna: string, valor: unknown) { this.filtros.push({ texto: `${coluna}=${String(valor)}`, ok: (l) => l[coluna] === valor }); return this; }
    in(coluna: string, valores: unknown[]) { this.filtros.push({ texto: `${coluna} in ${valores.join(",")}`, ok: (l) => valores.includes(l[coluna]) }); return this; }
    single() { this.unico = true; return this; }

    private projetar(l: Linha, colunas: string) {
      if (colunas === "*") return { ...l };
      return Object.fromEntries(colunas.split(",").map((c) => c.trim()).map((c) => [c, l[c]]));
    }

    private executar(): Resposta {
      const linhas = (estado.tabelas[this.tabela] ??= []);
      const filtro = this.filtros.map((f) => f.texto).join(" & ") || undefined;
      estado.log.push({ op: this.op, tabela: this.tabela, filtro, dados: this.dados ?? undefined });
      const falha = estado.falhas[`${this.op}:${this.tabela}`];
      if (falha) return { data: null, error: { message: falha } };
      const passa = (l: Linha) => this.filtros.every((f) => f.ok(l));
      if (this.op === "select") return { data: linhas.filter(passa).map((l) => this.projetar(l, this.colunas)), error: null };
      if (this.op === "update") {
        for (const l of linhas.filter(passa)) Object.assign(l, this.dados);
        return { data: null, error: null };
      }
      if (this.op === "delete") {
        estado.tabelas[this.tabela] = linhas.filter((l) => !passa(l));
        return { data: null, error: null };
      }
      const novas = (Array.isArray(this.dados) ? this.dados : [this.dados!]).map((d) => ({ id: `${this.tabela}-${++estado.seq}`, numero: ++estado.numero, ...d }));
      linhas.push(...novas);
      if (!this.retorno) return { data: null, error: null };
      const data = novas.map((l) => this.projetar(l, this.retorno!));
      return { data: this.unico ? data[0] : data, error: null };
    }

    then<A = Resposta, B = never>(ok?: ((r: Resposta) => A | PromiseLike<A>) | null, erro?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return Promise.resolve().then(() => this.executar()).then(ok, erro);
    }
  }

  return {
    estado,
    supabase: { from: (tabela: string) => new Consulta(tabela) },
    reiniciar(tabelas: Record<string, Linha[]> = {}) {
      estado.tabelas = structuredClone(tabelas);
      estado.log = [];
      estado.falhas = {};
      estado.seq = 0;
      estado.numero = 1500;
    },
  };
});

vi.mock("../supabase", () => ({ supabase: banco.supabase }));

import { criarComItens, sincronizarItens } from "../itens";

type ItemTela = { id?: string | null; produto_id: string; quantidade: number; valor_unitario: number; quantidade_recebida?: number };
const linhaCompra = (i: ItemTela) => ({ produto_id: i.produto_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario, quantidade_recebida: i.quantidade_recebida ?? 0 });
const ops = () => banco.estado.log.map((l) => `${l.op}:${l.tabela}${l.filtro ? `[${l.filtro}]` : ""}`);
const ultimaOp = () => ops()[ops().length - 1];
const tabela = (t: string) => banco.estado.tabelas[t] ?? [];

describe("sincronizarItens", () => {
  beforeEach(() => banco.reiniciar({
    pedidos_compra_itens: [
      { id: "a1", pedido_compra_id: "pc1", produto_id: "ROL", quantidade: 10, valor_unitario: 25.5, quantidade_recebida: 4 },
      { id: "a2", pedido_compra_id: "pc1", produto_id: "RET", quantidade: 3, valor_unitario: 8.9, quantidade_recebida: 0 },
      { id: "a3", pedido_compra_id: "pc1", produto_id: "EIXO", quantidade: 1, valor_unitario: 120, quantidade_recebida: 0 },
      { id: "x1", pedido_compra_id: "pc2", produto_id: "ROL", quantidade: 50, valor_unitario: 24, quantidade_recebida: 0 },
    ],
  }));

  it("atualiza o que continua, grava o que entrou e só no fim apaga o que saiu", async () => {
    const tela: ItemTela[] = [
      { id: "a2", produto_id: "RET", quantidade: 5, valor_unitario: 8.5 },
      { produto_id: "PAR", quantidade: 200, valor_unitario: 0.35 },
      { id: "a1", produto_id: "ROL", quantidade: 12, valor_unitario: 25.5, quantidade_recebida: 0 }, // tela desatualizada
    ];
    const ids = await sincronizarItens("pedidos_compra_itens", "pedido_compra_id", "pc1", tela, linhaCompra, { preservar: ["quantidade_recebida"] });

    const novo = tabela("pedidos_compra_itens").find((l) => l.produto_id === "PAR")!;
    expect(ids).toEqual(["a2", novo.id, "a1"]); // mesma ordem da tela
    expect(ops()).toEqual([
      "select:pedidos_compra_itens[pedido_compra_id=pc1]",
      "update:pedidos_compra_itens[id=a2]",
      "update:pedidos_compra_itens[id=a1]",
      "insert:pedidos_compra_itens",
      "delete:pedidos_compra_itens[id in a3]",
    ]);
    const a1 = tabela("pedidos_compra_itens").find((l) => l.id === "a1")!;
    expect(a1.quantidade).toBe(12);
    expect(a1.quantidade_recebida).toBe(4); // coluna preservada não é sobrescrita
    expect(tabela("pedidos_compra_itens").find((l) => l.id === "a2")).toMatchObject({ quantidade: 5, valor_unitario: 8.5 });
    expect(novo).toMatchObject({ pedido_compra_id: "pc1", quantidade: 200, valor_unitario: 0.35 });
    expect(tabela("pedidos_compra_itens").map((l) => l.id).sort()).toEqual(["a1", "a2", "x1", novo.id].sort()); // o outro pedido fica intacto
  });

  it("se a gravação dos novos falhar, nada é apagado", async () => {
    banco.estado.falhas["insert:pedidos_compra_itens"] = "Failed to fetch";
    const tela: ItemTela[] = [{ id: "a1", produto_id: "ROL", quantidade: 12, valor_unitario: 25.5 }, { produto_id: "PAR", quantidade: 1, valor_unitario: 1 }];
    await expect(sincronizarItens("pedidos_compra_itens", "pedido_compra_id", "pc1", tela, linhaCompra)).rejects.toMatchObject({ message: "Failed to fetch" });
    expect(ops().some((o) => o.startsWith("delete"))).toBe(false);
    expect(tabela("pedidos_compra_itens")).toHaveLength(4);
  });

  it("chaveNatural acha a linha gravada para item sem id (ficha técnica: um componente por produto)", async () => {
    banco.reiniciar({
      produto_componentes: [
        { id: "f1", produto_id: "MAQ", componente_id: "GAB", quantidade: 1 },
        { id: "f2", produto_id: "MAQ", componente_id: "MOT", quantidade: 1 },
      ],
    });
    const tela = [{ componente_id: "MOT", quantidade: 2 }, { componente_id: "CABO", quantidade: 1.5 }];
    const ids = await sincronizarItens("produto_componentes", "produto_id", "MAQ", tela as { id?: string | null; componente_id: string; quantidade: number }[],
      (i) => ({ componente_id: i.componente_id, quantidade: i.quantidade }), { chaveNatural: "componente_id" });

    const linhas = tabela("produto_componentes");
    expect(ids[0]).toBe("f2");
    expect(ids[1]).toBe(linhas.find((l) => l.componente_id === "CABO")!.id);
    expect(linhas.filter((l) => l.componente_id === "MOT")).toEqual([{ id: "f2", produto_id: "MAQ", componente_id: "MOT", quantidade: 2 }]); // não duplicou
    expect(linhas.some((l) => l.id === "f1")).toBe(false);
    expect(banco.estado.log[0].op).toBe("select");
    expect(ultimaOp()).toBe("delete:produto_componentes[id in f1]");
  });

  it("lista vazia tira todos os itens do documento (e só dele), sem gravar nada", async () => {
    expect(await sincronizarItens("pedidos_compra_itens", "pedido_compra_id", "pc1", [] as ItemTela[], linhaCompra)).toEqual([]);
    expect(ops()).toEqual(["select:pedidos_compra_itens[pedido_compra_id=pc1]", "delete:pedidos_compra_itens[id in a1,a2,a3]"]);
    expect(tabela("pedidos_compra_itens").map((l) => l.id)).toEqual(["x1"]);
  });

  it("id repetido na tela não é usado duas vezes: o segundo vira item novo", async () => {
    const tela: ItemTela[] = [{ id: "a1", produto_id: "ROL", quantidade: 1, valor_unitario: 25.5 }, { id: "a1", produto_id: "ROL", quantidade: 2, valor_unitario: 25.5 }];
    const ids = await sincronizarItens("pedidos_compra_itens", "pedido_compra_id", "pc1", tela, linhaCompra);
    expect(ids[0]).toBe("a1");
    expect(ids[1]).not.toBe("a1");
    expect(ids[1]).not.toBe("");
  });
});

describe("criarComItens", () => {
  beforeEach(() => banco.reiniciar());
  const itens = [{ produto_id: "ROL", quantidade: 10, valor_unitario: 25.5 }, { produto_id: "RET", quantidade: 3, valor_unitario: 8.9 }];

  it("grava o cabeçalho e os itens ligados a ele", async () => {
    const doc = await criarComItens("pedidos_compra", { fornecedor_id: "F1" }, "pedidos_compra_itens", "pedido_compra_id", itens);
    expect(doc).toEqual({ id: "pedidos_compra-1", numero: 1501 });
    expect(tabela("pedidos_compra_itens").map((l) => l.pedido_compra_id)).toEqual([doc.id, doc.id]);
  });

  it("sem itens não chama a gravação de itens", async () => {
    await criarComItens("pedidos_compra", { fornecedor_id: "F1" }, "pedidos_compra_itens", "pedido_compra_id", []);
    expect(ops()).toEqual(["insert:pedidos_compra"]);
  });

  it("itens falharam: apaga o cabeçalho e mostra o erro original", async () => {
    banco.estado.falhas["insert:pedidos_compra_itens"] = "valor_unitario inválido";
    const desfazer = vi.fn(async () => undefined);
    await expect(criarComItens("pedidos_compra", { fornecedor_id: "F1" }, "pedidos_compra_itens", "pedido_compra_id", itens, desfazer))
      .rejects.toMatchObject({ message: "valor_unitario inválido" });
    expect(tabela("pedidos_compra")).toEqual([]);
    expect(ultimaOp()).toBe("delete:pedidos_compra[id=pedidos_compra-1]");
    expect(desfazer).not.toHaveBeenCalled();
  });

  it("sem permissão para apagar o cabeçalho: chama desfazer com o motivo e ainda mostra o erro dos itens", async () => {
    banco.estado.falhas["insert:pedidos_compra_itens"] = "Failed to fetch";
    banco.estado.falhas["delete:pedidos_compra"] = "permission denied";
    const desfazer = vi.fn(async (_id: string, _motivo: string) => undefined);
    await expect(criarComItens("pedidos_compra", { fornecedor_id: "F1" }, "pedidos_compra_itens", "pedido_compra_id", itens, desfazer))
      .rejects.toMatchObject({ message: "Failed to fetch" });
    expect(desfazer).toHaveBeenCalledWith("pedidos_compra-1", "Itens não foram gravados (Failed to fetch)");
  });

  it("se o desfazer também falhar, o erro que aparece continua sendo o dos itens", async () => {
    banco.estado.falhas["insert:pedidos_compra_itens"] = "Failed to fetch";
    banco.estado.falhas["delete:pedidos_compra"] = "permission denied";
    const desfazer = vi.fn(async () => { throw new Error("rpc caiu"); });
    await expect(criarComItens("pedidos_compra", { fornecedor_id: "F1" }, "pedidos_compra_itens", "pedido_compra_id", itens, desfazer))
      .rejects.toMatchObject({ message: "Failed to fetch" });
    expect(desfazer).toHaveBeenCalledTimes(1);
  });

  it("cabeçalho falhou: nem tenta os itens", async () => {
    banco.estado.falhas["insert:pedidos_compra"] = "fornecedor bloqueado";
    await expect(criarComItens("pedidos_compra", { fornecedor_id: "F1" }, "pedidos_compra_itens", "pedido_compra_id", itens)).rejects.toMatchObject({ message: "fornecedor bloqueado" });
    expect(ops()).toEqual(["insert:pedidos_compra"]);
  });
});
