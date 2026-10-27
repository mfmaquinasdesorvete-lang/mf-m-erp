/** O texto da busca do menu parece uma pergunta para a IA (termina em "?" ou tem 3 palavras ou mais). */
export const parecePergunta = (t: string) => t.trim().endsWith("?") || t.trim().split(/\s+/).filter((p) => p.length > 1).length >= 3;
