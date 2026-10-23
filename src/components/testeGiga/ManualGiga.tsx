// Manual do equipamento de ensaio (aba do Teste do giga): a programação do HG371 passo a passo, os parâmetros que
// ele usa (continuidade do aterramento GB e tensão suportável HP) comparados com os limites cadastrados no ERP e as
// observações do procedimento. O texto vem do manual da fábrica (Rev. 01, 18/10/2026); os valores precisam ser
// validados pelo responsável técnico antes do uso (a portaria citada no texto-base foi revogada).
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Printer, Wand2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { fmtNum, parametrosDoModelo, type CampoParametro } from "@/lib/testeGiga";
import { CHAVES_GIGA, salvarParametrosGiga } from "@/lib/testeGigaDados";
import type { ContextoGiga } from "./tipos";

/** Os passos da programação, na ordem do manual (1–17 na coluna da esquerda, 18–29 na da direita). */
export const PASSOS_HG371: { texto: string; ajuste?: boolean }[] = [
  { texto: "Ligar o HG371." },
  { texto: "Pressionar o botão ENTER." },
  { texto: "Selecionar “Configura equip” e pressionar ENTER." },
  { texto: "Selecionar “Grava result” e configurar para “S” (SIM), pressionando ENTER." },
  { texto: "Selecionar “Envia result” e configurar para “N” (NÃO), pressionando ENTER." },
  { texto: "Selecionar “Medida result” e configurar para “N” (NÃO), pressionando ENTER." },
  { texto: "Selecionar “Buzzer” e configurar para “Contínuo”, pressionando ENTER." },
  { texto: "Selecionar “ID Ensaio” e configurar para “Números”, pressionando ENTER." },
  { texto: "Pressionar BACK." },
  { texto: "Selecionar “Edita ensaio” e pressionar ENTER." },
  { texto: "Selecionar “Ordem” e configurar para “GB->HP”, pressionando ENTER." },
  { texto: "Selecionar “Editar GB” e pressionar ENTER." },
  { texto: "Ajustar “Corrente” para 11,0 A.", ajuste: true },
  { texto: "Ajustar “Rmax” para 200 mΩ.", ajuste: true },
  { texto: "Ajustar “Tempo” para 2 s.", ajuste: true },
  { texto: "Ajustar “Medidas” para 1.", ajuste: true },
  { texto: "Pressionar BACK." },
  { texto: "Selecionar “Editar HP” e pressionar ENTER." },
  { texto: "Ajustar “Tempo” para 1 s.", ajuste: true },
  { texto: "Ajustar “Medidas” para 1.", ajuste: true },
  { texto: "Selecionar “Editar medidas” e pressionar ENTER." },
  { texto: "Ajustar “Vmin” para 1000 V.", ajuste: true },
  { texto: "Ajustar “Vmax” para 1500 V.", ajuste: true },
  { texto: "Ajustar “Imax” para 5,0 mA.", ajuste: true },
  { texto: "Pressionar BACK." },
  { texto: "Pressionar BACK." },
  { texto: "Ao ser questionado para salvar as alterações, selecionar “SIM” e pressionar ENTER." },
  { texto: "Pressionar BACK." },
  { texto: "O HG371 está configurado e pronto para ser operado, conforme este procedimento." },
];

/** O que o HG371 fica programado para medir, no mesmo formato dos limites do ERP. */
export const PARAMETROS_HG371: Record<CampoParametro, number> = {
  aterramento_corrente_a: 11, aterramento_resistencia_max_ohm: 0.2, tensao_v: 1000, tensao_tempo_s: 1, tensao_fuga_max_ma: 5,
};
const CONFERENCIA: { campo: CampoParametro; rotulo: string; unidade: string; manual: string }[] = [
  { campo: "aterramento_corrente_a", rotulo: "GB · corrente de teste", unidade: "A", manual: "11,0 A" },
  { campo: "aterramento_resistencia_max_ohm", rotulo: "GB · resistência máxima", unidade: "Ω", manual: "0,2 Ω (200 mΩ)" },
  { campo: "tensao_v", rotulo: "HP · tensão de ensaio", unidade: "V", manual: "1.000 V (até 1.500 V)" },
  { campo: "tensao_tempo_s", rotulo: "HP · tempo", unidade: "s", manual: "1 s" },
  { campo: "tensao_fuga_max_ma", rotulo: "HP · corrente de fuga máxima", unidade: "mA", manual: "5,0 mA" },
];

export function ManualGiga({ ctx, admin }: { ctx: ContextoGiga; admin: boolean }) {
  const invalidar = useInvalidate();
  const [gravando, setGravando] = useState(false);
  const { valores } = parametrosDoModelo(ctx.parametros, null);
  const diferentes = CONFERENCIA.filter((c) => valores[c.campo] == null || Number(valores[c.campo]) !== PARAMETROS_HG371[c.campo]);

  async function usarNoErp() {
    if (!(await confirmar("Gravar os valores do manual do HG371 como limites gerais do Teste do giga? Confirme antes com o responsável técnico: a portaria citada no manual foi revogada.", { ok: "Gravar os limites" }))) return;
    setGravando(true);
    try {
      const geral = ctx.parametros.find((p) => !p.produto_id && p.ativo !== false);
      await salvarParametrosGiga(null, { ...PARAMETROS_HG371, observacao: geral?.observacao || "Valores do Manual do Gigateste HG371 (Rev. 01). Validar com o responsável técnico." });
      notify("Limites gerais gravados com os valores do manual");
      invalidar(...CHAVES_GIGA);
    } catch (e) { notifyError(e); } finally { setGravando(false); }
  }

  const coluna = (de: number, ate: number) => (
    <ol className="space-y-1.5">
      {PASSOS_HG371.slice(de, ate).map((p, i) => (
        <li key={de + i} className={`flex items-start gap-2.5 rounded-lg px-2 py-1 text-sm ${p.ajuste ? "bg-emerald-50 text-emerald-900" : "text-fg"}`}>
          <span className={`mt-0.5 grid h-6 w-7 shrink-0 place-items-center rounded-md text-xs font-bold text-white ${p.ajuste ? "bg-fixo-teal-700" : "bg-fixo-slate-600"}`}>{String(de + i + 1).padStart(2, "0")}</span>
          <span className="min-w-0">{p.texto}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-3 border-l-4 border-fixo-teal-600 bg-[#132238] p-4 text-white sm:p-5">
          <div className="min-w-0 flex-1 basis-64">
            <div className="text-xs font-bold uppercase tracking-widest text-fixo-teal-200">Manual do Gigateste</div>
            <h2 className="text-xl font-bold leading-tight">Programação do equipamento HG371</h2>
            <p className="mt-1 text-sm text-white/80">Procedimento de programação · equipamento sob ensaio: máquina de sorvete · Rev. 01 (18/10/2026)</p>
          </div>
          <span className="rounded-lg bg-white/10 px-3 py-1.5 text-lg font-bold tracking-wide">HG371</span>
          <Button variant="secondary" onClick={() => window.print()} className="print:hidden"><Printer size={15} /> Imprimir</Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="mb-1 font-bold text-fg"><span className="mr-2 text-emerald-700">01</span>Programação do equipamento</h3>
        <p className="mb-3 text-xs text-slate-500">Siga a numeração: coluna esquerda (1–17) e depois coluna direita (18–29). Em verde, os valores que se ajustam.</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {coluna(0, 17)}
          <div className="space-y-4">
            {coluna(17, 29)}
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide">Conferência dos parâmetros</div>
              <div><b className="text-emerald-800">GB</b> 11,0 A · 200 mΩ · 2 s · 1 medida</div>
              <div><b className="text-emerald-800">HP</b> 1000–1500 V · 5,0 mA · 1 s · 1 medida</div>
              <div className="text-xs text-sky-800">Ordem: GB → HP</div>
            </div>
          </div>
        </div>
      </Card>

      {/* o que o equipamento mede x o que o ERP usa para sugerir aprovado/reprovado */}
      <Card className="p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-bold text-fg"><ClipboardCheck size={17} className="mr-1.5 inline text-emerald-700" aria-hidden />Manual x limites do ERP (padrão geral)</h3>
          {admin && diferentes.length > 0 && <Button onClick={usarNoErp} disabled={gravando}><Wand2 size={15} /> Usar os valores do manual</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 font-semibold">Parâmetro</th><th className="py-1 font-semibold">Manual do HG371</th><th className="py-1 font-semibold">ERP hoje</th><th className="py-1" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {CONFERENCIA.map((c) => {
                const erp = valores[c.campo];
                const igual = erp != null && Number(erp) === PARAMETROS_HG371[c.campo];
                return (
                  <tr key={c.campo}>
                    <td className="py-1.5 font-semibold text-fg">{c.rotulo}</td>
                    <td className="py-1.5">{c.manual}</td>
                    <td className="py-1.5">{erp != null ? `${fmtNum(erp)} ${c.unidade}` : <span className="text-slate-400">não cadastrado</span>}</td>
                    <td className="py-1.5">{igual ? <CheckCircle2 size={16} className="text-emerald-600" aria-label="igual" /> : <AlertTriangle size={16} className="text-amber-600" aria-label="diferente" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {diferentes.length ? `${diferentes.length} ${diferentes.length === 1 ? "valor está diferente ou falta" : "valores estão diferentes ou faltam"} no ERP. ` : "O ERP usa os mesmos valores do manual. "}
          Os limites de cada modelo ficam na aba Parâmetros.{!admin && diferentes.length > 0 && " Só o administrador grava os limites."}
        </p>
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 font-bold text-fg"><span className="mr-2 text-emerald-700">02</span>Observações quanto à programação</h3>
        <div className="grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-fg">Aplicação considerada no procedimento</h4>
              <p>A configuração considera que o produto testado tem:</p>
              <ul className="ml-5 list-disc">
                <li>Alimentação em 220 V.</li>
                <li>Carcaça exterior metálica aterrada (isolação básica).</li>
                <li>Cabo de força com três pinos, não destacável do produto.</li>
              </ul>
              <p className="mt-1">Por isso são duas medidas: continuidade de aterramento (GB) e tensão suportável (HP).</p>
            </div>
            <div>
              <h4 className="font-bold text-fg">GB — Continuidade de aterramento</h4>
              <p>O texto-base, com referência ao anexo B da Portaria Inmetro 371/2009, informa corrente mínima de 10 A e resistência máxima de 0,2 Ω para equipamentos com cordão de alimentação. O tempo não é especificado nessa referência.</p>
              <p className="mt-1 font-semibold text-emerald-800">Configuração adotada: 11,0 A, resistência máxima de 0,2 Ω (200 mΩ) e tempo de 2 s.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-fg">HP — Tensão suportável</h4>
              <p>O texto-base, com a mesma referência, informa 800 V para produtos alimentados em 127 V e 1000 V para produtos em 220 V, com corrente máxima de 5 mA e tempo de 1 s.</p>
              <p className="mt-1 font-semibold text-emerald-800">Configuração adotada: tensão entre 1000 V e 1500 V, corrente máxima de 5 mA e tempo de 1 s.</p>
              <p className="mt-1">A saída mínima de 1000 V atende ao mínimo citado para 220 V e fica acima do mínimo para 127 V.</p>
            </div>
            <div>
              <h4 className="font-bold text-fg">Execução e armazenamento dos resultados</h4>
              <p>Os ensaios são feitos no próprio HG371, sem computador durante o teste. Os resultados ficam na memória do equipamento e, de tempos em tempos, vão para um computador. No ERP, cada máquina testada é lançada na aba Lançar teste (REG-006).</p>
            </div>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span><b>Nota sobre a referência normativa:</b> a Portaria Inmetro 371/2009 citada no texto-base foi revogada. Validar o enquadramento e os parâmetros com o responsável técnico antes do uso operacional (os ensaios de segurança elétrica de aparelhos seguem a família IEC/NBR 60335). Valores do manual preservados aqui.</span>
        </p>
      </Card>
    </div>
  );
}
