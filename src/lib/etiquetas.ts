// Etiquetas de transporte e de volume: busca no ERP o que já se sabe (pedido, envio, expedição, nota),
// aplica o que foi editado à mão e guarda a versão editada. A tela fica em components/etiquetas.
import { supabase } from "./supabase";
import { aplicarEditados, montarEtiqueta, num, type EtiquetaDados, type FonteEtiqueta, type ModeloEtiqueta } from "./etiquetaDados";
import type { Envio } from "./fretes";

export type OrigemEtiqueta =
  | { tipo: "pedido"; pedido_id: string; sobrepor?: { volumes?: number | null; peso_kg?: string | number | null; transportadora_id?: string | null; rastreio?: string | null } }
  | { tipo: "envio"; envio_id: string; envio?: Partial<Envio> }
  | { tipo: "nota"; nota_id: string };

export type EtiquetaSalva = { impressoes: number; impressa_em: string | null; atualizado_em: string };

export type EtiquetaCarregada = {
  /** como o ERP monta agora, sem edição */
  base: EtiquetaDados;
  /** base + campos editados que ficaram salvos */
  dados: EtiquetaDados;
  editados: string[];
  /** onde a versão editada é guardada */
  chave: string;
  vinculo: { pedido_id: string | null; envio_id: string | null; nota_fiscal_id: string | null };
  salva: EtiquetaSalva | null;
  titulo: string;
};

type Nota = { id?: string; status: string; numero: string | null; serie?: string | number | null; chave?: string | null; ambiente?: string | null };
const valida = (n: Nota | null | undefined) => !!n && n.status === "autorizada" && n.ambiente !== "homologacao";

async function um<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T | null> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data as T) ?? null;
}

async function buscarPedido(id: string) {
  return um<any>(supabase.from("pedidos")
    .select("*, cliente:clientes(*), itens:pedido_itens(descricao, quantidade), notas:notas_fiscais(status, numero, serie, chave, ambiente)")
    .eq("id", id).maybeSingle());
}
async function envioAtivoDoPedido(pedidoId: string) {
  const lista = (await um<any[]>(supabase.from("envios").select("*").eq("pedido_id", pedidoId).order("created_at", { ascending: false }))) ?? [];
  return lista.find((e) => e.status !== "cancelado") ?? null;
}

/** Carrega tudo o que a etiqueta precisa e junta com a versão editada (se houver). */
export async function carregarEtiqueta(o: OrigemEtiqueta, cfg: FonteEtiqueta["cfg"], modelo: ModeloEtiqueta): Promise<EtiquetaCarregada> {
  let pedido: any = null, envio: any = null, nota: Nota | null = null, notaDireta: any = null, cliente: any = null, expedicao: any = null;

  if (o.tipo === "pedido") {
    pedido = await buscarPedido(o.pedido_id);
    if (!pedido) throw new Error("pedido não encontrado");
    envio = await envioAtivoDoPedido(pedido.id);
  } else if (o.tipo === "envio") {
    const doBanco = await um<any>(supabase.from("envios").select("*").eq("id", o.envio_id).maybeSingle());
    if (!doBanco && !o.envio) throw new Error("envio não encontrado");
    envio = { ...(doBanco ?? {}), ...(o.envio ?? {}) };
    if (envio.pedido_id) pedido = await buscarPedido(envio.pedido_id);
  } else {
    notaDireta = await um<any>(supabase.from("notas_fiscais").select("*").eq("id", o.nota_id).maybeSingle());
    if (!notaDireta) throw new Error("nota não encontrada");
    nota = notaDireta;
  }
  if (pedido) {
    cliente = pedido.cliente;
    nota = (pedido.notas ?? []).find(valida) ?? null;
    expedicao = await um<any>(supabase.from("expedicoes").select("*").eq("pedido_id", pedido.id).maybeSingle());
  }
  const clienteId = cliente?.id ?? envio?.cliente_id ?? notaDireta?.cliente_id;
  if (!cliente && clienteId) cliente = await um<any>(supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle());

  const unidades = (await um<any[]>(supabase.from("unidades").select("*"))) ?? [];
  const uid = pedido?.unidade_id ?? envio?.unidade_id ?? notaDireta?.unidade_id;
  const remetente = unidades.find((u) => u.id === uid) ?? unidades.find((u) => u.matriz) ?? null;

  const s = o.tipo === "pedido" ? o.sobrepor : undefined;
  // na tela da expedição a transportadora escolhida (inclusive "nenhuma") vale mais que a gravada
  const naTela = !!s && s.transportadora_id !== undefined;
  const transpId = naTela ? s!.transportadora_id || null : expedicao?.transportadora_id ?? envio?.transportadora_id ?? pedido?.transportadora_id;
  const transp = transpId ? await um<{ nome: string }>(supabase.from("transportadoras").select("nome").eq("id", transpId).maybeSingle()) : null;

  const base = montarEtiqueta({
    pedido, cliente, remetente, cfg, expedicao, envio,
    notaDireta: notaDireta ? { itens: notaDireta.itens } : null,
    nota: valida(nota) ? nota : null,
    transportadora: transp?.nome ?? (naTela ? null : envio?.transportadora_nome) ?? null,
    sobrepor: s ? { volumes: s.volumes ?? null, peso_kg: num(s.peso_kg), transportadora: naTela ? (transp?.nome ?? "") : undefined, rastreio: s.rastreio ?? null } : null,
  }, modelo);

  // Chave: o envio (despacho) quando existe; senão o pedido; nota direta pela nota
  const chaves = o.tipo === "nota" ? [`nota:${o.nota_id}`]
    : envio?.id ? [`envio:${envio.id}`, ...(pedido ? [`pedido:${pedido.id}`] : [])]
      : [`pedido:${pedido.id}`];
  const salvas = (await um<any[]>(supabase.from("etiquetas_envio").select("chave, dados, editados, impressoes, impressa_em, atualizado_em").in("chave", chaves))) ?? [];
  const salva = chaves.map((c) => salvas.find((x) => x.chave === c)).find(Boolean) ?? null;
  const editados: string[] = salva?.editados ?? [];

  const nomeCli = cliente?.nome_fantasia || cliente?.nome || "";
  const titulo = pedido ? `Pedido #${pedido.numero}${nomeCli ? ` · ${nomeCli}` : ""}`
    : envio?.numero ? `Envio ${envio.numero}${nomeCli ? ` · ${nomeCli}` : ""}`
      : `NF-e ${notaDireta?.numero ?? ""}${nomeCli ? ` · ${nomeCli}` : ""}`;

  return {
    base, dados: aplicarEditados(base, salva?.dados, editados), editados,
    chave: chaves[0],
    vinculo: { pedido_id: pedido?.id ?? null, envio_id: envio?.id ?? null, nota_fiscal_id: notaDireta?.id ?? null },
    salva: salva ? { impressoes: salva.impressoes ?? 0, impressa_em: salva.impressa_em ?? null, atualizado_em: salva.atualizado_em } : null,
    titulo,
  };
}

/** Guarda a etiqueta editada (e, se impressa, conta a impressão). */
export async function salvarEtiqueta(c: EtiquetaCarregada, dados: EtiquetaDados, editados: string[], impressa = false): Promise<EtiquetaSalva> {
  const linha = {
    chave: c.chave, ...c.vinculo, dados, editados,
    ...(impressa ? { impressoes: (c.salva?.impressoes ?? 0) + 1, impressa_em: new Date().toISOString() } : {}),
  };
  const { data, error } = await supabase.from("etiquetas_envio").upsert(linha, { onConflict: "chave" })
    .select("impressoes, impressa_em, atualizado_em").single();
  if (error) throw new Error(error.message);
  return data as EtiquetaSalva;
}
