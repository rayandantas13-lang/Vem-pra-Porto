export type ID = string;

/* ---------------- Autenticação ---------------- */
export type Papel = "admin" | "operador";

export interface Usuario {
  id: ID;
  nome: string;
  email: string;
  usuario: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
  ultimoAcesso?: string;
}

export interface Sessao {
  token: string;
  usuario: Usuario;
  expiraEm: string;
}

/* ---------------- Voucher ---------------- */

/** Um passeio dentro do voucher (serviço + dia + hora). */
export interface Passeio {
  id: ID;
  nome: string;
  data: string;
  hora: string;
  /** Ponto de encontro / observação do passeio */
  local: string;
}

export type StatusVoucher = "pendente" | "confirmado" | "concluido" | "cancelado";

export interface Voucher {
  id: ID;
  codigo: string;
  /** Nomes das pessoas incluídas no serviço */
  clientes: string[];
  pessoas: number;
  hotel: string;
  /** WhatsApp principal, usado para enviar o voucher */
  telefone: string;
  /** Texto livre com outros contatos ("Fone para contato: ...") */
  contatoExtra: string;
  passeios: Passeio[];
  total: number;
  entrada: number;
  formaPagamento: string;
  observacoes: string;
  status: StatusVoucher;
  criadoEm: string;
}

export interface Servico {
  id: ID;
  nome: string;
  preco: number;
}

export interface Config {
  empresa: string;
  cnpj: string;
  instagram: string;
  telefone: string;
  /** Mensagem enviada junto com o PDF do voucher no WhatsApp. Atalhos: {saudacao}, {cliente}, {codigo}, {empresa} */
  mensagemVoucher: string;
  politicaCancelamento: string;
  servicos: Servico[];
}

export interface DadosApi {
  vouchers: Voucher[];
  config: Config;
}
