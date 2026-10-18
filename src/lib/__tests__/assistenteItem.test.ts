import { describe, expect, it } from "vitest";
import {
  areaDe, assunto, autoPreencher, elaborar, gerarCenarios, gerarCriterios, gerarTarefas, gerarTestes, juntarLinhas, palavras, papelDe,
  parecidos, placarTestes, resumirComentarios, similaridade, sugerirPontos, sugerirTipo, topicosDaDescricao, type Rascunho,
} from "../assistenteItem";
import type { ItemScrum } from "../scrum";

const rascunho = (p: Partial<Rascunho> = {}): Rascunho => ({ titulo: "", tipo: "historia", descricao: "", criterio_aceite: "", pontos: null, responsavel_id: "", ...p });
const feito = (id: string, titulo: string, pontos: number, responsavel_id: string | null = null) =>
  ({ id, titulo, pontos, status: "feito", responsavel_id }) as Pick<ItemScrum, "id" | "titulo" | "pontos" | "status" | "responsavel_id">;

describe("texto e semelhança", () => {
  it("palavras sem acento, sem as pequenas e sem plural simples", () => {
    expect(palavras("Técnico anexa as fotos na OS pelo celular")).toEqual(["tecnico", "anexa", "foto", "celular"]);
  });
  it("títulos do mesmo assunto se parecem; assuntos diferentes não", () => {
    expect(similaridade("Técnico anexa fotos na OS pelo celular", "Fotos da máquina na OS pelo celular")).toBeGreaterThanOrEqual(0.5);
    expect(similaridade("Importar extrato do banco", "Importação do extrato bancário")).toBeGreaterThanOrEqual(0.5);
    expect(similaridade("Relatório de giro do estoque", "Fotos da máquina na OS pelo celular")).toBe(0);
    // uma palavra só em comum não basta
    expect(similaridade("Relatório de vendas por vendedor", "Relatório de giro do estoque")).toBe(0);
  });
  it("área do ERP e quem usa, pelo assunto (OS só em maiúsculas)", () => {
    expect(areaDe("Fotos da máquina na OS").id).toBe("assistencia");
    expect(areaDe("Avisar os clientes da promoção").id).toBe("vendas");
    expect(areaDe("Assinatura do cliente na tela").id).toBe("erp");
    expect(areaDe("Emitir NF-e de transferência").id).toBe("fiscal");
    expect(papelDe("Técnico registra a preventiva")).toBe("técnico");
    // "avisar o cliente" é a equipe que faz; o cliente só quando é ele quem usa
    expect(papelDe("Avisar o cliente quando o conserto acabar")).toBe("quem atende a assistência");
    expect(papelDe("Cliente acompanha o conserto pela página")).toBe("cliente");
    expect(papelDe("Tela nova")).toBe("quem usa o ERP");
  });
  it("o assunto não conta o que o próprio assistente escreveu", () => {
    const descricao = elaborar({ titulo: "Avisar o cliente quando o conserto acabar", tipo: "historia", descricao: "" });
    expect(descricao).toContain("Funciona no computador e no celular");
    expect(assunto({ titulo: "Avisar o cliente quando o conserto acabar", descricao })).not.toMatch(/celular|WhatsApp|complete/);
    expect(gerarCenarios({ titulo: "Avisar o cliente quando o conserto acabar", tipo: "historia", descricao, criterio_aceite: "" })).not.toContain("Para fazer na rua");
  });
});

describe("Auto-Fill", () => {
  it("tipo pelo texto", () => {
    expect(sugerirTipo("Erro ao salvar o pedido")?.tipo).toBe("bug");
    expect(sugerirTipo("Melhorar a busca de clientes")?.tipo).toBe("melhoria");
    expect(sugerirTipo("Importar a planilha de preços")?.tipo).toBe("tarefa");
    expect(sugerirTipo("Técnico assina a OS na tela")).toBeNull();
  });
  it("pontos pela mediana dos feitos parecidos; sem parecido, pela base do tipo e pelos sinais", () => {
    const hist = [feito("a", "Fotos da máquina na OS pelo celular", 5, "u1"), feito("b", "Fotos do conserto na OS pelo celular", 3, "u1"), feito("c", "Relatório de giro", 8)];
    expect(sugerirPontos(rascunho({ titulo: "Técnico anexa fotos na OS pelo celular" }), hist)).toMatchObject({ pontos: 3, dividir: false });
    expect(sugerirPontos(rascunho({ titulo: "Tela de metas" })).pontos).toBe(3);
    const grande = sugerirPontos(rascunho({ titulo: "Importar notas fiscais automaticamente e montar relatório em PDF" }));
    expect(grande.pontos).toBeGreaterThanOrEqual(13);
    expect(grande.dividir).toBe(true);
  });
  it("completa só o que está vazio e explica de onde tirou", () => {
    const hist = [feito("a", "Fotos da máquina na OS pelo celular", 5, "u1")];
    const r = autoPreencher(rascunho({ titulo: "Erro ao anexar fotos na OS pelo celular", responsavel_id: "" }), hist);
    expect(r.campos).toMatchObject({ tipo: "bug", pontos: 5, responsavel_id: "u1" });
    expect(r.campos.descricao).toContain("Como repetir:");
    expect(r.campos.criterio_aceite).toContain("o erro não acontece mais");
    expect(r.motivos.join(" ")).toContain('parecido com "Fotos da máquina na OS pelo celular"');
    // o que a pessoa já escreveu fica
    const mantido = autoPreencher(rascunho({ titulo: "Tela de metas", descricao: "minha descrição", pontos: 2, responsavel_id: "u9" }));
    expect(mantido.campos.descricao).toBeUndefined();
    expect(mantido.campos.pontos).toBeUndefined();
    expect(mantido.campos.responsavel_id).toBeUndefined();
  });
});

describe("Elaborator, Smart-Task e Smart-Acceptance", () => {
  it("descrição organizada pelo tipo, com o que falta entre parênteses", () => {
    const h = elaborar({ titulo: "Técnico anexa fotos na OS pelo celular", tipo: "historia", descricao: "" });
    expect(h).toContain("Quem usa: técnico");
    expect(h).toContain("Para quê: fazer na rua, pelo celular");
    expect(h).toContain("Onde no ERP: Assistência (OS) (/assistencia)");
    expect(h).toContain("(complete: o que fica para depois)");
    const b = elaborar({ titulo: "Erro ao anexar foto no iPhone", tipo: "bug", descricao: "" });
    expect(b).toContain("O que acontece: Erro ao anexar foto no iPhone.");
    expect(b).toContain("iPhone");
  });
  it("tarefas pelo tipo, pelo assunto e pelos tópicos da descrição, sem repetir", () => {
    const desc = "O que entra:\n- Botão de câmera\n- Funciona no computador e no celular\n\nFora desta entrega:\n- Vídeo";
    expect(topicosDaDescricao(desc)).toEqual(["Botão de câmera", "Funciona no computador e no celular"]);
    const t = gerarTarefas({ titulo: "Importar fotos na OS", tipo: "historia", descricao: desc }).map((x) => x.texto);
    expect(t).toContain("Fazer: Botão de câmera");
    expect(t).not.toContain("Fazer: Vídeo");
    expect(t).not.toContain("Fazer: Funciona no computador e no celular");
    expect(t).toContain("Importar de novo e conferir que não duplica");
    expect(t).toContain("Testar arquivo grande e foto do iPhone");
    const de_novo = gerarTarefas({ titulo: "Importar fotos na OS", tipo: "historia", descricao: desc }, t.map((texto) => ({ texto, feito: true })));
    expect(de_novo).toEqual([]);
    expect(gerarTarefas({ titulo: "Erro no PDF", tipo: "bug", descricao: "" })[0]!.texto).toBe("Repetir o erro seguindo os passos da descrição");
  });
  it("critérios de aceite e junção sem repetir", () => {
    const c = gerarCriterios({ titulo: "Importar extrato do banco com valores", tipo: "historia", descricao: "" });
    expect(c).toContain("Importar o mesmo arquivo duas vezes não duplica nada");
    expect(c).toContain("Os valores batem com uma conta feita à mão (R$ com duas casas)");
    expect(c).toContain("Só quem tem permissão vê e altera");
    expect(juntarLinhas("- Só quem tem permissão vê e altera", ["Só quem tem permissão vê e altera", "Nova regra"])).toBe("- Só quem tem permissão vê e altera\n- Nova regra");
  });
});

describe("Smart-BDD e Test-Gen", () => {
  it("cenários em português e casos de teste lidos deles", () => {
    const g = gerarCenarios({ titulo: "Importar extrato do banco", tipo: "historia", descricao: "", criterio_aceite: "- O saldo bate com o banco" });
    expect(g).toContain("# language: pt");
    expect(g).toContain("Funcionalidade: Importar extrato do banco");
    expect(g).toContain("Então o saldo bate com o banco");
    expect(g).toContain("Cenário: Importar duas vezes");
    const testes = gerarTestes(g);
    const principal = testes.find((x) => x.nome === "Caminho principal")!;
    expect(principal.passos[0]).toBe("Entrei no ERP Line como financeiro");
    expect(principal.passos).toContain("Faço o que o item pede: importar extrato do banco");
    expect(principal.esperado).toEqual(["O saldo bate com o banco"]);
    const duas = testes.find((x) => x.nome === "Importar duas vezes")!;
    expect(duas.esperado).toEqual(["Nada é duplicado", "Vejo quantas linhas foram puladas"]);
    expect(placarTestes([{ ...duas, ok: true }, { ...principal, ok: false }, { ...principal, ok: null }])).toEqual({ passou: 1, falhou: 1, falta: 1 });
  });
  it("problema: cenário de correção", () => {
    const testes = gerarTestes(gerarCenarios({ titulo: "Erro ao salvar pedido", tipo: "bug", descricao: "", criterio_aceite: "" }));
    expect(testes[0]).toMatchObject({ nome: "O erro não acontece mais", esperado: ["O erro não aparece", "O resultado é o esperado"] });
  });
});

describe("Summarizer", () => {
  it("decisões, pendências, perguntas sem resposta e próximos passos", () => {
    const r = resumirComentarios([
      { nome: "Ana Lima", texto: "Vamos usar a câmera do próprio celular. Falta o modelo do checklist.", created_at: "2026-10-10T10:00:00Z" },
      { nome: "Beto Souza", texto: "Pode ser foto da galeria também?", created_at: "2026-10-11T10:00:00Z" },
      { nome: "Ana Lima", texto: "Pode sim, combinado. Vou testar no iPhone amanhã.", created_at: "2026-10-12T10:00:00Z" },
      { nome: "Beto Souza", texto: "E o tamanho máximo?", created_at: "2026-10-13T10:00:00Z" },
    ]);
    expect(r.total).toBe(4);
    expect(r.pessoas).toEqual([{ nome: "Ana Lima", n: 2 }, { nome: "Beto Souza", n: 2 }]);
    expect(r.decisoes).toEqual(["Pode sim, combinado. — Ana", "Vamos usar a câmera do próprio celular. — Ana"]);
    expect(r.pendencias).toEqual(["Falta o modelo do checklist. — Ana"]);
    // a primeira pergunta foi respondida depois; a última ainda não
    expect(r.perguntas).toEqual(["E o tamanho máximo? — Beto"]);
    expect(r.proximos).toEqual(["Vou testar no iPhone amanhã. — Ana"]);
    expect(r.de).toBe("2026-10-10T10:00:00Z");
    expect(r.ultimo).toBe("E o tamanho máximo? — Beto");
    expect(resumirComentarios([])).toMatchObject({ total: 0, ultimo: null });
  });
});

describe("AI Suggest", () => {
  it("acha o parecido entre itens, ideias e entregas; ignora o próprio item", () => {
    const candidatos = [
      { id: "1", titulo: "Fotos da máquina na OS pelo celular", origem: "scrum" as const, detalhe: "Feito" },
      { id: "2", titulo: "Relatório de giro do estoque", origem: "scrum" as const, detalhe: "Backlog" },
      { id: "3", titulo: "Ficha da OS", texto: "Técnico tira fotos pelo celular e o cliente assina", origem: "ideia" as const, detalhe: "Ideia" },
    ];
    const r = parecidos("Técnico anexa fotos na OS pelo celular", candidatos);
    expect(r.map((x) => x.id)).toEqual(["1", "3"]);
    expect(parecidos("Técnico anexa fotos na OS pelo celular", candidatos, { ignorar: "1" }).map((x) => x.id)).toEqual(["3"]);
    expect(parecidos("Fotos", candidatos)).toEqual([]);
  });
});
