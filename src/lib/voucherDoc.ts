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
  private readonly M = 14; // Margem
  private readonly W: number;
  private y = 0;

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4" });
    this.W = this.L - this.M * 2;
    this.y = 0;
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

  // 1. CABEÇALHO
  private construirCabecalho(config: Config, voucher: Voucher) {
    // Fundo gradiente (simulado com duas formas)
    this.doc.setFillColor(...CORES.primaria);
    this.doc.rect(0, 0, this.L, 45, "F");
    
    // Detalhe triangular
    this.doc.setFillColor(...CORES.secundaria);
    this.doc.triangle(this.L - 80, 0, this.L, 0, this.L, 45, "F");

    // Nome da empresa
    this.texto(config.empresa, this.M, 18, 22, "bold", CORES.branco);

    // Informações da empresa
    let subY = 26;
    if (config.cnpj) {
      this.texto(`CNPJ: ${config.cnpj}`, this.M, subY, 8, "normal", [200, 210, 255]);
      subY += 5;
    }
    if (config.instagram) {
      this.texto(config.instagram, this.M, subY, 8, "normal", [200, 210, 255]);
      subY += 5;
    }
    if (config.telefone) {
      this.texto(config.telefone, this.M, subY, 8, "normal", [200, 210, 255]);
    }

    // Voucher
    this.texto("VOUCHER OFICIAL", this.L - this.M, 16, 9, "bold", [200, 210, 255], "right");
    this.texto(voucher.codigo, this.L - this.M, 24, 18, "bold", CORES.branco, "right");
    this.texto(
      `Emitido em ${dataBR(voucher.criadoEm.slice(0, 10))}`,
      this.L - this.M,
      32,
      8,
      "normal",
      [200, 210, 255],
      "right"
    );

    this.y = 55;
  }

  // 2. TÍTULO DO PASSEIO
  private construirTituloPasseio(voucher: Voucher) {
    // Box de fundo
    this.box(this.M, this.y - 8, this.W, 22, CORES.fundo, false, 3);
    
    // Rótulo
    this.texto("PASSEIO ESPECIAL", this.M + 5, this.y - 2, 8, "bold", CORES.cinza);
    
    // Nome do passeio
    const nome = nomesPasseios(voucher) || "—";
    this.texto(nome, this.M + 5, this.y + 7, 14, "bold", CORES.primaria);
    
    // Detalhes do passeio (localidades)
    if (voucher.passeios?.length) {
      const locais = voucher.passeios
        .map(p => p.local || p.nome)
        .filter(Boolean)
        .join(" • ");
      
      if (locais) {
        this.texto(locais, this.M + 5, this.y + 15, 8, "normal", CORES.cinza);
        this.y += 26;
      } else {
        this.y += 22;
      }
    } else {
      this.y += 22;
    }
  }

  // 3. DADOS DA RESERVA
  private construirDadosReserva(voucher: Voucher) {
    // Título da seção
    this.texto("DADOS DA RESERVA & PASSAGEIRO", this.M, this.y, 8, "bold", CORES.cinza);
    this.y += 6;

    const pessoas = totalPessoas(voucher);
    const dados = [
      { label: "NOME DO CLIENTE / RESPONSÁVEL", value: nomesClientes(voucher) },
      { label: "TELEFONE / WHATSAPP", value: [voucher.telefone, voucher.contatoExtra].filter(Boolean).join("  •  ") || "—" },
      { label: "QUANTIDADE DE PASSAGEIROS", value: `${pessoas} Pessoas (${voucher.passeios?.length || 0} adulto${(voucher.passeios?.length || 0) > 1 ? "s" : ""} / 1 criança)` },
      { label: "PONTO DE EMBARQUE / HOTEL", value: voucher.hotel || "—" },
      { label: "DATA DO PASSEIO", value: datasPasseios(voucher) || "—" },
      { label: "HORÁRIO", value: voucher.passeios?.[0]?.hora ? `${voucher.passeios[0].hora}h (Tolerância 10min)` : "—" },
    ];

    // Layout em duas colunas
    const colWidth = (this.W - 8) / 2;
    dados.forEach((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = this.M + col * (colWidth + 8);
      const yPos = this.y + row * 28;

      // Box
      this.box(x, yPos, colWidth, 24, CORES.fundo, false, 2);
      
      // Label
      this.texto(item.label, x + 4, yPos + 6, 6.5, "bold", CORES.cinza);
      
      // Valor
      const lines = this.doc.splitTextToSize(item.value, colWidth - 8) as string[];
      this.texto(lines[0] || "—", x + 4, yPos + 14, 10, "bold", CORES.escuro);
      
      // Se tiver mais linhas
      if (lines.length > 1) {
        this.texto(lines[1], x + 4, yPos + 20, 9, "normal", CORES.cinza);
      }
    });

    this.y += Math.ceil(dados.length / 2) * 28 + 8;
  }

  // 4. DETALHES DO TRANSPORTE
  private construirDetalhesTransporte(voucher: Voucher, config: Config) {
    if (!voucher.passeios?.length) return;

    this.texto("DETALHES DO TRANSPORTE & MOTORISTA", this.M, this.y, 8, "bold", CORES.cinza);
    this.y += 6;

    const primeiroPasseio = voucher.passeios[0];
    const colWidth = (this.W - 4) / 3;

    const dados = [
      { label: "MOTORISTA / GUIA RESPONSÁVEL", value: primeiroPasseio.motorista || config.motorista || "—" },
      { label: "VEÍCULO / MODELO", value: primeiroPasseio.veiculo || config.veiculo || "—" },
      { label: "PLACA DO VEÍCULO", value: primeiroPasseio.placa || config.placa || "—" },
    ];

    dados.forEach((item, index) => {
      const x = this.M + index * (colWidth + 2);
      
      // Box
      this.box(x, this.y, colWidth, 22, CORES.fundo, false, 2);
      
      // Label
      this.texto(item.label, x + 3, this.y + 6, 6, "bold", CORES.cinza);
      
      // Valor
      const lines = this.doc.splitTextToSize(item.value, colWidth - 6) as string[];
      this.texto(lines[0] || "—", x + 3, this.y + 14, 9, "bold", CORES.escuro);
      
      if (lines.length > 1) {
        this.texto(lines[1], x + 3, this.y + 19, 8, "normal", CORES.cinza);
      }
    });

    this.y += 28;
  }

  // 5. ROTEIRO
  private construirRoteiro(voucher: Voucher) {
    const passeios = (voucher.passeios || []).filter(p => p.nome || p.data);
    if (!passeios.length) return;

    this.texto("ROTEIRO & ORIENTAÇÕES DO PASSEIO", this.M, this.y, 8, "bold", CORES.cinza);
    this.y += 6;

    passeios.forEach((p) => {
      // Marcador
      this.doc.setFillColor(...CORES.primaria);
      this.doc.circle(this.M + 2, this.y + 1.5, 1.5, "F");

      let txt = `• ${p.nome || "Passeio"} — ${dataBR(p.data)}`;
      if (p.hora) txt += ` às ${p.hora} (ida)`;
      
      if (p.dataVolta && p.dataVolta !== p.data) {
        txt += ` | Volta ${dataBR(p.dataVolta)}`;
        if (p.horaVolta) txt += ` às ${p.horaVolta}`;
      } else if (p.horaVolta) {
        txt += ` | Volta às ${p.horaVolta}`;
      }
      
      if (p.local) txt += ` · ${p.local}`;

      const lines = this.doc.splitTextToSize(txt, this.W - 10) as string[];
      this.texto(lines[0] || txt, this.M + 7, this.y, 9.5, "normal");
      this.y += 5.5;

      // Sub-itens (recomendações)
      if (p.recomendacoes) {
        const recs = p.recomendacoes.split("\n");
        recs.forEach(rec => {
          if (rec.trim()) {
            this.texto(`   ${rec.trim()}`, this.M + 7, this.y, 8, "normal", CORES.cinza);
            this.y += 4.5;
          }
        });
      }
    });

    this.y += 4;
  }

  // 6. PAGAMENTO
  private construirPagamento(voucher: Voucher) {
    const total = voucher.total || 0;
    const entrada = voucher.entrada || 0;
    const aReceberValor = aReceber(voucher);

    // Box principal
    this.box(this.M, this.y, this.W, 28, CORES.escuro, false, 3);

    const colWidth = this.W / 3;
    const items = [
      { label: "ENTRADA PAGA", value: brl(entrada), status: entrada > 0 ? "✓ CONFIRMADO" : "" },
      { label: "VALOR TOTAL", value: brl(total) },
      { label: "A RECEBER", value: brl(aReceberValor) },
    ];

    items.forEach((item, index) => {
      const x = this.M + index * colWidth + colWidth / 2;
      
      // Label
      this.texto(item.label, x, this.y + 10, 7.5, "normal", CORES.cinzaClaro, "center");
      
      // Valor
      const cor = index === 2 ? CORES.destaque : CORES.branco;
      const tamanho = index === 2 ? 14 : 12;
      this.texto(item.value, x, this.y + 20, tamanho, "bold", cor, "center");
      
      // Status (apenas para entrada)
      if (item.status) {
        this.texto(item.status, x, this.y + 26, 7, "bold", CORES.sucesso, "center");
      }
    });

    this.y += 34;

    // Forma de pagamento
    if (voucher.formaPagamento) {
      this.texto(
        `Forma de pagamento: ${voucher.formaPagamento}`,
        this.M,
        this.y,
        9,
        "normal",
        CORES.cinza
      );
      this.y += 7;
    }
  }

  // 7. INSTRUÇÕES
  private construirInstrucoes(voucher: Voucher, config: Config) {
    const colWidth = (this.W - 4) / 2;

    const instrucoes = [
      {
        label: "INSTRUÇÃO PARA O CLIENTE",
        value: `Esteja na recepção do hotel com 10 minutos de antecedência. Em caso de imprevistos ou dúvidas durante o passeio, entre em contato imediatamente com nossa central: ${config.telefone || "—"}`,
      },
      {
        label: "INSTRUÇÃO PARA O MOTORISTA",
        value: "Confirmar a quantidade de passageiros e nomes no embarque. Manter o veículo higienizado e ar-condicionado em temperatura agradável. Boa viagem!",
      },
    ];

    instrucoes.forEach((item, index) => {
      const x = this.M + index * (colWidth + 4);
      
      this.texto(item.label, x, this.y, 7.5, "bold", CORES.cinza);
      this.y += 5;

      const lines = this.doc.splitTextToSize(item.value, colWidth - 4) as string[];
      this.texto(lines[0] || item.value, x, this.y, 8.5, "normal", CORES.escuro);
      
      for (let i = 1; i < Math.min(lines.length, 3); i++) {
        this.texto(lines[i], x, this.y + i * 5, 8.5, "normal", CORES.escuro);
      }
      
      this.y += Math.min(lines.length, 3) * 5 + 4;
    });

    this.y += 2;
  }

  // 8. OBSERVAÇÕES
  private construirObservacoes(voucher: Voucher) {
    if (!voucher.observacoes) return;

    this.texto("OBSERVAÇÕES", this.M, this.y, 7.5, "bold", CORES.cinza);
    this.y += 5;

    const lines = this.doc.splitTextToSize(voucher.observacoes, this.W - 4) as string[];
    lines.slice(0, 4).forEach(line => {
      this.texto(line, this.M, this.y, 9, "normal", CORES.escuro);
      this.y += 5;
    });

    this.y += 3;
  }

  // 9. POLÍTICA DE CANCELAMENTO
  private construirPoliticaCancelamento(config: Config) {
    if (!config.politicaCancelamento?.trim()) return;

    const texto = config.politicaCancelamento.trim();
    const lines = this.doc.splitTextToSize(texto, this.W - 12) as string[];
    const limite = 276;
    const alturaLinha = 4.4;
    const topoBox = 14;

    let i = 0;
    let primeira = true;

    while (i < lines.length) {
      const cabem = Math.floor((limite - this.y - topoBox) / alturaLinha);
      
      if (cabem < 3) {
        this.doc.addPage();
        this.y = 18;
        continue;
      }

      const trecho = lines.slice(i, i + cabem);
      const altura = topoBox + trecho.length * alturaLinha;

      // Fundo
      this.doc.setFillColor(254, 242, 242);
      this.doc.roundedRect(this.M, this.y, this.W, altura, 3, 3, "F");
      
      // Barra lateral
      this.doc.setFillColor(239, 68, 68);
      this.doc.roundedRect(this.M, this.y, 2, altura, 1, 1, "F");

      // Título
      this.texto(
        primeira ? "POLÍTICA DE CANCELAMENTO" : "POLÍTICA DE CANCELAMENTO (CONTINUAÇÃO)",
        this.M + 6,
        this.y + 8,
        8.5,
        "bold",
        [185, 28, 28]
      );

      // Conteúdo
      trecho.forEach((t, j) => {
        this.texto(t, this.M + 6, this.y + topoBox + j * alturaLinha, 8, "normal", [127, 29, 29]);
      });

      i += trecho.length;
      primeira = false;
      this.y += altura + 8;
    }
  }

  // 10. RODAPÉ
  private construirRodape(voucher: Voucher, config: Config) {
    const paginas = this.doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      this.doc.setPage(p);
      this.linha(this.M, 285, this.W, [200, 200, 200]);
      
      this.texto(
        `${config.empresa} · Voucher ${voucher.codigo}`,
        this.M,
        290,
        7.5,
        "normal",
        CORES.cinza
      );
      this.texto(
        `Página ${p} de ${paginas}`,
        this.L - this.M,
        290,
        7.5,
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
