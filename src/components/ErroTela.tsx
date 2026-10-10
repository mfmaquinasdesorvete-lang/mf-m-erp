import { Component, useEffect, useState, type ReactNode } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { ehErroDeVersao, haVersaoNova, MSG_VERSAO } from "@/lib/versao";

/** Uma tela que falhou não derruba o ERP inteiro: mostra o aviso e deixa o menu funcionando. */
export class ErroTela extends Component<{ children: ReactNode }, { erro: unknown }> {
  state = { erro: null as unknown };
  static getDerivedStateFromError(erro: unknown) { return { erro }; }
  componentDidCatch(erro: unknown) { if (ehErroDeVersao(erro)) window.dispatchEvent(new Event("erp-versao-nova")); }
  render() {
    if (!this.state.erro) return this.props.children;
    const versao = ehErroDeVersao(this.state.erro);
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-surface p-6 text-center shadow-card">
        <h2 className="text-lg font-bold text-fg">{versao ? "O ERP foi atualizado" : "Esta tela não abriu"}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {versao ? "Recarregue a página para usar a versão nova." : "Recarregue a página. Se continuar, avise com um print desta mensagem."}
        </p>
        {!versao && <p className="mt-2 break-words text-xs text-slate-400">{String((this.state.erro as Error)?.message ?? this.state.erro)}</p>}
        <button type="button" onClick={() => window.location.reload()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">
          <RefreshCw size={15} /> Recarregar
        </button>
      </div>
    );
  }
}

const DEZ_MIN = 10 * 60 * 1000;

/** Faixa "Nova versão do ERP": confere ao voltar para a aba e a cada 10 minutos. */
export function AvisoVersao() {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    let ultima = 0;
    const conferir = async () => {
      if (Date.now() - ultima < 60_000) return;
      ultima = Date.now();
      if (await haVersaoNova()) setNova(true);
    };
    const aoVoltar = () => { if (document.visibilityState === "visible") conferir(); };
    const marcar = () => setNova(true);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("erp-versao-nova", marcar);
    const t = setInterval(conferir, DEZ_MIN);
    return () => { document.removeEventListener("visibilitychange", aoVoltar); window.removeEventListener("erp-versao-nova", marcar); clearInterval(t); };
  }, []);
  if (!nova) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-3 bg-brand px-4 py-2 text-sm font-semibold text-brand-fg shadow-lg">
      <Sparkles size={16} className="shrink-0" />
      <span className="min-w-0">Nova versão do ERP. Salve o que estiver fazendo e atualize.</span>
      <button type="button" onClick={() => window.location.reload()}
        className="shrink-0 rounded-md bg-white/20 px-3 py-1 text-sm font-bold hover:bg-white/30">Atualizar</button>
    </div>
  );
}

export { MSG_VERSAO };
