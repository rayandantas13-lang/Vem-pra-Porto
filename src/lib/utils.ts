import type { Passeio, StatusVoucher, Voucher } from "@/types";

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

const pad = (n: number) => String(n).padStart(2, "0");

/** Date -> "yyyy-mm-dd" (local) */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const hoje = () => iso(new Date());

export const parseISO = (s: string) => {
  const [y, m, d] = (s || hoje()).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const startOfWeek = (d: Date) => addDays(d, -d.getDay());

export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const DIAS_LONGOS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "2026-07-29" -> "29/07" */
export const dataCurta = (s: string) => {
  const d = parseISO(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/** "2026-07-29" -> "29/07/2026" */
export const dataBR = (s: string) => {
  if (!s) return "";
  const d = parseISO(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

export const dataLonga = (s: string) => {
  const d = parseISO(s);
  return `${DIAS_CURTOS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
};

export const dataCompleta = (s: string) => {
  const d = parseISO(s);
  return `${DIAS_LONGOS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
};

export const diasEntre = (a: string, b: string) =>
  Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);

export const rotuloRelativo = (s: string) => {
  const diff = diasEntre(hoje(), s);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  if (diff > 1 && diff < 7) return `em ${diff} dias`;
  if (diff < -1 && diff > -7) return `há ${Math.abs(diff)} dias`;
  return dataCurta(s);
};

export const brl = (n: number) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const mascaraTelefone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const soDigitos = (v: string) => (v || "").replace(/\D/g, "");

export const iniciais = (nome: string) =>
  (nome || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

const CORES = [
  "from-indigo-500 to-violet-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-sky-500 to-blue-500",
  "from-fuchsia-500 to-purple-500",
];

export const corAvatar = (id: string) => {
  let h = 0;
  for (let i = 0; i < (id || "x").length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CORES[h % CORES.length];
};

/* ---------------- Voucher ---------------- */

export const STATUS_META: Record<
  StatusVoucher,
  { label: string; chip: string; dot: string }
> = {
  pendente: {
    label: "Pendente",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
  },
  confirmado: {
    label: "Confirmado",
    chip: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    dot: "bg-indigo-500",
  },
  concluido: {
    label: "Concluído",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500",
  },
  cancelado: {
    label: "Cancelado",
    chip: "bg-slate-100 text-slate-500 ring-slate-200",
    dot: "bg-slate-400",
  },
};

export const STATUS_LISTA: StatusVoucher[] = [
  "pendente",
  "confirmado",
  "concluido",
  "cancelado",
];

/** Nomes dos clientes formatados: "A, B e C" */
export const nomesClientes = (v: Voucher) => {
  const l = (v.clientes || []).map((n) => n.trim()).filter(Boolean);
  if (!l.length) return "";
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
};

/** Serviços contratados: "Praia do Espelho + Caraíva" */
export const nomesPasseios = (v: Voucher) =>
  (v.passeios || [])
    .map((p) => p.nome.trim())
    .filter(Boolean)
    .join(" + ");

/** Datas dos passeios: "29/07/2026 e 30/07/2026" */
export const datasPasseios = (v: Voucher) => {
  const l = [...new Set((v.passeios || []).map((p) => p.data).filter(Boolean))].sort();
  return l.map(dataBR).join(" e ");
};

/** Primeira data (usada para ordenação e agenda) */
export const primeiraData = (v: Voucher) => {
  const l = (v.passeios || []).map((p) => p.data).filter(Boolean).sort();
  return l[0] || "";
};

export const aReceber = (v: Voucher) =>
  Math.max(0, (Number(v.total) || 0) - (Number(v.entrada) || 0));

export const totalPessoas = (v: Voucher) =>
  Number(v.pessoas) || (v.clientes || []).filter((n) => n.trim()).length || 1;

export const gerarCodigo = (prefixo = "VP") => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefixo}-${s}`;
};

export const passeioVazio = (data = hoje()): Passeio => ({
  id: uid(),
  nome: "",
  data,
  hora: "",
  local: "",
});

export const normalizar = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const linkWhatsApp = (tel: string, msg = "") => {
  const d = soDigitos(tel);
  const numero = d ? (d.length > 11 ? d : `55${d}`) : "";
  return `https://wa.me/${numero}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
};

export const gerarHorarios = (inicio = "05:00", fim = "22:00") => {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const out: string[] = [];
  for (let t = toMin(inicio); t <= toMin(fim); t += 30)
    out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  return out;
};
