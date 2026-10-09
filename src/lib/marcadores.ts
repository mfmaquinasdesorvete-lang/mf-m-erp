// Marcadores coloridos das notas (como no Tiny): cor e ícone escolhidos na tela, guardados por nome.
// Só cores que acompanham o tema claro/escuro (tailwind.config.js).
import {
  Ban, Banknote, Bookmark, CircleAlert, CircleCheck, Clock, CreditCard, DollarSign, FilePen, Flag, Gift, Heart, Mail, Package, Phone,
  Send, Shield, Sparkles, Star, Tag, TriangleAlert, Truck, Undo2, Wrench, Zap, type LucideIcon,
} from "lucide-react";

export type Marcador = { id: string; nome: string; cor: string; icone: string; ativo: boolean; ordem: number };

export const CORES: { valor: string; rotulo: string; chip: string; ponto: string }[] = [
  { valor: "slate", rotulo: "Cinza", chip: "bg-slate-100 text-slate-700 ring-slate-300", ponto: "bg-slate-500" },
  { valor: "emerald", rotulo: "Verde", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", ponto: "bg-emerald-500" },
  { valor: "sky", rotulo: "Azul", chip: "bg-sky-50 text-sky-700 ring-sky-200", ponto: "bg-sky-500" },
  { valor: "indigo", rotulo: "Anil", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", ponto: "bg-indigo-500" },
  { valor: "purple", rotulo: "Roxo", chip: "bg-purple-50 text-purple-700 ring-purple-200", ponto: "bg-purple-500" },
  { valor: "amber", rotulo: "Amarelo", chip: "bg-amber-50 text-amber-700 ring-amber-200", ponto: "bg-amber-500" },
  { valor: "orange", rotulo: "Laranja", chip: "bg-orange-50 text-orange-700 ring-orange-200", ponto: "bg-orange-500" },
  { valor: "red", rotulo: "Vermelho", chip: "bg-red-50 text-red-700 ring-red-200", ponto: "bg-red-500" },
];
export const corDe = (cor: string) => CORES.find((c) => c.valor === cor) ?? CORES[0];

export const ICONES: Record<string, LucideIcon> = {
  tag: Tag, star: Star, "circle-check": CircleCheck, clock: Clock, "file-pen": FilePen, send: Send, shield: Shield, "undo-2": Undo2,
  "triangle-alert": TriangleAlert, "credit-card": CreditCard, banknote: Banknote, "dollar-sign": DollarSign, truck: Truck, package: Package,
  flag: Flag, bookmark: Bookmark, heart: Heart, gift: Gift, wrench: Wrench, phone: Phone, mail: Mail, ban: Ban, "circle-alert": CircleAlert,
  sparkles: Sparkles, zap: Zap,
};
export const iconeDe = (nome: string) => ICONES[nome] ?? Tag;
