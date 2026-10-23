// Voz dos avisos: escolhe a voz mais natural em português do Brasil que o aparelho tiver (as "Natural/Online" do Edge,
// a do Google no Chrome, as aprimoradas do iPhone) e deixa a pessoa trocar e ouvir antes. A escolha fica no aparelho.

export type VozInfo = { name: string; lang: string; localService?: boolean };

export const CHAVE_NOME_VOZ = "erp.avisos.voz.nome";

/** Nota de cada voz: quanto maior, mais natural costuma soar. */
export function pontuarVoz(v: VozInfo) {
  const lang = (v.lang ?? "").toLowerCase().replace("_", "-");
  const nome = v.name.toLowerCase();
  if (!lang.startsWith("pt")) return -1;
  let n = lang === "pt-br" ? 50 : 10;
  if (/natural|neural|online/.test(nome)) n += 40;
  if (/google/.test(nome)) n += 30;
  if (/enhanced|premium|aprimorad|siri/.test(nome)) n += 20;
  if (/francisca|thalita|antonio|luciana|felipe|fernanda|camila|vitória|vitoria|ricardo/.test(nome)) n += 10;
  if (/espeak|compact/.test(nome)) n -= 40;
  return Math.max(0, n); // voz ruim ainda serve quando é a única em português
}

/** As vozes em português, da mais natural para a menos. */
export const vozesPortugues = <T extends VozInfo>(vozes: T[]) =>
  vozes.filter((v) => pontuarVoz(v) >= 0).sort((a, b) => pontuarVoz(b) - pontuarVoz(a) || a.name.localeCompare(b.name));

/** A voz escolhida pela pessoa (se ainda existir no aparelho) ou a mais natural. */
export function melhorVoz<T extends VozInfo>(vozes: T[], escolhida?: string | null): T | undefined {
  const lista = vozesPortugues(vozes);
  return (escolhida ? lista.find((v) => v.name === escolhida) : undefined) ?? lista[0];
}

export const nomeVozEscolhida = () => { try { return localStorage.getItem(CHAVE_NOME_VOZ); } catch { return null; } };
export const guardarVoz = (nome: string) => { try { localStorage.setItem(CHAVE_NOME_VOZ, nome); } catch { /* sem armazenamento */ } };
