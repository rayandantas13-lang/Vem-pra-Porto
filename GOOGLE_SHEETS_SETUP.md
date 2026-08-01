# Controle de Vouchers — como usar e publicar

Sistema para quem fecha o serviço pelo WhatsApp: **não existe cadastro de cliente**. Você cria o voucher já com os nomes das pessoas, envia o **PDF por WhatsApp escolhendo o contato na hora** e o cliente salva os passeios no Google Agenda por um link.

## Telas

| Tela | O que faz |
| --- | --- |
| **Início** | Passeios de hoje, pessoas atendidas, faturamento e valores a receber |
| **Vouchers** | Criar, enviar o PDF por WhatsApp, baixar PDF, mudar status |
| **Agenda** | Todos os passeios dos vouchers por dia e hora (semana ou lista) |
| **Configurações** | Empresa, mensagem do WhatsApp, política de cancelamento, passeios, banco e usuários (só admin) |

## Como funciona o voucher

Ao criar um voucher você informa:

- **Clientes** — quantos nomes quiser (o principal e os acompanhantes)
- **Nº de pessoas** — preenchido sozinho conforme os nomes
- **Hotel**, **WhatsApp** e **outros contatos**
- **Passeios** — um ou vários, cada um com serviço, data, hora e ponto de encontro
- **Valor total** e **entrada** — o "a receber" é calculado automaticamente
- **Forma de pagamento** e **observações**

O envio é sempre **PDF + mensagem curta**, sem número fixo: o WhatsApp abre e você escolhe para qual contato mandar.

- **No celular** — o PDF é gerado e anexado automaticamente; o menu de compartilhamento abre com a mensagem pronta. É só escolher o WhatsApp e o contato.
- **No computador** — o PDF é baixado e o WhatsApp abre já com a mensagem; anexe o arquivo baixado e escolha o contato.

A mensagem é editável em **Configurações → Mensagem do WhatsApp** e aceita atalhos:

| Atalho | Vira |
| --- | --- |
| `{saudacao}` | **Bom dia** (5h–11h), **Boa tarde** (12h–17h) ou **Boa noite**, conforme o horário |
| `{cliente}` | nome da primeira pessoa do voucher |
| `{codigo}` | código do voucher (ex.: VP-A7K2M) |
| `{empresa}` | nome da empresa |

Padrão: `{saudacao}! 🌴 Segue o seu voucher com todos os detalhes do passeio. Qualquer dúvida estamos à disposição. 😊`

Os botões de cada voucher:

- **Enviar WhatsApp** — PDF anexado + mensagem, escolhendo o contato no WhatsApp
- **Baixar PDF** — arquivo com cabeçalho da empresa, dados, pagamento, link do Google Agenda clicável e a política de cancelamento
- **Google Agenda** (ícone de calendário) — abre o evento pronto para salvar

Também há **pré-visualizar** (mostra o PDF anexado e a mensagem como o cliente vai receber).

## Primeiro acesso

Não existe mais usuário ou senha padrão. No primeiro acesso, crie o administrador com uma senha de pelo menos 10 caracteres.

Sem conectar o Google Sheets, o sistema abre em **modo local** com vouchers fictícios de exemplo. Esse modo serve para demonstração; dados reais devem ser armazenados no Google Sheets.

## Conectar o Google Sheets

1. Crie uma planilha e abra **Extensões → Apps Script**
2. Cole o arquivo `google-apps-script/Code.gs`
3. Execute a função **`configurarBanco`** e autorize
4. Execute **`obterChaveInstalacao`** e copie a chave exibida no registro de execução
5. **Implantar → Nova implantação → Aplicativo da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
6. Copie a URL terminada em `/exec`
7. No primeiro acesso, informe a chave para criar o administrador principal; ela é invalidada automaticamente depois do uso

Abas criadas automaticamente: `Usuarios`, `Vouchers`, `Config`, `Sessoes`, `Auditoria`.

Na aba `Vouchers`, além dos dados brutos, as colunas **servicos**, **datas** e **aReceber** são preenchidas sozinhas para você conseguir ler e filtrar direto na planilha.

### Onde colar a URL

**Opção A — variável do GitHub (recomendada)**

Em **Settings → Secrets and variables → Actions → aba Variables → New repository variable**:

```text
Name:  VITE_APPS_SCRIPT_URL
Value: https://script.google.com/macros/s/SEU_ID/exec
```

O workflow `.github/workflows/deploy.yml` já injeta isso no build.

**Opção B — no painel**

Entre como admin em **Configurações → Banco de dados**, cole a URL, clique em **Testar conexão** e depois em **Salvar URL**. Essa opção tem prioridade sobre a variável do GitHub.

Depois use **Enviar vouchers locais para a planilha** para migrar o que já foi criado no modo local.

## Perfis

| Recurso | Administrador | Operador |
| --- | --- | --- |
| Início, Vouchers, Agenda | Sim | Sim |
| Configurações e usuários | Sim | Não |

O menu fica oculto para operadores e o Apps Script bloqueia a chamada no servidor.

## Segurança

- Todo o tráfego usa HTTPS e o Google também protege os arquivos armazenados na infraestrutura dele
- No modo conectado, senhas nunca são gravadas em texto: ficam como HMAC SHA-256 com salt e um segredo exclusivo guardado nas propriedades privadas do Apps Script
- Tokens de sessão nunca são gravados em formato utilizável na planilha; somente o HMAC do token é armazenado
- A sessão expira no servidor em 8 horas, fica apenas na aba atual e é encerrada após 30 minutos sem atividade
- Cinco tentativas incorretas bloqueiam temporariamente novas tentativas para o mesmo usuário
- A criação do primeiro administrador exige uma chave de instalação aleatória e de uso único
- Toda entrada é validada no servidor e textos são neutralizados para impedir injeção de fórmulas na planilha
- Alterações importantes são registradas na aba `Auditoria`
- Não dá para desativar o próprio usuário nem o último administrador
- Configurações e usuários continuam restritos ao perfil administrador
- Mantenha a planilha privada e não compartilhe o projeto do Apps Script

### Sobre o F12 / DevTools

O endereço público do Apps Script e os dados que a tela precisa exibir podem aparecer no DevTools do **próprio usuário autenticado**. Isso é normal em qualquer aplicação web: o navegador precisa receber os dados para mostrá-los. A URL `/exec` não é uma senha e conhecê-la não libera os vouchers.

A proteção contra pessoas externas é feita no servidor: sem uma sessão válida, as ações de leitura e gravação são recusadas. Criptografar novamente o conteúdo dentro do HTTPS apenas esconderia visualmente o painel *Network*, mas a chave também teria de estar no navegador e não criaria segurança real.

## Desenvolvimento

```bash
npm install
npm run dev
```
