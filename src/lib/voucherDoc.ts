import { jsPDF } from "jspdf";
import type { Config, Voucher } from "@/types";
import {
  aReceber,
  brl,
  dataBR,
  datasPasseios,
  linkAbrirWhatsApp,
  mensagemVoucher,
  nomesClientes,
  nomesPasseios,
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

  // Use volta if available on last passeio for end time
  const fimData = fim.dataVolta || fim.data;
  const fimHora = fim.horaVolta || fim.hora || inicio.hora;

  let datas: string;
  if (inicio.hora) {
    datas = `${carimbo(inicio.data, inicio.hora)}/${somarHoras(fimData, fimHora, 8)}`;
  } else {
    const [y, m, d] = fimData.split("-").map(Number);
    const seguinte = new Date(y, m - 1, d + 1);
    datas = `${inicio.data.replace(/-/g, "")}/${seguinte.getFullYear()}${zzz(seguinte.getMonth() + 1)}${zzz(seguinte.getDate())}`;
  }

  const detalhes = [
    `Voucher: ${v.codigo}`,
    `Cliente: ${nomesClientes(v)} (${totalPessoas(v)} pessoa${totalPessoas(v) > 1 ? "s" : ""})`,
    v.hotel ? `Hotel: ${v.hotel}` : "",
    ordenados
      .map((p) => {
        let line = `• ${p.nome} — ${dataBR(p.data)}`;
        if (p.hora) line += ` às ${p.hora} (ida)`;
        if (p.dataVolta && p.dataVolta !== p.data) {
          line += ` | Volta ${dataBR(p.dataVolta)}`;
          if (p.horaVolta) line += ` às ${p.horaVolta}`;
        } else if (p.horaVolta) {
          line += ` | Volta às ${p.horaVolta}`;
        }
        return line;
      })
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
   Envio pelo WhatsApp (PDF + mensagem curta)
   ============================================================ */

/**
 * Abre o menu de compartilhamento do celular já com o PDF do voucher anexado
 * e a mensagem curta (saudação + texto das Configurações). Aí é só escolher
 * o WhatsApp e o contato — sem número fixo.
 *
 * Retorna:
 * - "compartilhado": o menu abriu e o envio foi concluído;
 * - "cancelado": a pessoa fechou o menu (não fazer nada);
 * - "sem-suporte": o navegador não consegue anexar arquivos (usar o plano B).
 */
export type ResultadoCompartilhamento = "compartilhado" | "cancelado" | "sem-suporte";

export async function compartilharPDFVoucher(
  v: Voucher,
  config: Config,
): Promise<ResultadoCompartilhamento> {
  try {
    const arquivo = arquivoPDFVoucher(v, config);
    if (
      typeof navigator === "undefined" ||
      typeof navigator.canShare !== "function" ||
      !navigator.canShare({ files: [arquivo] })
    )
      return "sem-suporte";

    await navigator.share({
      files: [arquivo],
      title: `Voucher ${v.codigo}`,
      text: mensagemVoucher(v, config),
    });
    return "compartilhado";
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return "cancelado";
    return "sem-suporte";
  }
}

/**
 * Plano B para computadores: baixa o PDF e abre o WhatsApp (sem número,
 * com a mensagem pronta) para anexar o arquivo manualmente.
 */
export function baixarEAbrirWhatsApp(v: Voucher, config: Config) {
  baixarPDFVoucher(v, config);
  window.open(linkAbrirWhatsApp(mensagemVoucher(v, config)), "_blank", "noopener,noreferrer");
}

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
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const linhas = doc.splitTextToSize(val, W - 4) as string[];
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
      let txt = `${p.nome || "Passeio"} — ${dataBR(p.data)}`;
      if (p.hora) txt += ` às ${p.hora} (ida)`;
      if (p.dataVolta && p.dataVolta !== p.data) {
        txt += ` | Volta: ${dataBR(p.dataVolta)}`;
        if (p.horaVolta) txt += ` às ${p.horaVolta}`;
      } else if (p.horaVolta) {
        txt += ` | Volta às ${p.horaVolta}`;
      }
      if (p.local) txt += ` · ${p.local}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
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
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const linhas = doc.splitTextToSize(v.observacoes, W - 4) as string[];
    doc.setTextColor(...ESCURO);
    linhas.slice(0, 4).forEach((t) => {
      doc.text(t, M, y);
      y += 5;
    });
    y += 3;
  }

  /* ============================================================
     NOVAS SEÇÕES DO LAYOUT (Incluso / Não incluso / O que levar / Retorno)
     Baseado no modelo que o usuário enviou
  ============================================================ */
  const addSection = (titulo: string, conteudo: string | undefined, corTitulo: [number,number,number] = CINZA) => {
    if (!conteudo?.trim()) return;
    const linhas = doc.splitTextToSize(conteudo.trim(), W - 10) as string[];
    if (!linhas.length) return;

    // pequena separação
    y += 3;

    linhaTexto(titulo, M, y, 8, "bold", corTitulo);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ESCURO);

    linhas.slice(0, 7).forEach((t) => {
      doc.text(t, M + 2, y);
      y += 4.5;
    });
    y += 4;
  };

  // Seções do modelo
  addSection("INCLUSO NO PASSEIO", (config as any).incluso);
  addSection("NÃO INCLUSO", (config as any).naoIncluso);
  addSection("O QUE LEVAR", (config as any).oQueLevar);

  if ((config as any).pontoRetorno || (config as any).informacoesAdicionais) {
    y += 2;
    linhaTexto("INFORMAÇÕES IMPORTANTES", M, y, 8, "bold", CINZA);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ESCURO);

    if ((config as any).pontoRetorno) {
      const linhas = doc.splitTextToSize((config as any).pontoRetorno, W - 4) as string[];
      linhas.slice(0, 3).forEach((t) => { doc.text(t, M, y); y += 4.5; });
    }
    if ((config as any).informacoesAdicionais) {
      const linhas = doc.splitTextToSize((config as any).informacoesAdicionais, W - 4) as string[];
      linhas.slice(0, 4).forEach((t) => { doc.text(t, M, y); y += 4.5; });
    }
    y += 3;
  }

  /* ---- Política de cancelamento ----
     Quebra o texto em quantas folhas forem preciso: cada trecho recebe a
     própria caixa, sem nunca passar do limite do rodapé da página. */
  if (config.politicaCancelamento?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const linhas = doc.splitTextToSize(config.politicaCancelamento.trim(), W - 12) as string[];
    const LIMITE = 276; // rodapé começa em 285 mm
    const ALT_LINHA = 4.4;
    const TOPO_CAIXA = 14; // título + respiro antes da 1ª linha de texto

    let i = 0;
    let primeira = true;
    while (i < linhas.length) {
      const cabem = Math.floor((LIMITE - y - TOPO_CAIXA) / ALT_LINHA);
      if (cabem < 3) {
        // sem espaço mínimo na folha atual: começa em folha nova
        doc.addPage();
        y = 18;
        continue;
      }
      const trecho = linhas.slice(i, i + cabem);
      const altura = TOPO_CAIXA + trecho.length * ALT_LINHA;
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(M, y, W, altura, 3, 3, "F");
      doc.setFillColor(239, 68, 68);
      doc.roundedRect(M, y, 1.6, altura, 1, 1, "F");
      linhaTexto(
        primeira ? "POLÍTICA DE CANCELAMENTO" : "POLÍTICA DE CANCELAMENTO (CONTINUAÇÃO)",
        M + 6,
        y + 8,
        8.5,
        "bold",
        [185, 28, 28],
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(127, 29, 29);
      trecho.forEach((t, j) => doc.text(t, M + 6, y + TOPO_CAIXA + j * ALT_LINHA));
      i += trecho.length;
      primeira = false;
      y += altura + 8;
    }
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

/** Nome do arquivo PDF do voucher: "voucher-VPA1B2C-maria.pdf" */
export function nomeArquivoPDF(v: Voucher) {
  return `voucher-${v.codigo}-${(nomesClientes(v) || "cliente")
    .split(" ")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/gi, "")}.pdf`;
}

/** O voucher em forma de arquivo (File), pronto para anexar/compartilhar. */
export function arquivoPDFVoucher(v: Voucher, config: Config) {
  const blob = gerarPDFVoucher(v, config).output("blob");
  return new File([blob], nomeArquivoPDF(v), { type: "application/pdf" });
}

export function baixarPDFVoucher(v: Voucher, config: Config) {
  gerarPDFVoucher(v, config).save(nomeArquivoPDF(v));
}

export function abrirPDFVoucher(v: Voucher, config: Config) {
  const url = gerarPDFVoucher(v, config).output("bloburl");
  window.open(url, "_blank", "noopener,noreferrer");
}
