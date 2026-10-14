// Confirmações e perguntas do ERP numa janela própria (no lugar do confirm/prompt do navegador): mesmo visual em todo
// lugar, botão vermelho quando a ação não tem volta, funciona no celular e na prévia (o navegador bloqueia as caixas dele
// dentro de outra página) e mostra o mínimo de caracteres de uma justificativa antes de enviar.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Modal } from "./ui";

type Pedido =
  | { tipo: "confirmar"; texto: string; titulo: string; ok: string; perigo: boolean; responder: (v: boolean) => void }
  | { tipo: "texto"; texto: string; titulo: string; ok: string; inicial: string; minimo: number; responder: (v: string | null) => void };

let mostrar: ((p: Pedido) => void) | null = null;
const fila: Pedido[] = [];

// Verbos que viram o nome do botão ("Apagar", "Cancelar"…) e os que pedem o botão vermelho
const VERBOS = ["Apagar", "Excluir", "Cancelar", "Inutilizar", "Concluir", "Unificar", "Gerar", "Completar", "Desligar", "Parar", "Reabrir",
  "Tirar", "Devolver", "Começar", "Emitir", "Enviar", "Sair", "Mover", "Desfazer"];
const RISCO = /^(Apagar|Excluir|Cancelar|Inutilizar|Desligar|Tirar)\b|definitiv|não dá para desfazer|não pode ser desfeito|TESTE/i;

function abrir(p: Pedido) {
  if (mostrar) mostrar(p);
  else fila.push(p);
}

/** Pergunta sim/não. Ex.: if (!(await confirmar("Apagar esta regra?"))) return; */
export function confirmar(texto: string, opcoes: { titulo?: string; ok?: string; perigo?: boolean } = {}): Promise<boolean> {
  const verbo = VERBOS.find((v) => texto.startsWith(v + " ") || texto.startsWith(v + "?"));
  return new Promise((responder) => abrir({
    tipo: "confirmar", texto, responder,
    titulo: opcoes.titulo ?? "Confirmar",
    ok: opcoes.ok ?? (verbo === "Sair" ? "Sair sem salvar" : verbo ?? "Confirmar"),
    perigo: opcoes.perigo ?? RISCO.test(texto),
  }));
}

/** Pede um texto (motivo, observação…). null = a pessoa desistiu. "minimo" trava o botão até ter os caracteres. */
export function pedirTexto(texto: string, inicial = "", opcoes: { titulo?: string; ok?: string; minimo?: number } = {}): Promise<string | null> {
  const minimo = opcoes.minimo ?? Number(texto.match(/mínimo (\d+) caracteres/)?.[1] ?? 0);
  return new Promise((responder) => abrir({ tipo: "texto", texto, inicial, minimo, responder, titulo: opcoes.titulo ?? "Informe", ok: opcoes.ok ?? "OK" }));
}

/** Montado uma vez (main.tsx): mostra um pedido de cada vez. */
export function Dialogos() {
  const [atual, setAtual] = useState<Pedido | null>(null);
  const [valor, setValor] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);
  const atualRef = useRef<Pedido | null>(null);
  useEffect(() => {
    mostrar = (p) => { if (atualRef.current) fila.push(p); else { atualRef.current = p; setValor(p.tipo === "texto" ? p.inicial : ""); setAtual(p); } };
    const proximo = fila.shift();
    if (proximo) mostrar(proximo);
    return () => { mostrar = null; };
  }, []);
  useEffect(() => { if (atual?.tipo === "texto") setTimeout(() => campo.current?.select(), 30); }, [atual]);

  function fechar(resposta: boolean) {
    const p = atualRef.current;
    if (!p) return;
    if (p.tipo === "confirmar") p.responder(resposta);
    else p.responder(resposta ? valor : null);
    atualRef.current = null;
    setAtual(null);
    const proximo = fila.shift();
    if (proximo) setTimeout(() => mostrar?.(proximo), 0);
  }
  if (!atual) return null;
  const curto = atual.tipo === "texto" && valor.trim().length < atual.minimo;
  const enviar = (e: FormEvent) => { e.preventDefault(); if (!curto) fechar(true); };

  return (
    <Modal open onClose={() => fechar(false)} title={atual.titulo}>
      <form onSubmit={enviar} className="space-y-4">
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-fg">{atual.texto}</p>
        {atual.tipo === "texto" && (
          <div>
            <textarea ref={campo} className="input" rows={3} value={valor} onChange={(e) => setValor(e.target.value)} aria-label={atual.texto}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!curto) fechar(true); } }} />
            {atual.minimo > 0 && (
              <p className={`mt-1 text-xs ${curto ? "text-amber-700" : "text-emerald-700"}`}>{valor.trim().length} de no mínimo {atual.minimo} caracteres</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => fechar(false)}>Voltar</Button>
          <Button type="submit" autoFocus={atual.tipo === "confirmar"} disabled={curto}
            variant={atual.tipo === "confirmar" && atual.perigo ? "danger" : "primary"}>{atual.ok}</Button>
        </div>
      </form>
    </Modal>
  );
}
