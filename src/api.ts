import type { Config, DadosApi, Sessao, Usuario, Voucher } from "@/types";
import { requisicaoLocal } from "@/localBackend";

interface RespostaApi<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

const URL_KEY = "vempraporto.apps_script_url";

/** URL vinda da variável do repositório GitHub (injetada no build pelo Vite). */
export function urlDoAmbiente() {
  const v = import.meta.env.VITE_APPS_SCRIPT_URL;
  return typeof v === "string" ? v.trim().replace(/\/$/, "") : "";
}

/** URL salva manualmente pelo administrador neste navegador. */
export function urlManual() {
  return localStorage.getItem(URL_KEY) || "";
}

/** URL efetiva: a manual tem prioridade sobre a variável do GitHub. */
export function urlApi() {
  return urlManual() || urlDoAmbiente();
}

export function definirUrlApi(url: string) {
  const v = url.trim().replace(/\/$/, "");
  if (v) localStorage.setItem(URL_KEY, v);
  else localStorage.removeItem(URL_KEY);
}

export type OrigemApi = "manual" | "github" | "local";

export function origemApi(): OrigemApi {
  if (urlManual()) return "manual";
  if (urlDoAmbiente()) return "github";
  return "local";
}

export function modoLocal() {
  return !urlApi();
}

async function enviar<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao Google Apps Script. Confira a URL e se a implantação está como “Qualquer pessoa”.",
    );
  }

  if (!resposta.ok) throw new Error(`Falha na comunicação com a planilha (${resposta.status}).`);

  let json: RespostaApi<T>;
  try {
    json = (await resposta.json()) as RespostaApi<T>;
  } catch {
    throw new Error("Resposta inválida da API. Reimplante o Apps Script e tente novamente.");
  }

  if (!json.ok) throw new Error(json.error || "A planilha retornou um erro.");
  return json.data as T;
}

async function req<T>(payload: Record<string, unknown>): Promise<T> {
  const url = urlApi();
  if (!url) return requisicaoLocal<T>(payload);
  return enviar<T>(url, payload);
}

/** Testa uma URL sem salvá-la. */
export async function testarUrl(url: string) {
  const v = url.trim().replace(/\/$/, "");
  if (!v) throw new Error("Informe a URL do Apps Script.");
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(v))
    throw new Error("A URL precisa ser do Apps Script e terminar com /exec.");
  return enviar<{ temAdmin: boolean }>(v, { acao: "status" });
}

export const api = {
  status: () => req<{ temAdmin: boolean }>({ acao: "status" }),
  entrar: (usuario: string, senha: string) => req<Sessao>({ acao: "entrar", usuario, senha }),
  criarPrimeiroAdmin: (p: { nome: string; email: string; usuario: string; senha: string }) =>
    req<Sessao>({ acao: "criarPrimeiroAdmin", ...p }),
  eu: (token: string) => req<Usuario>({ acao: "eu", token }),
  sair: (token: string) => req<void>({ acao: "sair", token }),

  dados: (token: string) => req<DadosApi>({ acao: "dados", token }),

  salvarVoucher: (token: string, voucher: Voucher) =>
    req<Voucher>({ acao: "salvarVoucher", token, voucher }),
  removerVoucher: (token: string, id: string) => req<void>({ acao: "removerVoucher", token, id }),

  salvarConfig: (token: string, config: Config) =>
    req<Config>({ acao: "salvarConfig", token, config }),

  listarUsuarios: (token: string) => req<Usuario[]>({ acao: "listarUsuarios", token }),
  criarUsuario: (
    token: string,
    usuarioNovo: {
      nome: string;
      email: string;
      usuario: string;
      senha: string;
      papel: Usuario["papel"];
    },
  ) => req<Usuario>({ acao: "criarUsuario", token, usuarioNovo }),
  alternarUsuario: (token: string, id: string, ativo: boolean) =>
    req<Usuario>({ acao: "alternarUsuario", token, id, ativo }),
};

/** Envia os vouchers do modo local para o Google Sheets já configurado. */
export async function migrarParaSheets(token: string, dados: { vouchers: Voucher[] }) {
  const url = urlApi();
  if (!url) throw new Error("Configure a URL do Google Apps Script antes de migrar.");
  for (const voucher of dados.vouchers) await enviar(url, { acao: "salvarVoucher", token, voucher });
  return dados.vouchers.length;
}
