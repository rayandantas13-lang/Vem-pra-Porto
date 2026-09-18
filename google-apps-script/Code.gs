/**
 * Controle de Vouchers — backend seguro em Google Sheets.
 *
 * Implantação:
 * 1. execute configurarBanco();
 * 2. execute obterChaveInstalacao() e guarde a chave exibida no registro;
 * 3. publique como Aplicativo da Web (executar como "Eu", acesso "Qualquer pessoa").
 *
 * O endereço /exec pode aparecer no DevTools e não é tratado como segredo.
 * A proteção real é feita por autenticação, autorização, sessões com token
 * armazenado somente como hash, limitação de tentativas e validação no servidor.
 */

var ABAS = {
  Usuarios: ['id', 'nome', 'email', 'usuario', 'papel', 'senhaHash', 'salt', 'ativo', 'criadoEm', 'ultimoAcesso'],
  Vouchers: ['id', 'codigo', 'clientes', 'pessoas', 'hotel', 'telefone', 'contatoExtra', 'passeios',
             'servicos', 'datas', 'total', 'tipoDesconto', 'desconto', 'entrada', 'aReceber', 'formaPagamento', 'observacoes', 'status', 'criadoEm'],
  Gastos: ['id', 'descricao', 'categoria', 'valor', 'data', 'observacao', 'criadoEm'],
  Config: ['chave', 'valor', 'atualizadoEm'],
  Sessoes: ['id', 'token', 'usuarioId', 'expiraEm', 'criadoEm'],
  Auditoria: ['id', 'usuarioId', 'usuario', 'acao', 'recurso', 'recursoId', 'detalhes', 'criadoEm']
};

/**
 * Colunas gravadas como NÚMERO de verdade na planilha (e não como texto).
 * Antes tudo ia como string: a célula ficava alinhada à esquerda, não entrava
 * em SOMA/somatórios da própria planilha e herdava qualquer formatação errada
 * da coluna (foi o que fez o valor aparecer como DATA no lugar de número).
 */
var COLUNAS_NUMERICAS = {
  Vouchers: { pessoas: true, total: true, desconto: true, entrada: true, aReceber: true },
  Gastos: { valor: true }
};

/**
 * Teto de sanidade para valores em reais — o mesmo máximo aceito na validação
 * ao salvar. Qualquer coisa acima disso na planilha é lixo de versão antiga ou
 * digitação errada (ex.: aReceber "10.000.000.000.000.000"), nunca um valor
 * negociado de verdade.
 */
var TETO_DINHEIRO = 100000000;

/** Lê dinheiro vindo da planilha preso entre 0 e o teto; NaN/lixo vira 0. */
function dinheiroFolha(v) {
  var n = parseNumeroGs(v);
  if (!isFinite(n) || n < 0) return 0;
  return n > TETO_DINHEIRO ? TETO_DINHEIRO : n;
}

/** true quando a célula é uma DATA de verdade (digitada ou auto-convertida). */
function ehData(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

/**
 * Tipo do desconto lido da planilha. 'fixo' explícito é respeitado; quando o
 * valor passa de 100 SEM marcação, não pode ser porcentagem (a validação
 * nunca deixaria salvar desconto >100%): a pessoa digitou um valor em R$ e
 * ele é tratado como fixo — senão um desconto "249.1" virava 249% e o
 * "a receber" ia a zero/errado.
 */
function tipoDescontoEfetivoGs(tipoBruto, desconto) {
  if (tipoBruto === 'fixo') return 'fixo';
  return desconto > 100 ? 'fixo' : 'percentual';
}

var SEGURANCA = {
  // Enviada ao painel em todas as respostas. Quando o número aqui for menor
  // que o esperado pelo site, o painel avisa que a implantação está velha.
  // v4: desconto (tipoDesconto/desconto) gravado na planilha + migração
  //     automática de abas criadas com layout antigo.
  // v6: sessão persistente de 10 dias (era 8 horas), com renovação automática
  //     pela metade do prazo.
  // v7: a ação "eu" passa a devolver { usuario, expiraEm } para o painel
  //     conseguir renovar a sessão sem novo login.
  // v8: remoção da biometria — login somente com usuário e senha.
  // v9: parseNumeroGs — lê números em formato BR ("R$ 1.234,56") vindos de
  //     edição manual direto na planilha, para o PDF não sair com total/
  //     a receber zerados.
  // v10: alta performance — cache da estrutura do banco (evita re-verificar
  //      todas as 6 abas em cada requisição) e entrega dos dados no próprio
  //      login (elimina a segunda chamada lenta ao entrar).
  // v11: a coluna "aReceber" da planilha passa a ser respeitada: quando o
  //      valor gravado nela difere do cálculo automático (total − desconto −
  //      entrada), ele é tratado como valor manual (negociado) e devolvido ao
  //      painel/PDF em vez de ser ignorado e sobrescrito. parseNumeroGs
  //      também entende "1.200" (ponto de milhar sem vírgula) como 1200.
  // v12: linhas duplicadas com o mesmo id (gravadas por versões antigas ou
  //      edições manuais) não confundem mais o painel: na leitura vale a
  //      ÚLTIMA linha (a mais recente) e, ao salvar, as cópias fantasmas são
  //      removidas da aba.
  // v13: diagnóstico informa o NOME e a URL da planilha conectada ao script
  //      (status e GET) — para descobrir na hora quando se está editando uma
  //      planilha e o Apps Script lendo outra.
  // v14: saneamento dos valores em reais. A leitura passa a ter teto
  //      (R$ 100 milhões): lixo na coluna "aReceber" (ex.:
  //      "10.000.000.000.000.000" no lugar de 1000) deixa de ser tratado
  //      como valor negociado e volta para o cálculo automático — era isso
  //      que fazia o painel somar quatrilhões em vez dos pendentes da
  //      planilha. As colunas de dinheiro passam a ser GRAVADAS como número
  //      de verdade (antes iam como texto) e, na primeira requisição desta
  //      versão, a planilha é reparada: o formato dessas colunas volta para
  //      Automático (estavam exibindo o valor como DATA), linhas duplicadas
  //      com o mesmo id são removidas (fica a mais recente) e um "aReceber"
  //      absurdo vira o cálculo automático (total − desconto − entrada).
  // v15: célula de dinheiro que o Sheets converteu para DATA por engano
  //      (número digitado com ponto, ex.: "1349.1" — em pt-BR o decimal é
  //      vírgula) deixa de ser lida como 0/"pago": na coluna aReceber ela
  //      é ignorada e volta o cálculo automático, e o reparo regrava o
  //      automático no lugar. Desconto digitado sem tipo e acima de 100
  //      (ex.: "249.1") passa a ser tratado como R$ fixo — percentual >100
  //      é dado inválido e antes derrubava o "a receber".
  // v16: preserva números nativos na leitura (189.905 não vira 189905),
  //      calcula dinheiro em centavos e não confunde saldo inválido com zero.
  //      O reparo lê datas ANTES de trocar o formato e usa setNumberFormat:
  //      clearFormat não removia o formato de data das colunas numéricas.
  versao: '16',
  tamanhoMaximoRequisicao: 300000,
  // A sessão vive 10 dias no servidor e é renovada automaticamente quando o
  // painel é aberto a partir da metade do prazo (5 dias).
  horasSessao: 10 * 24,
  maxTentativasLogin: 5,
  bloqueioLoginSegundos: 15 * 60,
  maxRegistrosAuditoria: 5000
};

// Status aceitos pelo app. O 'confirmado' de versões antigas foi removido e é
// tratado como 'pendente' para não quebrar vouchers já gravados na planilha.
var STATUS_VALIDOS = ['pendente', 'concluido', 'cancelado'];

var CONFIG_PADRAO = {
  empresa: 'Vem Pra Porto',
  cnpj: '',
  instagram: '@vempraporto.ps',
  telefone: '',
  mensagemVoucher: '{saudacao}! 🌴 Segue o seu voucher com todos os detalhes do passeio. Qualquer dúvida estamos à disposição. 😊',
  politicaCancelamento: 'Prezados(as),\n\nInformamos que cancelamentos realizados com até 18 horas de antecedência do horário do passeio estarão sujeitos à cobrança integral do valor do passeio.\n\nA exceção será apenas em casos de doença, mediante apresentação de atestado médico válido.\n\nAgradecemos pela compreensão e permanecemos à disposição.',
  servicos: JSON.stringify([
    {
      id: 's1',
      nome: 'Praia do Espelho + Caraíva',
      preco: 300,
      oQueLevar: '• Protetor solar, boné/chapéu\n• Roupa de banho + toalha\n• Câmera / celular carregado\n• Dinheiro / cartão para compras',
      pontoRetorno: 'Retorno previsto no mesmo ponto de embarque (Hotel / Pousada). Horário aproximado de retorno: conforme roteiro.',
      informacoesAdicionais: 'Em caso de atraso ou imprevisto, entre em contato com nossa central pelo WhatsApp da empresa. Obrigado por escolher a Vem Pra Porto!'
    },
    {
      id: 's2',
      nome: 'Trancoso + Quadrado',
      preco: 180,
      oQueLevar: '• Protetor solar, boné/chapéu\n• Calçado confortável\n• Câmera / celular carregado\n• Dinheiro / cartão para compras',
      pontoRetorno: 'Retorno previsto no mesmo ponto de embarque (Hotel / Pousada). Horário aproximado de retorno: conforme roteiro.',
      informacoesAdicionais: 'Em caso de atraso ou imprevisto, entre em contato com nossa central pelo WhatsApp da empresa. Obrigado por escolher a Vem Pra Porto!'
    },
    {
      id: 's3',
      nome: "Arraial d'Ajuda",
      preco: 150,
      oQueLevar: '• Protetor solar, boné/chapéu\n• Roupa de banho + toalha\n• Dinheiro / cartão para compras',
      pontoRetorno: 'Retorno previsto no mesmo ponto de embarque (Hotel / Pousada). Horário aproximado de retorno: conforme roteiro.',
      informacoesAdicionais: 'Em caso de atraso ou imprevisto, entre em contato com nossa central pelo WhatsApp da empresa. Obrigado por escolher a Vem Pra Porto!'
    }
  ])
};

/* ---------------- Entrada HTTP ---------------- */

/**
 * GET não executa ações nem recebe credenciais: serve apenas para o painel
 * confirmar que a implantação está no ar. Se o navegador receber HTML ou 404
 * aqui, a implantação está desatualizada ou não está aberta a "Qualquer pessoa".
 */
function doGet() {
  return responder({ ok: true, data: { servico: 'Controle de Vouchers', versao: SEGURANCA.versao, planilha: infoPlanilha() } });
}

/**
 * Nome e URL da planilha à qual este script está conectado. O Apps Script é
 * "presado" à planilha onde foi criado; se a pessoa edita outra planilha (uma
 * cópia, por exemplo), os valores nunca chegam ao site. Exibir isso no
 * diagnóstico revela o problema na hora. Não é dado sensível: é a planilha
 * do próprio dono do sistema.
 */
function infoPlanilha() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss ? { nome: ss.getName(), url: ss.getUrl() } : null;
  } catch (e) {
    return null;
  }
}

function doPost(e) {
  var conteudo = (e && e.postData && e.postData.contents) || '';
  if (!conteudo || conteudo.length > SEGURANCA.tamanhoMaximoRequisicao) {
    return responder({ ok: false, error: 'Requisição inválida ou muito grande.' });
  }

  var body = {};
  try {
    body = JSON.parse(conteudo);
  } catch (err) {
    return responder({ ok: false, error: 'JSON inválido.' });
  }
  return responder(processar(body));
}

function responder(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function processar(req) {
  try {
    garantirBancoConfigurado();
    if (!req || Object.prototype.toString.call(req) !== '[object Object]')
      throw new Error('Requisição inválida.');

    var acao = texto(req.acao, 40, true, 'Ação');

    // Somente estas três ações existem antes da autenticação.
    if (acao === 'status') return ok({ temAdmin: temAdmin(), versao: SEGURANCA.versao, planilha: infoPlanilha() });
    if (acao === 'criarPrimeiroAdmin') return ok(criarPrimeiroAdmin(req));
    if (acao === 'entrar') return ok(entrar(req));

    var auth = exigirSessao(req.token);

    switch (acao) {
      case 'eu': {
        // Abre o painel perto do fim da validade (além da metade) estica a
        // sessão por mais 10 dias, sem precisar digitar a senha de novo.
        var sessaoAtual = auth.sessao;
        var expiraEm = sessaoAtual.expiraEm;
        var agoraMs = Date.now();
        var totalMs = SEGURANCA.horasSessao * 60 * 60 * 1000;
        var metadeMs = totalMs / 2;
        var criadaEm = sessaoAtual.criadoEm ? new Date(sessaoAtual.criadoEm).getTime() : agoraMs - totalMs;
        if (agoraMs - criadaEm >= metadeMs) {
          var novaExpira = new Date(agoraMs + totalMs).toISOString();
          sessaoAtual.expiraEm = novaExpira;
          gravar('Sessoes', sessaoAtual);
          expiraEm = novaExpira;
        }
        return ok({ usuario: publico(auth.usuario), expiraEm: expiraEm });
      }

      case 'sair':
        auditar(auth.usuario, 'SAIR', 'Sessao', auth.sessao.id, 'Sessão encerrada');
        remover('Sessoes', auth.sessao.id);
        return ok(null);

      case 'dados':
        return ok({ vouchers: lerVouchers(), gastos: lerGastos(), config: lerConfig(), versao: SEGURANCA.versao });

      case 'salvarVoucher': {
        var voucher = salvarVoucher(req.voucher);
        auditar(auth.usuario, 'SALVAR', 'Voucher', voucher.id, voucher.codigo);
        return ok(voucher);
      }

      case 'removerVoucher': {
        var voucherId = identificador(req.id, 'Voucher');
        remover('Vouchers', voucherId);
        auditar(auth.usuario, 'REMOVER', 'Voucher', voucherId, '');
        return ok(null);
      }

      case 'salvarGasto': {
        var gasto = salvarGasto(req.gasto);
        auditar(auth.usuario, 'SALVAR', 'Gasto', gasto.id, gasto.descricao);
        return ok(gasto);
      }

      case 'removerGasto': {
        var gastoId = identificador(req.id, 'Gasto');
        remover('Gastos', gastoId);
        auditar(auth.usuario, 'REMOVER', 'Gasto', gastoId, '');
        return ok(null);
      }

      case 'salvarConfig': {
        exigirAdmin(auth.usuario);
        var config = salvarConfig(req.config);
        auditar(auth.usuario, 'SALVAR', 'Config', 'geral', 'Configurações atualizadas');
        return ok(config);
      }

      case 'listarUsuarios':
        exigirAdmin(auth.usuario);
        return ok(registros('Usuarios').map(publico));

      case 'criarUsuario': {
        exigirAdmin(auth.usuario);
        var usuarioNovo = criarUsuario(req.usuarioNovo);
        auditar(auth.usuario, 'CRIAR', 'Usuario', usuarioNovo.id, usuarioNovo.usuario);
        return ok(usuarioNovo);
      }

      case 'alternarUsuario': {
        exigirAdmin(auth.usuario);
        var usuarioAlterado = alternarUsuario(auth.usuario, req.id, req.ativo);
        auditar(
          auth.usuario,
          usuarioAlterado.ativo ? 'ATIVAR' : 'DESATIVAR',
          'Usuario',
          usuarioAlterado.id,
          usuarioAlterado.usuario
        );
        return ok(usuarioAlterado);
      }

      default:
        throw new Error('Ação não permitida.');
    }
  } catch (err) {
    // Nunca devolve stack trace, nomes de abas ou detalhes internos ao navegador.
    return { ok: false, error: mensagemErro(err) };
  }
}

function ok(data) {
  return { ok: true, data: data };
}

function mensagemErro(err) {
  var msg = err && err.message ? String(err.message) : 'Não foi possível concluir a operação.';
  return msg.length <= 240 ? msg : 'Não foi possível concluir a operação.';
}

/* ---------------- Planilha ---------------- */

function garantirBancoConfigurado() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('banco_versao') === SEGURANCA.versao) {
    return;
  }
  configurarBanco();
}

function configurarBanco() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(function (nome) {
    var abaAtual = ss.getSheetByName(nome) || ss.insertSheet(nome);
    if (abaAtual.getLastRow() === 0) {
      abaAtual.getRange(1, 1, 1, ABAS[nome].length).setValues([ABAS[nome]]);
      abaAtual.setFrozenRows(1);
      abaAtual.getRange(1, 1, 1, ABAS[nome].length).setFontWeight('bold');
    } else {
      migrarCabecalho(abaAtual, nome);
    }
  });

  inicializarSegredos();

  if (registros('Config').length === 0) {
    Object.keys(CONFIG_PADRAO).forEach(function (chave) {
      gravar('Config', { chave: chave, valor: CONFIG_PADRAO[chave], atualizadoEm: agora() });
    });
  }

  try {
    repararValoresNumericos();
  } catch (e) {
    // Um problema na limpeza nunca pode derrubar o painel; dá para rodar
    // repararPlanilha() à mão no editor do Apps Script depois.
    Logger.log('repararValoresNumericos falhou: ' + e);
  }

  PropertiesService.getScriptProperties().setProperty('banco_versao', SEGURANCA.versao);
}

/**
 * Atualiza abas criadas por versões antigas do Code.gs para o esquema atual.
 *
 * O cabeçalho só era escrito quando a aba nascia vazia; por isso planilhas
 * antigas podem não ter as colunas novas (ex.: tipoDesconto e desconto). Com
 * o cabeçalho defasado, cada gravação posiciona os valores pelo esquema ATUAL
 * enquanto a leitura de linhas antigas usa o esquema em que foram gravadas —
 * era isso que fazia o desconto "sumir" depois de salvar.
 *
 * A migração compara o cabeçalho com ABAS e, se estiver diferente, reescreve
 * o cabeçalho e move cada valor para a coluna de mesmo nome. Colunas novas
 * nascem vazias; colunas que não existem mais são descartadas. Roda sozinha
 * na primeira requisição após reimplantar o Code.gs novo.
 */
function migrarCabecalho(s, nome) {
  var cols = ABAS[nome];
  var ultimaLinha = s.getLastRow();
  var largura = Math.max(s.getLastColumn(), cols.length);

  var cabAtual = s.getRange(1, 1, 1, largura).getValues()[0].map(function (c) {
    return String(c === null || c === undefined ? '' : c).trim();
  });

  var igual = cabAtual.length === cols.length;
  for (var c = 0; igual && c < cols.length; c++) {
    if (cabAtual[c] !== cols[c]) igual = false;
  }
  if (igual) return;

  var linhas = ultimaLinha > 1 ? s.getRange(2, 1, ultimaLinha - 1, largura).getValues() : [];
  var novas = linhas
    .filter(function (linha) {
      return linha.some(function (v) { return v !== '' && v !== null; });
    })
    .map(function (linha) {
      return cols.map(function (col) {
        var origem = cabAtual.indexOf(col);
        var valor = origem >= 0 ? linha[origem] : '';
        return valor === null || valor === undefined ? '' : valor;
      });
    });

  s.getRange(1, 1, ultimaLinha, largura).clearContent();
  s.getRange(1, 1, 1, cols.length).setValues([cols]);
  s.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  s.setFrozenRows(1);
  if (novas.length) s.getRange(2, 1, novas.length, cols.length).setValues(novas);
}

/**
 * Execute manualmente no editor do Apps Script antes do primeiro acesso.
 * A chave também aparece no registro de execução e é apagada após criar o admin.
 */
function obterChaveInstalacao() {
  configurarBanco();
  if (temAdmin()) {
    Logger.log('O administrador principal já foi criado.');
    return 'O administrador principal já foi criado.';
  }
  var chave = PropertiesService.getScriptProperties().getProperty('SETUP_KEY');
  Logger.log('CHAVE DE INSTALAÇÃO: ' + chave);
  return chave;
}

function inicializarSegredos() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SESSION_PEPPER'))
    props.setProperty('SESSION_PEPPER', aleatorioSeguro());
  if (!props.getProperty('PASSWORD_PEPPER'))
    props.setProperty('PASSWORD_PEPPER', aleatorioSeguro());
  if (!temAdmin() && !props.getProperty('SETUP_KEY'))
    props.setProperty('SETUP_KEY', gerarChaveInstalacao());
}

function aleatorioSeguro() {
  return [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join('-');
}

function gerarChaveInstalacao() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32).toUpperCase();
}

function segredo(nome) {
  var valor = PropertiesService.getScriptProperties().getProperty(nome);
  if (!valor) throw new Error('Configuração de segurança ausente. Execute configurarBanco().');
  return valor;
}

function aba(nome) {
  if (!ABAS[nome]) throw new Error('Operação de banco inválida.');
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!s) throw new Error('Banco de dados não configurado.');
  return s;
}

function registros(nome) {
  var s = aba(nome);
  var ultima = s.getLastRow();
  if (ultima < 2) return [];
  var cols = ABAS[nome];
  return s.getRange(2, 1, ultima - 1, cols.length).getValues()
    .filter(function (linha) {
      return linha.some(function (v) { return v !== '' && v !== null; });
    })
    .map(function (linha) {
      var reg = {};
      cols.forEach(function (col, i) {
        // Só textos digitados passam pelo parser BR. Converter um número
        // nativo para texto fazia 189.905 virar "189.905" e depois 189905.
        var numerica = COLUNAS_NUMERICAS[nome] && COLUNAS_NUMERICAS[nome][col];
        reg[col] = numerica && typeof linha[i] === 'number' ? linha[i] : lerCelula(linha[i]);
      });
      return reg;
    });
}

/** Impede que texto controlado pelo usuário vire fórmula no Google Sheets. */
function valorCelula(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  var valor = String(v);
  return /^[=+\-@]/.test(valor) ? "'" + valor : valor;
}

function lerCelula(v) {
  if (v === null || v === undefined) return '';
  // Datas passam intactas: as leituras de dinheiro precisam reconhecer uma
  // célula que virou DATA por engano (ex.: número digitado com ponto, tipo
  // "1349.1", que o Sheets em pt-BR pode converter para data) para ignorá-la
  // em vez de lê-la como zero. Na gravação nada muda: o app nunca escreve
  // datas nessas colunas e String(data) continua disponível onde precisa.
  if (ehData(v)) return v;
  var valor = String(v);
  return /^'[=+\-@]/.test(valor) ? valor.slice(1) : valor;
}

function formatoNumeroGs(col) {
  if (col === 'pessoas') return '0';
  // Percentuais podem ter mais casas; o desconto em R$ é arredondado no cálculo.
  return col === 'desconto' ? '0.##########' : '0.00';
}

function gravar(nome, registro) {
  if (!registro || typeof registro !== 'object') throw new Error('Registro inválido.');
  var s = aba(nome);
  var cols = ABAS[nome];
  var chaveCol = nome === 'Config' ? 'chave' : 'id';
  if (nome !== 'Config' && !registro.id) registro.id = Utilities.getUuid();
  var chave = String(registro[chaveCol] || '');
  if (!chave) throw new Error('Registro sem identificador.');

  var idx = cols.indexOf(chaveCol);
  var ultima = s.getLastRow();
  var linhas = ultima > 1 ? s.getRange(2, 1, ultima - 1, cols.length).getValues() : [];
  // Todas as linhas com este id: a ÚLTIMA é a vigente (é ela que o painel
  // mostra); se houver cópias fantasmas de versões antigas, elas são
  // apagadas agora para o banco não ficar com dado duplicado.
  var alvos = [];
  for (var i = 0; i < linhas.length; i++) {
    if (lerCelula(linhas[i][idx]) === chave) alvos.push(i + 2);
  }
  var alvo = alvos.length ? alvos[alvos.length - 1] : -1;
  for (var d = alvos.length - 2; d >= 0; d--) s.deleteRow(alvos[d]);
  if (alvo !== -1) alvo -= alvos.length - 1;

  var valores = cols.map(function (col) {
    // Colunas de dinheiro viram NÚMERO na célula: texto "1000" não entra em
    // SOMA da planilha e some/exibe errado conforme a formatação da coluna.
    if (COLUNAS_NUMERICAS[nome] && COLUNAS_NUMERICAS[nome][col]) {
      var n = parseNumeroGs(registro[col]);
      if (isFinite(n)) return n;
    }
    return valorCelula(registro[col]);
  });
  var destino = alvo === -1 ? s.getLastRow() + 1 : alvo;
  if (alvo === -1) s.appendRow(valores);
  else s.getRange(alvo, 1, 1, cols.length).setValues([valores]);
  // Formata DEPOIS do appendRow, que pode precisar expandir a planilha.
  // Mesmo se a coluna foi formatada como data após a migração, a linha
  // gravada pelo app deve continuar sendo dinheiro, não uma data.
  cols.forEach(function (col, i) {
    if (COLUNAS_NUMERICAS[nome] && COLUNAS_NUMERICAS[nome][col])
      s.getRange(destino, i + 1).setNumberFormat(formatoNumeroGs(col));
  });
  return registro;
}

function remover(nome, id) {
  var s = aba(nome);
  var cols = ABAS[nome];
  var idx = cols.indexOf('id');
  var ultima = s.getLastRow();
  if (idx < 0 || ultima < 2) return null;
  var linhas = s.getRange(2, 1, ultima - 1, cols.length).getValues();
  for (var i = linhas.length - 1; i >= 0; i--) {
    if (lerCelula(linhas[i][idx]) === String(id)) s.deleteRow(i + 2);
  }
  return null;
}

/**
 * Mantém apenas a ocorrência MAIS RECENTE de cada id, preservando a ordem.
 * Versões antigas e edições manuais podem deixar duas linhas com o mesmo id
 * na aba; sem isso o painel mostrava a linha VELHA (com valores zerados ou
 * trocados) no lugar da que a pessoa acabou de corrigir na planilha.
 */
function ultimosPorId(lista) {
  var posicao = {};
  var saida = [];
  for (var i = 0; i < lista.length; i++) {
    var id = String(lista[i].id);
    if (posicao[id] === undefined) {
      posicao[id] = saida.length;
      saida.push(lista[i]);
    } else {
      saida[posicao[id]] = lista[i];
    }
  }
  return saida;
}

function porId(nome, id) {
  var lista = registros(nome);
  var achado = null;
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].id) === String(id)) achado = lista[i];
  }
  return achado;
}

/* ---------------- Reparo dos dados da planilha ---------------- */

/**
 * Pode ser executada à mão no editor do Apps Script (botão ▶ Executar) para
 * refazer a limpeza sem precisar reimplantar/trocar versão.
 */
function repararPlanilha() {
  repararValoresNumericos();
  Logger.log('Reparo concluído: colunas de dinheiro saneadas.');
}

/**
 * Saneamento rodado sozinho na primeira requisição de cada versão nova do
 * Code.gs (via configurarBanco), em duas frentes:
 *
 * 1) FORMATO: as colunas de dinheiro recebem formato numérico explícito,
 *    inclusive nas linhas vazias. clearFormat não redefinia formatos de data.
 *    O conteúdo é lido ANTES da mudança para distinguir datas de dinheiro;
 *    depois da mudança uma data viraria um número serial aparentemente válido.
 *    Cores, fontes e cabeçalho são preservados.
 * 2) CONTEÚDO: as linhas são regravadas com dinheiro como NÚMERO de verdade;
 *    linhas duplicadas com o mesmo id saem (fica a ÚLTIMA, a mesma que o
 *    painel mostra) e um "aReceber" absurdo (acima do teto — lixo de versão
 *    antiga/digitação, tipo "10.000.000.000.000.000") volta para o cálculo
 *    automático (total − desconto − entrada). Um valor manual normal
 *    (≤ teto), mesmo diferente do cálculo, continua respeitado.
 */
function repararValoresNumericos() {
  Object.keys(COLUNAS_NUMERICAS).forEach(function (nome) {
    repararAbaDinheiro(nome);
  });
}

function repararAbaDinheiro(nome) {
  var s = aba(nome);
  var cols = ABAS[nome];
  var numericas = COLUNAS_NUMERICAS[nome] || {};
  var ultima = s.getLastRow();

  // Capture os tipos originais: mudar o formato primeiro esconde células-data.
  var dados = ultima > 1 ? s.getRange(2, 1, ultima - 1, cols.length).getValues() : [];

  // (1) Formato numérico de verdade nas colunas de dinheiro.
  var maxLinhas = Math.max(s.getMaxRows(), 2);
  cols.forEach(function (col, i) {
    if (!numericas[col]) return;
    try {
      s.getRange(2, i + 1, maxLinhas - 1, 1).setNumberFormat(formatoNumeroGs(col));
    } catch (e) {
      // Falha de formato não interrompe o reparo do conteúdo.
      Logger.log('setNumberFormat ' + nome + '.' + col + ': ' + e);
    }
  });

  if (ultima < 2) return;

  // (2) Regrava o conteúdo saneado que foi lido antes de mudar os formatos.
  var idxId = cols.indexOf('id');
  var jaVistos = {};
  var manter = new Array(dados.length);
  for (var i = dados.length - 1; i >= 0; i--) {
    var vazia = !dados[i].some(function (v) { return v !== '' && v !== null; });
    if (vazia) {
      manter[i] = false;
      continue;
    }
    var id = idxId >= 0 ? String(dados[i][idxId] || '') : '';
    // Vale a ÚLTIMA linha de cada id — a mesma que o painel exibe.
    if (id && jaVistos[id]) manter[i] = false;
    else {
      manter[i] = true;
      if (id) jaVistos[id] = true;
    }
  }

  var saida = [];
  for (var r = 0; r < dados.length; r++) {
    if (!manter[r]) continue;
    saida.push(
      nome === 'Vouchers'
        ? repararLinhaVoucher(dados[r], cols)
        : repararLinhaGenerica(dados[r], cols, numericas)
    );
  }

  s.getRange(2, 1, ultima - 1, cols.length).clearContent();
  if (saida.length) s.getRange(2, 1, saida.length, cols.length).setValues(saida);
  var sobra = ultima - 1 - saida.length;
  if (sobra > 0) s.deleteRows(2 + saida.length, sobra);
}

/**
 * Linha de voucher regravada com pessoas/total/desconto/entrada/aReceber
 * saneados. O "aReceber" manual só é mantido quando é um dinheiro válido
 * dentro do teto; vazio, NaN ou absurdo volta para o cálculo automático.
 */
function repararLinhaVoucher(linha, cols) {
  var pos = {};
  cols.forEach(function (col, i) {
    pos[col] = i;
  });

  var desconto = dinheiroFolha(linha[pos.desconto]);
  var tipo = tipoDescontoEfetivoGs(String(linha[pos.tipoDesconto]), desconto);
  if (tipo === 'fixo') desconto = arredondarDinheiroGs(desconto);
  var total = arredondarDinheiroGs(dinheiroFolha(linha[pos.total]));
  var entrada = arredondarDinheiroGs(dinheiroFolha(linha[pos.entrada]));
  if (entrada > total) total = entrada;
  var calculado = aReceberAutomaticoGs(total, tipo, desconto, entrada);
  var manual = aReceberManualGs(linha[pos.aReceber], calculado);
  var aReceberNovo = manual === null ? calculado : manual;

  var pessoas = Math.max(1, Math.round(parseNumeroGs(linha[pos.pessoas]))) || 1;

  return cols.map(function (col) {
    if (col === 'pessoas') return pessoas;
    if (col === 'total') return total;
    if (col === 'desconto') return desconto;
    if (col === 'tipoDesconto') return tipo;
    if (col === 'entrada') return entrada;
    if (col === 'aReceber') return aReceberNovo;
    return linha[pos[col]];
  });
}

/** Demais abas com coluna de dinheiro (Gastos): só saneia o número. */
function repararLinhaGenerica(linha, cols, numericas) {
  return cols.map(function (col, i) {
    return numericas[col] ? arredondarDinheiroGs(dinheiroFolha(linha[i])) : linha[i];
  });
}

function booleano(v) {
  return String(v).toLowerCase() === 'true' || String(v) === '1';
}

/**
 * Mesmo parser do painel (parseNumeroOpcional). Ausência ou dado inválido é
 * null, não zero: isso é essencial para não transformar lixo em saldo quitado.
 * Só strings usam a regra de milhar; números nativos preservam a precisão.
 */
function parseNumeroOpcionalGs(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  var texto = v.trim().replace(/^R\$\s*/i, '').trim();
  if (!texto) return null;

  var normalizado = texto;
  if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(texto)) {
    normalizado = texto.replace(/\./g, '');
  } else if (/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d*),\d*$/.test(texto)) {
    normalizado = texto.replace(/\./g, '').replace(',', '.');
  } else if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(texto)) {
    return null;
  }
  var n = Number(normalizado);
  return isFinite(n) ? n : null;
}

function parseNumeroGs(v) {
  var n = parseNumeroOpcionalGs(v);
  return n === null ? 0 : n;
}

function arredondarDinheiroGs(n) {
  return Math.round((n + Number.EPSILON * Math.max(1, Math.abs(n))) * 100) / 100;
}

/** Total, desconto em reais e entrada usam os mesmos centavos exibidos no PDF. */
function totalComDescontoGs(total, tipo, desconto) {
  total = arredondarDinheiroGs(total);
  return arredondarDinheiroGs(Math.max(0, total - descontoValorGs(total, tipo, desconto)));
}

function aReceberAutomaticoGs(total, tipo, desconto, entrada) {
  return arredondarDinheiroGs(Math.max(0,
    totalComDescontoGs(total, tipo, desconto) - arredondarDinheiroGs(entrada)
  ));
}

/** Manual válido diferente do cálculo; null mantém o saldo automático. */
function aReceberManualGs(bruto, calculado) {
  var n = parseNumeroOpcionalGs(bruto);
  if (n === null || n < 0 || n > TETO_DINHEIRO) return null;
  // Compara ANTES de arredondar. Saldos automáticos antigos podiam guardar
  // meio centavo (189.905); não devem virar ajustes manuais na migração.
  var tolerancia = 0.005 + Number.EPSILON * Math.max(1, n, calculado);
  if (Math.abs(n - calculado) <= tolerancia) return null;
  return arredondarDinheiroGs(n);
}

function jsonSeguro(valor, padrao) {
  try {
    var v = JSON.parse(valor || '');
    return v || padrao;
  } catch (e) {
    return padrao;
  }
}

/* ---------------- Validação ---------------- */

function texto(valor, maximo, obrigatorio, rotulo) {
  if (valor !== null && typeof valor === 'object') throw new Error((rotulo || 'Campo') + ' inválido.');
  var saida = String(valor === undefined || valor === null ? '' : valor).trim();
  if (obrigatorio && !saida) throw new Error((rotulo || 'Campo') + ' é obrigatório.');
  if (saida.length > maximo) throw new Error((rotulo || 'Campo') + ' excede o limite permitido.');
  return saida;
}

function identificador(valor, rotulo) {
  var id = texto(valor, 100, true, rotulo || 'Identificador');
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error((rotulo || 'Identificador') + ' inválido.');
  return id;
}

function numero(valor, minimo, maximo, rotulo) {
  // Aceita número puro OU formato brasileiro ("R$ 1.234,56"), para não dar erro
  // se alguém copiar/colar um valor com máscara no campo.
  var n = parseNumeroOpcionalGs(valor);
  if (n === null || n < minimo || n > maximo)
    throw new Error((rotulo || 'Número') + ' inválido.');
  return n;
}

/** Valor do desconto em reais sobre o total (aceita % ou valor fixo R$). */
function descontoValorGs(total, tipo, valor) {
  if (valor <= 0) return 0;
  return arredondarDinheiroGs(tipo === 'fixo' ? Math.min(valor, total) : total * (valor / 100));
}

function lista(valor, maximo, rotulo) {
  if (Object.prototype.toString.call(valor) !== '[object Array]')
    throw new Error((rotulo || 'Lista') + ' inválida.');
  if (valor.length > maximo) throw new Error((rotulo || 'Lista') + ' excede o limite permitido.');
  return valor;
}

function dataSegura(valor) {
  var data = texto(valor, 10, true, 'Data');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data inválida.');
  return data;
}

/** Igual a dataSegura, mas aceita vazio — usado na data de volta. */
function dataOpcional(valor) {
  var data = texto(valor, 10, false, 'Data');
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Data inválida.');
  return data;
}

function horaSegura(valor) {
  var hora = texto(valor, 5, false, 'Hora');
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error('Hora inválida.');
  return hora;
}

function limparVoucher(v) {
  if (!v || Object.prototype.toString.call(v) !== '[object Object]')
    throw new Error('Voucher inválido.');

  var clientes = lista(v.clientes, 50, 'Clientes').map(function (nome) {
    return texto(nome, 120, true, 'Nome do cliente');
  });
  if (!clientes.length) throw new Error('Informe pelo menos um cliente.');

  var passeios = lista(v.passeios, 30, 'Passeios').map(function (p) {
    if (!p || Object.prototype.toString.call(p) !== '[object Object]')
      throw new Error('Passeio inválido.');
    // Todos os campos preenchidos na tela precisam ser gravados. Qualquer campo
    // ausente aqui é silenciosamente descartado e some do voucher e do PDF.
    return {
      id: p.id ? identificador(p.id, 'Passeio') : Utilities.getUuid(),
      nome: texto(p.nome, 160, true, 'Nome do passeio'),
      data: dataSegura(p.data),
      hora: horaSegura(p.hora),
      dataVolta: dataOpcional(p.dataVolta),
      horaVolta: horaSegura(p.horaVolta),
      local: texto(p.local, 250, false, 'Ponto de encontro'),
      oQueLevar: texto(p.oQueLevar || '', 1000, false, 'O que levar'),
      informacoesAdicionais: texto(p.informacoesAdicionais || '', 2000, false, 'Informações adicionais')
    };
  });
  if (!passeios.length) throw new Error('Informe pelo menos um passeio.');

  var status = texto(v.status || 'pendente', 20, true, 'Status');
  // Clientes/abas antigas podem ainda enviar 'confirmado'; trata como pendente.
  if (status === 'confirmado') status = 'pendente';
  if (STATUS_VALIDOS.indexOf(status) === -1)
    throw new Error('Status inválido.');

  var codigo = texto(v.codigo, 30, true, 'Código').toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(codigo)) throw new Error('Código do voucher inválido.');

  var criadoEm = texto(v.criadoEm || agora(), 40, true, 'Data de criação');
  if (isNaN(new Date(criadoEm).getTime())) criadoEm = agora();

  var total = arredondarDinheiroGs(numero(v.total || 0, 0, TETO_DINHEIRO, 'Valor total'));
  var entrada = arredondarDinheiroGs(numero(v.entrada || 0, 0, total, 'Valor da entrada'));
  var tipoDesconto = v.tipoDesconto === 'fixo' ? 'fixo' : 'percentual';
  var desconto = numero(v.desconto || 0, 0, TETO_DINHEIRO, 'Desconto');
  if (tipoDesconto === 'fixo') desconto = arredondarDinheiroGs(desconto);
  if (desconto > 0 && tipoDesconto === 'percentual' && desconto > 100)
    throw new Error('Desconto percentual não pode passar de 100%.');
  // "A receber" manual: presente apenas quando o painel definiu um valor
  // próprio (ou carregou um valor manual da planilha). null/ausente mantém o
  // cálculo automático (total − desconto − entrada) na hora de gravar.
  var aReceberManual = null;
  if (v.aReceber !== undefined && v.aReceber !== null)
    aReceberManual = arredondarDinheiroGs(numero(v.aReceber, 0, TETO_DINHEIRO, 'Valor a receber'));

  return {
    id: identificador(v.id, 'Voucher'),
    codigo: codigo,
    clientes: clientes,
    pessoas: Math.floor(numero(v.pessoas || clientes.length, 1, 1000, 'Quantidade de pessoas')),
    hotel: texto(v.hotel, 200, false, 'Hotel'),
    telefone: texto(v.telefone, 40, false, 'Telefone'),
    contatoExtra: texto(v.contatoExtra, 300, false, 'Contato adicional'),
    passeios: passeios,
    total: total,
    tipoDesconto: tipoDesconto,
    desconto: desconto,
    entrada: entrada,
    aReceber: aReceberManual,
    formaPagamento: texto(v.formaPagamento, 200, false, 'Forma de pagamento'),
    observacoes: texto(v.observacoes, 2000, false, 'Observações'),
    status: status,
    criadoEm: criadoEm
  };
}

function limparConfig(config) {
  if (!config || Object.prototype.toString.call(config) !== '[object Object]')
    throw new Error('Configuração inválida.');

  var servicos = lista(config.servicos || [], 200, 'Serviços').map(function (s) {
    if (!s || Object.prototype.toString.call(s) !== '[object Object]')
      throw new Error('Serviço inválido.');
    return {
      id: s.id ? identificador(s.id, 'Serviço') : Utilities.getUuid(),
      nome: texto(s.nome, 160, true, 'Nome do serviço'),
      preco: numero(s.preco || 0, 0, 100000000, 'Preço do serviço'),
      oQueLevar: texto(s.oQueLevar || '', 1000, false, 'O que levar'),
      pontoRetorno: texto(s.pontoRetorno || '', 1000, false, 'Ponto de retorno'),
      informacoesAdicionais: texto(s.informacoesAdicionais || '', 2000, false, 'Informações adicionais')
    };
  });

  return {
    empresa: texto(config.empresa, 160, true, 'Nome da empresa'),
    cnpj: texto(config.cnpj, 30, false, 'CNPJ'),
    instagram: texto(config.instagram, 100, false, 'Instagram'),
    telefone: texto(config.telefone, 40, false, 'Telefone'),
    mensagemVoucher: texto(config.mensagemVoucher, 2000, false, 'Mensagem do voucher'),
    politicaCancelamento: texto(config.politicaCancelamento, 10000, false, 'Política de cancelamento'),
    servicos: servicos
  };
}

/* ---------------- Vouchers ---------------- */

function lerVouchers() {
  return ultimosPorId(registros('Vouchers')).map(function (v) {
    var total = arredondarDinheiroGs(dinheiroFolha(v.total));
    var entrada = arredondarDinheiroGs(dinheiroFolha(v.entrada));
    var desconto = dinheiroFolha(v.desconto);
    var pessoas = Math.max(1, Math.round(parseNumeroGs(v.pessoas))) || 1;
    if (entrada > total) total = entrada;
    var tipoDesconto = tipoDescontoEfetivoGs(v.tipoDesconto, desconto);
    if (tipoDesconto === 'fixo') desconto = arredondarDinheiroGs(desconto);
    var calculado = aReceberAutomaticoGs(total, tipoDesconto, desconto, entrada);
    // Preserva o tipo original. String(189.905) seria confundido com milhar.
    // Vazio, texto inválido, data, negativo e valor acima do teto usam o cálculo.
    var manual = aReceberManualGs(v.aReceber, calculado);
    var saida = {
      id: v.id,
      codigo: v.codigo,
      clientes: jsonSeguro(v.clientes, v.clientes ? [v.clientes] : []),
      pessoas: pessoas,
      hotel: v.hotel,
      telefone: v.telefone,
      contatoExtra: v.contatoExtra,
      passeios: jsonSeguro(v.passeios, []),
      total: total,
      tipoDesconto: tipoDesconto,
      desconto: desconto,
      entrada: entrada,
      formaPagamento: v.formaPagamento,
      observacoes: v.observacoes,
      // Nunca devolve um status desconhecido (ex.: 'confirmado' de versões
      // antigas) para o app — isso derrubava a tela de Vouchers.
      status: STATUS_VALIDOS.indexOf(v.status) !== -1 ? v.status : 'pendente',
      criadoEm: v.criadoEm
    };
    if (manual !== null) saida.aReceber = manual;
    return saida;
  });
}

function salvarVoucher(entrada) {
  var v = limparVoucher(entrada);
  var servicos = v.passeios.map(function (p) { return p.nome; }).filter(String).join(' + ');
  var datas = v.passeios.map(function (p) { return p.data; }).filter(String).sort().join(' | ');

  // Sem valor manual, a coluna "aReceber" guarda o cálculo automático; com
  // valor manual (digitado no painel ou direto na planilha), preserva o que
  // a pessoa definiu — senão qualquer gravação sobrescrevia o valor dela.
  var aReceberColuna =
    v.aReceber !== undefined && v.aReceber !== null
      ? v.aReceber
      : aReceberAutomaticoGs(v.total, v.tipoDesconto, v.desconto, v.entrada);

  gravar('Vouchers', {
    id: v.id,
    codigo: v.codigo,
    clientes: JSON.stringify(v.clientes),
    pessoas: v.pessoas,
    hotel: v.hotel,
    telefone: v.telefone,
    contatoExtra: v.contatoExtra,
    passeios: JSON.stringify(v.passeios),
    servicos: servicos,
    datas: datas,
    total: v.total,
    tipoDesconto: v.tipoDesconto,
    desconto: v.desconto,
    entrada: v.entrada,
    aReceber: aReceberColuna,
    formaPagamento: v.formaPagamento,
    observacoes: v.observacoes,
    status: v.status,
    criadoEm: v.criadoEm
  });
  return v;
}

/* ---------------- Gastos operacionais ---------------- */

function lerGastos() {
  return ultimosPorId(registros('Gastos')).map(function (g) {
    return { id: g.id, descricao: g.descricao, categoria: g.categoria, valor: dinheiroFolha(g.valor), data: g.data, observacao: g.observacao || '', criadoEm: g.criadoEm };
  });
}

function salvarGasto(entrada) {
  if (!entrada || Object.prototype.toString.call(entrada) !== '[object Object]') throw new Error('Gasto inválido.');
  var gasto = {
    id: entrada.id ? identificador(entrada.id, 'Gasto') : Utilities.getUuid(),
    descricao: texto(entrada.descricao, 200, true, 'Descrição'),
    categoria: texto(entrada.categoria, 80, true, 'Categoria'),
    valor: numero(entrada.valor, 0.01, 100000000, 'Valor'),
    data: dataSegura(entrada.data),
    observacao: texto(entrada.observacao || '', 1000, false, 'Observação'),
    criadoEm: texto(entrada.criadoEm || agora(), 40, true, 'Data de criação')
  };
  gravar('Gastos', gasto);
  return gasto;
}

/* ---------------- Config ---------------- */

function lerConfig() {
  var saida = {
    empresa: CONFIG_PADRAO.empresa,
    cnpj: CONFIG_PADRAO.cnpj,
    instagram: CONFIG_PADRAO.instagram,
    telefone: CONFIG_PADRAO.telefone,
    mensagemVoucher: CONFIG_PADRAO.mensagemVoucher,
    politicaCancelamento: CONFIG_PADRAO.politicaCancelamento,
    servicos: []
  };
  registros('Config').forEach(function (item) {
    if (item.chave === 'servicos') {
      saida.servicos = jsonSeguro(item.valor, []);
    } else if (saida.hasOwnProperty(item.chave)) {
      saida[item.chave] = item.valor;
    }
  });
  if (!saida.servicos.length) saida.servicos = jsonSeguro(CONFIG_PADRAO.servicos, []);
  return saida;
}

function salvarConfig(entrada) {
  var config = limparConfig(entrada);
  ['empresa', 'cnpj', 'instagram', 'telefone', 'mensagemVoucher', 'politicaCancelamento']
    .forEach(function (chave) {
      gravar('Config', { chave: chave, valor: config[chave], atualizadoEm: agora() });
    });
  gravar('Config', {
    chave: 'servicos', valor: JSON.stringify(config.servicos), atualizadoEm: agora()
  });
  return lerConfig();
}

/* ---------------- Autenticação ---------------- */

function temAdmin() {
  return registros('Usuarios').some(function (u) { return u.papel === 'admin'; });
}

function criarPrimeiroAdmin(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (registros('Usuarios').length > 0) throw new Error('O primeiro usuário já foi criado.');
    var esperada = segredo('SETUP_KEY');
    var recebida = texto(req.chaveInstalacao, 100, true, 'Chave de instalação').toUpperCase();
    if (!seguroIgual(esperada, recebida)) throw new Error('Chave de instalação inválida.');

    validarUsuario(req);
    var u = montarUsuario(req, 'admin');
    gravar('Usuarios', u);
    PropertiesService.getScriptProperties().deleteProperty('SETUP_KEY');
    auditar(u, 'CRIAR', 'Usuario', u.id, 'Administrador principal');
    return novaSessao(u, true);
  } finally {
    lock.releaseLock();
  }
}

function entrar(req) {
  var id = texto(req.usuario, 160, true, 'Usuário').toLowerCase();
  var senha = senhaRecebida(req.senha);
  verificarLimiteLogin(id);

  var achado = null;
  registros('Usuarios').forEach(function (u) {
    if (u.usuario.toLowerCase() === id || u.email.toLowerCase() === id) achado = u;
  });

  var valido = false;
  if (achado && booleano(achado.ativo)) {
    if (String(achado.senhaHash).indexOf('v2$') === 0) {
      valido = seguroIgual(hashSenha(senha, achado.salt), achado.senhaHash);
    } else {
      // Migração transparente dos hashes da versão anterior no primeiro login.
      valido = seguroIgual(hashLegado(senha, achado.salt), achado.senhaHash);
      if (valido) {
        achado.senhaHash = hashSenha(senha, achado.salt);
        gravar('Usuarios', achado);
      }
    }
  }

  if (!valido) {
    registrarFalhaLogin(id);
    Utilities.sleep(150);
    throw new Error('Usuário ou senha inválidos.');
  }

  limparFalhasLogin(id);
  achado.ultimoAcesso = agora();
  gravar('Usuarios', achado);
  auditar(achado, 'ENTRAR', 'Sessao', '', 'Login realizado');
  return novaSessao(achado, true);
}

function chaveLogin(id) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(id),
    Utilities.Charset.UTF_8
  );
  return 'login_' + Utilities.base64EncodeWebSafe(digest).slice(0, 40);
}

function verificarLimiteLogin(id) {
  var total = Number(CacheService.getScriptCache().get(chaveLogin(id)) || 0);
  if (total >= SEGURANCA.maxTentativasLogin)
    throw new Error('Muitas tentativas de acesso. Tente novamente em 15 minutos.');
}

function registrarFalhaLogin(id) {
  var cache = CacheService.getScriptCache();
  var chave = chaveLogin(id);
  var total = Number(cache.get(chave) || 0) + 1;
  cache.put(chave, String(total), SEGURANCA.bloqueioLoginSegundos);
}

function limparFalhasLogin(id) {
  CacheService.getScriptCache().remove(chaveLogin(id));
}

function novaSessao(usuario, incluirDados) {
  var token = aleatorioSeguro();
  var expiraEm = new Date(Date.now() + SEGURANCA.horasSessao * 60 * 60 * 1000).toISOString();
  gravar('Sessoes', {
    id: Utilities.getUuid(),
    // Nunca grava o token utilizável na planilha; apenas seu HMAC.
    token: hashToken(token),
    usuarioId: usuario.id,
    expiraEm: expiraEm,
    criadoEm: agora()
  });
  limparSessoes();
  var resposta = { token: token, usuario: publico(usuario), expiraEm: expiraEm };
  if (incluirDados) {
    resposta.dados = {
      vouchers: lerVouchers(),
      gastos: lerGastos(),
      config: lerConfig(),
      versao: SEGURANCA.versao
    };
  }
  return resposta;
}

function hashToken(token) {
  var bytes = Utilities.computeHmacSha256Signature(
    String(token),
    segredo('SESSION_PEPPER'),
    Utilities.Charset.UTF_8
  );
  return 'v2$' + Utilities.base64Encode(bytes);
}

function exigirSessao(token) {
  var recebido = texto(token, 300, true, 'Sessão');
  var procurado = hashToken(recebido);
  var achada = null;
  registros('Sessoes').forEach(function (s) {
    if (seguroIgual(s.token, procurado)) achada = s;
  });
  if (!achada || new Date(achada.expiraEm).getTime() < Date.now())
    throw new Error('Sessão expirada. Entre novamente.');
  var usuario = porId('Usuarios', achada.usuarioId);
  if (!usuario || !booleano(usuario.ativo)) throw new Error('Usuário inativo.');
  return { sessao: achada, usuario: usuario };
}

function limparSessoes() {
  registros('Sessoes').forEach(function (s) {
    if (new Date(s.expiraEm).getTime() < Date.now()) remover('Sessoes', s.id);
  });
}

function exigirAdmin(usuario) {
  if (!usuario || usuario.papel !== 'admin')
    throw new Error('Acesso permitido somente para administradores.');
}

function senhaRecebida(valor) {
  if (valor !== null && typeof valor === 'object') throw new Error('Senha inválida.');
  var senha = String(valor === undefined || valor === null ? '' : valor);
  if (!senha || senha.length > 200) throw new Error('Senha inválida.');
  return senha;
}

function validarUsuario(dados) {
  var nome = texto(dados && dados.nome, 160, true, 'Nome');
  var email = texto(dados && dados.email, 160, true, 'E-mail').toLowerCase();
  var usuario = texto(dados && dados.usuario, 50, true, 'Usuário').toLowerCase();
  var senha = senhaRecebida(dados && dados.senha);
  if (nome.length < 2) throw new Error('Informe o nome completo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  if (!/^[a-z0-9._-]{3,50}$/.test(usuario))
    throw new Error('O usuário deve ter de 3 a 50 caracteres, sem espaços.');
  if (senha.length < 10) throw new Error('A senha precisa ter pelo menos 10 caracteres.');
}

function montarUsuario(dados, papel) {
  var usuario = texto(dados.usuario, 50, true, 'Usuário').toLowerCase();
  var email = texto(dados.email, 160, true, 'E-mail').toLowerCase();
  var duplicado = registros('Usuarios').some(function (u) {
    return u.usuario.toLowerCase() === usuario || u.email.toLowerCase() === email;
  });
  if (duplicado) throw new Error('Usuário ou e-mail já cadastrado.');
  var salt = Utilities.getUuid();
  return {
    id: Utilities.getUuid(),
    nome: texto(dados.nome, 160, true, 'Nome'),
    email: email,
    usuario: usuario,
    papel: papel === 'admin' ? 'admin' : 'operador',
    senhaHash: hashSenha(String(dados.senha), salt),
    salt: salt,
    ativo: 'true',
    criadoEm: agora(),
    ultimoAcesso: ''
  };
}

function criarUsuario(dados) {
  validarUsuario(dados);
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var u = montarUsuario(dados, dados.papel === 'admin' ? 'admin' : 'operador');
    gravar('Usuarios', u);
    return publico(u);
  } finally {
    lock.releaseLock();
  }
}

function alternarUsuario(atual, id, ativo) {
  var alvo = porId('Usuarios', identificador(id, 'Usuário'));
  if (!alvo) throw new Error('Usuário não encontrado.');
  var ligar = ativo === true || String(ativo) === 'true';
  if (alvo.id === atual.id && !ligar)
    throw new Error('Você não pode desativar o seu próprio usuário.');
  if (alvo.papel === 'admin' && !ligar) {
    var admins = registros('Usuarios').filter(function (u) {
      return u.papel === 'admin' && booleano(u.ativo);
    });
    if (admins.length <= 1) throw new Error('Mantenha pelo menos um administrador ativo.');
  }
  alvo.ativo = ligar ? 'true' : 'false';
  gravar('Usuarios', alvo);
  return publico(alvo);
}

function publico(u) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    usuario: u.usuario,
    papel: u.papel === 'admin' ? 'admin' : 'operador',
    ativo: booleano(u.ativo),
    criadoEm: u.criadoEm,
    ultimoAcesso: u.ultimoAcesso || undefined
  };
}

/** Hash com salt e segredo exclusivo, mantido fora da planilha. */
function hashSenha(senha, salt) {
  var bytes = Utilities.computeHmacSha256Signature(
    String(salt) + ':' + String(senha),
    segredo('PASSWORD_PEPPER'),
    Utilities.Charset.UTF_8
  );
  return 'v2$' + Utilities.base64Encode(bytes);
}

/** Compatibilidade apenas para migrar senhas criadas pela versão anterior. */
function hashLegado(senha, salt) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + ':' + String(senha),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

function seguroIgual(a, b) {
  var x = String(a || '');
  var y = String(b || '');
  var diferenca = x.length ^ y.length;
  var tamanho = Math.max(x.length, y.length);
  for (var i = 0; i < tamanho; i++)
    diferenca |= (x.charCodeAt(i % Math.max(1, x.length)) || 0) ^
                 (y.charCodeAt(i % Math.max(1, y.length)) || 0);
  return diferenca === 0;
}

/* ---------------- Auditoria ---------------- */

function auditar(usuario, acao, recurso, recursoId, detalhes) {
  try {
    gravar('Auditoria', {
      id: Utilities.getUuid(),
      usuarioId: usuario && usuario.id ? usuario.id : '',
      usuario: usuario && usuario.usuario ? usuario.usuario : '',
      acao: texto(acao, 40, true, 'Ação'),
      recurso: texto(recurso, 60, true, 'Recurso'),
      recursoId: texto(recursoId, 100, false, 'Recurso'),
      detalhes: texto(detalhes, 300, false, 'Detalhes'),
      criadoEm: agora()
    });

    var s = aba('Auditoria');
    var excedentes = s.getLastRow() - 1 - SEGURANCA.maxRegistrosAuditoria;
    if (excedentes > 0) s.deleteRows(2, excedentes);
  } catch (e) {
    // Uma falha no histórico não pode impedir a operação principal.
  }
}

function agora() {
  return new Date().toISOString();
}
