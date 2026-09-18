import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Config, GastoOperacional, ID, Sessao, StatusVoucher, Usuario, Voucher } from "@/types";
import { api, modoLocal, versaoDesatualizada } from "@/api";
import { CONFIG_PADRAO } from "@/data/seed";
import { deduplicarPorId, dinheiroValido, normalizarVoucher, uid } from "@/lib/utils";

const SESSAO_KEY = "vempraporto.sessao";
const DADOS_CACHE_KEY = "vempraporto.cache.dados";
const BROADCAST_CANAL = "vempraporto_sync_channel";

interface CacheDados {
  vouchers: Voucher[];
  gastos: GastoOperacional[];
  config: Config;
  versao?: string;
  salvoEm: number;
}

type SyncMsg =
  | {
      tipo: "DADOS_ATUALIZADOS";
      vouchers: Voucher[];
      gastos: GastoOperacional[];
      config: Config;
      versao?: string;
    }
  | { tipo: "LOGOUT" };

function notificarAbas(msg: SyncMsg) {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(BROADCAST_CANAL);
      bc.postMessage(msg);
      bc.close();
    }
  } catch {
    // broadcast channel indisponível ou em modo restrito
  }
}

/**
 * Lê os dados em cache do localStorage para exibição imediata (0ms)
 * ao abrir novas abas ou recarregar a página (estratégia Stale-While-Revalidate).
 */
function lerCacheDados(): CacheDados | null {
  try {
    const raw = localStorage.getItem(DADOS_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as CacheDados;
    if (!cache || !Array.isArray(cache.vouchers)) return null;
    // O cache também pode ter saldos inválidos de versões antigas. Aplique
    // a mesma leitura da API antes do primeiro render, inclusive sem conexão.
    return { ...cache, vouchers: deduplicarPorId(cache.vouchers).map(normalizarVoucher) };
  } catch {
    return null;
  }
}

function gravarCacheDados(dados: {
  vouchers: Voucher[];
  gastos: GastoOperacional[];
  config: Config;
  versao?: string;
}) {
  try {
    const item: CacheDados = {
      vouchers: dados.vouchers,
      gastos: dados.gastos,
      config: dados.config,
      versao: dados.versao,
      salvoEm: Date.now(),
    };
    localStorage.setItem(DADOS_CACHE_KEY, JSON.stringify(item));
  } catch {
    // quota excedida ou modo anônimo restrito
  }
}

function limparCacheDados() {
  try {
    localStorage.removeItem(DADOS_CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * A sessão é persistida em localStorage para continuar conectado entre abas e
 * reinícios do navegador/celular por até 10 dias.
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
    (m.includes("sessão") && m.includes("expir")) ||
    m.includes("usuário inativo") ||
    m.includes("usuario inativo") ||
    (m.includes("token") && m.includes("inválid"))
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
  sincronizando: boolean;
  local: boolean;
  erroCarga: string;
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
  const cacheInicial = useMemo(() => lerCacheDados(), []);
  const sessaoInicial = useMemo(() => lerSessao(), []);

  const [sessao, setSessao] = useState<Sessao | null>(sessaoInicial);
  // Se já há sessão válida no localStorage, não bloqueia a tela inteira:
  // a validação no servidor é feita em background.
  const [verificando] = useState(false);
  // Se já temos cache, não bloqueamos o painel (carregando = false)
  const [carregando, setCarregando] = useState(() => !cacheInicial && !!sessaoInicial);
  const [sincronizando, setSincronizando] = useState(false);
  const [erroCarga, setErroCarga] = useState("");
  const [apiDesatualizada, setApiDesatualizada] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const [vouchers, setVouchers] = useState<Voucher[]>(() => cacheInicial?.vouchers ?? []);
  const [gastos, setGastos] = useState<GastoOperacional[]>(() => cacheInicial?.gastos ?? []);
  const [config, setConfig] = useState<Config>(() => cacheInicial?.config ?? CONFIG_PADRAO);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Evita re-buscar dados via api.dados imediatamente se o login já os trouxe
  const dadosCarregadosNoLoginRef = useRef(false);

  const notificar = useCallback((msg: string, tone: Toast["tone"] = "ok") => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, tone }]);
    // Erro de salvamento fica na tela por mais tempo: é a única pista de que
    // o valor NÃO foi gravado (implantação antiga recusando, por exemplo) —
    // com 3,6s a pessoa não via e achava que o valor tinha "sumido sozinho".
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      tone === "erro" ? 9000 : 3600,
    );
  }, []);

  // Sincronização em tempo real entre abas / janelas (BroadcastChannel + storage event)
  useEffect(() => {
    const aplicarNovosDados = (novos: {
      vouchers: Voucher[];
      gastos: GastoOperacional[];
      config: Config;
      versao?: string;
    }) => {
      setVouchers(deduplicarPorId(novos.vouchers).map(normalizarVoucher));
      setGastos(novos.gastos);
      setConfig(novos.config);
      if (novos.versao) {
        setApiDesatualizada(!modoLocal() && versaoDesatualizada(novos.versao));
      }
    };

    let canal: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        canal = new BroadcastChannel(BROADCAST_CANAL);
        canal.onmessage = (e: MessageEvent<SyncMsg>) => {
          if (e.data?.tipo === "DADOS_ATUALIZADOS") {
            aplicarNovosDados(e.data);
          } else if (e.data?.tipo === "LOGOUT") {
            setSessao(null);
            setVouchers([]);
            setGastos([]);
            setConfig(CONFIG_PADRAO);
          }
        };
      } catch {
        canal = null;
      }
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === DADOS_CACHE_KEY && e.newValue) {
        try {
          const cache = JSON.parse(e.newValue) as CacheDados;
          if (cache && Array.isArray(cache.vouchers)) {
            aplicarNovosDados(cache);
          }
        } catch {}
      } else if (e.key === SESSAO_KEY && !e.newValue) {
        setSessao(null);
        setVouchers([]);
        setGastos([]);
        setConfig(CONFIG_PADRAO);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      canal?.close();
    };
  }, []);

  // Validação/renovação de sessão com o servidor em background
  useEffect(() => {
    const guardada = lerSessao();
    if (!guardada) return;

    if (new Date(guardada.expiraEm).getTime() <= Date.now()) {
      gravarSessao(null);
      limparCacheDados();
      setSessao(null);
      return;
    }

    api
      .eu(guardada.token)
      .then(({ usuario, expiraEm }) => {
        const nova = {
          ...guardada,
          usuario,
          expiraEm: expiraEm ?? guardada.expiraEm,
        };
        setSessao(nova);
        gravarSessao(nova);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "";
        if (msg && ehErroDeSessao(msg)) {
          gravarSessao(null);
          limparCacheDados();
          setSessao(null);
        } else {
          setSessao(guardada);
          gravarSessao(guardada);
        }
      });
  }, []);

  // Observador de expiração de sessão local
  useEffect(() => {
    if (!sessao) return;

    const relogio = window.setInterval(() => {
      if (new Date(sessao.expiraEm).getTime() > Date.now()) return;
      void api.sair(sessao.token).catch(() => {});
      gravarSessao(null);
      limparCacheDados();
      setSessao(null);
      setVouchers([]);
      setConfig(CONFIG_PADRAO);
      notificar("Sua sessão expirou. Entre novamente.", "info");
    }, 60_000);

    return () => window.clearInterval(relogio);
  }, [sessao, notificar]);

  // Carga de dados (Stale-While-Revalidate: usa cache imediatamente e revalida em background)
  useEffect(() => {
    if (!sessao) return;
    if (dadosCarregadosNoLoginRef.current) {
      dadosCarregadosNoLoginRef.current = false;
      return;
    }

    let cancelado = false;
    const temDadosLocais = vouchers.length > 0 || !!cacheInicial;

    if (!temDadosLocais) {
      setCarregando(true);
    }
    setSincronizando(true);
    setErroCarga("");

    api
      .dados(sessao.token)
      .then((d) => {
        if (cancelado) return;
        const vouchersNorm = deduplicarPorId(d.vouchers ?? []).map(normalizarVoucher);
        const gastosNorm = deduplicarPorId(d.gastos ?? []).map((g) => ({
          ...g,
          valor: dinheiroValido(g.valor),
        }));
        const configNorm = { ...CONFIG_PADRAO, ...(d.config ?? {}) };

        setVouchers(vouchersNorm);
        setGastos(gastosNorm);
        setConfig(configNorm);
        setApiDesatualizada(!modoLocal() && versaoDesatualizada(d.versao));

        // Grava no cache e notifica outras janelas/abas
        gravarCacheDados({
          vouchers: vouchersNorm,
          gastos: gastosNorm,
          config: configNorm,
          versao: d.versao,
        });
        notificarAbas({
          tipo: "DADOS_ATUALIZADOS",
          vouchers: vouchersNorm,
          gastos: gastosNorm,
          config: configNorm,
          versao: d.versao,
        });
      })
      .catch((e: unknown) => {
        if (!cancelado) {
          const msg = e instanceof Error ? e.message : "Não foi possível carregar os dados.";
          if (!temDadosLocais) {
            setErroCarga(msg);
          }
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCarregando(false);
          setSincronizando(false);
        }
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
      sincronizando,
      local: modoLocal(),
      erroCarga,
      apiDesatualizada,

      entrar: (s) => {
        gravarSessao(s);
        setSessao(s);

        // Se a resposta de login já trouxe os dados, aplica direto (0ms de tela de carregamento!)
        if (s.dados) {
          dadosCarregadosNoLoginRef.current = true;
          const vouchersNorm = deduplicarPorId(s.dados.vouchers ?? []).map(normalizarVoucher);
          const gastosNorm = deduplicarPorId(s.dados.gastos ?? []).map((g) => ({
            ...g,
            valor: dinheiroValido(g.valor),
          }));
          const configNorm = { ...CONFIG_PADRAO, ...(s.dados.config ?? {}) };

          setVouchers(vouchersNorm);
          setGastos(gastosNorm);
          setConfig(configNorm);
          setCarregando(false);
          setSincronizando(false);
          setApiDesatualizada(!modoLocal() && versaoDesatualizada(s.dados.versao));

          gravarCacheDados({
            vouchers: vouchersNorm,
            gastos: gastosNorm,
            config: configNorm,
            versao: s.dados.versao,
          });
          notificarAbas({
            tipo: "DADOS_ATUALIZADOS",
            vouchers: vouchersNorm,
            gastos: gastosNorm,
            config: configNorm,
            versao: s.dados.versao,
          });
        }
      },

      sair: async () => {
        if (sessao) await api.sair(sessao.token).catch(() => {});
        gravarSessao(null);
        limparCacheDados();
        setSessao(null);
        setVouchers([]);
        setGastos([]);
        setConfig(CONFIG_PADRAO);
        notificarAbas({ tipo: "LOGOUT" });
      },

      recarregar: () => setRecarga((n) => n + 1),

      vouchers,
      gastos,
      config,

      salvarVoucher: async (voucher) => {
        // Cache, tela e API recebem os mesmos centavos, sem mudar após recarregar.
        const v = normalizarVoucher(voucher);
        const antes = vouchers;
        const novos = vouchers.some((x) => x.id === v.id)
          ? vouchers.map((x) => (x.id === v.id ? v : x))
          : [v, ...vouchers];
        setVouchers(novos);
        gravarCacheDados({ vouchers: novos, gastos, config });
        notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers: novos, gastos, config });

        await executar(
          () => api.salvarVoucher(token, v),
          `Voucher ${v.codigo} salvo.`,
          () => {
            setVouchers(antes);
            gravarCacheDados({ vouchers: antes, gastos, config });
            notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers: antes, gastos, config });
          },
        );
      },

      removerVoucher: async (id) => {
        const antes = vouchers;
        const novos = vouchers.filter((v) => v.id !== id);
        setVouchers(novos);
        gravarCacheDados({ vouchers: novos, gastos, config });
        notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers: novos, gastos, config });

        await executar(
          () => api.removerVoucher(token, id),
          "Voucher excluído.",
          () => {
            setVouchers(antes);
            gravarCacheDados({ vouchers: antes, gastos, config });
            notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers: antes, gastos, config });
          },
        );
      },

      salvarGasto: async (g) => {
        const antes = gastos;
        const novos = [g, ...gastos];
        setGastos(novos);
        gravarCacheDados({ vouchers, gastos: novos, config });
        notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers, gastos: novos, config });

        await executar(
          () => api.salvarGasto(token, g),
          "Gasto registrado.",
          () => {
            setGastos(antes);
            gravarCacheDados({ vouchers, gastos: antes, config });
            notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers, gastos: antes, config });
          },
        );
      },

      removerGasto: async (id) => {
        const antes = gastos;
        const novos = gastos.filter((g) => g.id !== id);
        setGastos(novos);
        gravarCacheDados({ vouchers, gastos: novos, config });
        notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers, gastos: novos, config });

        await executar(
          () => api.removerGasto(token, id),
          "Gasto excluído.",
          () => {
            setGastos(antes);
            gravarCacheDados({ vouchers, gastos: antes, config });
            notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers, gastos: antes, config });
          },
        );
      },

      mudarStatus: async (id, status) => {
        const antes = vouchers;
        const alvo = vouchers.find((v) => v.id === id);
        if (!alvo) return;
        const novo = { ...alvo, status };
        const novos = vouchers.map((v) => (v.id === id ? novo : v));
        setVouchers(novos);
        gravarCacheDados({ vouchers: novos, gastos, config });
        notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers: novos, gastos, config });

        await executar(
          () => api.salvarVoucher(token, novo),
          "",
          () => {
            setVouchers(antes);
            gravarCacheDados({ vouchers: antes, gastos, config });
            notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers: antes, gastos, config });
          },
        );
      },

      salvarConfig: async (c) => {
        const antes = config;
        setConfig(c);
        gravarCacheDados({ vouchers, gastos, config: c });
        notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers, gastos, config: c });

        await executar(
          () => api.salvarConfig(token, c),
          "Configurações salvas.",
          () => {
            setConfig(antes);
            gravarCacheDados({ vouchers, gastos, config: antes });
            notificarAbas({ tipo: "DADOS_ATUALIZADOS", vouchers, gastos, config: antes });
          },
        );
      },

      toasts,
      notificar,
    }),
    [
      sessao,
      verificando,
      carregando,
      sincronizando,
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
