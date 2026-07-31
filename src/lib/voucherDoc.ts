import { jsPDF } from "jspdf";
import type { Config, Voucher } from "@/types";
import {
  aReceber,
  brl,
  dataBR,
  datasPasseios,
  linkWhatsApp,
  nomesClientes,
  nomesPasseios,
  soDigitos,
  totalPessoas,
} from "@/lib/utils";

/* ============================================================
   Link do Google Agenda
   ============================================================ */

const zzz = (n: number) => String(n).padStart(2, "0");

/** "2026-07-29" + "08:00" -> "20260729T080000" */
function carimbo(data: string, hora: string) {
  const [y, m, d] = data.split("-").map(Number);
  const [h, mi] = (hora || "08:00").split(":").map(Number);
  return `${y}${zzz(m)}${zzz(d)}T${zzz(h)}${zzz(mi)}00`;
}

function somarHoras(data: string, hora: string, horas: number) {
  const [y, m, d] = data.split("-").map(Number);
  const [h, mi] = (hora || "08:00").split(":").map(Number);
  const dt = new Date(y, m - 1, d, h + horas, mi);
  return `${dt.getFullYear()}${zzz(dt.getMonth() + 1)}${zzz(dt.getDate())}T${zzz(dt.getHours())}${zzz(dt.getMinutes())}00`;
}

/**
 * Gera o link "Adicionar ao Google Agenda" do voucher.
 * Com hora definida cria evento com horário; sem hora, cria evento de dia inteiro.
 */
export function linkGoogleAgenda(v: Voucher, config: Config) {
  const passeios = (v.passeios || []).filter((p) => p.data);
  if (!passeios.length) return "";

  const ordenados = [...passeios].sort((a, b) =>
    `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`),
  );
  const inicio = ordenados[0];
  const fim = ordenados[ordenados.length - 1];

  let datas: string;
  if (inicio.hora) {
    datas = `${carimbo(inicio.data, inicio.hora)}/${somarHoras(fim.data, fim.hora || inicio.hora, 8)}`;
  } else {
    const [y, m, d] = fim.data.split("-").map(Number);
    const seguinte = new Date(y, m - 1, d + 1);
    datas = `${inicio.data.replace(/-/g, "")}/${seguinte.getFullYear()}${zzz(seguinte.getMonth() + 1)}${zzz(seguinte.getDate())}`;
  }

  const detalhes = [
    `Voucher: ${v.codigo}`,
    `Cliente: ${nomesClientes(v)} (${totalPessoas(v)} pessoa${totalPessoas(v) > 1 ? "s" : ""})`,
    v.hotel ? `Hotel: ${v.hotel}` : "",
    ordenados
      .map((p) => `• ${p.nome}${p.hora ? ` às ${p.hora}` : ""} — ${dataBR(p.data)}`)
      .join("\n"),
    "",
    `Total: ${brl(v.total)} | Entrada: ${brl(v.entrada)} | A receber: ${brl(aReceber(v))}`,
    config.telefone ? `Contato: ${config.telefone}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${nomesPasseios(v) || "Passeio"} · ${config.empresa}`,
    dates: datas,
    details: detalhes,
    location: v.hotel || config.empresa,
    ctz: "America/Bahia",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ============================================================
   Mensagem do WhatsApp
   ============================================================ */

export function textoWhatsApp(v: Voucher, config: Config) {
  const pessoas = totalPessoas(v);
  const agenda = linkGoogleAgenda(v, config);
  const linhas: string[] = [];

  if (config.mensagemTopo) linhas.push(config.mensagemTopo);
  if (config.instagram) linhas.push(config.instagram);
  linhas.push("");

  linhas.push(`🏢 ${config.empresa}`);
  if (config.cnpj) linhas.push(`CNPJ: ${config.cnpj}`);
  linhas.push("");

  linhas.push("*Dados para voucher*");
  linhas.push(`🎟️ Voucher: ${v.codigo}`);
  linhas.push("");

  linhas.push(`📌 Serviço Contratado: ${nomesPasseios(v)}`);
  linhas.push("");
  linhas.push(`👤 Cliente: ${nomesClientes(v)}`);
  linhas.push(`( ${pessoas} pessoa${pessoas > 1 ? "s" : ""} )`);
  if (v.hotel) linhas.push(`🏨 Hotel: ${v.hotel}`);
  if (v.telefone) linhas.push(`📞 Telefone: ${v.telefone}`);
  if (v.contatoExtra) linhas.push(v.contatoExtra);
  linhas.push(`📅 Data dos Passeios: ${datasPasseios(v)}`);

  const comHora = (v.passeios || []).filter((p) => p.hora);
  if (comHora.length) {
    comHora.forEach((p) =>
      linhas.push(`   ⏰ ${p.nome} — ${dataBR(p.data)} às ${p.hora}${p.local ? ` (${p.local})` : ""}`),
    );
  }

  linhas.push("");
  linhas.push("💳 Forma de Pagamento:");
  if (v.formaPagamento) linhas.push(v.formaPagamento);
  linhas.push(`Valor da entrada: ${brl(v.entrada)}`);
  linhas.push(`Valor a receber: ${brl(aReceber(v))}`);
  linhas.push(`Valor total: ${brl(v.total)}`);

  if (v.observacoes) {
    linhas.push("");
    linhas.push(`📝 Observações: ${v.observacoes}`);
  }

  if (agenda) {
    linhas.push("");
    linhas.push("🗓️ Salve na sua agenda:");
    linhas.push(agenda);
  }

  if (config.politicaCancelamento) {
    linhas.push("");
    linhas.push("");
    linhas.push("🚨POLÍTICA DE CANCELAMENTO!");
    linhas.push("");
    linhas.push(config.politicaCancelamento);
  }

  return linhas.join("\n");
}

export function linkEnviarWhatsApp(v: Voucher, config: Config) {
  return linkWhatsApp(v.telefone, textoWhatsApp(v, config));
}

export const temWhatsApp = (v: Voucher) => soDigitos(v.telefone).length >= 10;

/* ============================================================
   PDF
   ============================================================ */

const INDIGO: [number, number, number] = [79, 70, 229];
const VIOLETA: [number, number, number] = [124, 58, 237];
const ESCURO: [number, number, number] = [15, 23, 42];
const CINZA: [number, number, number] = [100, 116, 139];
const CLARO: [number, number, number] = [241, 245, 249];

export function gerarPDFVoucher(v: Voucher, config: Config) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 210;
  const M = 14;
  const W = L - M * 2;
  let y = 0;

  const linhaTexto = (
    texto: string,
    x: number,
    yy: number,
    tam: number,
    estilo: "normal" | "bold" = "normal",
    cor: [number, number, number] = ESCURO,
  ) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    doc.text(texto, x, yy);
  };

  /* ---- Cabeçalho ---- */
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, L, 42, "F");
  doc.setFillColor(...VIOLETA);
  doc.triangle(L - 70, 0, L, 0, L, 42, "F");

  linhaTexto(config.empresa, M, 18, 20, "bold", [255, 255, 255]);
  let sub = 25;
  if (config.cnpj) {
    linhaTexto(`CNPJ: ${config.cnpj}`, M, sub, 9, "normal", [224, 231, 255]);
    sub += 5;
  }
  if (config.instagram) {
    linhaTexto(config.instagram, M, sub, 9, "normal", [224, 231, 255]);
    sub += 5;
  }
  if (config.telefone) linhaTexto(config.telefone, M, sub, 9, "normal", [224, 231, 255]);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(224, 231, 255);
  doc.text("VOUCHER", L - M, 16, { align: "right" });
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(v.codigo, L - M, 24, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(224, 231, 255);
  doc.text(`Emitido em ${dataBR(v.criadoEm.slice(0, 10))}`, L - M, 31, { align: "right" });

  y = 55;

  /* ---- Serviço contratado ---- */
  doc.setFillColor(...CLARO);
  doc.roundedRect(M, y - 8, W, 20, 3, 3, "F");
  linhaTexto("SERVIÇO CONTRATADO", M + 5, y - 2, 7.5, "bold", CINZA);
  const servico = doc.splitTextToSize(nomesPasseios(v) || "—", W - 10) as string[];
  linhaTexto(servico[0], M + 5, y + 6, 13, "bold", INDIGO);
  y += 22;

  /* ---- Dados ---- */
  const pessoas = totalPessoas(v);
  const dados: [string, string][] = [
    ["Cliente", `${nomesClientes(v)}  (${pessoas} pessoa${pessoas > 1 ? "s" : ""})`],
    ["Hotel", v.hotel || "—"],
    ["Telefone", [v.telefone, v.contatoExtra].filter(Boolean).join("  ·  ") || "—"],
    ["Data dos passeios", datasPasseios(v) || "—"],
  ];

  dados.forEach(([rot, val]) => {
    linhaTexto(rot.toUpperCase(), M, y, 7.5, "bold", CINZA);
    const linhas = doc.splitTextToSize(val, W) as string[];
    linhaTexto(linhas[0], M, y + 6, 11, "bold");
    let extra = 0;
    linhas.slice(1, 3).forEach((t, i) => {
      linhaTexto(t, M, y + 12 + i * 5, 11, "bold");
      extra += 5;
    });
    y += 13 + extra;
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y - 4, L - M, y - 4);
  });

  /* ---- Roteiro (passeios com hora) ---- */
  const passeios = (v.passeios || []).filter((p) => p.nome || p.data);
  if (passeios.length) {
    y += 2;
    linhaTexto("ROTEIRO", M, y, 7.5, "bold", CINZA);
    y += 6;
    passeios.forEach((p) => {
      doc.setFillColor(...INDIGO);
      doc.circle(M + 1.5, y - 1.4, 1.4, "F");
      const txt = `${p.nome || "Passeio"} — ${dataBR(p.data)}${p.hora ? ` às ${p.hora}` : ""}${p.local ? ` · ${p.local}` : ""}`;
      const linhas = doc.splitTextToSize(txt, W - 8) as string[];
      linhaTexto(linhas[0], M + 6, y, 10);
      y += 6;
    });
    y += 2;
  }

  /* ---- Pagamento ---- */
  doc.setFillColor(...ESCURO);
  doc.roundedRect(M, y, W, 26, 3, 3, "F");
  const col = W / 3;
  const caixa = (i: number, rot: string, val: string, destaque = false) => {
    const cx = M + col * i + col / 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(rot.toUpperCase(), cx, y + 9, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(destaque ? 14 : 12);
    const c: [number, number, number] = destaque ? [167, 139, 250] : [255, 255, 255];
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(val, cx, y + 18, { align: "center" });
  };
  caixa(0, "Entrada paga", brl(v.entrada));
  caixa(1, "A receber", brl(aReceber(v)));
  caixa(2, "Valor total", brl(v.total), true);
  y += 32;

  if (v.formaPagamento) {
    linhaTexto(`Forma de pagamento: ${v.formaPagamento}`, M, y, 9, "normal", CINZA);
    y += 7;
  }

  /* ---- Google Agenda ---- */
  const agenda = linkGoogleAgenda(v, config);
  if (agenda) {
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(M, y, W, 16, 3, 3, "F");
    linhaTexto("Adicione os passeios no seu Google Agenda", M + 5, y + 6.5, 9, "bold", INDIGO);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.textWithLink("Toque aqui para abrir o link e salvar na sua agenda", M + 5, y + 12, {
      url: agenda,
    });
    doc.link(M, y, W, 16, { url: agenda });
    y += 22;
  }

  /* ---- Observações ---- */
  if (v.observacoes) {
    linhaTexto("OBSERVAÇÕES", M, y, 7.5, "bold", CINZA);
    y += 5;
    const linhas = doc.splitTextToSize(v.observacoes, W) as string[];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...ESCURO);
    linhas.slice(0, 4).forEach((t) => {
      doc.text(t, M, y);
      y += 5;
    });
    y += 3;
  }

  /* ---- Política de cancelamento ---- */
  if (config.politicaCancelamento) {
    const linhas = doc.splitTextToSize(config.politicaCancelamento, W - 10) as string[];
    const altura = 14 + linhas.length * 4.6;
    if (y + altura > 275) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(M, y, W, altura, 3, 3, "F");
    doc.setFillColor(239, 68, 68);
    doc.roundedRect(M, y, 1.6, altura, 1, 1, "F");
    linhaTexto("POLÍTICA DE CANCELAMENTO", M + 6, y + 8, 9, "bold", [185, 28, 28]);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(127, 29, 29);
    linhas.forEach((t, i) => doc.text(t, M + 6, y + 14 + i * 4.6));
    y += altura + 8;
  }

  /* ---- Rodapé ---- */
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(M, 285, L - M, 285);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(`${config.empresa} · Voucher ${v.codigo}`, M, 290);
    doc.text(`Página ${p} de ${paginas}`, L - M, 290, { align: "right" });
  }

  return doc;
}

export function baixarPDFVoucher(v: Voucher, config: Config) {
  const nome = `voucher-${v.codigo}-${(nomesClientes(v) || "cliente")
    .split(" ")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/gi, "")}.pdf`;
  gerarPDFVoucher(v, config).save(nome);
}

export function abrirPDFVoucher(v: Voucher, config: Config) {
  const url = gerarPDFVoucher(v, config).output("bloburl");
  window.open(url, "_blank");
}
