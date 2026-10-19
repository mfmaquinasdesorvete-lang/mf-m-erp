// Página de apresentação do ERP Line (/conheca, sem login). Estrutura do layout "Alavanca" do Claude Design, nas cores
// do ERP (navy + ciano). Por enquanto a venda é por indicação: escritórios de contabilidade parceiros e a rede de
// relacionamento; a venda aberta vem depois. Quem deixa o contato entra em erp_interessados e vendas é avisado.
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

const CSS = `
.cn{--navy:#0D1B2E;--navy2:#13263F;--ink:#0F1E33;--ink2:#2E3F57;--mute:#5B6B80;--line:#E2E7EE;--soft:#F2F5F9;--soft2:#E9EEF4;--ciano:#00D4FF;--ciano-t:#067494;--ciano-bg:#E3F6FC;
  background:#fff;color:var(--ink);font-family:"DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh}
.cn *{box-sizing:border-box}
.cn a{color:inherit;text-decoration:none}
.cn h1,.cn h2,.cn h3{font-family:"Poppins","DM Sans",system-ui,sans-serif;margin:0;text-wrap:balance}
.cn em{font-style:italic;color:var(--ciano-t)}
.cn .wrap{max-width:1160px;margin:0 auto;padding-left:max(24px,env(safe-area-inset-left,0px));padding-right:max(24px,env(safe-area-inset-right,0px))}
.cn .navw{position:sticky;top:0;z-index:60;padding:18px 0 0}
.cn nav{background:var(--navy);border-radius:999px;padding:12px 14px 12px 24px;display:flex;align-items:center;gap:36px;box-shadow:0 18px 40px -28px rgba(13,27,46,.7)}
.cn .logo{display:flex;align-items:center;gap:10px;color:#fff;font-weight:800;font-size:19px;font-family:"Poppins",sans-serif}
.cn .logo i{width:26px;height:26px;border-radius:999px;background:var(--ciano);color:var(--navy);font-style:normal;font-size:13px;display:grid;place-items:center}
.cn .logo b{color:var(--ciano)}
.cn .links{display:flex;gap:24px;font-size:15px;font-weight:500;color:#E9EEF4}
.cn .links a:hover{color:var(--ciano)}
.cn .btn{display:inline-flex;align-items:center;gap:12px;border-radius:999px;font-weight:700;font-size:16px;padding:15px 26px;border:0;cursor:pointer;font-family:inherit}
.cn .btn-c{background:var(--ciano);color:var(--navy)}
.cn .btn-c span{width:30px;height:30px;border-radius:999px;background:var(--navy);color:var(--ciano);display:grid;place-items:center;font-size:14px}
.cn .btn-w{background:#fff;color:var(--navy)}
.cn .btn-o{background:#fff;border:1px solid #D9E0E9;color:var(--ink)}
.cn .btn-n{background:var(--navy);color:#fff}
.cn .eyebrow{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ciano-t)}
.cn .eyebrow span{width:22px;height:2px;background:var(--ciano)}
.cn section{padding:96px 0 0}
.cn .hero{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start;padding-top:64px}
.cn .tag{display:inline-block;border:1px dashed var(--ciano-t);border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600}
.cn h1{margin-top:26px;font-size:56px;line-height:1.06;font-weight:800;letter-spacing:-.03em}
.cn h1 em{text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:7px}
.cn .lead{margin:26px 0 0;max-width:500px;font-size:17px;line-height:1.62;color:var(--ink2)}
.cn .ctas{display:flex;gap:14px;margin-top:32px;flex-wrap:wrap}
.cn .fine{margin:22px 0 0;font-size:14px;color:var(--mute)}
.cn .mock-w{position:relative;padding-top:36px}
.cn .blob{position:absolute;left:50%;transform:translateX(-50%);width:220px;height:220px;border-radius:999px;background:var(--ciano);opacity:.9}
.cn .mock{position:relative;background:#F8FAFC;border:1px solid var(--line);border-radius:14px;box-shadow:0 40px 70px -50px rgba(13,27,46,.55);overflow:hidden}
.cn .mock-top{background:var(--navy);padding:13px 18px;display:flex;align-items:center;gap:8px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#CFE6F0}
.cn .mock-top i{width:9px;height:9px;border-radius:999px;background:#3A5577;display:block}
.cn .mock-b{padding:18px 20px 20px;display:grid;gap:12px}
.cn .steps{display:flex;gap:8px}
.cn .steps span{height:4px;flex:1;border-radius:999px;background:var(--soft2)}
.cn .steps span.on{background:var(--ciano)}
.cn .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.cn .kpi{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.cn .kpi small{display:block;font-size:11px;color:var(--mute);font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.cn .kpi b{font-size:20px;font-family:"Poppins",sans-serif}
.cn .row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px}
.cn .row .grow{flex:1;min-width:0}
.cn .row small{display:block;color:var(--mute);font-size:12px}
.cn .pill{font-size:10.5px;font-weight:800;letter-spacing:.06em;padding:4px 8px;border-radius:6px}
.cn .p-ok{background:#DCFCE7;color:#166534}.cn .p-at{background:#FEF3C7;color:#92400E}.cn .p-in{background:var(--ciano-bg);color:var(--ciano-t)}
.cn .marq{margin-top:96px;background:var(--navy);color:#fff;padding:20px 0;overflow:hidden}
.cn .marq div{display:flex;gap:28px;white-space:nowrap;width:max-content;animation:cnmarq 38s linear infinite;font-family:"Poppins",sans-serif;font-weight:600;font-size:20px}
.cn .marq b{color:var(--ciano)}
@keyframes cnmarq{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.cn .marq div{animation:none}}
.cn h2{margin-top:16px;font-size:42px;line-height:1.1;font-weight:800;letter-spacing:-.025em}
.cn .sub{margin:16px 0 0;max-width:620px;font-size:17px;line-height:1.6;color:var(--ink2)}
.cn .head{display:flex;align-items:end;justify-content:space-between;gap:24px;flex-wrap:wrap}
.cn .rule{height:1px;background:var(--line);margin:34px 0}
.cn .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.cn .card{border:1px solid var(--line);border-radius:18px;padding:28px;background:#fff}
.cn .card .ic{width:44px;height:44px;border-radius:12px;background:var(--ciano-bg);display:grid;place-items:center;margin-bottom:20px}
.cn .card h3{font-size:21px;font-weight:700}
.cn .card p{margin:10px 0 0;font-size:15.5px;line-height:1.6;color:var(--ink2)}
.cn .card ul{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:6px;font-size:14.5px;color:var(--ink2)}
.cn .card li::before{content:"✓";color:var(--ciano-t);font-weight:800;margin-right:8px}
.cn .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:40px}
.cn .step{background:var(--soft);border-radius:18px;padding:26px}
.cn .step .n{width:40px;height:40px;border-radius:999px;background:var(--navy);color:var(--ciano);font-weight:800;display:grid;place-items:center;font-family:"Poppins",sans-serif;margin-bottom:18px}
.cn .step h3{font-size:19px;font-weight:700}
.cn .step p{margin:8px 0 0;font-size:15px;line-height:1.55;color:var(--ink2)}
.cn .rec{display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:start}
.cn .feat{display:flex;gap:18px;padding:22px 0;border-bottom:1px solid var(--line)}
.cn .feat>span{font-family:ui-monospace,Menlo,monospace;color:var(--ciano-t);font-weight:600;font-size:14px;padding-top:4px}
.cn .feat h3{font-size:19px;font-weight:700}
.cn .feat p{margin:6px 0 0;font-size:15.5px;line-height:1.6;color:var(--ink2)}
.cn .painel{background:var(--navy);border-radius:22px;padding:22px;color:#fff;display:grid;gap:10px;position:sticky;top:110px}
.cn .painel .ph{display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:6px}
.cn .painel .ph small{font-size:11px;letter-spacing:.08em;color:var(--ciano);font-weight:800}
.cn .pr{background:var(--navy2);border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px}
.cn .pr .grow{flex:1;min-width:0;font-size:14.5px;font-weight:600}
.cn .pr small{display:block;font-weight:400;color:#A9BBD0;font-size:12.5px;margin-top:2px}
.cn .bar{width:70px;height:6px;border-radius:999px;background:#2A4262;overflow:hidden}
.cn .bar i{display:block;height:100%;background:var(--ciano)}
.cn .seg{display:inline-flex;background:var(--soft);border-radius:999px;padding:5px}
.cn .seg button{border:0;background:transparent;border-radius:999px;padding:11px 22px;font-weight:700;font-size:15px;cursor:pointer;color:var(--ink2);font-family:inherit}
.cn .seg button.on{background:var(--navy);color:#fff}
.cn .plano{border:1px solid var(--line);border-radius:22px;padding:30px;display:flex;flex-direction:column;gap:14px;background:#fff;position:relative}
.cn .plano.dest{background:var(--navy);color:#fff;border-color:var(--navy)}
.cn .plano.dest p,.cn .plano.dest li{color:#CFE0EC}
.cn .plano .badge{position:absolute;top:-13px;left:30px;background:var(--ciano);color:var(--navy);font-weight:800;font-size:12px;padding:6px 12px;border-radius:999px}
.cn .plano h3{font-size:22px;font-weight:700}
.cn .plano .preco{font-family:"Poppins",sans-serif;font-size:30px;font-weight:800}
.cn .plano p{margin:0;font-size:14.5px;color:var(--mute);line-height:1.55}
.cn .plano ul{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:9px;font-size:15px;flex:1}
.cn .plano li::before{content:"✓";color:var(--ciano);font-weight:800;margin-right:10px}
.cn .gar{margin-top:28px;background:var(--soft);border-radius:22px;padding:30px;display:grid;grid-template-columns:auto 1fr auto;gap:28px;align-items:center}
.cn .selo{width:96px;height:96px;border-radius:999px;border:2px dashed var(--ciano-t);display:grid;place-items:center;text-align:center;font-family:"Poppins",sans-serif;color:var(--navy)}
.cn .selo b{display:block;font-size:30px;line-height:1}
.cn .selo small{font-size:10px;letter-spacing:.12em;font-weight:800}
.cn .gar h3{font-size:22px;font-weight:700}
.cn .gar p{margin:8px 0 0;font-size:15.5px;line-height:1.6;color:var(--ink2)}
.cn form{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:30px}
.cn label{display:grid;gap:6px;font-size:13.5px;font-weight:700;color:var(--ink2)}
.cn input,.cn textarea{font:inherit;font-size:16px;border:1px solid #D9E0E9;border-radius:12px;padding:13px 14px;color:var(--ink);background:#fff;width:100%}
.cn input:focus,.cn textarea:focus{outline:2px solid var(--ciano);outline-offset:1px;border-color:transparent}
.cn .full{grid-column:1/-1}
.cn .msg{grid-column:1/-1;border-radius:12px;padding:14px 16px;font-weight:600}
.cn .msg.ok{background:#DCFCE7;color:#166534}.cn .msg.er{background:#FEE2E2;color:#991B1B}
.cn footer{margin-top:110px;background:var(--navy);color:#A9BBD0;padding:44px 0;font-size:14px}
.cn footer .wrap{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center}
@media (max-width:960px){
  .cn .links{display:none}.cn nav{gap:14px}.cn nav .btn{margin-left:auto}
  .cn .hero,.cn .rec{grid-template-columns:1fr}.cn .painel{position:static}
  .cn .g3,.cn .g4{grid-template-columns:1fr 1fr}
  .cn h1{font-size:42px}.cn h2{font-size:34px}
  .cn .gar{grid-template-columns:1fr}
}
@media (max-width:600px){
  .cn .g3,.cn .g4,.cn form{grid-template-columns:1fr}
  .cn h1{font-size:36px}.cn h2{font-size:29px}.cn section{padding-top:72px}
  .cn nav{padding-left:16px}.cn nav .btn{padding:11px 16px;font-size:14px}
  .cn .kpis{grid-template-columns:1fr 1fr}
}
`;

const MODULOS = ["Vendas e propostas", "NF-e e NFS-e", "Financeiro", "Conciliação bancária", "Estoque", "Produção (OP)", "Compras",
  "Assistência técnica", "Painel do contador", "Lucro Real", "Pix e boletos", "Fretes e etiquetas", "Matriz e filial", "Relatórios e DRE"];

const ICONE = {
  vendas: <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="#0D1B2E" strokeWidth="1.6"><rect x="2" y="3" width="16" height="14" rx="2" /><line x1="2" y1="8" x2="18" y2="8" /><line x1="6" y1="12" x2="11" y2="12" /></svg>,
  fiscal: <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="#0D1B2E" strokeWidth="1.6"><path d="M5 2h7l3 3v13H5z" /><line x1="8" y1="9" x2="12" y2="9" /><line x1="8" y1="12" x2="12" y2="12" /></svg>,
  financeiro: <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="#0D1B2E" strokeWidth="1.6"><rect x="2" y="5" width="16" height="11" rx="2" /><circle cx="10" cy="10.5" r="2.4" /></svg>,
};

type Perfil = "empresa" | "contador";

export default function Conheca() {
  const [perfil, setPerfil] = useState<Perfil>("empresa");
  const [f, setF] = useState({ nome: "", empresa: "", contato: "", cidade: "", indicado_por: "", mensagem: "" });
  const [estado, setEstado] = useState<{ tipo: "ok" | "er"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setEstado(null);
    try {
      const { error } = await supabase.rpc("erp_interesse", {
        p_perfil: perfil, p_nome: f.nome, p_empresa: f.empresa, p_contato: f.contato, p_cidade: f.cidade,
        p_indicado_por: f.indicado_por || null, p_mensagem: f.mensagem || null,
      });
      if (error) throw error;
      setEstado({ tipo: "ok", texto: "Recebemos! Vamos falar com você pelo contato que deixou." });
      setF({ nome: "", empresa: "", contato: "", cidade: "", indicado_por: "", mensagem: "" });
    } catch (err) {
      setEstado({ tipo: "er", texto: (err as Error).message || "Não deu para enviar agora. Tente de novo." });
    } finally {
      setEnviando(false);
    }
  }

  const irContato = (p: Perfil) => { setPerfil(p); document.getElementById("contato")?.scrollIntoView({ behavior: "smooth" }); };

  return (
    <div className="cn">
      <style>{CSS}</style>
      <div className="navw wrap">
        <nav aria-label="Seções">
          <a href="#inicio" className="logo"><i>EL</i>ERP Line<b>.</b></a>
          <div className="links">
            <a href="#modulos">Módulos</a><a href="#como">Como funciona</a><a href="#recursos">Recursos</a><a href="#acesso">Acesso</a>
          </div>
          <a href="#contato" className="btn btn-w" style={{ marginLeft: "auto" }}>Quero conhecer</a>
        </nav>
      </div>

      <div className="wrap hero" id="inicio">
        <div style={{ paddingTop: 24 }}>
          <div className="tag">Por indicação · vagas limitadas</div>
          <h1>A empresa inteira <em>em uma tela</em>, do pedido ao contador.</h1>
          <p className="lead">O ERP Line junta vendas, notas fiscais, financeiro, estoque, produção e assistência técnica — feito por quem fabrica e
            vende de verdade, com o Lucro Real e a matriz e filial já pensados.</p>
          <div className="ctas">
            <button type="button" className="btn btn-c" onClick={() => irContato("empresa")}>Quero conhecer <span>↗</span></button>
            <button type="button" className="btn btn-o" onClick={() => irContato("contador")}>Sou escritório de contabilidade</button>
          </div>
          <p className="fine">Implantação acompanhada · Seus dados do sistema antigo vêm junto · Contador com acesso próprio</p>
        </div>
        <div className="mock-w" aria-hidden="true">
          <div className="blob" style={{ top: 8 }} />
          <div className="blob" style={{ bottom: -30 }} />
          <div className="mock">
            <div className="mock-top"><i /><i /><i /><span style={{ marginLeft: 12 }}>erp line — fluxo de pedidos</span></div>
            <div className="mock-b">
              <div className="steps"><span className="on" /><span className="on" /><span className="on" /><span /></div>
              <div className="kpis">
                <div className="kpi"><small>A faturar</small><b>12</b></div>
                <div className="kpi"><small>Em produção</small><b>4</b></div>
                <div className="kpi"><small>Para enviar</small><b>7</b></div>
              </div>
              <div className="row"><div className="grow">Pedido #1042 · Distribuidora<small>NF-e autorizada · etiqueta pronta</small></div><span className="pill p-ok">ENVIADO</span></div>
              <div className="row"><div className="grow">Pedido #1043 · Loja Centro<small>Pix recebido · separando</small></div><span className="pill p-in">SEPARAÇÃO</span></div>
              <div className="row"><div className="grow">OP #318 · Máquina sob encomenda<small>3 de 5 etapas feitas</small></div><span className="pill p-at">PRODUÇÃO</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="marq" aria-hidden="true">
        <div>{[...MODULOS, ...MODULOS].map((m, i) => <span key={i}>{m} <b>✳</b></span>)}</div>
      </div>

      <section id="modulos" className="wrap">
        <div className="eyebrow"><span />Módulos</div>
        <div className="head"><h2><em>O que</em> o ERP Line resolve</h2></div>
        <div className="rule" />
        <div className="g3">
          <div className="card"><div className="ic">{ICONE.vendas}</div><h3>Vendas e operação</h3>
            <p>Da proposta ao pedido, com separação, embalagem, frete e rastreio — num quadro por etapas que mostra o que travou.</p>
            <ul><li>Propostas com aceite online</li><li>PDV de balcão</li><li>Produção e compras ligadas ao pedido</li></ul></div>
          <div className="card"><div className="ic">{ICONE.fiscal}</div><h3>Fiscal sem susto</h3>
            <p>NF-e e NFS-e emitidas no próprio sistema, regras por operação e conferência antes de emitir.</p>
            <ul><li>Lucro Real e Reforma (IBS/CBS)</li><li>Notas de fornecedor entram sozinhas</li><li>Calendário de obrigações</li></ul></div>
          <div className="card"><div className="ic">{ICONE.financeiro}</div><h3>Financeiro que fecha</h3>
            <p>Contas, cobrança, Pix e boletos com baixa automática, e o extrato do banco conciliado com sugestões.</p>
            <ul><li>DRE pelas notas e pelo caixa</li><li>Aprovação antes de pagar</li><li>Painel do contador</li></ul></div>
        </div>
      </section>

      <section id="como" className="wrap">
        <div className="eyebrow"><span />Como funciona</div>
        <h2><em>Quatro passos,</em> sem parar a empresa</h2>
        <p className="sub">A troca é acompanhada do começo ao fim. Ninguém fica com dois sistemas ao mesmo tempo por meses.</p>
        <div className="g4">
          <div className="step"><div className="n">1</div><h3>Indicação</h3><p>Seu escritório de contabilidade parceiro ou alguém da rede apresenta o ERP Line para a sua empresa.</p></div>
          <div className="step"><div className="n">2</div><h3>Diagnóstico</h3><p>Olhamos como a empresa vende, fatura e paga hoje, e o que precisa vir do sistema antigo.</p></div>
          <div className="step"><div className="n">3</div><h3>Implantação</h3><p>Clientes, produtos, notas e contas vêm junto. Treinamos cada área no próprio dia a dia.</p></div>
          <div className="step"><div className="n">4</div><h3>Rotina</h3><p>O contador acompanha o mês pelo painel dele, sem planilha e sem pedir arquivo por e-mail.</p></div>
        </div>
      </section>

      <section id="recursos" className="wrap rec">
        <div>
          <div className="eyebrow"><span />O que tem dentro</div>
          <h2>Feito para quem<br /><em>fabrica e vende</em></h2>
          <div style={{ marginTop: 18 }}>
            <div className="feat"><span>01</span><div><h3>Matriz e filial no mesmo sistema</h3><p>Estoque, notas e caixa por unidade, com transferência entre elas e o consolidado na mesma tela.</p></div></div>
            <div className="feat"><span>02</span><div><h3>Produção de verdade</h3><p>Ficha técnica em vários níveis, ordem de produção por etapas e a necessidade de compra calculada pelo que vai ser feito.</p></div></div>
            <div className="feat"><span>03</span><div><h3>Assistência técnica com histórico</h3><p>Cada máquina vendida com série, garantia e preventiva; cada OS no histórico do cliente.</p></div></div>
            <div className="feat"><span>04</span><div><h3>Painéis que respondem</h3><p>Cada área abre num painel com o que precisa de ação agora, e o número leva direto para a lista certa.</p></div></div>
          </div>
        </div>
        <div className="painel" aria-hidden="true">
          <div className="ph"><span>Painel do contador</span><small>OUTUBRO</small></div>
          {[["Notas do mês conferidas", "214 de 220", 97], ["Bancos conciliados", "3 de 4 contas", 75], ["Contas com comprovante", "188 de 201", 93], ["Fechamento", "faltam 2 pendências", 60]].map(([t, s, p]) => (
            <div className="pr" key={t as string}><div className="grow">{t}<small>{s}</small></div><div className="bar"><i style={{ width: `${p}%` }} /></div></div>
          ))}
        </div>
      </section>

      <section className="wrap">
        <div className="eyebrow"><span />Para quem é</div>
        <h2>Se a empresa cresceu e o sistema <em>não acompanhou</em></h2>
        <div className="g3" style={{ marginTop: 40 }}>
          <div className="card"><h3>Indústria</h3><p>Você fabrica, vende e dá assistência, e hoje junta tudo em três sistemas e muitas planilhas.</p></div>
          <div className="card"><h3>Comércio e distribuição</h3><p>Você vende no balcão, no site e nos marketplaces e precisa do estoque e do fiscal certos em todo canal.</p></div>
          <div className="card"><h3>Escritório de contabilidade</h3><p>Você quer clientes organizados, com notas, bancos e fechamento chegando prontos todo mês.</p></div>
        </div>
      </section>

      <section id="acesso" className="wrap">
        <div className="eyebrow"><span />Acesso</div>
        <div className="head">
          <div><h2><em>Por indicação,</em> nesta primeira fase</h2>
            <p className="sub">Estamos abrindo o ERP Line aos poucos, com escritórios de contabilidade parceiros e a nossa rede, para acompanhar cada implantação de perto. A venda aberta vem depois.</p></div>
          <div className="seg" role="tablist" aria-label="Para quem">
            <button type="button" role="tab" aria-selected={perfil === "empresa"} className={perfil === "empresa" ? "on" : ""} onClick={() => setPerfil("empresa")}>Para empresas</button>
            <button type="button" role="tab" aria-selected={perfil === "contador"} className={perfil === "contador" ? "on" : ""} onClick={() => setPerfil("contador")}>Para contadores</button>
          </div>
        </div>
        <div className="rule" />
        {perfil === "empresa" ? (
          <div className="g3">
            <div className="plano"><h3>Diagnóstico</h3><div className="preco">Sem custo</div><p>Uma conversa para ver se o ERP Line serve para a sua operação.</p>
              <ul><li>Como você vende e fatura hoje</li><li>O que vem do sistema antigo</li><li>Prazo da troca</li></ul>
              <button type="button" className="btn btn-o" onClick={() => irContato("empresa")}>Agendar conversa</button></div>
            <div className="plano dest"><span className="badge">Mais escolhido</span><h3>Implantação acompanhada</h3><div className="preco">Sob proposta</div><p>Valor pelo tamanho da empresa e pelos módulos.</p>
              <ul><li>Importação dos seus dados</li><li>Treinamento por área</li><li>Fiscal configurado com o seu contador</li><li>Suporte direto no começo</li></ul>
              <button type="button" className="btn btn-c" onClick={() => irContato("empresa")}>Quero uma proposta <span>↗</span></button></div>
            <div className="plano"><h3>Indicado pelo contador</h3><div className="preco">Condição especial</div><p>Empresas que chegam por um escritório parceiro.</p>
              <ul><li>Tudo da implantação</li><li>Contador com acesso próprio</li><li>Fechamento do mês pelo painel</li></ul>
              <button type="button" className="btn btn-o" onClick={() => irContato("empresa")}>Fui indicado</button></div>
          </div>
        ) : (
          <div className="g3">
            <div className="plano"><h3>Painel do contador</h3><div className="preco">Incluso</div><p>Acesso de leitura às empresas que você atende.</p>
              <ul><li>Notas, bancos e contas do mês</li><li>Pendências com o caminho para resolver</li><li>Pacote do fechamento</li></ul>
              <button type="button" className="btn btn-o" onClick={() => irContato("contador")}>Quero ver o painel</button></div>
            <div className="plano dest"><span className="badge">Programa de parceiros</span><h3>Escritório parceiro</h3><div className="preco">Por indicação</div><p>Para escritórios que querem clientes mais organizados.</p>
              <ul><li>Condição especial para os seus clientes</li><li>Implantação acompanhada por nós</li><li>Contato direto com o time</li><li>Participação nas indicações</li></ul>
              <button type="button" className="btn btn-c" onClick={() => irContato("contador")}>Quero ser parceiro <span>↗</span></button></div>
            <div className="plano"><h3>Rede de relacionamento</h3><div className="preco">Convite</div><p>Para quem conhece empresas que precisam trocar de sistema.</p>
              <ul><li>Apresentação conjunta</li><li>Acompanhamento da indicação</li></ul>
              <button type="button" className="btn btn-o" onClick={() => irContato("contador")}>Indicar uma empresa</button></div>
          </div>
        )}
        <div className="gar">
          <div className="selo"><div><b>1º</b><small>MÊS</small></div></div>
          <div><h3>Primeiro mês acompanhado de perto</h3>
            <p>Na implantação, alguém do nosso time acompanha a rotina com você até o primeiro fechamento do mês sair pelo ERP Line, conferido pelo seu contador.</p></div>
          <button type="button" className="btn btn-n" onClick={() => irContato(perfil)}>Falar com a gente</button>
        </div>
      </section>

      <section id="contato" className="wrap">
        <div className="eyebrow"><span />Contato</div>
        <h2>{perfil === "contador" ? <>Quero ser <em>escritório parceiro</em></> : <>Quero <em>conhecer</em> o ERP Line</>}</h2>
        <p className="sub">Deixe seu contato. A gente responde pelo WhatsApp ou e-mail que você informar.</p>
        <form onSubmit={enviar}>
          <div className="full seg" role="radiogroup" aria-label="Você é">
            <button type="button" role="radio" aria-checked={perfil === "empresa"} className={perfil === "empresa" ? "on" : ""} onClick={() => setPerfil("empresa")}>Sou empresa</button>
            <button type="button" role="radio" aria-checked={perfil === "contador"} className={perfil === "contador" ? "on" : ""} onClick={() => setPerfil("contador")}>Sou contabilidade</button>
          </div>
          <label>Seu nome<input required value={f.nome} onChange={set("nome")} autoComplete="name" /></label>
          <label>{perfil === "contador" ? "Escritório" : "Empresa"}<input value={f.empresa} onChange={set("empresa")} autoComplete="organization" /></label>
          <label>WhatsApp ou e-mail<input required value={f.contato} onChange={set("contato")} /></label>
          <label>Cidade / UF<input value={f.cidade} onChange={set("cidade")} placeholder="Joinville/SC" /></label>
          {perfil === "empresa" && <label className="full">Quem indicou (contador ou pessoa)<input value={f.indicado_por} onChange={set("indicado_por")} /></label>}
          <label className="full">Conte um pouco (opcional)<textarea rows={3} value={f.mensagem} onChange={set("mensagem")} placeholder={perfil === "contador" ? "Quantas empresas atende, que sistemas elas usam hoje…" : "O que vende, quantas pessoas usam o sistema, que sistema usa hoje…"} /></label>
          {estado && <div className={`msg ${estado.tipo}`} role="status">{estado.texto}</div>}
          <div className="full"><button type="submit" className="btn btn-c" disabled={enviando}>{enviando ? "Enviando…" : "Enviar"} <span>↗</span></button></div>
        </form>
      </section>

      <footer>
        <div className="wrap"><span className="logo" style={{ fontSize: 17 }}><i>EL</i>ERP Line<b>.</b></span><span>Gestão completa para quem fabrica e vende.</span></div>
      </footer>
    </div>
  );
}
