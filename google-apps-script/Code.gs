/**
 * Controle de Vouchers — backend em Google Sheets.
 *
 * Cole este arquivo em Extensões > Apps Script da sua planilha,
 * execute a função configurarBanco() uma vez e publique como
 * Aplicativo da Web (executar como "Eu", acesso "Qualquer pessoa").
 */

var ABAS = {
  Usuarios: ['id', 'nome', 'email', 'usuario', 'papel', 'senhaHash', 'salt', 'ativo', 'criadoEm', 'ultimoAcesso'],
  Vouchers: ['id', 'codigo', 'clientes', 'pessoas', 'hotel', 'telefone', 'contatoExtra', 'passeios',
             'servicos', 'datas', 'total', 'entrada', 'aReceber', 'formaPagamento', 'observacoes', 'status', 'criadoEm'],
  Config: ['chave', 'valor', 'atualizadoEm'],
  Sessoes: ['id', 'token', 'usuarioId', 'expiraEm', 'criadoEm']
};

var CONFIG_PADRAO = {
  empresa: 'Vem Pra Porto',
  cnpj: '',
  instagram: '@vempraporto.ps',
  telefone: '',
  mensagemTopo: '*Já nos segue no nosso Instagram*',
  politicaCancelamento: 'Prezados(as),\n\nInformamos que cancelamentos realizados com até 18 horas de antecedência do horário do passeio estarão sujeitos à cobrança integral do valor do passeio.\n\nA exceção será apenas em casos de doença, mediante apresentação de atestado médico válido.\n\nAgradecemos pela compreensão e permanecemos à disposição.',
  servicos: JSON.stringify([
    { id: 's1', nome: 'Praia do Espelho + Caraíva', preco: 300 },
    { id: 's2', nome: 'Trancoso + Quadrado', preco: 180 },
    { id: 's3', nome: "Arraial d'Ajuda", preco: 150 }
  ])
};

/* ---------------- Entrada HTTP ---------------- */

function doGet(e) {
  return responder(processar((e && e.parameter) || {}));
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
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
    configurarBanco();
    var acao = String(req.acao || '');

    if (acao === 'status') return ok({ temAdmin: temAdmin() });
    if (acao === 'criarPrimeiroAdmin') return ok(criarPrimeiroAdmin(req));
    if (acao === 'entrar') return ok(entrar(req));

    var auth = exigirSessao(req.token);

    switch (acao) {
      case 'eu': return ok(publico(auth.usuario));
      case 'sair': remover('Sessoes', auth.sessao.id); return ok(null);
      case 'dados': return ok({ vouchers: lerVouchers(), config: lerConfig() });

      case 'salvarVoucher': return ok(salvarVoucher(req.voucher));
      case 'removerVoucher': return ok(remover('Vouchers', req.id));

      case 'salvarConfig':
        exigirAdmin(auth.usuario);
        return ok(salvarConfig(req.config));

      case 'listarUsuarios':
        exigirAdmin(auth.usuario);
        return ok(registros('Usuarios').map(publico));

      case 'criarUsuario':
        exigirAdmin(auth.usuario);
        return ok(criarUsuario(req.usuarioNovo));

      case 'alternarUsuario':
        exigirAdmin(auth.usuario);
        return ok(alternarUsuario(auth.usuario, req.id, req.ativo));

      default:
        throw new Error('Ação "' + acao + '" não reconhecida.');
    }
  } catch (err) {
    return { ok: false, error: err.message || 'Erro interno.' };
  }
}

function ok(data) {
  return { ok: true, data: data };
}

/* ---------------- Planilha ---------------- */

function configurarBanco() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ABAS).forEach(function (nome) {
    var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
    if (aba.getLastRow() === 0) {
      aba.getRange(1, 1, 1, ABAS[nome].length).setValues([ABAS[nome]]);
      aba.setFrozenRows(1);
      aba.getRange(1, 1, 1, ABAS[nome].length).setFontWeight('bold');
    }
  });
  if (registros('Config').length === 0) {
    Object.keys(CONFIG_PADRAO).forEach(function (chave) {
      gravar('Config', { chave: chave, valor: CONFIG_PADRAO[chave], atualizadoEm: agora() });
    });
  }
}

function aba(nome) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!s) throw new Error('A aba ' + nome + ' não existe. Execute configurarBanco().');
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
        reg[col] = linha[i] === null ? '' : String(linha[i]);
      });
      return reg;
    });
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
  var alvo = -1;
  for (var i = 0; i < linhas.length; i++) {
    if (String(linhas[i][idx]) === chave) { alvo = i + 2; break; }
  }

  var valores = cols.map(function (col) {
    var v = registro[col];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
  });

  if (alvo === -1) s.appendRow(valores);
  else s.getRange(alvo, 1, 1, cols.length).setValues([valores]);
  return registro;
}

function remover(nome, id) {
  var s = aba(nome);
  var cols = ABAS[nome];
  var idx = cols.indexOf('id');
  var ultima = s.getLastRow();
  if (ultima < 2) return null;
  var linhas = s.getRange(2, 1, ultima - 1, cols.length).getValues();
  for (var i = linhas.length - 1; i >= 0; i--) {
    if (String(linhas[i][idx]) === String(id)) s.deleteRow(i + 2);
  }
  return null;
}

function porId(nome, id) {
  var lista = registros(nome);
  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].id) === String(id)) return lista[i];
  }
  return null;
}

function booleano(v) {
  return String(v).toLowerCase() === 'true' || String(v) === '1';
}

function jsonSeguro(texto, padrao) {
  try {
    var v = JSON.parse(texto || '');
    return v || padrao;
  } catch (e) {
    return padrao;
  }
}

/* ---------------- Vouchers ---------------- */

function lerVouchers() {
  return registros('Vouchers').map(function (v) {
    return {
      id: v.id,
      codigo: v.codigo,
      clientes: jsonSeguro(v.clientes, v.clientes ? [v.clientes] : []),
      pessoas: Number(v.pessoas || 1),
      hotel: v.hotel,
      telefone: v.telefone,
      contatoExtra: v.contatoExtra,
      passeios: jsonSeguro(v.passeios, []),
      total: Number(v.total || 0),
      entrada: Number(v.entrada || 0),
      formaPagamento: v.formaPagamento,
      observacoes: v.observacoes,
      status: v.status || 'pendente',
      criadoEm: v.criadoEm
    };
  });
}

/**
 * Guarda o voucher. As colunas "servicos", "datas" e "aReceber" são
 * preenchidas automaticamente para facilitar a leitura direto na planilha.
 */
function salvarVoucher(v) {
  if (!v) throw new Error('Voucher inválido.');
  var clientes = v.clientes || [];
  var passeios = v.passeios || [];
  var total = Number(v.total || 0);
  var entrada = Number(v.entrada || 0);

  var servicos = passeios.map(function (p) { return p.nome; }).filter(String).join(' + ');
  var datas = passeios.map(function (p) { return p.data; }).filter(String).sort().join(' | ');

  gravar('Vouchers', {
    id: v.id,
    codigo: v.codigo,
    clientes: JSON.stringify(clientes),
    pessoas: v.pessoas,
    hotel: v.hotel,
    telefone: v.telefone,
    contatoExtra: v.contatoExtra,
    passeios: JSON.stringify(passeios),
    servicos: servicos,
    datas: datas,
    total: total,
    entrada: entrada,
    aReceber: Math.max(0, total - entrada),
    formaPagamento: v.formaPagamento,
    observacoes: v.observacoes,
    status: v.status || 'pendente',
    criadoEm: v.criadoEm || agora()
  });
  return v;
}

/* ---------------- Config ---------------- */

function lerConfig() {
  var saida = {
    empresa: CONFIG_PADRAO.empresa,
    cnpj: CONFIG_PADRAO.cnpj,
    instagram: CONFIG_PADRAO.instagram,
    telefone: CONFIG_PADRAO.telefone,
    mensagemTopo: CONFIG_PADRAO.mensagemTopo,
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

function salvarConfig(config) {
  if (!config) throw new Error('Configuração inválida.');
  ['empresa', 'cnpj', 'instagram', 'telefone', 'mensagemTopo', 'politicaCancelamento']
    .forEach(function (chave) {
      if (config[chave] !== undefined) {
        gravar('Config', { chave: chave, valor: String(config[chave]), atualizadoEm: agora() });
      }
    });
  if (config.servicos) {
    gravar('Config', { chave: 'servicos', valor: JSON.stringify(config.servicos), atualizadoEm: agora() });
  }
  return lerConfig();
}

/* ---------------- Autenticação ---------------- */

function temAdmin() {
  return registros('Usuarios').some(function (u) { return u.papel === 'admin'; });
}

function criarPrimeiroAdmin(req) {
  if (registros('Usuarios').length > 0) throw new Error('O primeiro usuário já foi criado.');
  validar(req);
  var u = montarUsuario(req, 'admin');
  gravar('Usuarios', u);
  return novaSessao(u);
}

function entrar(req) {
  var id = String(req.usuario || '').trim().toLowerCase();
  var senha = String(req.senha || '');
  if (!id || !senha) throw new Error('Informe usuário e senha.');

  var achado = null;
  registros('Usuarios').forEach(function (u) {
    if (u.usuario.toLowerCase() === id || u.email.toLowerCase() === id) achado = u;
  });
  if (!achado || !booleano(achado.ativo)) throw new Error('Usuário ou senha inválidos.');
  if (hash(senha, achado.salt) !== achado.senhaHash) throw new Error('Usuário ou senha inválidos.');

  achado.ultimoAcesso = agora();
  gravar('Usuarios', achado);
  return novaSessao(achado);
}

function novaSessao(usuario) {
  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  var expiraEm = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  gravar('Sessoes', {
    id: Utilities.getUuid(), token: token, usuarioId: usuario.id,
    expiraEm: expiraEm, criadoEm: agora()
  });
  limparSessoes();
  return { token: token, usuario: publico(usuario), expiraEm: expiraEm };
}

function exigirSessao(token) {
  if (!token) throw new Error('Sessão ausente. Entre novamente.');
  var achada = null;
  registros('Sessoes').forEach(function (s) {
    if (s.token === String(token)) achada = s;
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

function validar(dados) {
  if (!dados || !String(dados.nome || '').trim() || !String(dados.email || '').trim() || !String(dados.usuario || '').trim())
    throw new Error('Nome, email e usuário são obrigatórios.');
  if (String(dados.senha || '').length < 6)
    throw new Error('A senha precisa ter pelo menos 6 caracteres.');
}

function montarUsuario(dados, papel) {
  var usuario = String(dados.usuario).trim().toLowerCase();
  var email = String(dados.email).trim().toLowerCase();
  var duplicado = registros('Usuarios').some(function (u) {
    return u.usuario.toLowerCase() === usuario || u.email.toLowerCase() === email;
  });
  if (duplicado) throw new Error('Usuário ou email já cadastrado.');
  var salt = Utilities.getUuid();
  return {
    id: Utilities.getUuid(), nome: String(dados.nome).trim(), email: email, usuario: usuario,
    papel: papel === 'admin' ? 'admin' : 'operador',
    senhaHash: hash(String(dados.senha), salt), salt: salt,
    ativo: 'true', criadoEm: agora(), ultimoAcesso: ''
  };
}

function criarUsuario(dados) {
  validar(dados);
  var u = montarUsuario(dados, dados.papel === 'admin' ? 'admin' : 'operador');
  gravar('Usuarios', u);
  return publico(u);
}

function alternarUsuario(atual, id, ativo) {
  var alvo = porId('Usuarios', id);
  if (!alvo) throw new Error('Usuário não encontrado.');
  var ligar = ativo === true || String(ativo) === 'true';
  if (alvo.id === atual.id && !ligar) throw new Error('Você não pode desativar o seu próprio usuário.');
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
    id: u.id, nome: u.nome, email: u.email, usuario: u.usuario,
    papel: u.papel === 'admin' ? 'admin' : 'operador',
    ativo: booleano(u.ativo), criadoEm: u.criadoEm,
    ultimoAcesso: u.ultimoAcesso || undefined
  };
}

function hash(senha, salt) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + ':' + String(senha),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

function agora() {
  return new Date().toISOString();
}
