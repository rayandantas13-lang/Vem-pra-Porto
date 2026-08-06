import { useMemo } from "react";
import { useStore } from "@/store";
import type { Voucher } from "@/types";
import { Icon, type IconName } from "@/components/Icon";
import { Botao, Cartao, Selo, Vazio } from "@/components/ui";
import {
  aReceber,
  addDays,
  brl,
  dataBR,
  DIAS_CURTOS,
  hoje,
  iso,
  nomesClientes,
  nomesPasseios,
  parseISO,
  primeiraData,
  rotuloRelativo,
  statusMeta,
  totalComDesconto,
  totalPessoas,
} from "@/lib/utils";
import { cn } from "@/utils/cn";

function Kpi({
  icone,
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  icone: IconName;
  rotulo: string;
  valor: string;
  detalhe: string;
  cor: string;
}) {
  return (
    <Cartao className="p-5">
      <div className={cn("grid size-11 place-items-center rounded-xl", cor)}>
        <Icon name={icone} className="size-5" />
      </div>
      <p className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">{valor}</p>
      <p className="text-sm font-semibold text-slate-600">{rotulo}</p>
      <p className="mt-1 text-xs text-slate-400">{detalhe}</p>
    </Cartao>
  );
}

export default function Dashboard({ ir }: { ir: (r: string) => void }) {
  const { vouchers, config } = useStore();
  const h = hoje();

  const d = useMemo(() => {
    const ativos = vouchers.filter((v) => v.status !== "cancelado");

    /** Todos os passeios (voucher + passeio) achatados */
    const eventos = ativos.flatMap((v) =>
      (v.passeios || [])
        .filter((p) => p.data)
        .map((p) => ({ v, p })),
    );

    const doDia = eventos
      .filter((e) => e.p.data === h)
      .sort((a, b) => (a.p.hora || "").localeCompare(b.p.hora || ""));

    const proximos = eventos
      .filter((e) => e.p.data > h)
      .sort((a, b) => `${a.p.data}${a.p.hora}`.localeCompare(`${b.p.data}${b.p.hora}`))
      .slice(0, 6);

    const mes = h.slice(0, 7);
    const doMes = ativos.filter((v) => primeiraData(v).startsWith(mes));

    const serie = Array.from({ length: 7 }, (_, i) => {
      const dia = iso(addDays(parseISO(h), i - 2));
      const evs = eventos.filter((e) => e.p.data === dia);
      return {
        dia,
        rotulo: DIAS_CURTOS[parseISO(dia).getDay()],
        qtd: evs.length,
        pessoas: evs.reduce((s, e) => s + totalPessoas(e.v), 0),
        hoje: dia === h,
      };
    });

    return {
      doDia,
      proximos,
      serie,
      maxSerie: Math.max(1, ...serie.map((s) => s.pessoas)),
      pessoasHoje: doDia.reduce((s, e) => s + totalPessoas(e.v), 0),
      receitaMes: doMes.reduce((s, v) => s + totalComDesconto(v), 0),
      aReceberTotal: ativos
        .filter((v) => v.status !== "concluido")
        .reduce((s, v) => s + aReceber(v), 0),
      pendentes: vouchers.filter((v) => v.status === "pendente").length,
      totalMes: doMes.length,
    };
  }, [vouchers, h]);

  const LinhaEvento = ({
    v,
    nome,
    data,
    hora,
    local,
  }: {
    v: Voucher;
    nome: string;
    data: string;
    hora: string;
    local: string;
  }) => (
    <li
      onClick={() => ir("vouchers")}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-indigo-50/50"
    >
      <div className="grid w-14 shrink-0 place-items-center rounded-lg bg-indigo-50 py-1.5 text-xs font-extrabold text-indigo-700">
        {hora || dataBR(data).slice(0, 5)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{nomesClientes(v)}</p>
        <p className="truncate text-xs text-slate-500">
          {nome} · {totalPessoas(v)} pax{local ? ` · ${local}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[11px] font-bold text-slate-400">{v.codigo}</p>
        {aReceber(v) > 0 && (
          <p className="text-[11px] font-bold text-amber-600">receber {brl(aReceber(v))}</p>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 p-6 text-white shadow-lg shadow-indigo-600/20 sm:p-8">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-32 -bottom-24 size-56 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-indigo-200 uppercase">
              {config.empresa} · painel de vouchers
            </p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {d.doDia.length
                ? `${d.doDia.length} passeio${d.doDia.length > 1 ? "s" : ""} hoje · ${d.pessoasHoje} pessoas`
                : "Nenhum passeio marcado para hoje"}
            </h1>
            <p className="mt-1.5 text-sm text-indigo-100">
              {d.pendentes} voucher(s) pendente(s) · {brl(d.aReceberTotal)} a receber
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => ir("vouchers")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
            >
              <Icon name="plus" className="size-4" /> Criar voucher
            </button>
            <button
              onClick={() => ir("agenda")}
              className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/25"
            >
              <Icon name="calendar" className="size-4" /> Ver agenda
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icone="ticket"
          rotulo="Vouchers no mês"
          valor={String(d.totalMes)}
          detalhe={`${vouchers.length} no total`}
          cor="bg-indigo-50 text-indigo-600"
        />
        <Kpi
          icone="users"
          rotulo="Pessoas hoje"
          valor={String(d.pessoasHoje)}
          detalhe={`em ${d.doDia.length} passeio(s)`}
          cor="bg-violet-50 text-violet-600"
        />
        <Kpi
          icone="money"
          rotulo="Faturamento do mês"
          valor={brl(d.receitaMes)}
          detalhe="soma dos vouchers do mês"
          cor="bg-emerald-50 text-emerald-600"
        />
        <Kpi
          icone="clock"
          rotulo="A receber"
          valor={brl(d.aReceberTotal)}
          detalhe={`${d.pendentes} voucher(s) pendente(s)`}
          cor="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Cartao className="xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-900">Passeios de hoje</h2>
              <p className="text-xs text-slate-500">{dataBR(h)}</p>
            </div>
            <Botao variante="contorno" icone="calendar" onClick={() => ir("agenda")}>
              Agenda
            </Botao>
          </div>
          {d.doDia.length ? (
            <ul className="space-y-0.5 p-3">
              {d.doDia.map((e) => (
                <LinhaEvento
                  key={e.p.id}
                  v={e.v}
                  nome={e.p.nome}
                  data={e.p.data}
                  hora={e.p.hora}
                  local={e.p.local}
                />
              ))}
            </ul>
          ) : (
            <Vazio
              icone="calendar"
              titulo="Dia livre"
              texto="Nenhum passeio agendado para hoje."
            />
          )}
        </Cartao>

        <Cartao className="p-5">
          <h2 className="font-bold text-slate-900">Pessoas por dia</h2>
          <p className="text-xs text-slate-500">Próximos dias</p>
          <div className="mt-6 flex h-44 items-end justify-between gap-2">
            {d.serie.map((s) => (
              <div key={s.dia} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400">{s.pessoas || ""}</span>
                <div className="flex h-32 w-full items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-all",
                      s.hoje ? "bg-indigo-600" : "bg-indigo-300",
                    )}
                    style={{ height: `${Math.max(4, (s.pessoas / d.maxSerie) * 100)}%` }}
                    title={`${s.pessoas} pessoas`}
                  />
                </div>
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    s.hoje ? "text-indigo-600" : "text-slate-400",
                  )}
                >
                  {s.rotulo}
                </span>
              </div>
            ))}
          </div>
        </Cartao>
      </div>

      <Cartao>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Próximos passeios</h2>
          <button
            onClick={() => ir("vouchers")}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            Ver vouchers
          </button>
        </div>
        {d.proximos.length ? (
          <ul className="divide-y divide-slate-50">
            {d.proximos.map((e) => (
              <li
                key={e.p.id}
                onClick={() => ir("vouchers")}
                className="flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
              >
                <div className="grid w-16 shrink-0 place-items-center rounded-xl bg-slate-100 py-2">
                  <span className="text-sm font-extrabold text-slate-800">
                    {dataBR(e.p.data).slice(0, 5)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">{e.p.hora || "—"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {nomesClientes(e.v)}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {e.p.nome} · {totalPessoas(e.v)} pessoa(s) · {e.v.hotel || "sem hotel"}
                  </p>
                </div>
                <Selo className={statusMeta(e.v.status).chip}>
                  {statusMeta(e.v.status).label}
                </Selo>
                <span className="hidden w-20 text-right text-xs font-bold text-slate-400 sm:block">
                  {rotuloRelativo(e.p.data)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio
            icone="ticket"
            titulo="Nenhum passeio futuro"
            texto="Crie um voucher para começar a organizar a agenda."
            acao={
              <Botao icone="plus" onClick={() => ir("vouchers")}>
                Criar voucher
              </Botao>
            }
          />
        )}
      </Cartao>

      {vouchers.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          Serviço mais vendido:{" "}
          <b className="text-slate-600">
            {nomesPasseios(vouchers[0]) || "—"}
          </b>
        </p>
      )}
    </div>
  );
}
