// Sobre → Design: a vitrine do design system. Cada peça que as telas usam aparece aqui do jeito que é, com o nome
// dela no código, para aprovar o visual antes de espalhar e para quem monta uma tela nova usar a peça certa
// (e não montar botão, cartão ou selo à mão). Trocar a área pinta a vitrine com a cor dela; o tema vem do menu.
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarClock, ClipboardCheck, FileText, Mail, Package, Pencil, Plus, ShoppingCart, Trash2, TrendingUp, Truck, Users, Wrench } from "lucide-react";
import { Badge, BotaoAtalho, Button, Card, chip, COR_ATALHO, Field, Indicador, Modal, Section, Stat, Table, Tabs, type TomAcao } from "@/components/ui";
import { CabecalhoPainel, CartaoPainel, Funil, type Periodo as PeriodoPainel } from "@/components/painel/Painel";
import { AnelEscuro, LinhaEscura, NumeroEscuro, QuadroEscuro, type FatiaAnel, TOM_ESCURO } from "@/components/painel/PainelEscuro";
import { BarraFiltros, ChipsSituacao } from "@/components/filtros/BarraFiltros";
import { SeloCidade } from "@/components/SeloCidade";
import { SEM_PERIODO, type Periodo } from "@/lib/filtroLista";
import { brl } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { useAparencia } from "@/lib/aparencia";
import { EditorAparencia } from "@/components/sobre/EditorAparencia";
import { TokensDesign } from "@/components/sobre/TokensDesign";

// cor de cada área (o --modulo de index.css), para o ponto da escolha
const AREAS = [
  { id: "inicio", rotulo: "Início", cor: "6 182 212" }, { id: "vendas", rotulo: "Vendas", cor: "16 185 129" },
  { id: "notas", rotulo: "Notas", cor: "59 130 246" }, { id: "financeiro", rotulo: "Financeiro", cor: "245 158 11" },
  { id: "cadastros", rotulo: "Cadastros", cor: "168 85 247" }, { id: "logistica", rotulo: "Logística", cor: "101 163 13" },
  { id: "posvenda", rotulo: "Pós-venda", cor: "20 184 166" }, { id: "producao", rotulo: "Produção", cor: "249 115 22" },
  { id: "analises", rotulo: "Análises", cor: "99 102 241" }, { id: "rh", rotulo: "Funcionários", cor: "217 70 239" }, { id: "admin", rotulo: "Admin", cor: "100 116 139" },
];

const LETRAS: { classe: string; px: string; uso: string; display?: boolean }[] = [
  { classe: "text-3xl", px: "30", uso: "número grande do painel", display: true },
  { classe: "text-2xl", px: "24", uso: "título da tela", display: true },
  { classe: "text-xl", px: "20", uso: "número do indicador", display: true },
  { classe: "text-lg", px: "18", uso: "título de janela e cartão", display: true },
  { classe: "text-base", px: "16", uso: "texto de leitura e campos no celular" },
  { classe: "text-sm", px: "14", uso: "texto das listas, botões e campos" },
  { classe: "text-xs", px: "12", uso: "rótulos e linhas de apoio" },
  { classe: "text-2xs", px: "11", uso: "etiquetas e chips" },
];

const TONS: { tom: TomAcao; rotulo: string; icone: typeof Mail }[] = [
  { tom: "enviar", rotulo: "WhatsApp / e-mail", icone: Mail }, { tom: "fiscal", rotulo: "Emitir NF-e", icone: FileText },
  { tom: "logistica", rotulo: "Etiqueta", icone: Truck }, { tom: "servico", rotulo: "Abrir OS", icone: Wrench },
  { tom: "documento", rotulo: "Imprimir", icone: FileText }, { tom: "desfazer", rotulo: "Reabrir", icone: CalendarClock },
  { tom: "perigo", rotulo: "Excluir", icone: Trash2 },
];

const FATIAS: FatiaAnel<string>[] = [
  { id: "maquinas", rotulo: "Máquinas", valor: 182000, ...TOM_ESCURO.ciano },
  { id: "pecas", rotulo: "Peças", valor: 64000, ...TOM_ESCURO.indigo },
  { id: "servicos", rotulo: "Serviços", valor: 28000, ...TOM_ESCURO.laranja },
  { id: "insumos", rotulo: "Insumos", valor: 15000, ...TOM_ESCURO.roxo },
];
const ICONE_FATIA: Record<string, typeof Package> = { maquinas: ShoppingCart, pecas: Package, servicos: Wrench, insumos: Users };

/** Bloco da vitrine: título, para que serve e o nome da peça no código. */
function Bloco({ titulo, peca, children, texto }: { titulo: string; peca: string; texto: string; children: ReactNode }) {
  return (
    <Section title={titulo} actions={<code className="rounded-md bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-600">{peca}</code>}>
      <p className="mb-3 text-sm text-slate-600">{texto}</p>
      {children}
    </Section>
  );
}

export function DesignSystem() {
  const { papel, master } = usePerfil();
  const corAreas = useAparencia().cores_areas ?? {};
  const [area, setArea] = useState(() => document.documentElement.dataset.modulo || "inicio");
  // pinta a vitrine com a área escolhida e devolve a cor da tela ao sair (como o PDV faz com Vendas)
  useEffect(() => {
    const raiz = document.documentElement, antes = raiz.dataset.modulo;
    return () => { raiz.dataset.modulo = antes ?? ""; };
  }, []);
  useEffect(() => { document.documentElement.dataset.modulo = area; }, [area]);

  const [aba, setAba] = useState<"um" | "dois" | "tres">("um");
  const [chipDemo, setChipDemo] = useState("Todos");
  const [periodoPainel, setPeriodoPainel] = useState<PeriodoPainel>("mes");
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>(SEM_PERIODO);
  const [situacao, setSituacao] = useState<"todos" | "aberto" | "pago">("todos");
  const [fatia, setFatia] = useState("");
  const [janela, setJanela] = useState(false);
  const total = FATIAS.reduce((s, f) => s + f.valor, 0);
  const daVez = FATIAS.find((f) => f.id === fatia);

  return (
    <div className="space-y-4">
      {(papel === "admin" || master) && <EditorAparencia />}
      <Card className="p-4 sm:p-5">
        <p className="text-sm text-slate-600">
          Todas as peças do visual do ERP num lugar só. Toda tela nova usa estas peças, e as telas antigas vão passando
          para elas. Os números aqui são exemplos. Escolha a área para ver a vitrine com a cor dela; o tema claro ou escuro
          vem do botão do menu.
        </p>
        <div className="faixa-chips mt-3" role="group" aria-label="Cor da área">
          {AREAS.map((a) => (
            <button key={a.id} type="button" aria-pressed={area === a.id} onClick={() => setArea(a.id)}
              className={chip(area === a.id, "border-modulo bg-modulo-escuro text-white")}>
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white/60" style={{ background: corAreas[a.id] ?? `rgb(${a.cor})` }} aria-hidden />{a.rotulo}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Bloco titulo="Letras" peca="font-display · font-sans · text-2xs…3xl"
          texto="Poppins nos títulos, números grandes, botões, abas e menu; DM Sans no texto e nos campos. São só estes 8 tamanhos, sem tamanho solto.">
          <ul className="divide-y divide-slate-100">
            {LETRAS.map((l) => (
              <li key={l.classe} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className={`${l.classe} ${l.display ? "font-display font-bold" : ""} min-w-0 text-fg`}>{l.display ? "R$ 182.400" : "Máquina de sorvete S430"}</span>
                <span className="shrink-0 text-xs text-slate-500 sm:text-right"><code className="font-semibold">{l.classe}</code> · {l.px}px · {l.uso}</span>
              </li>
            ))}
          </ul>
        </Bloco>

        <Bloco titulo="Cores" peca="modulo · brand · solido · kpi"
          texto="Cada área tem a sua cor (título, abas, seções, indicadores e menu). As cores dos números dizem o assunto: verde é bom, âmbar pede atenção, vermelho é problema.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["bg-modulo", "Área"], ["bg-modulo-escuro", "Área escura"], ["bg-brand", "Marca"], ["bg-ink", "Menu"],
              ["bg-solido-verde", "Bom"], ["bg-solido-ambar", "Atenção"], ["bg-solido-vermelho", "Problema"], ["bg-solido-azul", "Informação"]].map(([c, r]) => (
              <div key={c} className="overflow-hidden rounded-xl border border-slate-200">
                <div className={`h-10 ${c}`} />
                <p className="px-2 py-1 text-xs font-semibold text-slate-700">{r}<br /><code className="text-2xs font-normal text-slate-500">{c}</code></p>
              </div>
            ))}
          </div>
          {/* cores que não mudam com o tema: nome da paleta no lugar do #hex solto */}
          <p className="mt-3 text-xs text-slate-500">Cores fixas com nome: <code>fixo-emerald-500</code>, <code>noite-fundo</code> (apps do celular), <code>publico-petroleo</code> (páginas públicas) e os tons do painel escuro (<code>TOM_ESCURO</code>):</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.entries(TOM_ESCURO).map(([nome, t]) => (
              <span key={nome} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-2xs font-semibold text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: `linear-gradient(135deg, ${t.de}, ${t.ate})` }} aria-hidden />{nome}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(COR_ATALHO).map(([nome, cor]) => (
              <span key={nome} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-2xs font-semibold text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} aria-hidden />{nome}
              </span>
            ))}
          </div>
        </Bloco>
      </div>

      <Bloco titulo="Tokens" peca="src/design/tokens.js"
        texto="Os valores do visual com nome: cores, letras, espaços, cantos, bordas, sombras e camadas. Tela nova escolhe pelo nome (rounded-cartao, text-sm, z-janela), não por valor solto como rounded-[14px] ou text-[13px].">
        <TokensDesign />
      </Bloco>

      <Bloco titulo="Botões" peca="<Button variant | tom>"
        texto="Um botão cheio por tela, para a ação principal. As outras ações usam o tom do assunto: o mesmo tipo de ação tem a mesma cor em todo o ERP.">
        <div className="flex flex-wrap gap-2">
          <Button><Plus size={16} /> Novo pedido</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Ver mais</Button>
          <Button variant="danger"><Trash2 size={16} /> Excluir</Button>
          <Button disabled>Desativado</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TONS.map((t) => <Button key={t.tom} tom={t.tom}><t.icone size={16} /> {t.rotulo}</Button>)}
        </div>
        {/* peças únicas em classe (index.css): botões só de ícone, link de texto e cartão */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="botao-icone h-8 w-8" title="Editar" aria-label="Editar (exemplo)"><Pencil size={16} /></button>
          <button type="button" className="botao-icone-perigo h-8 w-8" title="Apagar" aria-label="Apagar (exemplo)"><Trash2 size={16} /></button>
          <button type="button" className="link-acao text-sm">Ver detalhes</button>
          <button type="button" className="link-modulo text-sm">Ver todas</button>
          <button type="button" className="link-discreto text-sm">Limpar</button>
          <code className="text-2xs text-slate-500">.botao-icone · .botao-icone-perigo · .link-acao · .link-modulo · .link-discreto · .cartao</code>
        </div>
        {/* botão pequeno das linhas e cartões, chips de escolha e linha de lista que abre algo */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button tamanho="mini" variant="secondary">+7 dias</Button>
          <Button tamanho="mini" tom="enviar"><Mail size={13} /> WhatsApp</Button>
          <Button tamanho="mini" tom="perigo">Tirar</Button>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          {["Todos", "Abertos", "Pagos"].map((r) => (
            <button key={r} type="button" aria-pressed={chipDemo === r} onClick={() => setChipDemo(r)} className={chip(chipDemo === r)}>{r}</button>
          ))}
          <code className="text-2xs text-slate-500">{'<Button tamanho="mini"> · chip(ativo) · .linha-clicavel'}</code>
        </div>
        <div className="mt-2 max-w-md">
          {["Sorveteria Central · R$ 1.200,00", "Gelato & Cia · R$ 860,00"].map((l) => (
            <button key={l} type="button" className="linha-clicavel flex items-center justify-between px-2 py-2 text-sm">{l}<span className="text-slate-400">›</span></button>
          ))}
        </div>
        <div className="mt-4 grid max-w-md grid-cols-4 gap-2 sm:grid-cols-6">
          <BotaoAtalho icon={ShoppingCart} label="Vendas" cor={COR_ATALHO.verde} />
          <BotaoAtalho icon={FileText} label="Notas" cor={COR_ATALHO.azul} />
          <BotaoAtalho icon={Wrench} label="OS" cor={COR_ATALHO.roxo} ativo />
          <BotaoAtalho icon={Truck} label="Fretes" cor={COR_ATALHO.laranja} />
        </div>
      </Bloco>

      <div className="grid gap-4 xl:grid-cols-2">
        <Bloco titulo="Abas" peca="<Tabs>"
          texto="Abas na cor da área. Com mais de 3 abas, no celular viram uma lista de escolha numa linha só.">
          <Tabs value={aba} onChange={setAba} options={[{ value: "um", label: "Em aberto" }, { value: "dois", label: "Pagas" }, { value: "tres", label: "Todas" }]} />
        </Bloco>
        <Bloco titulo="Campos" peca=".input · <Field>"
          texto="Nome em cima, campo embaixo. No celular a letra do campo tem 16px, para o iPhone não dar zoom.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cliente"><input className="input" placeholder="Nome ou CNPJ" /></Field>
            <Field label="Situação"><select className="input"><option>Em aberto</option><option>Paga</option></select></Field>
          </div>
        </Bloco>
      </div>

      <Bloco titulo="Selos" peca="<Badge> · <Badge forte> · <SeloCidade>"
        texto="A situação de cada registro, sempre com a mesma cor. O selo cheio é para a etapa da venda; o da cidade fica ao lado do nome do cliente.">
        <div className="flex flex-wrap items-center gap-2">
          {["orcamento", "aprovado", "faturado", "entregue", "cancelado"].map((v) => <Badge key={v} value={v} forte />)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {["aberto", "pago", "vencido", "em_reparo", "aguardando_peca", "autorizada", "rascunho"].map((v) => <Badge key={v} value={v} />)}
        </div>
        <p className="mt-3 text-sm font-semibold text-fg">Sorveteria Gelato Bom<SeloCidade cliente={{ municipio: "Joinville", uf: "SC" }} /></p>
      </Bloco>

      <Bloco titulo="Indicadores" peca="<Stat tom> · <Indicador cor> · <CartaoPainel>"
        texto="Números de destaque no alto das telas, todos com o mesmo brilho da tela inicial (estiloBrilho e Luz). A cor diz o assunto. O cartão do painel traz também a variação e a linha de tendência.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Vendas do mês" valor={brl(182400)} sub="34 pedidos" icon={TrendingUp} />
          <Stat label="Recebido" valor={brl(95300)} icon={ClipboardCheck} tom="bom" />
          <Stat label="Vence esta semana" valor={brl(21800)} icon={CalendarClock} tom="atencao" />
          <Stat label="Vencido" valor={brl(4350)} icon={AlertTriangle} tom="critico" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador rotulo="Máquinas na ficha" valor="12" icon={Package} cor="azul" />
          <Indicador rotulo="OS abertas" valor="3" icon={Wrench} cor="roxo" />
          <CartaoPainel anterior="mês passado" c={{ id: "a", rotulo: "Faturado", valor: brl(182400), icone: TrendingUp, cor: "var(--serie-1)", delta: 12, tendencia: [40, 52, 48, 61, 70, 66, 82] }} />
          <CartaoPainel anterior="mês passado" c={{ id: "b", rotulo: "Devoluções", valor: "4", icone: AlertTriangle, cor: "var(--kpi-laranja)", delta: 25, bomCair: true, tendencia: [2, 1, 3, 2, 4, 3, 4] }} />
        </div>
      </Bloco>

      <Bloco titulo="Painel da área" peca="<CabecalhoPainel> · <Funil>"
        texto="O alto de cada painel: a cor da área, a frase-resumo e o período (Hoje, Semana, 30 dias, Mês, Ano).">
        <CabecalhoPainel icone={ShoppingCart} area={AREAS.find((a) => a.id === area)?.rotulo ?? ""} titulo="Como foi o mês"
          resumo="R$ 182.400 vendidos em 34 pedidos, 12% a mais que no mês passado." periodo={periodoPainel} onPeriodo={setPeriodoPainel} />
        <div className="mt-4 max-w-xl">
          <Funil etapas={[{ rotulo: "Orçamentos", valor: 58 }, { rotulo: "Aprovados", valor: 41 }, { rotulo: "Faturados", valor: 34 }, { rotulo: "Entregues", valor: 29 }]} />
        </div>
      </Bloco>

      <Bloco titulo="Painel escuro" peca="<QuadroEscuro> · <AnelEscuro> · <NumeroEscuro> · <LinhaEscura>"
        texto="O estilo painel: fundo escuro nos dois temas, colorido, com o número principal no centro do anel. É o do “Quanto tem para pagar” e o do “Vendas do ano” (Retaguarda), e vai para os outros painéis. Toque numa parte para filtrar.">
        <QuadroEscuro rotulo="Vendas do ano (exemplo)" titulo="Vendas" destaque="do ano" className=""
          filtro={daVez ? { texto: daVez.rotulo, onLimpar: () => setFatia("") } : undefined}>
          <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,15.5rem)_auto_minmax(0,1fr)] lg:gap-6">
            <div className="order-1 min-w-0 lg:order-2">
              <AnelEscuro fatias={FATIAS} escolhida={fatia} onEscolher={setFatia} rotulo={`Vendas do ano ${brl(total)}`}
                centro={{ rotulo: daVez?.rotulo ?? "Vendas do ano", valor: brl(daVez?.valor ?? total), sub: daVez ? `${Math.round((daVez.valor / total) * 100)}% do ano` : "18% a mais que 2025" }} />
            </div>
            <div className="order-2 grid min-w-0 grid-cols-2 gap-2 lg:order-1 lg:grid-cols-1">
              <NumeroEscuro icone={TrendingUp} rotulo="Este mês" valor={brl(31200)} sub="8 pedidos" tom="verde" aceso />
              <NumeroEscuro icone={ShoppingCart} rotulo="Ticket médio" valor={brl(9150)} sub="por pedido" tom="anil" aceso />
              <NumeroEscuro icone={ClipboardCheck} rotulo="Orçamentos" valor="23" sub="esperando resposta" tom="roxo" aceso />
              <NumeroEscuro icone={AlertTriangle} rotulo="Cancelados" valor={brl(6400)} sub="2 pedidos" tom="cinza" />
            </div>
            <ul className="order-3 grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" aria-label="Por tipo de venda">
              {FATIAS.map((f) => {
                const pct = Math.round((f.valor / total) * 100);
                return (
                  <li key={f.id} className="min-w-0">
                    <LinhaEscura icone={ICONE_FATIA[f.id]} rotulo={f.rotulo} valor={brl(f.valor)} pct={pct} cor={f.cor} neon={f.neon}
                      ativo={fatia === f.id} apagado={!!fatia && fatia !== f.id} onClick={() => setFatia(fatia === f.id ? "" : f.id)}
                      detalhes={<span>{pct}% do ano</span>} />
                  </li>
                );
              })}
            </ul>
          </div>
        </QuadroEscuro>
      </Bloco>

      <Bloco titulo="Filtros das listas" peca="<BarraFiltros> · <ChipsSituacao>"
        texto="A mesma barra em todas as listas: busca, período (com atalhos ou de/até) e os outros filtros guardados num botão. Os chips mostram a situação com a quantidade.">
        <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar cliente, pedido ou nota…" periodo={periodo} onPeriodo={setPeriodo}
          rotuloData="Emissão" nFiltros={0} onLimpar={() => { setBusca(""); setPeriodo(SEM_PERIODO); }}
          filtros={<Field label="Vendedor"><select className="input"><option>Todos</option></select></Field>} />
        <ChipsSituacao valor={situacao} onChange={setSituacao}
          opcoes={[{ value: "todos", label: "Todos", n: 48 }, { value: "aberto", label: "Em aberto", n: 13 }, { value: "pago", label: "Pagos", n: 35 }]} />
      </Bloco>

      <Bloco titulo="Tabelas" peca="<Table> · .tabela-leve"
        texto="Clicar no título da coluna ordena; no celular cada linha vira um cartão. A tabela leve (títulos sem caixa-alta e texto um pouco maior, como no Tiny) é a das Notas fiscais e é a candidata a valer para todas as listas.">
        <div className="space-y-4">
          {[false, true].map((leve) => (
            <div key={String(leve)} className={leve ? "tabela-leve" : ""}>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">{leve ? "Leve (.tabela-leve)" : "Padrão"}</p>
              <Table head={<><th className="th">Cliente</th><th className="th">Cidade</th><th className="th text-right">Valor</th><th className="th">Situação</th></>}>
                {[["Sorveteria Gelato Bom", "Joinville/SC", 18400, "pago"], ["Açaí da Praia", "Santos/SP", 9650, "aberto"], ["Doce Frio", "Blumenau/SC", 3200, "vencido"]].map(([c, m, v, s]) => (
                  <tr key={String(c)}>
                    <td className="td font-semibold">{c}</td><td className="td">{m}</td>
                    <td className="td num text-right">{brl(Number(v))}</td><td className="td"><Badge value={String(s)} /></td>
                  </tr>
                ))}
              </Table>
            </div>
          ))}
        </div>
      </Bloco>

      <Bloco titulo="Janela" peca="<Modal>"
        texto="Janela por cima da tela: título, fechar no X ou no Esc, e a linha Cancelar/Salvar presa no pé quando a janela é alta.">
        <Button variant="secondary" onClick={() => setJanela(true)}>Abrir janela de exemplo</Button>
        <Modal open={janela} onClose={() => setJanela(false)} title="Nova conta a pagar">
          <form onSubmit={(e) => { e.preventDefault(); setJanela(false); }} className="space-y-3">
            <Field label="Descrição"><input className="input" placeholder="Ex.: frete da transportadora" /></Field>
            <Field label="Valor"><input className="input" inputMode="decimal" placeholder="0,00" /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setJanela(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </Modal>
      </Bloco>
    </div>
  );
}
