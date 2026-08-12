import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Config, GastoOperacional, ID, Sessao, StatusVoucher, Usuario, Voucher } from "@/types";
import { api, modoLocal, versaoDesatualizada } from "@/api";
import { CONFIG_PADRAO } from "@/data/seed";
import { normalizarStatus, uid } from "@/lib/utils";

const SESSAO_KEY = "vempraporto.sessao";

/**
 * A sessão é persistida em localStorage para continuar conectado entre abas e
 * reinícios do navegador/celular por até 10 dias. Versões antigas gravavam
 * apenas em sessionStorage (que some ao fechar a aba); migramos esse valor uma
 * única vez para manter quem já estava logado.
 */
function lerSessao(): Sessao | null {
  try {
    let raw = localStorage.getItem(SESSAO_KEY);
    if (!raw) {
      raw = sessionStorage.getItem(SESSAO_KEY);
      if (raw) {
        localStorage.setItem(SESSAO_KEY, raw);
        sessionStorage.removeItem(SESSAO_KEY);
      }
    }
    if (!raw) return null;
    const sessao = JSON.parse(raw) as Sessao;
    if (
      !sessao.token ||
      !sessao.usuario ||
      !sessao.usuario.papel ||
      new Date(sessao.expiraEm).getTime() <= Date.now()
    ) {
      localStorage.removeItem(SESSAO_KEY);
      return null;
    }
    return sessao;
  } catch {
    localStorage.removeItem(SESSAO_KEY);
    return null;
  }
}

function gravarSessao(s: Sessao | null) {
  if (s) localStorage.setItem(SESSAO_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSAO_KEY);
  // Limpa resquícios de versões antigas que usavam sessionStorage.
  sessionStorage.removeItem(SESSAO_KEY);
}

/**
 * Mensagens que o servidor devolve quando o token NÃO é mais aceito. Só nesses
 * casos deslogamos o usuário — um erro de rede ou do Apps Script instável
 * mantém a sessão para não derrubar o painel à toa.
 */
function ehErroDeSessao(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("sessão expirada") ||
    m.includes("sessao expirada") ||
    m.includes("sessão") && m.includes("expir") ||
    m.includes("usuário inativo") ||
    m.includes("usuario inativo") ||
    m.includes("token") && m.includes("inválid")
  );
}

export interface Toast {
  id: string;
  msg: string;
  tone: "ok" | "erro" | "info";
}

interface Ctx {
  sessao: Sessao | null;
  usuario: Usuario | null;
  ehAdmin: boolean;
  verificando: boolean;
  carregando: boolean;
  local: boolean;
  erroCarga: string;
  /** true quando o Apps Script publicado é anterior ao Code.gs deste site. */
  apiDesatualizada: boolean;
  entrar: (s: Sessao) => void;
  sair: () => Promise<void>;
  recarregar: () => void;

  vouchers: Voucher[];
  gastos: GastoOperacional[];
  config: Config;

  salvarVoucher: (v: Voucher) => Promise<void>;
  removerVoucher: (id: ID) => Promise<void>;
  salvarGasto: (g: GastoOperacional) => Promise<void>;
  removerGasto: (id: ID) => Promise<void>;
  mudarStatus: (id: ID, status: StatusVoucher) => Promise<void>;
  salvarConfig: (c: Config) => Promise<void>;

  toasts: Toast[];
  notificar: (msg: string, tone?: Toast["tone"]) => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(lerSessao);
  const [verificando, setVerificando] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState("");
  const [apiDesatualizada, setApiDesatualizada] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [gastos, setGastos] = useState<GastoOperacional[]>([]);
  const [config, setConfig] = useState<Config>(CONFIG_PADRAO);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notificar = useCallback((msg: string, tone: Toast["tone"] = "ok") => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  useEffect(() => {
    const guardada = lerSessao();
    if (!guardada) {
      setVerificando(false);
      return;
    }
    api
      .eu(guardada.token)
      .then(({ usuario, expiraEm }) => {
        // O servidor renova a validade automaticamente a partir da metade do
        // prazo. Quando devolve a nova data, atualizamos para estender os 10
        // dias. Se for uma implantação antiga (sem expiraEm), mantemos a atual.
        const nova = {
          ...guardada,
          usuario,
          expiraEm: expiraEm ?? guardada.expiraEm,
        };
        setSessao(nova);
        gravarSessao(nova);
      })
      .catch((err) => {
        // Só desloga quando o servidor realmente rejeita a sessão. Um erro de
        // rede ou do Apps Script instável mantém o usuário conectado usando a
        // última sessão válida salva.
        const msg = err instanceof Error ? err.message : "";
        if (msg && ehErroDeSessao(msg)) {
          gravarSessao(null);
          setSessao(null);
        } else {
          setSessao(guardada);
          gravarSessao(guardada);
        }
      })
      .finally(() => setVerificando(false));
  }, []);

  useEffect(() => {
    if (!sessao) return;

    // Não encerramos mais por inatividade. A sessão só cai quando o servidor
    // diz que expirou (após 10 dias, renováveis pela metade do prazo). Aqui
    // apenas observamos a data local para cair sozinha quando o prazo total
    // vencer sem nenhuma renovação.
    const relogio = window.setInterval(() => {
      if (new Date(sessao.expiraEm).getTime() > Date.now()) return;
      void api.sair(sessao.token).catch(() => {});
      gravarSessao(null);
      setSessao(null);
      setVouchers([]);
      setConfig(CONFIG_PADRAO);
      notificar("Sua sessão expirou. Entre novamente.", "info");
    }, 60_000);

    return () => window.clearInterval(relogio);
  }, [sessao, notificar]);

  useEffect(() => {
    if (!sessao) return;
    let cancelado = false;
    setCarregando(true);
    setErroCarga("");

    api
      .dados(sessao.token)
      .then((d) => {
        if (cancelado) return;
        // Status fora da lista (ex.: "confirmado" de versões antigas) é
        // normalizado para "pendente" para a tela nunca quebrar.
        setVouchers((d.vouchers ?? []).map((v) => ({ ...v, status: normalizarStatus(v.status) })));
        setGastos(d.gastos ?? []);
        setConfig({ ...CONFIG_PADRAO, ...(d.config ?? {}) });
        // Uma implantação antiga responde normalmente, mas descarta os campos
        // novos ao gravar. Avisamos para o texto não sumir sem explicação.
        setApiDesatualizada(!modoLocal() && versaoDesatualizada(d.versao));
      })
      .catch((e: unknown) => {
        if (!cancelado)
          setErroCarga(e instanceof Error ? e.message : "Não foi possível carregar os dados.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [sessao, recarga]);

  const token = sessao?.token ?? "";

  const executar = useCallback(
    async (fn: () => Promise<unknown>, ok: string, reverter: () => void) => {
      try {
        await fn();
        if (ok) notificar(ok);
      } catch (e) {
        reverter();
        notificar(e instanceof Error ? e.message : "Falha ao salvar.", "erro");
      }
    },
    [notificar],
  );

  const valor = useMemo<Ctx>(
    () => ({
      sessao,
      usuario: sessao?.usuario ?? null,
      ehAdmin: sessao?.usuario?.papel === "admin",
      verificando,
      carregando,
      local: modoLocal(),
      erroCarga,
      apiDesatualizada,

      entrar: (s) => {
        gravarSessao(s);
        setSessao(s);
      },
      sair: async () => {
        if (sessao) await api.sair(sessao.token).catch(() => {});
        gravarSessao(null);
        setSessao(null);
        setVouchers([]);
        setConfig(CONFIG_PADRAO);
      },
      recarregar: () => setRecarga((n) => n + 1),

      vouchers,
      gastos,
      config,

      salvarVoucher: async (v) => {
        const antes = vouchers;
        setVouchers((l) =>
          l.some((x) => x.id === v.id) ? l.map((x) => (x.id === v.id ? v : x)) : [v, ...l],
        );
        await executar(
          () => api.salvarVoucher(token, v),
          `Voucher ${v.codigo} salvo.`,
          () => setVouchers(antes),
        );
      },
      removerVoucher: async (id) => {
        const antes = vouchers;
        setVouchers((l) => l.filter((v) => v.id !== id));
        await executar(() => api.removerVoucher(token, id), "Voucher excluído.", () => setVouchers(antes));
      },
      salvarGasto: async (g) => {
        const antes = gastos;
        setGastos((l) => [g, ...l]);
        await executar(() => api.salvarGasto(token, g), "Gasto registrado.", () => setGastos(antes));
      },
      removerGasto: async (id) => {
        const antes = gastos;
        setGastos((l) => l.filter((g) => g.id !== id));
        await executar(() => api.removerGasto(token, id), "Gasto excluído.", () => setGastos(antes));
      },
      mudarStatus: async (id, status) => {
        const antes = vouchers;
        const alvo = vouchers.find((v) => v.id === id);
        if (!alvo) return;
        const novo = { ...alvo, status };
        setVouchers((l) => l.map((v) => (v.id === id ? novo : v)));
        await executar(() => api.salvarVoucher(token, novo), "", () => setVouchers(antes));
      },
      salvarConfig: async (c) => {
        const antes = config;
        setConfig(c);
        await executar(() => api.salvarConfig(token, c), "Configurações salvas.", () =>
          setConfig(antes),
        );
      },

      toasts,
      notificar,
    }),
    [
      sessao,
      verificando,
      carregando,
      erroCarga,
      apiDesatualizada,
      vouchers,
      gastos,
      config,
      toasts,
      token,
      executar,
      notificar,
    ],
  );

  return <StoreCtx.Provider value={valor}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore precisa estar dentro de StoreProvider");
  return ctx;
}
