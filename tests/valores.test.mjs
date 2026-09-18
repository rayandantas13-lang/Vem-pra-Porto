import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Usa o TypeScript já instalado no projeto, sem depender de um test runner extra.
const { outputText } = ts.transpileModule(
  readFileSync(new URL("../src/lib/utils.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
);
const contexto = vm.createContext({ exports: {} });
vm.runInContext(outputText, contexto);
const utils = contexto.exports;
const codigoGs = readFileSync(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");

const voucher = (campos = {}) => ({
  id: "voucher-teste",
  codigo: "VP-TESTE",
  clientes: ["Cliente de teste"],
  pessoas: 1,
  hotel: "",
  telefone: "",
  contatoExtra: "",
  passeios: [{ id: "passeio-teste", nome: "Passeio", data: "2026-09-18", hora: "08:00", local: "" }],
  total: 1000,
  tipoDesconto: "percentual",
  desconto: 0,
  entrada: 200,
  formaPagamento: "PIX",
  observacoes: "",
  status: "pendente",
  criadoEm: "2026-09-18T00:00:00.000Z",
  ...campos,
});

function carregarGs() {
  const gs = vm.createContext({ Logger: { log() {} } });
  vm.runInContext(codigoGs, gs);
  return gs;
}

/** Planilha em memória: getValues preserva tipos e setNumberFormat desfaz datas. */
function planilhaMemoria(cols, registros = []) {
  const linhas = [Array.from(cols), ...registros.map((r) => cols.map((c) => r[c] ?? ""))];
  const formatos = new Map();
  const eventos = [];
  const s = {
    linhas, formatos, eventos,
    getLastRow: () => linhas.length,
    getMaxRows: () => Math.max(100, linhas.length),
    appendRow(valores) { linhas.push(Array.from(valores)); },
    deleteRow(linha) { linhas.splice(linha - 1, 1); },
    deleteRows(linha, quantas) { linhas.splice(linha - 1, quantas); },
    getRange(linha, coluna, nLinhas = 1, nColunas = 1) {
      const range = {
        getValues() {
          eventos.push("leitura");
          return Array.from({ length: nLinhas }, (_, i) =>
            Array.from({ length: nColunas }, (_, j) => linhas[linha - 1 + i]?.[coluna - 1 + j] ?? ""),
          );
        },
        setValues(valores) {
          for (let i = 0; i < nLinhas; i++) {
            linhas[linha - 1 + i] ??= Array(cols.length).fill("");
            for (let j = 0; j < nColunas; j++) linhas[linha - 1 + i][coluna - 1 + j] = valores[i][j];
          }
          return range;
        },
        clearContent() {
          return range.setValues(Array.from({ length: nLinhas }, () => Array(nColunas).fill("")));
        },
        // No Sheets, clearFormat NÃO redefine o formato numérico.
        clearFormat() { eventos.push("clearFormat"); return range; },
        setNumberFormat(formato) {
          eventos.push("formato");
          for (let j = 0; j < nColunas; j++) formatos.set(coluna - 1 + j, formato);
          // Uma data passa a ser seu número serial se for lida DEPOIS da troca de formato.
          for (let i = linha - 1; i < Math.min(linha - 1 + nLinhas, linhas.length); i++) {
            for (let j = coluna - 1; j < coluna - 1 + nColunas; j++) {
              const valor = linhas[i][j];
              if (valor instanceof Date) linhas[i][j] = valor.getTime() / 86400000 + 25569;
            }
          }
          return range;
        },
      };
      return range;
    },
  };
  return s;
}

function bancoGs(registros = []) {
  const gs = carregarGs();
  const planilha = planilhaMemoria(gs.ABAS.Vouchers, registros);
  gs.aba = () => planilha;
  return { gs, planilha };
}

const formatosValidos = [
  [1200, 1200], [189.905, 189.905], ["1.200", 1200], ["1.234,56", 1234.56],
  ["R$ 1.234,56", 1234.56], ["R$\u00a0600,50", 600.5], ["1349.1", 1349.1],
  ["249,10", 249.1], ["0", 0], ["0,00", 0], [".50", 0.5], [",50", 0.5],
];
for (const [entrada, esperado] of formatosValidos) {
  test(`leitura numérica consistente: ${JSON.stringify(entrada)}`, () => {
    const gs = carregarGs();
    assert.equal(utils.parseNumero(entrada), esperado);
    assert.equal(gs.parseNumeroGs(entrada), esperado);
  });
}

const saldos = [
  ["sem desconto", {}, 800],
  ["desconto percentual", { desconto: 10 }, 700],
  ["desconto fixo", { tipoDesconto: "fixo", desconto: 50 }, 750],
  ["R$ com ponto decimal", { total: 1349.1, tipoDesconto: "fixo", desconto: 249.1, entrada: 100 }, 1000],
  ["desconto arredondado antes de subtrair", { total: 199.9, desconto: 5, entrada: 0 }, 189.9],
  ["centavos sem resíduos de ponto flutuante", { total: 0.3, entrada: 0.1 }, 0.2],
  ["quitado", { total: 0.3, entrada: 0.27, desconto: 10 }, 0],
  ["entrada maior que o total", { entrada: 1200 }, 0],
  ["desconto fixo maior que o total", { tipoDesconto: "fixo", desconto: 1500, entrada: 0 }, 0],
  ["concluído ainda com saldo", { status: "concluido" }, 800],
];
for (const [nome, campos, esperado] of saldos) {
  test(`cálculo do saldo: ${nome}`, () => {
    assert.equal(utils.aReceber(voucher(campos)), esperado);
  });
}

const invalidos = [
  undefined, null, "", " ", "inválido", "1.2.3", "R$", "NaN", "Infinity", "0x10",
  NaN, Infinity, -1, "-1", true, false, {}, [], new Date("2026-09-18"),
  "2026-09-18T00:00:00.000Z", 100000001, "10.000.000.000.000.000",
];
for (const [i, entrada] of invalidos.entries()) {
  test(`a receber inválido não quita o voucher (${i}: ${String(entrada)})`, () => {
    const v = voucher({ aReceber: entrada });
    const normalizado = utils.normalizarVoucher(v);
    assert.equal(utils.aReceber(v), 800);
    assert.equal(normalizado.aReceber, undefined);
    assert.equal(utils.aReceber(normalizado), 800);

    const { gs } = bancoGs([v]);
    const lido = gs.lerVouchers()[0];
    assert.equal(lido.aReceber, undefined);
    assert.equal(utils.aReceber(lido), 800);
    const cols = gs.ABAS.Vouchers;
    const reparado = gs.repararLinhaVoucher(cols.map((c) => v[c] ?? ""), cols);
    assert.equal(reparado[cols.indexOf("aReceber")], 800);
  });
}

for (const [entrada, esperado] of [[0, 0], ["0,00", 0], [350, 350], ["R$ 350,75", 350.75]]) {
  test(`a receber manual válido é preservado: ${entrada}`, () => {
    const v = voucher({ aReceber: entrada });
    assert.equal(utils.aReceber(utils.normalizarVoucher(v)), esperado);
    assert.equal(utils.aReceber(v), esperado);
    const { gs } = bancoGs([v]);
    const lido = gs.lerVouchers()[0];
    assert.equal(lido.aReceber, esperado);
  });
}

test("tipo de desconto inferido também aparece correto no formulário", () => {
  const v = utils.normalizarVoucher(voucher({ total: 1349.1, entrada: 100, desconto: 249.1, tipoDesconto: undefined }));
  assert.equal(v.tipoDesconto, "fixo");
  assert.equal(utils.aReceber(v), 1000);
});

test("número nativo com três decimais não é reinterpretado como milhar", () => {
  const { gs } = bancoGs([voucher({ aReceber: 189.905, total: 199.9, entrada: 0, desconto: 5 })]);
  assert.equal(gs.registros("Vouchers")[0].aReceber, 189.905);
  const v = gs.lerVouchers()[0];
  assert.equal(v.aReceber, undefined);
  assert.equal(utils.aReceber(v), 189.9);
});

for (const campos of [
  { total: 199.9, entrada: 0, desconto: 5 },
  { total: 1349.1, entrada: 100, tipoDesconto: "fixo", desconto: 249.1 },
  { aReceber: 0 }, { aReceber: 325.5 },
]) {
  test(`gravar, reler e reparar mantém o mesmo saldo: ${JSON.stringify(campos)}`, () => {
    const { gs, planilha } = bancoGs();
    const v = voucher(campos);
    const esperado = utils.aReceber(v);
    gs.salvarVoucher(v);
    const cols = gs.ABAS.Vouchers;
    assert.equal(typeof planilha.linhas[1][cols.indexOf("aReceber")], "number");
    assert.equal(planilha.linhas[1][cols.indexOf("aReceber")], esperado);
    assert.equal(utils.aReceber(gs.lerVouchers()[0]), esperado);
    gs.repararAbaDinheiro("Vouchers");
    assert.equal(utils.aReceber(gs.lerVouchers()[0]), esperado);
    assert.equal(planilha.linhas[1][cols.indexOf("aReceber")], esperado);
  });
}

test("reparo lê datas antes de mudar o formato e define formato numérico de verdade", () => {
  const { gs, planilha } = bancoGs([voucher({ aReceber: new Date("2026-09-18") })]);
  gs.repararAbaDinheiro("Vouchers");
  assert.equal(planilha.eventos[0], "leitura");
  assert.ok(planilha.eventos.includes("formato"));
  assert.equal(planilha.formatos.get(gs.ABAS.Vouchers.indexOf("aReceber")), "0.00");
  assert.equal(planilha.linhas[1][gs.ABAS.Vouchers.indexOf("aReceber")], 800);
  assert.equal(utils.aReceber(gs.lerVouchers()[0]), 800);
});

test("salvar garante formato numérico na linha escrita", () => {
  const { gs, planilha } = bancoGs();
  gs.salvarVoucher(voucher());
  for (const col of ["total", "entrada", "aReceber"]) {
    assert.equal(planilha.formatos.get(gs.ABAS.Vouchers.indexOf(col)), "0.00");
  }
});

test("validação do servidor rejeita texto inválido em vez de gravar saldo zero", () => {
  const { gs } = bancoGs();
  assert.throws(() => gs.salvarVoucher(voucher({ aReceber: "não é dinheiro" })), /Valor a receber inválido/);
});

test("arredondamento trata meios centavos sem perder a precisão do percentual", () => {
  const gs = carregarGs();
  for (const [valor, esperado] of [[1.005, 1.01], [8.035, 8.04], [189.905, 189.91]]) {
    assert.equal(utils.arredondarDinheiro(valor), esperado);
    assert.equal(gs.arredondarDinheiroGs(valor), esperado);
  }
  const v = voucher({ total: 1000, desconto: 33.333, entrada: 0 });
  assert.equal(utils.valorDesconto(v), 333.33);
  assert.equal(utils.aReceber(v), 666.67);
  assert.equal(gs.aReceberAutomaticoGs(1000, "percentual", 33.333, 0), 666.67);
});

test("saldo automático continua recalculando ao editar entrada, desconto e total", () => {
  const { gs } = bancoGs();
  gs.salvarVoucher(voucher({ total: 199.9, entrada: 0, desconto: 5 }));
  let v = gs.lerVouchers()[0];
  assert.equal(v.aReceber, undefined);
  gs.salvarVoucher({ ...v, entrada: 50 });
  v = gs.lerVouchers()[0];
  assert.equal(v.aReceber, undefined);
  assert.equal(utils.aReceber(v), 139.9);
  gs.salvarVoucher({ ...v, total: 250, desconto: 10 });
  assert.equal(utils.aReceber(gs.lerVouchers()[0]), 175);
});

test("reparo é idempotente e conserva ajustes manuais e os dados do voucher", () => {
  const v = voucher({ aReceber: 350.75, observacoes: "Valor negociado" });
  const { gs, planilha } = bancoGs();
  gs.salvarVoucher(v);
  gs.repararAbaDinheiro("Vouchers");
  const primeira = JSON.stringify(planilha.linhas);
  gs.repararAbaDinheiro("Vouchers");
  assert.equal(JSON.stringify(planilha.linhas), primeira);
  const lido = gs.lerVouchers()[0];
  assert.equal(lido.aReceber, 350.75);
  assert.equal(lido.observacoes, v.observacoes);
  assert.equal(lido.codigo, v.codigo);
});

test("atualizar voucher duplicado grava o saldo na linha correta sem sobrescrever outro", () => {
  const { gs, planilha } = bancoGs([
    voucher({ aReceber: 999 }),
    voucher({ aReceber: 800 }),
    voucher({ id: "outro", codigo: "VP-OUTRO", aReceber: 100 }),
  ]);
  gs.salvarVoucher(voucher({ aReceber: 350 }));
  assert.equal(planilha.linhas.length, 3);
  const lidos = gs.lerVouchers();
  assert.equal(lidos.length, 2);
  assert.equal(lidos.find((v) => v.id === "voucher-teste").aReceber, 350);
  assert.equal(lidos.find((v) => v.id === "outro").aReceber, 100);
});

test("painel e backend mantêm os mesmos centavos em uma combinação de valores", () => {
  const gs = carregarGs();
  for (const total of [0.01, 0.3, 1.01, 8.04, 19.9, 199.9, 499.9, 1349.1, 99999.99, 99999999.99]) {
    for (const desconto of [0, 1, 5, 10, 33.333, 99.99, 100]) {
      const v = voucher({ total, desconto, entrada: 0 });
      v.entrada = utils.arredondarDinheiro(utils.totalComDesconto(v) / 3);
      const esperado = utils.aReceber(v);
      assert.equal(gs.aReceberAutomaticoGs(total, "percentual", desconto, v.entrada), esperado);
      assert.equal(utils.aReceber(utils.normalizarVoucher(v)), esperado);
      assert.ok(esperado >= 0);
      assert.equal(esperado, utils.arredondarDinheiro(esperado));
    }
  }
});

test("novo voucher é inserido antes de formatar uma linha que ainda não existe", () => {
  const { gs, planilha } = bancoGs();
  const getRange = planilha.getRange;
  planilha.getRange = (linha, ...args) => {
    assert.ok(linha <= planilha.getLastRow(), "A linha precisa existir antes de receber formato");
    return getRange(linha, ...args);
  };
  gs.salvarVoucher(voucher());
  assert.equal(utils.aReceber(gs.lerVouchers()[0]), 800);
});
