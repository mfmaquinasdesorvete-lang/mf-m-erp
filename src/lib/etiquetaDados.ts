// Etiquetas de transporte e de volume: os dados que vão impressos, montados do pedido, do envio (fretes),
// da expedição ou da nota direta, e o que a pessoa editou à mão por cima.
// Funções puras (sem banco nem tela): o editor, a impressão em lote e os testes usam as mesmas regras.

export type AvisoId = "fragil" | "para_cima" | "nao_empilhar" | "umidade" | "manter_em_pe" | "pesado";

export const AVISOS: { id: AvisoId; rotulo: string; texto: string }[] = [
  { id: "fragil", rotulo: "Frágil", texto: "FRÁGIL" },
  { id: "para_cima", rotulo: "Este lado para cima", texto: "ESTE LADO PARA CIMA" },
  { id: "manter_em_pe", rotulo: "Manter em pé (não tombar)", texto: "NÃO TOMBAR" },
  { id: "nao_empilhar", rotulo: "Não empilhar", texto: "NÃO EMPILHAR" },
  { id: "umidade", rotulo: "Proteger da umidade", texto: "PROTEGER DA UMIDADE" },
  { id: "pesado", rotulo: "Carga pesada", texto: "PESADO" },
];
const IDS_AVISO = new Set<string>(AVISOS.map((a) => a.id));

export type VolumeEtiqueta = {
  descricao: string; peso_kg: number | null; largura_cm: number | null; altura_cm: number | null; comprimento_cm: number | null;
};

export type EtiquetaDados = {
  remetente: { nome: string; documento: string; endereco: string; bairro: string; municipio: string; uf: string; cep: string; telefone: string };
  destinatario: {
    nome: string; ac: string; documento: string; logradouro: string; numero: string; complemento: string; bairro: string;
    municipio: string; uf: string; cep: string; telefone: string; referencia: string;
  };
  pedido: string;
  nota: { numero: string; serie: string; chave: string };
  transportadora: string; rastreio: string; cte: string;
  /** usado quando os volumes não têm peso próprio */
  peso_total_kg: number | null;
  volumes: VolumeEtiqueta[];
  avisos: AvisoId[];
  observacao: string;
};

export type FormatoTransporte = "10x15" | "a4";
export type FormatoVolume = "10x15" | "10x10" | "a4";
export type ModeloEtiqueta = {
  formato_transporte: FormatoTransporte;
  formato_volume: FormatoVolume;
  imprimir: "transporte" | "volume" | "ambas";
  codigo: "chave" | "pedido" | "rastreio" | "nenhum";
  mostrar_logo: boolean; mostrar_cnpj: boolean; mostrar_telefone: boolean;
  mostrar_peso: boolean; mostrar_medidas: boolean; mostrar_conteudo: boolean;
  destinatario_grande: boolean;
  avisos_padrao: AvisoId[];
  rodape: string;
};

export const MODELO_PADRAO: ModeloEtiqueta = {
  formato_transporte: "10x15", formato_volume: "10x10", imprimir: "transporte", codigo: "chave",
  mostrar_logo: false, mostrar_cnpj: true, mostrar_telefone: true, mostrar_peso: true, mostrar_medidas: true, mostrar_conteudo: true,
  destinatario_grande: false, avisos_padrao: [], rodape: "",
};

const umDe = <T extends string>(v: unknown, ok: readonly T[], padrao: T): T => (ok.includes(v as T) ? (v as T) : padrao);
const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);

/** Modelo salvo na configuração (o formato da etiqueta de transporte é a coluna etiqueta_formato). */
export function modeloDe(cfg: { etiqueta_modelo?: unknown; etiqueta_formato?: string | null } | null | undefined): ModeloEtiqueta {
  const m = (cfg?.etiqueta_modelo && typeof cfg.etiqueta_modelo === "object" ? cfg.etiqueta_modelo : {}) as Record<string, unknown>;
  const p = MODELO_PADRAO;
  return {
    formato_transporte: umDe(cfg?.etiqueta_formato, ["10x15", "a4"] as const, p.formato_transporte),
    formato_volume: umDe(m.formato_volume, ["10x15", "10x10", "a4"] as const, p.formato_volume),
    imprimir: umDe(m.imprimir, ["transporte", "volume", "ambas"] as const, p.imprimir),
    codigo: umDe(m.codigo, ["chave", "pedido", "rastreio", "nenhum"] as const, p.codigo),
    mostrar_logo: bool(m.mostrar_logo, p.mostrar_logo), mostrar_cnpj: bool(m.mostrar_cnpj, p.mostrar_cnpj),
    mostrar_telefone: bool(m.mostrar_telefone, p.mostrar_telefone), mostrar_peso: bool(m.mostrar_peso, p.mostrar_peso),
    mostrar_medidas: bool(m.mostrar_medidas, p.mostrar_medidas), mostrar_conteudo: bool(m.mostrar_conteudo, p.mostrar_conteudo),
    destinatario_grande: bool(m.destinatario_grande, p.destinatario_grande),
    avisos_padrao: Array.isArray(m.avisos_padrao) ? (m.avisos_padrao as string[]).filter((a) => IDS_AVISO.has(a)) as AvisoId[] : [],
    rodape: typeof m.rodape === "string" ? m.rodape.slice(0, 120) : "",
  };
}

// ---------------------------------------------------------------------
// Montagem a partir do que o ERP já sabe
// ---------------------------------------------------------------------
type EnderecoFonte = {
  nome?: string | null; razao_social?: string | null; nome_fantasia?: string | null; cpf_cnpj?: string | null; cnpj?: string | null;
  logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null;
  municipio?: string | null; uf?: string | null; cep?: string | null; telefone?: string | null; whatsapp?: string | null;
};
type VolumeFonte = {
  descricao?: string | null; quantidade?: number | string | null;
  peso_kg?: number | string | null; largura_cm?: number | string | null; altura_cm?: number | string | null; comprimento_cm?: number | string | null;
};

export type FonteEtiqueta = {
  pedido?: { numero?: number | string | null; volumes?: number | null; peso_total_kg?: number | null; codigo_rastreio?: string | null;
    itens?: { descricao: string; quantidade: number | string }[] | null } | null;
  /** nota direta: número e itens vêm dela */
  notaDireta?: { itens?: { descricao?: string | null; quantidade?: number | string | null }[] | null } | null;
  cliente?: EnderecoFonte | null;
  /** unidade (empresa) que despacha; sem ela, os dados da configuração */
  remetente?: EnderecoFonte | null;
  cfg?: { razao_social?: string | null; nome_fantasia?: string | null; cnpj?: string | null; endereco?: string | null; municipio?: string | null; uf?: string | null; telefone?: string | null; whatsapp?: string | null } | null;
  nota?: { numero?: string | null; serie?: string | number | null; chave?: string | null } | null;
  expedicao?: { volumes?: number | null; peso_kg?: number | null; codigo_rastreio?: string | null } | null;
  envio?: {
    volumes?: VolumeFonte[] | null; peso_total_kg?: number | null; restricoes?: string[] | null; restricoes_obs?: string | null;
    codigo_rastreio?: string | null; transportadora_nome?: string | null; cte_numero?: string | null;
    endereco_destino?: string | null; cep_destino?: string | null; cidade_destino?: string | null; uf_destino?: string | null;
  } | null;
  transportadora?: string | null;
  /** o que está na tela da expedição e ainda não foi salvo */
  sobrepor?: { volumes?: number | null; peso_kg?: number | null; transportadora?: string | null; rastreio?: string | null } | null;
};

const LIMITE_VOLUMES = 300;
const txt = (v: unknown) => (v == null ? "" : String(v).trim());
const dig = (v: unknown) => txt(v).replace(/\D/g, "");
export const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  // "1.234,5" e "12,5" (jeito brasileiro) ou "12.5"
  const n = typeof v === "number" ? v : Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
// "1.5" vindo do banco é número com ponto decimal (não milhar)
const numBanco = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const volumeVazio = (): VolumeEtiqueta => ({ descricao: "", peso_kg: null, largura_cm: null, altura_cm: null, comprimento_cm: null });

/** Uma linha do envio com quantidade 3 vira 3 volumes (cada um ganha a sua etiqueta). */
export function expandirVolumes(lista: VolumeFonte[] | null | undefined): VolumeEtiqueta[] {
  const out: VolumeEtiqueta[] = [];
  for (const v of lista ?? []) {
    const q = Math.max(0, Math.ceil(Number(v.quantidade ?? 1) || 0));
    for (let i = 0; i < q && out.length < LIMITE_VOLUMES; i++) {
      out.push({ descricao: txt(v.descricao), peso_kg: numBanco(v.peso_kg), largura_cm: numBanco(v.largura_cm), altura_cm: numBanco(v.altura_cm), comprimento_cm: numBanco(v.comprimento_cm) });
    }
  }
  return out;
}

/** Ajusta a quantidade de volumes mantendo o que já foi preenchido nos primeiros. */
export function ajustarQtd(volumes: VolumeEtiqueta[], n: number): VolumeEtiqueta[] {
  const alvo = Math.max(1, Math.min(LIMITE_VOLUMES, Math.floor(n) || 1));
  if (volumes.length >= alvo) return volumes.slice(0, alvo);
  return [...volumes, ...Array.from({ length: alvo - volumes.length }, volumeVazio)];
}

function resumoItens(itens: { descricao?: string | null; quantidade?: number | string | null }[] | null | undefined) {
  const partes = (itens ?? []).filter((i) => txt(i.descricao)).map((i) => `${Number(i.quantidade) || 1}× ${txt(i.descricao)}`);
  return partes.join("; ").slice(0, 160);
}

export function montarEtiqueta(f: FonteEtiqueta, modelo: ModeloEtiqueta = MODELO_PADRAO): EtiquetaDados {
  const c = f.cliente ?? {};
  const r = f.remetente;
  const e = f.envio;
  const s = f.sobrepor ?? {};

  const remetente: EtiquetaDados["remetente"] = r
    ? {
      nome: txt(r.razao_social || r.nome), documento: dig(r.cnpj || r.cpf_cnpj),
      endereco: [`${txt(r.logradouro)}${txt(r.numero) ? `, ${txt(r.numero)}` : ""}`, txt(r.complemento)].filter(Boolean).join(" - "),
      bairro: txt(r.bairro), municipio: txt(r.municipio), uf: txt(r.uf).toUpperCase(), cep: dig(r.cep), telefone: txt(r.telefone || r.whatsapp),
    }
    : {
      nome: txt(f.cfg?.razao_social || f.cfg?.nome_fantasia), documento: dig(f.cfg?.cnpj), endereco: txt(f.cfg?.endereco), bairro: "",
      municipio: txt(f.cfg?.municipio), uf: txt(f.cfg?.uf).toUpperCase(), cep: "", telefone: txt(f.cfg?.telefone || f.cfg?.whatsapp),
    };

  // O envio pode ter um endereço de entrega diferente do cadastro (outro CEP): vale o do envio
  const cepEnvio = dig(e?.cep_destino);
  const entregaNoutroLugar = !!cepEnvio && cepEnvio !== dig(c.cep) && !!txt(e?.endereco_destino);
  const nome = txt(c.nome);
  const fantasia = txt(c.nome_fantasia);
  const destinatario: EtiquetaDados["destinatario"] = {
    nome, ac: fantasia && fantasia.toLowerCase() !== nome.toLowerCase() ? fantasia : "", documento: dig(c.cpf_cnpj),
    logradouro: entregaNoutroLugar ? txt(e?.endereco_destino) : txt(c.logradouro),
    numero: entregaNoutroLugar ? "" : txt(c.numero),
    complemento: entregaNoutroLugar ? "" : txt(c.complemento),
    bairro: entregaNoutroLugar ? "" : txt(c.bairro),
    municipio: entregaNoutroLugar ? txt(e?.cidade_destino) : txt(c.municipio),
    uf: (entregaNoutroLugar ? txt(e?.uf_destino) : txt(c.uf)).toUpperCase(),
    cep: entregaNoutroLugar ? cepEnvio : dig(c.cep),
    telefone: txt(c.whatsapp || c.telefone), referencia: "",
  };

  // Volumes: os do envio (com peso e medidas); sem envio, a quantidade da expedição/pedido
  let volumes = expandirVolumes(e?.volumes);
  const qtdInformada = s.volumes ?? f.expedicao?.volumes ?? f.pedido?.volumes ?? null;
  if (!volumes.length) volumes = ajustarQtd([], qtdInformada ?? 1);
  else if (s.volumes && s.volumes !== volumes.length) volumes = ajustarQtd(volumes, s.volumes);
  if (volumes.length === 1 && !volumes[0].descricao) {
    volumes[0] = { ...volumes[0], descricao: resumoItens(f.pedido?.itens ?? f.notaDireta?.itens) };
  }
  const somaPesos = volumes.reduce((t, v) => t + (v.peso_kg ?? 0), 0);
  const pesoTotal = num(s.peso_kg) ?? numBanco(f.expedicao?.peso_kg) ?? numBanco(e?.peso_total_kg) ?? numBanco(f.pedido?.peso_total_kg);

  const avisos = new Set<AvisoId>(modelo.avisos_padrao);
  for (const rr of e?.restricoes ?? []) {
    if (rr === "fragil") avisos.add("fragil");
    if (rr === "manter_em_pe") { avisos.add("manter_em_pe"); avisos.add("para_cima"); }
  }

  const nota = f.nota;
  return {
    remetente, destinatario,
    pedido: txt(f.pedido?.numero),
    nota: { numero: txt(nota?.numero), serie: txt(nota?.serie), chave: dig(nota?.chave).length === 44 ? dig(nota?.chave) : "" },
    transportadora: txt(s.transportadora ?? f.transportadora ?? e?.transportadora_nome),
    rastreio: txt(s.rastreio || e?.codigo_rastreio || f.expedicao?.codigo_rastreio || f.pedido?.codigo_rastreio),
    cte: txt(e?.cte_numero),
    peso_total_kg: pesoTotal ?? (somaPesos > 0 ? Math.round(somaPesos * 1000) / 1000 : null),
    volumes,
    avisos: AVISOS.map((a) => a.id).filter((id) => avisos.has(id)),
    observacao: txt(e?.restricoes_obs).slice(0, 120),
  };
}

// ---------------------------------------------------------------------
// Edição: só os campos que a pessoa mudou ficam guardados por cima. O resto continua vindo do ERP,
// então o rastreio ou a NF-e que chegam depois aparecem na próxima impressão.
// ---------------------------------------------------------------------
export const CAMPOS_GRUPO = ["remetente", "destinatario", "nota"] as const;

export function lerCampo(d: EtiquetaDados, caminho: string): unknown {
  const [a, b] = caminho.split(".");
  const v = (d as unknown as Record<string, unknown>)[a];
  return b ? (v as Record<string, unknown> | undefined)?.[b] : v;
}

export function gravarCampo(d: EtiquetaDados, caminho: string, valor: unknown): EtiquetaDados {
  const [a, b] = caminho.split(".");
  if (!b) return { ...d, [a]: valor } as EtiquetaDados;
  const grupo = (d as unknown as Record<string, Record<string, unknown>>)[a];
  if (!grupo || typeof grupo !== "object") return d;
  return { ...d, [a]: { ...grupo, [b]: valor } } as EtiquetaDados;
}

const CAMINHO_OK = /^(remetente|destinatario|nota)\.[a-z_]+$|^(pedido|transportadora|rastreio|cte|peso_total_kg|volumes|avisos|observacao)$/;

/** Junta o que vem do ERP agora com os campos editados que ficaram salvos. */
export function aplicarEditados(base: EtiquetaDados, salvo: Partial<EtiquetaDados> | null | undefined, editados: string[] | null | undefined): EtiquetaDados {
  if (!salvo || !editados?.length) return base;
  let d = base;
  for (const caminho of editados) {
    if (!CAMINHO_OK.test(caminho)) continue;
    const v = lerCampo(salvo as EtiquetaDados, caminho);
    if (v === undefined) continue;
    if (caminho === "volumes") {
      if (Array.isArray(v) && v.length) d = { ...d, volumes: (v as VolumeEtiqueta[]).slice(0, LIMITE_VOLUMES).map((x) => ({ ...volumeVazio(), ...x })) };
      continue;
    }
    if (caminho === "avisos") {
      if (Array.isArray(v)) d = { ...d, avisos: (v as string[]).filter((a) => IDS_AVISO.has(a)) as AvisoId[] };
      continue;
    }
    d = gravarCampo(d, caminho, v);
  }
  return d;
}

// ---------------------------------------------------------------------
// O que sai em cada etiqueta
// ---------------------------------------------------------------------
export const cepFmt = (c?: string | null) => dig(c).replace(/^(\d{5})(\d{3})$/, "$1-$2");
const fmtNum = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export const pesoTxt = (kg: number | null | undefined) => (kg ? `${fmtNum(kg)} kg` : "");
export function medidasTxt(v: VolumeEtiqueta) {
  const m = [v.comprimento_cm, v.largura_cm, v.altura_cm];
  return m.every((x) => x) ? `${m.map((x) => fmtNum(x!)).join(" × ")} cm` : "";
}

/** Código de barras da etiqueta de transporte, conforme o modelo (cai para o que existir). */
export function codigoTransporte(d: EtiquetaDados, modelo: ModeloEtiqueta): { valor: string; rotulo: string } | null {
  if (modelo.codigo === "nenhum") return null;
  const chave = d.nota.chave.length === 44 ? { valor: d.nota.chave, rotulo: "Chave de acesso da NF-e" } : null;
  const pedido = d.pedido ? { valor: `PED${d.pedido.replace(/\D/g, "") || d.pedido}`, rotulo: "Pedido" } : null;
  const nota = d.nota.numero ? { valor: `NF${d.nota.numero.replace(/\D/g, "")}`, rotulo: "Nota fiscal" } : null;
  const rastreio = d.rastreio ? { valor: d.rastreio.replace(/[^\x20-\x7e]/g, ""), rotulo: "Rastreio" } : null;
  const ordem = modelo.codigo === "pedido" ? [pedido, chave, nota, rastreio] : modelo.codigo === "rastreio" ? [rastreio, chave, pedido, nota] : [chave, pedido, nota, rastreio];
  return ordem.find((x) => x && x.valor) ?? null;
}

/** Código do volume (para conferir na saída): pedido ou nota + nº do volume. */
export function codigoVolume(d: EtiquetaDados, v: number, total: number) {
  const base = d.pedido ? `PED${d.pedido.replace(/\D/g, "") || d.pedido}` : d.nota.numero ? `NF${d.nota.numero.replace(/\D/g, "")}` : "VOL";
  const w = String(total).length;
  return `${base}-${String(v).padStart(w, "0")}/${total}`;
}

/** Peso que aparece na etiqueta de um volume: o dele; sem peso próprio e com um volume só, o total. */
export function pesoDoVolume(d: EtiquetaDados, i: number) {
  return d.volumes[i]?.peso_kg ?? (d.volumes.length === 1 ? d.peso_total_kg : null);
}

/** Avisos que impedem imprimir (sem destinatário, sem cidade...). */
export function faltandoNaEtiqueta(d: EtiquetaDados): string[] {
  const f: string[] = [];
  if (txt(d.destinatario.nome).length < 2) f.push("nome do destinatário");
  if (!txt(d.destinatario.municipio) || !txt(d.destinatario.uf)) f.push("cidade/UF do destinatário");
  if (dig(d.destinatario.cep).length !== 8) f.push("CEP do destinatário");
  if (!d.volumes.length) f.push("ao menos um volume");
  return f;
}

/** Conferências que não bloqueiam, mas a pessoa deve ver. */
export function alertasEtiqueta(d: EtiquetaDados): string[] {
  const a: string[] = [];
  if (!txt(d.destinatario.logradouro)) a.push("sem endereço (rua) do destinatário");
  if (!d.nota.numero) a.push("sem NF-e: a mercadoria não pode circular sem nota");
  const somaPesos = d.volumes.reduce((t, v) => t + (v.peso_kg ?? 0), 0);
  if (somaPesos > 0 && d.peso_total_kg && Math.abs(somaPesos - d.peso_total_kg) > Math.max(0.5, d.peso_total_kg * 0.05)) {
    a.push(`a soma dos volumes (${fmtNum(somaPesos)} kg) é diferente do peso total (${fmtNum(d.peso_total_kg)} kg)`);
  }
  return a;
}
