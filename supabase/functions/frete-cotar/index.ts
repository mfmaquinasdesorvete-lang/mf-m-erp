// Cotação de frete por CEP e produtos, nas transportadoras ligadas ao ERP ao mesmo tempo (Mercado Envios pela conta do
// Mercado Livre, Melhor Envio, Braspress e Rodonaves, e as tabelas de frete negociadas das que não têm API), com as regras de frete da loja. Serve a cotação rápida da equipe e o "Calcule o frete" da loja.
// POST { cep, itens: [{ produto_id, quantidade }], cliente_id? }
//  - equipe (login do ERP): todos os produtos ativos; mostra o custo e o motivo de cada transportadora que não cotou;
//  - loja (sem login do ERP): só com a loja ligada nas regras, só produtos da loja, até 30 consultas por hora por
//    endereço de internet; mostra só o preço para o cliente. O cliente logado na loja usa o CPF/CNPJ do cadastro.
// Cada consulta fica em frete_consultas (o pedido da loja usa o valor gravado ali, nunca o que o navegador manda).
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, onlyDigits, requireErpUser } from "../_shared/supabase.ts";
import { aplicarRegras, lerRegras, ufDoCep, volumesDosItens, type OpcaoFrete, type ProdutoFrete } from "../_shared/frete-cotar.ts";
import { cotarMe, temAcessoMe } from "../_shared/melhorenvio-api.ts";
import { cotarBp, temAcessoBp } from "../_shared/braspress-api.ts";
import { cotarRte, temAcessoRte } from "../_shared/rodonaves-api.ts";
import { chamarML } from "../_shared/mercadolivre.ts";
import { lerOpcoesMl, pacoteMl } from "../_shared/ml-frete.ts";
import { cotarPelaTabela, type DestinoTabela, type TabelaFrete } from "../_shared/frete-tabela.ts";

const LIMITE_HORA = 30;
const MAX_ITENS = 20;

async function hashIp(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sem-ip";
  const dados = new TextEncoder().encode(`${Deno.env.get("SUPABASE_URL")}|${ip}`);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", dados))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Login da loja (cliente), se houver: o CPF/CNPJ e o CEP do cadastro. */
async function clienteDaLoja(req: Request, db: ReturnType<typeof adminClient>) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const u = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user } } = await u.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return null;
  const { data } = await db.from("loja_clientes").select("cliente_id, clientes(cpf_cnpj)").eq("user_id", user.id).maybeSingle();
  const doc = (data as { clientes?: { cpf_cnpj?: string | null } | null } | null)?.clientes?.cpf_cnpj ?? null;
  return { user_id: user.id, cliente_id: (data as { cliente_id?: string } | null)?.cliente_id ?? null, doc: onlyDigits(doc) };
}

/** Conta do Mercado Livre ligada e com o token em dia (a rotina do Mercado Livre renova a cada 5 minutos). */
async function acessoMl(db: ReturnType<typeof adminClient>) {
  const { data: conta } = await db.from("ml_contas").select("ml_user_id, token_expira_em").eq("status", "ativa").limit(1).maybeSingle();
  if (!conta?.ml_user_id || new Date(conta.token_expira_em ?? 0).getTime() < Date.now() + 60_000) return null;
  const { data } = await db.rpc("ml_segredos");
  const token = (data as { ml_access_token?: string } | null)?.ml_access_token;
  return token ? { usuario: conta.ml_user_id as number, token } : null;
}

/** Tabelas de frete vigentes da unidade de origem, com os destinos do estado do CEP. */
async function tabelasVigentes(db: ReturnType<typeof adminClient>, unidadeId: string, uf: string) {
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const { data: tabs } = await db.from("frete_tabelas").select("*, transportadoras(nome, nome_fantasia)").eq("ativo", true)
    .or(`unidade_id.is.null,unidade_id.eq.${unidadeId}`).or(`vigencia_inicio.is.null,vigencia_inicio.lte.${hoje}`).or(`vigencia_fim.is.null,vigencia_fim.gte.${hoje}`);
  if (!tabs?.length) return [];
  const { data: dests } = await db.from("frete_tabela_destinos").select("*").in("tabela_id", tabs.map((t) => t.id)).eq("uf", uf).limit(20000);
  return tabs.map((t) => {
    const tr = (t as { transportadoras?: { nome?: string; nome_fantasia?: string | null } | null }).transportadoras;
    const tabela = { ...t, transportadora: tr?.nome_fantasia || tr?.nome || t.nome } as unknown as TabelaFrete;
    return { tabela, destinos: (dests ?? []).filter((d) => d.tabela_id === t.id) as unknown as DestinoTabela[] };
  });
}

/** Cidade e estado do CEP: ViaCEP, senão BrasilAPI; sem nenhum, o estado pelo começo do CEP. */
async function cidadeDoCep(cep: string) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(5_000) });
    const x = await r.json() as { localidade?: string; uf?: string; erro?: boolean };
    if (!x.erro && x.uf) return { cidade: x.localidade ?? null, uf: x.uf };
  } catch { /* tenta a outra */ }
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`, { signal: AbortSignal.timeout(5_000) });
    if (r.ok) {
      const x = await r.json() as { city?: string; state?: string };
      if (x.state) return { cidade: x.city ?? null, uf: x.state };
    }
  } catch { /* fica com o estado do CEP */ }
  const uf = ufDoCep(cep);
  return uf ? { cidade: null, uf } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const db = adminClient();
    const equipe = await requireErpUser(req, ["vendas", "financeiro", "expedicao"]).catch(() => null);
    const { data: conf } = await db.from("configuracoes").select("frete_regras, loja_unidade_id").eq("id", 1).maybeSingle();
    const regras = lerRegras(conf?.frete_regras);

    const cep = onlyDigits(String(body.cep ?? ""));
    if (cep.length !== 8) throw new HttpError(400, "informe o CEP com 8 números");
    const pedidos = (Array.isArray(body.itens) ? body.itens : []).slice(0, MAX_ITENS)
      .map((i: { produto_id?: unknown; quantidade?: unknown }) => ({ produto_id: String(i.produto_id ?? ""), quantidade: Math.min(99, Math.floor(Number(i.quantidade) || 0)) }))
      .filter((i: { produto_id: string; quantidade: number }) => /^[0-9a-f-]{36}$/i.test(i.produto_id) && i.quantidade > 0);
    if (!pedidos.length) throw new HttpError(400, "escolha pelo menos um produto");

    // loja: ligada nas regras e com limite por endereço de internet
    let loja: Awaited<ReturnType<typeof clienteDaLoja>> = null;
    let ip: string | null = null;
    if (!equipe) {
      if (!regras.loja_ligada) throw new HttpError(403, "cálculo de frete desligado na loja");
      ip = await hashIp(req);
      const desde = new Date(Date.now() - 3_600_000).toISOString();
      const { count } = await db.from("frete_consultas").select("id", { count: "exact", head: true }).eq("ip_hash", ip).gte("criado_em", desde);
      if ((count ?? 0) >= LIMITE_HORA) throw new HttpError(429, "muitas consultas seguidas: tente de novo daqui a pouco ou fale com a nossa equipe no WhatsApp");
      loja = await clienteDaLoja(req, db);
    }

    // produtos (com a embalagem): a loja só vê os produtos da loja
    let q = db.from("produtos").select("id, descricao, preco_venda, peso_kg, altura_cm, largura_cm, profundidade_cm, embalagens(largura_cm, altura_cm, comprimento_cm, peso_kg)")
      .in("id", pedidos.map((p: { produto_id: string }) => p.produto_id)).eq("ativo", true);
    if (!equipe) q = q.eq("no_catalogo", true).gt("preco_venda", 0);
    const { data: prods, error } = await q;
    if (error) throw new HttpError(500, error.message);
    const porId = new Map((prods ?? []).map((p) => [p.id, { ...p, embalagem: (p as { embalagens?: ProdutoFrete["embalagem"] }).embalagens ?? null } as ProdutoFrete]));
    const itens = pedidos.filter((p: { produto_id: string }) => porId.has(p.produto_id)).map((p: { produto_id: string; quantidade: number }) => ({ produto: porId.get(p.produto_id)!, quantidade: p.quantidade }));
    if (!itens.length) throw new HttpError(400, "produto não encontrado");
    const carga = volumesDosItens(itens, regras);

    // origem: unidade da loja (ou a escolhida pela equipe) e o cliente (CPF/CNPJ para a Braspress)
    const unidadeId = (equipe && body.unidade_id) || conf?.loja_unidade_id;
    const unQ = db.from("unidades").select("id, cnpj, cep, municipio, uf").eq("ativo", true);
    const { data: un } = unidadeId ? await unQ.eq("id", unidadeId).maybeSingle() : await unQ.eq("matriz", true).limit(1).maybeSingle();
    let doc = loja?.doc ?? "";
    if (equipe && body.cliente_id) {
      const { data: cli } = await db.from("clientes").select("cpf_cnpj").eq("id", body.cliente_id).maybeSingle();
      doc = onlyDigits(cli?.cpf_cnpj ?? "");
    }
    const destino = await cidadeDoCep(cep);

    const opcoes: Omit<OpcaoFrete, "valor_cliente">[] = [];
    const avisos: string[] = [];
    if (carga.faltam.length) avisos.push(`Sem peso ou medidas no cadastro: ${carga.faltam.join(", ")}`);
    if (carga.volumes.length && !carga.faltam.length && un?.cep) {
      const dados = { cep_origem: un.cep, cep_destino: cep, valor_mercadoria: carga.valor_produtos, peso_total_kg: carga.peso_total, volumes: carga.volumes, modalidade: "cif" };
      const tarefas: [string, Promise<void>][] = [];
      const ml = await acessoMl(db);
      const pacote = pacoteMl(carga.volumes);
      if (ml && pacote) tarefas.push(["Mercado Envios", chamarML(`/users/${ml.usuario}/shipping_options?zip_code=${cep}&dimensions=${pacote}&item_price=${carga.valor_produtos.toFixed(2)}`, ml.token).then((r) => {
        for (const o of lerOpcoesMl(r)) opcoes.push({ id: `ml:${o.metodo}`, transportadora: "Mercado Envios", servico: o.servico, prazo: o.prazo, valor: o.valor });
      })]);
      if (temAcessoMe()) tarefas.push(["Melhor Envio", cotarMe(dados).then((r) => {
        for (const s of r.servicos) opcoes.push({ id: `me:${s.servico_id ?? s.servico}`, transportadora: s.empresa, servico: s.servico, prazo: s.prazo, valor: s.valor });
      })]);
      if (temAcessoBp() && un.cnpj) {
        if ([11, 14].includes(doc.length)) tarefas.push(["Braspress", cotarBp(dados, un.cnpj, doc).then((r) => { opcoes.push({ id: "bp", transportadora: "Braspress", servico: null, prazo: r.prazo, valor: r.valor }); })]);
        else if (equipe) avisos.push("Braspress: escolha o cliente (a Braspress pede o CPF/CNPJ de quem recebe)");
      }
      if (temAcessoRte() && un.cnpj) tarefas.push(["Rodonaves", cotarRte(dados, un.cnpj).then((r) => { opcoes.push({ id: "rte", transportadora: "Rodonaves", servico: null, prazo: r.prazo, valor: r.valor }); })]);
      if (destino?.uf) {
        for (const { tabela, destinos } of await tabelasVigentes(db, un.id, destino.uf)) {
          const r = cotarPelaTabela(tabela, destinos, { volumes: carga.volumes, peso_kg: carga.peso_total, valor_nf: carga.valor_produtos }, { cep, cidade: destino.cidade, uf: destino.uf }, un.uf ?? "");
          if (r) opcoes.push({ id: `tab:${tabela.id}`, transportadora: tabela.transportadora, servico: null, prazo: r.prazo, valor: r.valor });
          else if (equipe && destinos.length) avisos.push(`${tabela.transportadora}: a tabela "${tabela.nome}" não tem preço para ${carga.peso_total} kg nesse destino`);
        }
      }
      if (!tarefas.length && !opcoes.length) avisos.push("Nenhuma transportadora ligada: conecte o Mercado Livre ou cadastre os acessos (Melhor Envio, Braspress, Rodonaves) nos secrets do Supabase");
      const fim = await Promise.allSettled(tarefas.map(([, t]) => t));
      fim.forEach((f, i) => { if (f.status === "rejected") avisos.push(`${tarefas[i][0]}: ${(f.reason as Error).message}`); });
    }
    const cotadas = aplicarRegras(opcoes, regras, { valor_produtos: carga.valor_produtos, uf: destino?.uf ?? null });
    if (regras.retirada && un) cotadas.push({ id: "retirada", transportadora: "Retirar na fábrica", servico: [un.municipio, un.uf].filter(Boolean).join("/") || null, prazo: null, valor: 0, valor_cliente: 0 });

    const { data: salva, error: e2 } = await db.from("frete_consultas").insert({
      origem: equipe ? "equipe" : "loja", cep, cidade: destino?.cidade ?? null, uf: destino?.uf ?? null, unidade_id: un?.id ?? null,
      itens: itens.map((i: { produto: ProdutoFrete; quantidade: number }) => ({ produto_id: i.produto.id, descricao: i.produto.descricao, quantidade: i.quantidade })),
      valor_produtos: carga.valor_produtos, peso_kg: carga.peso_total, opcoes: cotadas, avisos,
      user_id: equipe?.userId ?? loja?.user_id ?? null, cliente_id: (equipe ? body.cliente_id : loja?.cliente_id) ?? null, ip_hash: ip,
    }).select("id").single();
    if (e2) throw new HttpError(500, e2.message);

    const sobConsulta = !cotadas.some((o) => o.id !== "retirada");
    return json({
      ok: true, consulta_id: salva.id, cep, cidade: destino?.cidade ?? null, uf: destino?.uf ?? null, sob_consulta: sobConsulta,
      // a loja vê só o preço para o cliente; a equipe vê também o custo e os avisos
      opcoes: equipe ? cotadas : cotadas.map(({ valor: _v, ...o }) => o),
      avisos: equipe ? avisos : [],
      peso_kg: carga.peso_total, valor_produtos: carga.valor_produtos,
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
