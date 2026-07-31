import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Config, ID, Sessao, StatusVoucher, Usuario, Voucher } from "@/types";
import { api, modoLocal } from "@/api";
import { CONFIG_PADRAO } from "@/data/seed";
import { uid } from "@/lib/utils";

const SESSAO_KEY = "vempraporto.sessao";

function lerSessao(): Sessao | null {
  try {
    const raw = localStorage.getItem(SESSAO_KEY);
    return raw ? (JSON.parse(raw) as Sessao) : null;
  } catch {
    return null;
  }
}

function gravarSessao(s: Sessao | null) {
  if (s) localStorage.setItem(SESSAO_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSAO_KEY);
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
  entrar: (s: Sessao) => void;
  sair: () => Promise<void>;
  recarregar: () => void;

  vouchers: Voucher[];
  config: Config;

  salvarVoucher: (v: Voucher) => Promise<void>;
  removerVoucher: (id: ID) => Promise<void>;
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
  const [recarga, setRecarga] = useState(0);

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
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
      .then((usuario) => {
        const nova = { ...guardada, usuario };
        setSessao(nova);
        gravarSessao(nova);
      })
      .catch(() => {
        gravarSessao(null);
        setSessao(null);
      })
      .finally(() => setVerificando(false));
  }, []);

  useEffect(() => {
    if (!sessao) return;
    let cancelado = false;
    setCarregando(true);
    setErroCarga("");

    api
      .dados(sessao.token)
      .then((d) => {
        if (cancelado) return;
        setVouchers(d.vouchers ?? []);
        setConfig({ ...CONFIG_PADRAO, ...(d.config ?? {}) });
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
      ehAdmin: sessao?.usuario.papel === "admin",
      verificando,
      carregando,
      local: modoLocal(),
      erroCarga,

      entrar: (s) => {
        gravarSessao(s);
        setSessao(s);
      },
      sair: async () => {
        if (sessao) await api.sair(sessao.token).catch(() => {});
        gravarSessao(null);
        setSessao(null);
        setVouchers([]);
      },
      recarregar: () => setRecarga((n) => n + 1),

      vouchers,
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
        await executar(() => api.removerVoucher(token, id), "Voucher excluído.", () =>
          setVouchers(antes),
        );
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
    [sessao, verificando, carregando, erroCarga, vouchers, config, toasts, token, executar, notificar],
  );

  return <StoreCtx.Provider value={valor}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore precisa estar dentro de StoreProvider");
  return ctx;
}
