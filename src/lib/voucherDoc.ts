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
   CORES
   ============================================================ */
const CORES = {
  primaria: [79, 70, 229] as [number, number, number],
  secundaria: [124, 58, 237] as [number, number, number],
  escuro: [15, 23, 42] as [number, number, number],
  cinza: [100, 116, 139] as [number, number, number],
  cinzaClaro: [148, 163, 184] as [number, number, number],
  fundo: [241, 245, 249] as [number, number, number],
  branco: [255, 255, 255] as [number, number, number],
  sucesso: [34, 197, 94] as [number, number, number],
  destaque: [167, 139, 250] as [number, number, number],
};

/* ============================================================
   UTILITÁRIOS PDF
   ============================================================ */
class PDFVoucherBuilder {
  private doc: jsPDF;
  private readonly L = 210; // Largura A4
  private readonly M = 12; // Margem (reduzida)
  private readonly W: number;
  private y = 0;
  private readonly MARGEM_FIM = 287;
  private readonly MARGEM_INICIO = 18;

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4" });
    this.W = this.L - this.M * 2;
    this.y = 0;
  }

  private checkPageBreak(h: number) {
    if (this.y + h > this.MARGEM_FIM) {
      this.doc.addPage();
      this.y = this.MARGEM_INICIO;
      return true;
    }
    return false;
  }

  // Helper para texto
  private texto(
    texto: string,
    x: number,
    y: number,
    tamanho: number,
    estilo: "normal" | "bold" = "normal",
    cor: [number, number, number] = CORES.escuro,
    alinhamento: "left" | "center" | "right" = "left"
  ) {
    this.doc.setFont("helvetica", estilo);
    this.doc.setFontSize(tamanho);
    this.doc.setTextColor(...cor);
    this.doc.text(texto, x, y, { align: alinhamento });
  }

  // Helper para box com borda
  private box(
    x: number,
    y: number,
    w: number,
    h: number,
    cor: [number, number, number],
    borda = false,
    raio = 0
  ) {
    if (borda) {
      this.doc.setDrawColor(...cor);
      this.doc.roundedRect(x, y, w, h, raio, raio, "S");
    } else {
      this.doc.setFillColor(...cor);
      this.doc.roundedRect(x, y, w, h, raio, raio, "F");
    }
  }

  // Helper para linha horizontal
  private linha(x: number, y: number, w: number, cor: [number, number, number] = CORES.cinzaClaro) {
    this.doc.setDrawColor(...cor);
    this.doc.line(x, y, x + w, y);
  }

  /* ============================================================
     MÉTODOS DE CONSTRUÇÃO
     ============================================================ */

  // 1. CABEÇALHO (compacto)
  private construirCabecalho(config: Config, voucher: Voucher) {
    const ALT_BANNER = 26;
    
    // Fundo
    this.doc.setFillColor(...CORES.primaria);
    this.doc.rect(0, 0, this.L, ALT_BANNER, "F");
    
    // Detalhe triangular
    this.doc.setFillColor(...CORES.secundaria);
    this.doc.triangle(this.L - 50, 0, this.L, 0, this.L, ALT_BANNER, "F");

    // Nome da empresa
    this.texto(config.empresa, this.M, 12, 14, "bold", CORES.branco);

    // Informações da empresa em uma linha
    const subParts = [
      config.cnpj ? `CNPJ: ${config.cnpj}` : "",
      config.instagram,
      config.telefone
    ].filter(Boolean);
    
    if (subParts.length) {
      this.texto(subParts.join("  ·  "), this.M, 19, 6.5, "normal", [224, 231, 255]);
    }

    // Voucher à direita
    this.texto("VOUCHER", this.L - this.M, 10, 7, "bold", [224, 231, 255], "right");
    this.texto(voucher.codigo, this.L - this.M, 17, 13, "bold", CORES.branco, "right");
    this.texto(
      `Emitido em ${dataBR(voucher.criadoEm.slice(0, 10))}`,
      this.L - this.M,
      22,
      6.5,
      "normal",
      [224, 231, 255],
      "right"
    );

    this.y = ALT_BANNER + 8;
  }

  // 2. TÍTULO DO PASSEIO (compacto)
  private construirTituloPasseio(voucher: Voucher) {
    this.checkPageBreak(16);
    // Box de fundo
    this.box(this.M, this.y, this.W, 14, CORES.fundo, false, 2);
    
    // Rótulo
    this.texto("SERVIÇO CONTRATADO", this.M + 4, this.y + 5, 6.5, "bold", CORES.cinza);
    
    // Nome do passeio
    const nome = nomesPasseios(voucher) || "—";
    const lines = this.doc.splitTextToSize(nome, this.W - 10) as string[];
    this.texto(lines[0], this.M + 4, this.y + 11, 10, "bold", CORES.primaria);
    
    this.y += 16;
  }

  // 3. DADOS DA RESERVA (compacto, 2 colunas)
  private construirDadosReserva(voucher: Voucher) {
    const pessoas = totalPessoas(voucher);
    const colWidth = (this.W - 6) / 2;

    const desenhaCampo = (rot: string, val: string, x: number, yy: number, larg: number) => {
      this.texto(rot.toUpperCase(), x, yy, 6, "bold", CORES.cinza);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(8.5);
      const lines = this.doc.splitTextToSize(val, larg - 2) as string[];
      this.texto(lines[0] || "—", x, yy + 5, 8.5, "bold", CORES.escuro);
      let extra = 0;
      lines.slice(1, 3).forEach((t, i) => {
        this.texto(t, x, yy + 10 + i * 4, 8.5, "bold", CORES.escuro);
        extra += 4;
      });
      return 8 + extra;
    };

    // Linha 1: Cliente (coluna inteira)
    this.checkPageBreak(18);
    const altCliente = desenhaCampo("Cliente", `${nomesClientes(voucher)}  (${pessoas} pessoa${pessoas > 1 ? "s" : ""})`, this.M, this.y, this.W);
    this.y += altCliente + 2;
    this.linha(this.M, this.y - 1, this.W, [226, 232, 240]);
    this.y += 2;

    // Linha 2: Hotel + Telefone lado a lado
    this.checkPageBreak(14);
    const altH = desenhaCampo("Hotel", voucher.hotel || "—", this.M, this.y, colWidth);
    const altT = desenhaCampo("Telefone", [voucher.telefone, voucher.contatoExtra].filter(Boolean).join(" · ") || "—", this.M + colWidth + 6, this.y, colWidth);
    this.y += Math.max(altH, altT) + 2;
    this.linha(this.M, this.y - 1, this.W, [226, 232, 240]);
    this.y += 2;

    // Linha 3: Data dos passeios
    this.checkPageBreak(12);
    const altD = desenhaCampo("Data dos passeios", datasPasseios(voucher) || "—", this.M, this.y, this.W);
    this.y += altD + 2;
  }

  // 4. DETALHES DO TRANSPORTE (compacto)
  private construirDetalhesTransporte(voucher: Voucher, config: Config) {
    if (!voucher.passeios?.length) return;

    this.checkPageBreak(18);
    this.texto("DETALHES DO TRANSPORTE", this.M, this.y, 6.5, "bold", CORES.cinza);
    this.y += 5;

    const primeiroPasseio = voucher.passeios[0];
    const colWidth = (this.W - 4) / 3;

    const dados = [
      { label: "MOTORISTA", value: (primeiroPasseio as any).motorista || (config as any).motorista || "—" },
      { label: "VEÍCULO", value: (primeiroPasseio as any).veiculo || (config as any).veiculo || "—" },
      { label: "PLACA", value: (primeiroPasseio as any).placa || (config as any).placa || "—" },
    ];

    dados.forEach((item, index) => {
      const x = this.M + index * (colWidth + 2);
      
      // Box compacto
      this.box(x, this.y, colWidth, 13, CORES.fundo, false, 2);
      
      // Label
      this.texto(item.label, x + 3, this.y + 4, 5.5, "bold", CORES.cinza);
      
      // Valor
      const lines = this.doc.splitTextToSize(item.value, colWidth - 6) as string[];
      this.texto(lines[0] || "—", x + 3, this.y + 10, 7.5, "bold", CORES.escuro);
    });

    this.y += 18;
  }

  // 5. ROTEIRO (compacto)
  private construirRoteiro(voucher: Voucher) {
    const passeios = (voucher.passeios || []).filter(p => p.nome || p.data);
    if (!passeios.length) return;

    this.checkPageBreak(12);
    this.texto("ROTEIRO", this.M, this.y, 6.5, "bold", CORES.cinza);
    this.y += 5;

    passeios.forEach((p) => {
      this.checkPageBreak(6);
      // Marcador
      this.doc.setFillColor(...CORES.primaria);
      this.doc.circle(this.M + 1.2, this.y + 1, 1, "F");

      let txt = `${p.nome || "Passeio"} — ${dataBR(p.data)}`;
      if (p.hora) txt += ` às ${p.hora} (ida)`;
      
      if (p.dataVolta && p.dataVolta !== p.data) {
        txt += ` | Volta ${dataBR(p.dataVolta)}`;
        if (p.horaVolta) txt += ` às ${p.horaVolta}`;
      } else if (p.horaVolta) {
        txt += ` | Volta às ${p.horaVolta}`;
      }
      
      if (p.local) txt += ` · ${p.local}`;

      const lines = this.doc.splitTextToSize(txt, this.W - 8) as string[];
      this.texto(lines[0] || txt, this.M + 5, this.y, 8, "normal");
      this.y += 4.5;
    });

    this.y += 2;
  }

  // 6. PAGAMENTO (compacto)
  private construirPagamento(voucher: Voucher) {
    this.checkPageBreak(22);
    const total = voucher.total || 0;
    const entrada = voucher.entrada || 0;
    const aReceberValor = aReceber(voucher);

    // Box principal (reduzido de 24mm para 18mm)
    this.box(this.M, this.y, this.W, 18, CORES.escuro, false, 2);

    const colWidth = this.W / 3;
    const items = [
      { label: "ENTRADA PAGA", value: brl(entrada), destaque: false },
      { label: "VALOR TOTAL", value: brl(total), destaque: false },
      { label: "A RECEBER", value: brl(aReceberValor), destaque: true },
    ];

    items.forEach((item, index) => {
      const x = this.M + index * colWidth + colWidth / 2;
      
      // Label
      this.texto(item.label, x, this.y + 6, 6, "normal", CORES.cinzaClaro, "center");
      
      // Valor
      const cor = item.destaque ? CORES.destaque : CORES.branco;
      const tamanho = item.destaque ? 11 : 9.5;
      this.texto(item.value, x, this.y + 13, tamanho, "bold", cor, "center");
    });

    this.y += 21;

    // Forma de pagamento
    if (voucher.formaPagamento) {
      this.texto(
        `Forma de pagamento: ${voucher.formaPagamento}`,
        this.M,
        this.y,
        7,
        "normal",
        CORES.cinza
      );
      this.y += 5;
    }
  }

  // 7. INSTRUÇÕES E INFORMAÇÕES (compacto, 2 colunas)
  private construirInstrucoes(_voucher: Voucher, config: Config) {
    const colGap = 4;
    const halfCol = (this.W - colGap) / 2;

    const addSectionCompact = (
      titulo: string,
      conteudo: string | undefined,
      x: number,
      larg: number,
      maxY: number,
    ): number => {
      if (!conteudo?.trim()) return 0;
      const lines = this.doc.splitTextToSize(conteudo.trim(), larg - 4) as string[];
      if (!lines.length) return 0;

      this.texto(titulo, x, maxY, 6.5, "bold", CORES.cinza);
      let ly = maxY + 4;

      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.doc.setTextColor(...CORES.escuro);

      lines.forEach((t) => {
        this.doc.text(t, x + 1, ly);
        ly += 3.5;
      });
      return ly - maxY + 2;
    };

    // Incluso + Não incluso em 2 colunas
    const yInicio = this.y;
    const altIncluso = addSectionCompact("INCLUSO NO PASSEIO", config.incluso, this.M, halfCol, this.y);
    const altNaoIncluso = addSectionCompact("NÃO INCLUSO", config.naoIncluso, this.M + halfCol + colGap, halfCol, this.y);
    if (altIncluso || altNaoIncluso) {
      this.y = yInicio + Math.max(altIncluso, altNaoIncluso) + 1;
    }

    // O que levar (linha inteira)
    const altLevar = addSectionCompact("O QUE LEVAR", config.oQueLevar, this.M, this.W, this.y);
    if (altLevar) this.y += altLevar;

    // Ponto de retorno + Informações adicionais em 2 colunas
    if (config.pontoRetorno || config.informacoesAdicionais) {
      const yIni2 = this.y;
      const altRet = addSectionCompact("PONTO DE RETORNO", config.pontoRetorno, this.M, halfCol, this.y);
      const altInfo = addSectionCompact("INFORMAÇÕES ADICIONAIS", config.informacoesAdicionais, this.M + halfCol + colGap, halfCol, this.y);
      if (altRet || altInfo) {
        this.y = yIni2 + Math.max(altRet, altInfo) + 1;
      }
    }
  }

  // 8. OBSERVAÇÕES (compacto)
  private construirObservacoes(voucher: Voucher) {
    if (!voucher.observacoes) return;

    this.checkPageBreak(12);
    this.texto("OBSERVAÇÕES", this.M, this.y, 6.5, "bold", CORES.cinza);
    this.y += 4;

    const lines = this.doc.splitTextToSize(voucher.observacoes, this.W - 4) as string[];
    lines.slice(0, 3).forEach(line => {
      this.checkPageBreak(4);
      this.texto(line, this.M, this.y, 7.5, "normal", CORES.escuro);
      this.y += 3.8;
    });

    this.y += 2;
  }

  // 9. POLÍTICA DE CANCELAMENTO (compacto, caixa única)
  private construirPoliticaCancelamento(config: Config) {
    if (!config.politicaCancelamento?.trim()) return;

    const texto = config.politicaCancelamento.trim();
    const lines = this.doc.splitTextToSize(texto, this.W - 10) as string[];
    const alturaLinha = 3.4;
    const topoBox = 8;
    const altura = topoBox + lines.length * alturaLinha + 2;

    this.checkPageBreak(altura + 4);

    // Fundo
    this.doc.setFillColor(254, 242, 242);
    this.doc.roundedRect(this.M, this.y, this.W, altura, 2, 2, "F");
    
    // Barra lateral
    this.doc.setFillColor(239, 68, 68);
    this.doc.roundedRect(this.M, this.y, 1.2, altura, 1, 1, "F");

    // Título
    this.texto(
      "POLÍTICA DE CANCELAMENTO",
      this.M + 5,
      this.y + 5,
      7,
      "bold",
      [185, 28, 28]
    );

    // Conteúdo
    lines.forEach((t, j) => {
      this.texto(t, this.M + 5, this.y + topoBox + j * alturaLinha, 6.5, "normal", [127, 29, 29]);
    });

    this.y += altura + 3;
  }

  // 10. RODAPÉ
  private construirRodape(voucher: Voucher, config: Config) {
    const paginas = this.doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      this.doc.setPage(p);
      this.linha(this.M, 287, this.W, [200, 200, 200]);
      
      this.texto(
        `${config.empresa} · Voucher ${voucher.codigo}`,
        this.M,
        291,
        6.5,
        "normal",
        CORES.cinza
      );
      this.texto(
        `Página ${p} de ${paginas}`,
        this.L - this.M,
        291,
        6.5,
        "normal",
        CORES.cinza,
        "right"
      );
    }
  }

  /* ============================================================
     CONSTRUIR PDF COMPLETO
     ============================================================ */
  construir(voucher: Voucher, config: Config): jsPDF {
    // 1. Cabeçalho
    this.construirCabecalho(config, voucher);

    // 2. Título do Passeio
    this.construirTituloPasseio(voucher);

    // 3. Dados da Reserva
    this.construirDadosReserva(voucher);

    // 4. Detalhes do Transporte
    this.construirDetalhesTransporte(voucher, config);

    // 5. Roteiro
    this.construirRoteiro(voucher);

    // 6. Pagamento
    this.construirPagamento(voucher);

    // 7. Instruções
    this.construirInstrucoes(voucher, config);

    // 8. Observações
    this.construirObservacoes(voucher);

    // 9. Política de Cancelamento
    this.construirPoliticaCancelamento(config);

    // 10. Rodapé
    this.construirRodape(voucher, config);

    return this.doc;
  }
}

/* ============================================================
   FUNÇÕES EXPORTADAS
   ============================================================ */

export function gerarPDFVoucher(v: Voucher, config: Config) {
  const builder = new PDFVoucherBuilder();
  return builder.construir(v, config);
}

export function nomeArquivoPDF(v: Voucher) {
  return `voucher-${v.codigo}-${(nomesClientes(v) || "cliente")
    .split(" ")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/gi, "")}.pdf`;
}

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

/* ============================================================
   WHATSAPP E COMPARTILHAMENTO
   ============================================================ */

export type ResultadoCompartilhamento = "compartilhado" | "cancelado" | "sem-suporte";

export async function compartilharPDFVoucher(
  v: Voucher,
  config: Config
): Promise<ResultadoCompartilhamento> {
  try {
    const arquivo = arquivoPDFVoucher(v, config);
    if (
      typeof navigator === "undefined" ||
      typeof navigator.canShare !== "function" ||
      !navigator.canShare({ files: [arquivo] })
    ) {
      return "sem-suporte";
    }

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

export function baixarEAbrirWhatsApp(v: Voucher, config: Config) {
  baixarPDFVoucher(v, config);
  window.open(linkAbrirWhatsApp(mensagemVoucher(v, config)), "_blank", "noopener,noreferrer");
}

/* ============================================================
   GOOGLE AGENDA
   ============================================================ */

const zzz = (n: number) => String(n).padStart(2, "0");

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

export function linkGoogleAgenda(v: Voucher, config: Config) {
  const passeios = (v.passeios || []).filter((p) => p.data);
  if (!passeios.length) return "";

  const ordenados = [...passeios].sort((a, b) =>
    `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`)
  );
  const inicio = ordenados[0];
  const fim = ordenados[ordenados.length - 1];

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
