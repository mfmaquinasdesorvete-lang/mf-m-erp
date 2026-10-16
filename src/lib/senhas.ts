// Senha provisória fácil de ditar: 3 blocos sem letras parecidas (ex.: kfrm-4827-tpzw). A pessoa troca no primeiro acesso.
export function gerarSenha() {
  const letras = "abcdefghjkmnpqrstuvwxyz", nums = "23456789";
  const r = new Uint32Array(12); crypto.getRandomValues(r);
  const pega = (s: string, i: number) => s[r[i] % s.length];
  return [0, 1, 2, 3].map((i) => pega(letras, i)).join("") + "-" + [4, 5, 6, 7].map((i) => pega(nums, i)).join("") + "-" + [8, 9, 10, 11].map((i) => pega(letras, i)).join("");
}
