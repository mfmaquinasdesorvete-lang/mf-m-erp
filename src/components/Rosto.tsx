// Login com o rosto (pedido #103): depois da senha, administrador e financeiro confirmam com o rosto ou a digital do
// celular ou do computador. PortaoRosto fica entre o login e o ERP; MeuRosto é a janela do menu (cadastrar outro
// aparelho, apagar um). Quem perder o celular pede ao outro administrador para apagar o rosto em Usuários.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ScanFace, Smartphone, Trash2 } from "lucide-react";
import { Button, Card, Modal } from "@/components/ui";
import { MOLDURA, Marca, Mensagens } from "@/pages/Login";
import { dataBR } from "@/lib/format";
import { sairDoErp } from "@/lib/sair";
import {
  apagarRosto, cadastrarRosto, confirmarRosto, erroRosto, nomeDoAparelho, rostoObrigatorio, situacaoRosto, usaRosto,
  type SituacaoRosto,
} from "@/lib/rosto";

const ADIADO = "erp-rosto-adiado";
const adiado = () => { try { return sessionStorage.getItem(ADIADO) === "1"; } catch { return false; } };
const adiar = () => { try { sessionStorage.setItem(ADIADO, "1"); } catch { /* sem armazenamento: só não lembra */ } };

/** Fica entre o login e o ERP: pede o rosto de quem já cadastrou e convida (ou obriga, depois da data) quem não. */
export function PortaoRosto({ papel, extras, children }: { papel: string; extras?: string[] | null; children: ReactNode }) {
  const precisa = usaRosto(papel, extras);
  const [s, setS] = useState<SituacaoRosto | null>(null);
  const [erroLeitura, setErroLeitura] = useState("");
  const [depois, setDepois] = useState(adiado);

  const ler = useCallback(() => {
    setErroLeitura("");
    situacaoRosto().then(setS, (e) => setErroLeitura(erroRosto(e)));
  }, []);
  useEffect(() => { if (precisa) ler(); }, [precisa, ler]);

  if (!precisa) return <>{children}</>;
  if (erroLeitura) return <TelaRosto titulo="Confirme a entrada" erroInicial={erroLeitura} onTentar={ler} />;
  if (!s) return null;
  if (s.confirmado || !s.exige) return <>{children}</>;
  if (s.fatores.length) return <TelaRosto titulo="Confirme com o seu rosto" fatores={s} onPronto={ler} />;
  // sem data marcada o convite não aparece: a dona cadastra primeiro pelo menu (Meu rosto) e depois a data é marcada
  if (rostoObrigatorio(s) || (s.obrigatorioEm && !depois)) {
    return <TelaRosto titulo="Cadastre o seu rosto" cadastro situacao={s} onPronto={ler}
      onDepois={rostoObrigatorio(s) ? undefined : () => { adiar(); setDepois(true); }} />;
  }
  return <>{children}</>;
}

function TelaRosto({ titulo, fatores, cadastro, situacao, erroInicial = "", onPronto, onDepois, onTentar }: {
  titulo: string; fatores?: SituacaoRosto; cadastro?: boolean; situacao?: SituacaoRosto; erroInicial?: string;
  onPronto?: () => void; onDepois?: () => void; onTentar?: () => void;
}) {
  const [erro, setErro] = useState(erroInicial);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function agir(acao: () => Promise<void>, pronto: string) {
    setErro(""); setAviso(""); setOcupado(true);
    try { await acao(); setAviso(pronto); setTimeout(() => onPronto?.(), 600); }
    catch (e) { setErro(erroRosto(e)); }
    finally { setOcupado(false); }
  }

  const prazo = situacao?.obrigatorioEm;
  return (
    <main className={MOLDURA}>
      <Card className="w-full max-w-sm p-6">
        <Marca sub={titulo} />
        {fatores && (
          <p className="mb-4 text-sm text-slate-600">
            Para proteger o administrador e o financeiro, a entrada é confirmada com o rosto ou a digital, como nos bancos.
            No computador, aponte o celular para o código que aparecer.
          </p>
        )}
        {cadastro && (
          <div className="mb-4 space-y-2 text-sm text-slate-600">
            <p>Como nos bancos: depois da senha, o ERP vai pedir o seu rosto (ou a digital). O rosto não sai do aparelho:
              ele só avisa ao ERP que é você.</p>
            <p>Faça pelo celular que você usa todo dia. Se depois quiser entrar pelo computador, ele mostra um código para o celular ler.</p>
            {prazo
              ? <p className="font-semibold text-fg">{rostoObrigatorio({ obrigatorioEm: prazo }) ? "Já é obrigatório para entrar." : `Obrigatório a partir de ${dataBR(prazo)}.`}</p>
              : null}
          </div>
        )}
        <div className="space-y-3">
          <Mensagens erro={erro} aviso={aviso} />
          {fatores && fatores.fatores.map((f) => (
            <Button key={f.id} className="w-full" disabled={ocupado} onClick={() => agir(() => confirmarRosto(f.id), "Confirmado. Entrando…")}>
              <ScanFace size={18} /> {ocupado ? "Esperando o aparelho…" : fatores.fatores.length > 1 ? `Confirmar (${f.nome})` : "Confirmar com o rosto"}
            </Button>
          ))}
          {cadastro && (
            <Button className="w-full" disabled={ocupado} onClick={() => agir(() => cadastrarRosto(nomeDoAparelho()), "Rosto cadastrado. Entrando…")}>
              <ScanFace size={18} /> {ocupado ? "Esperando o aparelho…" : "Cadastrar o rosto neste aparelho"}
            </Button>
          )}
          {onTentar && <Button className="w-full" variant="secondary" onClick={onTentar}>Tentar de novo</Button>}
          {onDepois && <Button className="w-full" variant="secondary" disabled={ocupado} onClick={onDepois}>Agora não</Button>}
        </div>
        {fatores && <p className="mt-4 text-xs text-slate-500">Perdeu ou trocou o celular? Peça ao outro administrador para apagar o seu rosto em Usuários; depois é só cadastrar de novo.</p>}
        <button type="button" onClick={() => { void sairDoErp(); }}
          className="mt-4 w-full rounded text-center text-sm text-slate-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          Sair
        </button>
      </Card>
    </main>
  );
}

/** Menu → Meu rosto: os aparelhos cadastrados, cadastrar outro e apagar um. */
export function MeuRosto({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<SituacaoRosto | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ler = useCallback(() => { situacaoRosto().then(setS, (e) => setErro(erroRosto(e))); }, []);
  useEffect(ler, [ler]);

  async function agir(acao: () => Promise<void>, pronto: string) {
    setErro(""); setAviso(""); setOcupado(true);
    try { await acao(); setAviso(pronto); ler(); }
    catch (e) { setErro(erroRosto(e)); }
    finally { setOcupado(false); }
  }

  return (
    <Modal open onClose={onClose} title="Meu rosto">
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          O rosto (ou a digital) confirma a sua entrada no ERP, como nos bancos. Cadastre o celular e, se quiser, também o
          computador que tem leitor de rosto ou de digital.
        </p>
        {s && !s.fatores.length && <p className="text-slate-500">Nenhum aparelho cadastrado ainda.</p>}
        {s && s.fatores.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {s.fatores.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <Smartphone size={18} className="shrink-0 text-slate-500" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-fg">{f.nome}</span>
                  <span className="block text-xs text-slate-500">cadastrado em {dataBR(f.criado)}</span>
                </span>
                <button type="button" disabled={ocupado} title="Apagar este aparelho" aria-label={`Apagar ${f.nome}`}
                  onClick={() => { if (window.confirm(`Apagar o rosto do aparelho "${f.nome}"?`)) void agir(() => apagarRosto(f.id), "Aparelho apagado."); }}
                  className="botao-icone-perigo h-9 w-9 disabled:opacity-50">
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Mensagens erro={erro} aviso={aviso} />
        <Button className="w-full" disabled={ocupado || !s} onClick={() => agir(() => cadastrarRosto(nomeDoAparelho()), "Aparelho cadastrado.")}>
          <ScanFace size={18} /> {ocupado ? "Esperando o aparelho…" : s?.fatores.length ? "Cadastrar outro aparelho" : "Cadastrar o rosto neste aparelho"}
        </Button>
      </div>
    </Modal>
  );
}
