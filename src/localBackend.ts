import type { Config, Sessao, Usuario, Voucher } from "@/types";
import { CONFIG_PADRAO, criarVouchersExemplo } from "@/data/seed";
import { uid } from "@/lib/utils";

/**
 * Banco local (modo demonstração).
 *
 * Usado enquanto a URL do Google Apps Script não estiver configurada.
 * A estrutura é idêntica à das abas do Google Sheets.
 */

const DB_KEY = "vempraporto.local.v2";

export const ADMIN_PADRAO = { usuario: "admin", senha: "admin123" };

interface UsuarioLocal extends Usuario {
  senhaHash: string;
}

interface BancoLocal {
  usuarios: UsuarioLocal[];
  vouchers: Voucher[];
  config: Config;
  sessoes: { token: string; usuarioId: string; expiraEm: string }[];
}

function hash(senha: string) {
  let v = 0;
  const s = `voucher::${senha}`;
  for (let i = 0; i < s.length; i++) {
    v = (v << 5) - v + s.charCodeAt(i);
    v |= 0;
  }
  return `local_${Math.abs(v).toString(36)}_${s.length}`;
}

function criarBanco(): BancoLocal {
  return {
    usuarios: [
      {
        id: uid(),
        nome: "Administrador",
        email: "admin@empresa.com",
        usuario: ADMIN_PADRAO.usuario,
        papel: "admin",
        ativo: true,
        criadoEm: new Date().toISOString(),
        senhaHash: hash(ADMIN_PADRAO.senha),
      },
    ],
    vouchers: criarVouchersExemplo(),
    config: CONFIG_PADRAO,
    sessoes: [],
  };
}

function ler(): BancoLocal {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const novo = criarBanco();
      gravar(novo);
      return novo;
    }
    const p = JSON.parse(raw) as BancoLocal;
    if (!p.usuarios?.length) {
      const novo = criarBanco();
      gravar(novo);
      return novo;
    }
    if (!p.config) p.config = CONFIG_PADRAO;
    if (!p.vouchers) p.vouchers = [];
    return p;
  } catch {
    const novo = criarBanco();
    gravar(novo);
    return novo;
  }
}

function gravar(db: BancoLocal) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* ignora */
  }
}

function publico(u: UsuarioLocal): Usuario {
  const { senhaHash: _s, ...resto } = u;
  return resto;
}

function autenticar(db: BancoLocal, token: unknown): UsuarioLocal {
  const s = db.sessoes.find((x) => x.token === String(token));
  if (!s || new Date(s.expiraEm).getTime() < Date.now())
    throw new Error("Sessão expirada. Entre novamente.");
  const u = db.usuarios.find((x) => x.id === s.usuarioId);
  if (!u || !u.ativo) throw new Error("Usuário inativo.");
  return u;
}

function exigirAdmin(u: UsuarioLocal) {
  if (u.papel !== "admin") throw new Error("Acesso permitido somente para administradores.");
}

function novaSessao(db: BancoLocal, u: UsuarioLocal): Sessao {
  const token = `local-${uid()}-${uid()}`;
  const expiraEm = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  db.sessoes = db.sessoes.filter((s) => new Date(s.expiraEm).getTime() > Date.now());
  db.sessoes.push({ token, usuarioId: u.id, expiraEm });
  return { token, usuario: publico(u), expiraEm };
}

export function limparBancoLocal() {
  localStorage.removeItem(DB_KEY);
}

export function exportarBancoLocal() {
  const db = ler();
  return { vouchers: db.vouchers, config: db.config };
}

export async function requisicaoLocal<T>(payload: Record<string, unknown>): Promise<T> {
  const db = ler();
  const acao = String(payload.acao || "");
  let saida: unknown = null;

  switch (acao) {
    case "status":
      saida = { temAdmin: db.usuarios.some((u) => u.papel === "admin") };
      break;

    case "criarPrimeiroAdmin": {
      const usuario = String(payload.usuario || "").trim().toLowerCase();
      if (db.usuarios.some((u) => u.usuario.toLowerCase() === usuario))
        throw new Error("Este usuário já existe.");
      const novo: UsuarioLocal = {
        id: uid(),
        nome: String(payload.nome || "").trim(),
        email: String(payload.email || "").trim().toLowerCase(),
        usuario,
        papel: "admin",
        ativo: true,
        criadoEm: new Date().toISOString(),
        senhaHash: hash(String(payload.senha || "")),
      };
      db.usuarios.push(novo);
      saida = novaSessao(db, novo);
      break;
    }

    case "entrar": {
      const id = String(payload.usuario || "").trim().toLowerCase();
      const u = db.usuarios.find(
        (x) => x.usuario.toLowerCase() === id || x.email.toLowerCase() === id,
      );
      if (!u || !u.ativo || u.senhaHash !== hash(String(payload.senha || "")))
        throw new Error("Usuário ou senha inválidos.");
      u.ultimoAcesso = new Date().toISOString();
      saida = novaSessao(db, u);
      break;
    }

    case "eu":
      saida = publico(autenticar(db, payload.token));
      break;

    case "sair":
      db.sessoes = db.sessoes.filter((s) => s.token !== String(payload.token));
      break;

    case "dados":
      autenticar(db, payload.token);
      saida = { vouchers: db.vouchers, config: db.config };
      break;

    case "salvarVoucher": {
      autenticar(db, payload.token);
      const v = payload.voucher as Voucher;
      const i = db.vouchers.findIndex((x) => x.id === v.id);
      if (i === -1) db.vouchers.unshift(v);
      else db.vouchers[i] = v;
      saida = v;
      break;
    }

    case "removerVoucher":
      autenticar(db, payload.token);
      db.vouchers = db.vouchers.filter((v) => v.id !== String(payload.id));
      break;

    case "salvarConfig":
      exigirAdmin(autenticar(db, payload.token));
      db.config = { ...db.config, ...(payload.config as Config) };
      saida = db.config;
      break;

    case "listarUsuarios":
      exigirAdmin(autenticar(db, payload.token));
      saida = db.usuarios.map(publico);
      break;

    case "criarUsuario": {
      exigirAdmin(autenticar(db, payload.token));
      const dados = payload.usuarioNovo as {
        nome: string;
        email: string;
        usuario: string;
        senha: string;
        papel: Usuario["papel"];
      };
      const usuario = String(dados.usuario).trim().toLowerCase();
      const email = String(dados.email).trim().toLowerCase();
      if (
        db.usuarios.some(
          (u) => u.usuario.toLowerCase() === usuario || u.email.toLowerCase() === email,
        )
      )
        throw new Error("Usuário ou email já cadastrado.");
      const novo: UsuarioLocal = {
        id: uid(),
        nome: dados.nome.trim(),
        email,
        usuario,
        papel: dados.papel === "admin" ? "admin" : "operador",
        ativo: true,
        criadoEm: new Date().toISOString(),
        senhaHash: hash(dados.senha),
      };
      db.usuarios.push(novo);
      saida = publico(novo);
      break;
    }

    case "alternarUsuario": {
      const atual = autenticar(db, payload.token);
      exigirAdmin(atual);
      const alvo = db.usuarios.find((u) => u.id === String(payload.id));
      if (!alvo) throw new Error("Usuário não encontrado.");
      const ativo = payload.ativo === true || String(payload.ativo) === "true";
      if (alvo.id === atual.id && !ativo)
        throw new Error("Você não pode desativar o seu próprio usuário.");
      if (
        alvo.papel === "admin" &&
        !ativo &&
        db.usuarios.filter((u) => u.papel === "admin" && u.ativo).length <= 1
      )
        throw new Error("Mantenha pelo menos um administrador ativo.");
      alvo.ativo = ativo;
      saida = publico(alvo);
      break;
    }

    default:
      throw new Error(`Ação "${acao}" não reconhecida no modo local.`);
  }

  gravar(db);
  return saida as T;
}
