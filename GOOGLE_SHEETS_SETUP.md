# Controle de Vouchers — como usar e publicar

Sistema para quem fecha o serviço pelo WhatsApp: **não existe cadastro de cliente**. Você cria o voucher já com os nomes das pessoas, envia por WhatsApp, gera o PDF e o cliente salva os passeios no Google Agenda por um link.

## Telas

| Tela | O que faz |
| --- | --- |
| **Início** | Passeios de hoje, pessoas atendidas, faturamento e valores a receber |
| **Vouchers** | Criar, enviar por WhatsApp, gerar PDF, copiar texto, mudar status |
| **Agenda** | Todos os passeios dos vouchers por dia e hora (semana ou lista) |
| **Configurações** | Empresa, política de cancelamento, passeios, banco e usuários (só admin) |

## Como funciona o voucher

Ao criar um voucher você informa:

- **Clientes** — quantos nomes quiser (o principal e os acompanhantes)
- **Nº de pessoas** — preenchido sozinho conforme os nomes
- **Hotel**, **WhatsApp** e **outros contatos**
- **Passeios** — um ou vários, cada um com serviço, data, hora e ponto de encontro
- **Valor total** e **entrada** — o "a receber" é calculado automaticamente
- **Forma de pagamento** e **observações**

A mensagem sai exatamente neste formato:

```text
*Já nos segue no nosso Instagram*
@vempraporto.ps

🏢 Vem Pra Porto
CNPJ: ...

*Dados para voucher*
🎟️ Voucher: VP-A7K2M

📌 Serviço Contratado: Praia do Espelho + Caraíva

👤 Cliente: Ronaldo Alves e Cida Lima
( 2 pessoas )
🏨 Hotel: Paraíso Mar Hotel (Arraial)
📞 Telefone: (73) 99999-1111
📅 Data dos Passeios: 29/07/2026

💳 Forma de Pagamento:
Valor da entrada: R$ 100,00
Valor a receber: R$ 200,00
Valor total: R$ 300,00

🗓️ Salve na sua agenda:
https://calendar.google.com/...

🚨POLÍTICA DE CANCELAMENTO!
...
```

Os três botões de cada voucher:

- **Enviar WhatsApp** — abre a conversa com o texto pronto
- **Baixar PDF** — arquivo com cabeçalho da empresa, dados, pagamento, link do Google Agenda clicável e a política de cancelamento
- **Google Agenda** (ícone de calendário) — abre o evento pronto para salvar

Também há **copiar texto** e **pré-visualizar** (mostra a mensagem como o cliente vai ver).

## Acesso padrão

```text
usuário: admin
senha:   admin123
```

O botão **Preencher** na tela de login já completa esses dados. Sem configurar nada, o sistema abre em **modo local** com vouchers de exemplo.

## Conectar o Google Sheets

1. Crie uma planilha e abra **Extensões → Apps Script**
2. Cole o arquivo `google-apps-script/Code.gs`
3. Execute a função **`configurarBanco`** e autorize
4. **Implantar → Nova implantação → Aplicativo da Web**
   - Executar como: **Eu**
   - Quem tem acesso: **Qualquer pessoa**
5. Copie a URL terminada em `/exec`

Abas criadas automaticamente: `Usuarios`, `Vouchers`, `Config`, `Sessoes`.

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

- Senhas gravadas só como hash SHA-256 com salt
- Sessões expiram em 12 horas
- Não dá para desativar o próprio usuário nem o último administrador
- Mantenha a planilha privada

## Desenvolvimento

```bash
npm install
npm run dev
```
