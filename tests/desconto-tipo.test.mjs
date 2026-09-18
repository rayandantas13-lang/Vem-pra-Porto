/**
 * Teste de interface do formulário de voucher: o seletor de tipo do desconto.
 *
 * O bug que este teste trava: o R$ foi colocado como PRIMEIRA opção da lista,
 * mas o valor selecionado continuava "percentual" — ou seja, a caixa seguia
 * mostrando "%" na tela. Aqui o componente Vouchers é montado de verdade
 * (jsdom + os componentes reais de src/components/ui.tsx) e a caixa é lida do
 * DOM: ela precisa abrir mostrando "R$" e continuar respeitando o tipo gravado
 * quando o voucher é editado.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { after } from "node:test";
import vm from "node:vm";
import ts from "typescript";

import { JSDOM } from "jsdom";

/** Para os pacotes do node_modules (clsx, tailwind-merge) usados pelo app. */
const requireDoNode = createRequire(import.meta.url);

/* ------------------------- ambiente de navegador ------------------------- */
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// No Node 22 `navigator` é somente leitura: precisa redefinir a propriedade.
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const ReactDom = await import("react-dom");
const ReactJsxRuntime = await import("react/jsx-runtime");
const ReactDOMClient = await import("react-dom/client");
const { createRoot } = ReactDOMClient;
const { act } = React;

/* --------------------- módulos do app transpilados ----------------------- */
/**
 * Transpila um .tsx/.ts do app para CommonJS e executa num contexto, resolvendo
 * os imports "@/" pelos arquivos reais (utils, ui, Icon, cn) e trocando só o
 * que depende de rede/sessão (store, geração de PDF).
 */
const modulos = new Map();
const carregados = {};

function transpilar(caminho) {
  if (modulos.has(caminho)) return modulos.get(caminho);
  const codigo = readFileSync(new URL(caminho, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(codigo, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  modulos.set(caminho, outputText);
  return outputText;
}

/** Voucher de exemplo do painel (o store real é substituído). */
const storeFake = {
  vouchers: [],
  config: null,
  gastos: [],
  usuarios: [],
  sessao: null,
  salvarVoucher: async () => {},
  removerVoucher: async () => {},
  mudarStatus: async () => {},
  salvarGasto: async () => {},
  removerGasto: async () => {},
  salvarConfig: async () => {},
  notificar: () => {},
};

const stubs = {
  "@/store": { useStore: () => storeFake },
  "@/lib/voucherDoc": new Proxy(
    {},
    { get: (alvo, prop) => (prop === "__esModule" ? false : async () => {}) },
  ),
  // React de verdade (o mesmo que o app usa), só repassado para o require do VM.
  react: React,
  "react/jsx-runtime": ReactJsxRuntime,
  "react-dom": ReactDom,
  "react-dom/client": ReactDOMClient,
};

function importar(especificador) {
  if (especificador in stubs) return stubs[especificador];
  if (especificador === "react") return React;
  const caminhos = {
    "@/lib/utils": "../src/lib/utils.ts",
    "@/utils/cn": "../src/utils/cn.ts",
    "@/components/ui": "../src/components/ui.tsx",
    "@/components/Icon": "../src/components/Icon.tsx",
  };
  const caminho = caminhos[especificador];
  if (!caminho) {
    // Não é um módulo do app: resolve do node_modules (clsx, tailwind-merge).
    if (!especificador.startsWith(".") && !especificador.startsWith("@/"))
      return requireDoNode(especificador);
    throw new Error(`Import não mapeado no teste: ${especificador}`);
  }
  if (carregados[caminho]) return carregados[caminho];

  const exports = {};
  carregados[caminho] = exports;
  const contexto = vm.createContext({
    exports,
    module: { exports },
    require: importar,
    console,
    process,
    window,
    document,
    navigator,
    setTimeout,
    clearTimeout,
    Intl,
    URL,
  });
  vm.runInContext(transpilar(caminho), contexto, { filename: caminho });
  return exports;
}

const utils = importar("@/lib/utils");

/** src/data/seed.ts tem o CONFIG_PADRAO usado pelo store fake. */
const seed = (() => {
  const caminho = "../src/data/seed.ts";
  const exports = {};
  carregados[caminho] = exports;
  const contexto = vm.createContext({
    exports,
    module: { exports },
    require: importar,
    console,
    process,
    Intl,
  });
  vm.runInContext(transpilar(caminho), contexto, { filename: caminho });
  return exports;
})();
storeFake.config = seed.CONFIG_PADRAO;

const { default: Vouchers } = (() => {
  const caminho = "../src/pages/Vouchers.tsx";
  const exports = {};
  carregados[caminho] = exports;
  const contexto = vm.createContext({
    exports,
    module: { exports },
    require: importar,
    console,
    process,
    window,
    document,
    navigator,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Intl,
    Date,
  });
  vm.runInContext(transpilar(caminho), contexto, { filename: caminho });
  return exports;
})();

/* ------------------------------ helpers ---------------------------------- */
const seletorTipoDesconto = () =>
  document.querySelector('select[aria-label^="Tipo do desconto"]');

const clicar = async (el) => {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
};

const mudarSelect = async (el, valor) => {
  await act(async () => {
    el.value = valor;
    el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
};

/**
 * Simula digitação num <input> controlado pelo React. Atribuir `.value` direto
 * é ignorado (o rastreador de valor do React descarta o evento), então usamos
 * o setter nativo do prototype para o onChange disparar de verdade.
 */
const setterValor = Object.getOwnPropertyDescriptor(
  dom.window.HTMLInputElement.prototype,
  "value",
).set;
const digitar = async (input, valor) => {
  await act(async () => {
    setterValor.call(input, valor);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
};

async function montar(vouchers = []) {
  storeFake.vouchers = vouchers;
  // O Modal usa portal para o <body>: limpa tudo para um teste não enxergar
  // o seletor deixado pelo teste anterior.
  document.body.innerHTML = "";
  const alvo = document.createElement("div");
  document.body.appendChild(alvo);
  const raiz = createRoot(alvo);
  await act(async () => {
    raiz.render(React.createElement(Vouchers));
  });
  return {
    alvo,
    async desmontar() {
      await act(async () => raiz.unmount());
      document.body.innerHTML = "";
    },
  };
}

/** O campo de desconto é o input irmão do seletor de tipo (R$/%). */
const campoDesconto = () => seletorTipoDesconto().parentElement.querySelector("input");

/**
 * Texto visível da tela com os espaços "de moeda" (U+00A0/U+202F que o
 * pt-BR coloca entre "R$" e o número) normalizados para espaço comum.
 */
const textoTela = () => document.body.textContent.replace(/[\u00A0\u202F]/g, " ");

const voucherDe = (campos = {}) => ({
  id: "voucher-teste",
  codigo: "VP-TESTE",
  clientes: ["Cliente de teste"],
  pessoas: 1,
  hotel: "Hotel Teste",
  telefone: "",
  contatoExtra: "",
  passeios: [{ id: "p1", nome: "Passeio", data: utils.hoje(), hora: "08:00", local: "" }],
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

/* ------------------------------- testes ---------------------------------- */
test("novo voucher abre com R$ selecionado (e R$ é a primeira opção)", async () => {
  const tela = await montar();
  const botao = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Criar voucher",
  );
  assert.ok(botao, "botão 'Criar voucher' precisa existir");
  await clicar(botao);

  const seletor = seletorTipoDesconto();
  assert.ok(seletor, "o seletor de tipo do desconto precisa estar no formulário");
  assert.equal(seletor.value, "fixo", "a caixa precisa abrir mostrando R$");
  assert.equal(
    [...seletor.options].map((o) => o.textContent.trim()).join("/"),
    "R$/%",
    "R$ deve ser a primeira opção da lista",
  );
  assert.equal(seletor.options[seletor.selectedIndex].textContent.trim(), "R$");
  await tela.desmontar();
});

test("novo voucher em R$ aceita desconto acima de 100 e desconta em reais", async () => {
  const tela = await montar();
  await clicar(
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Criar voucher"),
  );
  const seletor = seletorTipoDesconto();
  const campo = campoDesconto();

  // O campo "Valor total" é o input decimal imediatamente anterior ao desconto,
  // independentemente de quantos campos existam antes dele no formulário.
  const decimais = [...document.querySelectorAll("input[inputmode='decimal']")];
  const campoTotal = decimais[decimais.indexOf(campo) - 1];
  await digitar(campoTotal, "1000");
  await digitar(campo, "250"); // em % isto seria inválido (>100)

  await digitar(campoTotal, "1000");
  await digitar(campo, "250"); // em % isto seria inválido (>100)

  assert.equal(seletor.value, "fixo");
  assert.ok(!campo.max, "em R$ não há teto de 100");
  assert.equal(
    textoTela().includes("não pode passar de 100%"),
    false,
    "R$ 250 não pode disparar o erro de percentual acima de 100%",
  );
  assert.equal(
    textoTela().includes("R$ 250,00"),
    true,
    "o desconto em reais precisa aparecer no formulário",
  );
  await tela.desmontar();
});

test("dá para trocar para % no seletor e o teto de 100 volta a valer", async () => {
  const tela = await montar();
  await clicar(
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Criar voucher"),
  );
  const seletor = seletorTipoDesconto();
  await mudarSelect(seletor, "percentual");
  assert.equal(seletor.value, "percentual");

  const campo = campoDesconto();
  assert.equal(campo.max, "100", "no modo % o campo é limitado a 100");

  await mudarSelect(seletor, "fixo");
  assert.equal(seletor.value, "fixo", "dá para voltar para R$");
  await tela.desmontar();
});

test("editar um voucher gravado em % continua mostrando %", async () => {
  const tela = await montar([voucherDe({ tipoDesconto: "percentual", desconto: 5 })]);
  const editar = document.querySelector('button[title="Editar"]');
  assert.ok(editar, "o voucher precisa aparecer na lista com o botão de editar");
  await clicar(editar);

  const seletor = seletorTipoDesconto();
  assert.equal(seletor.value, "percentual", "o tipo gravado não pode ser sobrescrito por R$");
  await tela.desmontar();
});

test("editar um voucher gravado em R$ continua mostrando R$", async () => {
  const tela = await montar([voucherDe({ tipoDesconto: "fixo", desconto: 249.1 })]);
  await clicar(document.querySelector('button[title="Editar"]'));
  assert.equal(seletorTipoDesconto().value, "fixo");
  await tela.desmontar();
});

/**
 * O React DOM mantém um MessageChannel aberto sob o jsdom, o que impede o
 * node de encerrar sozinho. Fechamos a janela aqui; o encerramento de fato
 * fica por conta de `node --test --test-force-exit` (ver package.json).
 */
after(() => {
  try {
    dom.window.close();
  } catch {
    // janela já fechada
  }
});
