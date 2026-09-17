import type { Config, Passeio, Servico, StatusVoucher, Voucher } from "@/types";

export const uid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

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

export const brl = (n: unknown) =>
  parseNumero(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const mascaraTelefone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Máscara de CNPJ: 00.000.000/0001-00 */
export const mascaraCnpj = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

/* ---------------- WhatsApp ---------------- */

/** Saudação conforme o horário do dia: 5h–11h "Bom dia", 12h–17h "Boa tarde", senão "Boa noite". */
export const saudacaoDoDia = (agora = new Date()) => {
  const h = agora.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
};

/** Modelo padrão da mensagem que acompanha o PDF do voucher no WhatsApp. */
export const MENSAGEM_VOUCHER_PADRAO =
  "{saudacao}! 🌴 Segue o seu voucher com todos os detalhes do passeio. Qualquer dúvida estamos à disposição. 😊";

/**
 * Monta a mensagem curta que vai junto com o PDF no WhatsApp.
 * Atalhos aceitos no modelo: {saudacao}, {cliente}, {codigo} e {empresa}.
 */
export function mensagemVoucher(v: Voucher, config: Config) {
  const modelo = (config.mensagemVoucher || "").trim() || MENSAGEM_VOUCHER_PADRAO;
  const primeiro = (v.clientes || []).map((n) => n.trim()).filter(Boolean)[0] || "";
  return modelo
    .replace(/\{saudacao\}/g, saudacaoDoDia())
    .replace(/\{cliente\}/g, primeiro)
    .replace(/\{codigo\}/g, v.codigo || "")
    .replace(/\{empresa\}/g, config.empresa || "")
    .trim();
}

/**
 * Link oficial do WhatsApp SEM número: abre o app/web já com o texto,
 * para a pessoa escolher para qual contato enviar.
 */
export const linkAbrirWhatsApp = (texto = "") =>
  `https://wa.me/${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;

/**
 * Monta o link direto para o WhatsApp de um cliente.
 * Os telefones cadastrados no app são brasileiros e normalmente não incluem
 * o código do país, então acrescentamos o 55 quando recebemos DDD + número.
 * Mantém números que já vierem com código do país e não cria links para
 * cadastros incompletos.
 */
export const linkWhatsAppTelefone = (telefone: string, texto = "") => {
  const digitos = (telefone || "").replace(/\D/g, "");
  if (digitos.length < 10) return "";
  const numero = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
};

/**
 * Abre um link do WhatsApp da forma mais confiável em cada dispositivo.
 * No celular navega na própria aba: links com target="_blank" são bloqueados
 * em navegadores embutidos (WebView) e aí o toque "não faz nada". No
 * computador mantém a abertura em nova aba para não tirar o usuário do app.
 */
export const abrirLinkWhatsApp = (url: string) => {
  if (!url) return;
  const dispositivoToque =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(hover: none)").matches;
  if (dispositivoToque) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

export const iniciais = (nome: string) =>
  (nome || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

const CORES = [
  "from-sky-500 to-amber-500",
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
  "concluido",
  "cancelado",
];

/** Status aceitos atualmente (o "confirmado" de versões antigas foi removido). */
const STATUS_VALIDOS = new Set<string>(STATUS_LISTA);

/**
 * Metadados visuais de um status SEM nunca derrubar a tela: se o valor vier
 * desconhecido (ex.: "confirmado" gravado na planilha por versões antigas),
 * mostra um selo neutro com o texto original em vez de lançar erro.
 */
export const statusMeta = (status: string) =>
  STATUS_META[status as StatusVoucher] ?? {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pendente",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
    dot: "bg-slate-400",
  };

/**
 * Normaliza o status vindo do banco: valores que não existem mais
 * (ex.: "confirmado") viram "pendente" para o app funcionar normalmente.
 */
export const normalizarStatus = (status: string): StatusVoucher =>
  STATUS_VALIDOS.has(status) ? (status as StatusVoucher) : "pendente";

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

/** Todas as datas do voucher (ida e volta), sem repetição e em ordem crescente. */
export const todasDatas = (v: Voucher) =>
  [
    ...new Set(
      (v.passeios || []).flatMap((p) => [p.data, p.dataVolta].filter((d): d is string => !!d)),
    ),
  ].sort();

/** Datas dos passeios: "29/07/2026 e 30/07/2026" (considera ida + volta) */
export const datasPasseios = (v: Voucher) => todasDatas(v).map(dataBR).join(" e ");

/** Primeira data (usada para ordenação e agenda) – prioriza ida */
export const primeiraData = (v: Voucher) => todasDatas(v)[0] || "";

/** Última data (ida ou volta): o dia em que o voucher "termina". */
export const ultimaData = (v: Voucher) => {
  const l = todasDatas(v);
  return l[l.length - 1] || "";
};

/** Próxima data do voucher a partir de `h` (inclusive); "" quando todas já passaram. */
export const proximaData = (v: Voucher, h = hoje()) => todasDatas(v).find((d) => d >= h) || "";

/** Menor horário do voucher em um dia específico (ida ou volta); "" se não houver. */
const horaNaData = (v: Voucher, data: string) =>
  (v.passeios || [])
    .flatMap((p) => [
      p.data === data ? p.hora || "" : "",
      p.dataVolta === data ? p.horaVolta || "" : "",
    ])
    .filter(Boolean)
    .sort()[0] || "";

/* ---------------- Abas por período ---------------- */

/** Até quantos dias à frente um passeio ainda conta como "próximo" (hoje + 7). */
export const DIAS_PROXIMOS = 7;

export type PeriodoVoucher = "passados" | "proximos" | "futuros";

export const PERIODOS_VOUCHER: PeriodoVoucher[] = ["passados", "proximos", "futuros"];

/**
 * Em qual aba o voucher aparece, comparando as datas dos passeios (ida e
 * volta) com o dia de hoje:
 * - "passados": todas as datas já passaram;
 * - "proximos": tem passeio hoje ou nos próximos 7 dias;
 * - "futuros": o próximo passeio está a mais de 7 dias.
 * Um voucher com passeio ontem e outro amanhã ainda é "próximo" — só vira
 * "passado" quando o último dia dele já ficou para trás. Voucher sem nenhuma
 * data fica em "proximos" para não passar despercebido.
 */
export const periodoVoucher = (v: Voucher, h = hoje()): PeriodoVoucher => {
  const datas = todasDatas(v);
  if (!datas.length) return "proximos";
  const proxima = datas.find((d) => d >= h);
  if (!proxima) return "passados";
  return diasEntre(h, proxima) <= DIAS_PROXIMOS ? "proximos" : "futuros";
};

/**
 * Ordena a lista de uma aba do jeito mais útil para o dia a dia:
 * - passados: do mais recente para o mais antigo;
 * - próximos e futuros: do mais perto para o mais longe (empate: hora do
 *   passeio naquele dia e depois ordem de criação).
 */
export const ordenarPorPeriodo = (lista: Voucher[], periodo: PeriodoVoucher, h = hoje()) => {
  if (periodo === "passados")
    return [...lista].sort((a, b) =>
      `${ultimaData(b)} ${b.criadoEm}`.localeCompare(`${ultimaData(a)} ${a.criadoEm}`),
    );
  const chave = (v: Voucher) => {
    const d = proximaData(v, h);
    return `${d} ${horaNaData(v, d)} ${v.criadoEm}`;
  };
  return [...lista].sort((a, b) => chave(a).localeCompare(chave(b)));
};

/**
 * Converte um valor vindo do banco/planilha/campo em número de forma defensiva:
 * - aceita número direto ("300", "600.5") — tentado ANTES do tratamento BR,
 *   senão "600.5" (ponto decimal) seria lido como "6005";
 * - aceita formato brasileiro ("1.234,56" → 1234.56, "600,50" → 600.5),
 *   com ponto de milhar e vírgula decimal;
 * - ignora prefixos como "R$ ";
 * - se ainda não der número, devolve 0 em vez de NaN.
 * Antes o `Number(v.total) || 0` transformava "R$ 300,00" (digitado direto na
 * planilha) em NaN → 0, e o PDF saía com total e a receber "zerados" enquanto
 * a entrada continuava certa (pois entrada não teve formatação manual).
 */
export function parseNumero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  const str = String(v).trim();
  if (!str) return 0;
  const semMoeda = str.replace(/^R\$\s?/i, "").trim();
  if (!semMoeda) return 0;
  // Sem vírgula e com pontos separando grupos de 3 dígitos ("1.200",
  // "12.345.678"): em dinheiro no padrão BR isso é milhar, não decimal —
  // Number("1.200") devolveria 1.2 e o valor digitado viraria R$ 1,20.
  if (/^\d{1,3}(\.\d{3})+$/.test(semMoeda)) {
    const milhar = Number(semMoeda.replace(/\./g, ""));
    return Number.isFinite(milhar) ? milhar : 0;
  }
  // Formato direto ("300", "600.5"): se já for número válido, não mexe mais.
  const direto = Number(semMoeda);
  if (Number.isFinite(direto)) return direto;
  // Formato BR: tira ponto de milhar e troca vírgula decimal por ponto.
  const limpo = semMoeda.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** Valor do desconto em reais sobre o total. Aceita desconto em % ou valor fixo (R$). */
export const valorDesconto = (v: Voucher) => {
  const total = parseNumero(v.total);
  const valor = parseNumero(v.desconto);
  if (valor <= 0) return 0;
  if (v.tipoDesconto === "fixo") return Math.min(valor, total);
  // percentual
  return total * (valor / 100);
};

/** Total já com o desconto aplicado (nunca negativo). */
export const totalComDesconto = (v: Voucher) =>
  Math.max(0, parseNumero(v.total) - valorDesconto(v));

/**
 * Valor a receber do voucher.
 * Se existir um valor MANUAL (digitado no formulário ou na coluna "aReceber"
 * da planilha — inclusive 0), ele vale mais que o cálculo automático: é o
 * caso de valores negociados que não fecham em "total − desconto − entrada".
 * Sem valor manual, calcula: total com desconto − entrada (nunca negativo).
 */
export const aReceber = (v: Voucher) => {
  if (typeof v.aReceber === "number" && Number.isFinite(v.aReceber))
    return Math.max(0, v.aReceber);
  return Math.max(0, totalComDesconto(v) - parseNumero(v.entrada));
};

export const totalPessoas = (v: Voucher) =>
  Math.max(1, Math.round(parseNumero(v.pessoas))) ||
  (v.clientes || []).filter((n) => n.trim()).length ||
  1;

/**
 * Normaliza um voucher na leitura (banco local ou Google Sheets), garantindo
 * que os campos numéricos são números válidos e consistentes.
 * - Campos de dinheiro viram número mesmo se vieram como "R$ 1.234,56" da planilha.
 * - Se a entrada for maior que o total (voucher antigo antes da validação),
 *   o total é ajustado para não ficar menor que a entrada — evita PDF com
 *   "R$ 0,00" no total/a receber só a entrada aparecendo.
 * - Garante `pessoas ≥ 1`, arrays de clientes/passeios existem e status válido.
 */
export function normalizarVoucher(v: Voucher): Voucher {
  if (!v) return v;
  const clientes = Array.isArray(v.clientes) ? v.clientes : v.clientes ? [v.clientes] : [];
  const passeios = Array.isArray(v.passeios) ? v.passeios : [];
  const pessoas = Math.max(
    1,
    Math.round(parseNumero(v.pessoas)) || clientes.filter((n) => n?.trim()).length || 1,
  );

  let total = Math.max(0, parseNumero(v.total));
  const entrada = Math.max(0, parseNumero(v.entrada));
  const desconto = Math.max(0, parseNumero(v.desconto));
  // "A receber" manual (digitado na planilha ou no formulário) é preservado;
  // se vier como texto ("200", "R$ 200,00") é convertido para número.
  // Ausente/null = automático (o cálculo acontece na função aReceber).
  const aReceberManual =
    v.aReceber === undefined || v.aReceber === null
      ? undefined
      : Math.max(0, parseNumero(v.aReceber));

  // Calcula o total com desconto e garante que ele não fique abaixo da entrada.
  // Vouchers antigos/planilha poderiam ter entrada > total (ex.: total=0 por dado
  // corrompido e entrada=300); se isso acontece o PDF mostrava R$ 0,00 no total
  // e no "a receber", dando a impressão que os valores "sumiram". Ajustamos o
  // total para, no mínimo, o valor de entrada já pago, garantindo que o PDF
  // sempre mostre números coerentes.
  if (total < entrada) total = entrada;

  return {
    ...v,
    clientes,
    passeios,
    pessoas,
    total,
    entrada,
    desconto,
    aReceber: aReceberManual,
    tipoDesconto: v.tipoDesconto === "fixo" ? "fixo" : "percentual",
    status: normalizarStatus(v.status),
  };
}

/**
 * Mantém apenas a ocorrência MAIS RECENTE de cada id, preservando a ordem.
 * A planilha pode conter linhas duplicadas com o mesmo id (gravadas por
 * versões antigas do código ou edições manuais); sem isso o painel mostra a
 * linha velha — com valores zerados/trocados — no lugar da corrigida.
 * Mesma regra do backend: a última linha vence.
 */
export function deduplicarPorId<T extends { id: string }>(lista: T[]): T[] {
  const pos = new Map<string, number>();
  const saida: T[] = [];
  lista.forEach((item) => {
    const i = pos.get(item.id);
    if (i === undefined) {
      pos.set(item.id, saida.length);
      saida.push(item);
    } else {
      saida[i] = item;
    }
  });
  return saida;
}

/** Serviço cadastrado com esse nome (ignora maiúsculas/acentos/espaços nas pontas). */
export const servicoPorNome = (servicos: Servico[], nome: string) => {
  const alvo = normalizar((nome || "").trim());
  if (!alvo) return undefined;
  return servicos.find((s) => normalizar(s.nome.trim()) === alvo);
};

/**
 * Soma dos preços de TODOS os passeios do voucher que batem com um serviço
 * cadastrado, multiplicada pelo nº de pessoas. Passeio digitado à mão (sem
 * serviço correspondente) não entra na conta.
 * Usado para preencher o "Valor total" automaticamente no formulário.
 */
export const totalSugerido = (v: Voucher, servicos: Servico[]) => {
  const pessoas = totalPessoas(v);
  const soma = (v.passeios || []).reduce(
    (s, p) => s + (servicoPorNome(servicos, p.nome)?.preco || 0),
    0,
  );
  return Math.round(soma * pessoas * 100) / 100;
};

export const gerarCodigo = (prefixo = "VP") => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const numeros = new Uint32Array(5);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function")
    crypto.getRandomValues(numeros);
  else for (let i = 0; i < numeros.length; i++) numeros[i] = Math.floor(Math.random() * 2 ** 32);
  const codigo = [...numeros].map((n) => chars[n % chars.length]).join("");
  return `${prefixo}-${codigo}`;
};

export const passeioVazio = (data = hoje()): Passeio => ({
  id: uid(),
  nome: "",
  data,
  hora: "",
  dataVolta: "",
  horaVolta: "",
  local: "",
});

export const normalizar = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");



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
