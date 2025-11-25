# 🔧 Implementação do Fechamento de Acordo

**Data de Implementação:** 25 de novembro de 2025  
**Última Atualização:** 25 de novembro de 2025 (Timeout: 10s → 30s)  
**Status:** ✅ Implementado e Testado

---

## 📋 O que foi implementado

### 1. **Importação do `postAcordoMaster`**

Adicionada a importação da função que chama o endpoint de registro de acordo:

```javascript
const {
  getListaCredores,
  getOfertasCredor,
  postAcordoMaster,
} = require("../../utils/requests");
```

### 2. **Função `processAcordoFechamento`**

Implementa o fluxo completo de fechamento do acordo com timeout de até **30 segundos**:

```javascript
async function processAcordoFechamento(userId) {
  // 1. Valida se todos os dados estão presentes
  if (!planoSelecionado || !credorSelecionado || !documento) {
    return { success: false, message: "Dados incompletos." };
  }

  // 2. Informa ao usuário que está processando (com feedback visual)
  addToContext(userId, "user", "Finalizando o acordo, por favor aguarde... ⏳");

  // 3. Cria Promise.race com timeout de 30 segundos
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("Timeout ao processar acordo. Tente novamente.")),
      30000 // 30 segundos
    )
  );

  // 4. Executa a API com tratamento de timeout
  const acordoResponse = await Promise.race([
    postAcordoMaster(documento, planoSelecionado),
    timeoutPromise,
  ]);

  // 5. Formata a resposta em uma mensagem legível
  const mensagemSucesso = formatarRespostaAcordo(acordoResponse);

  // 6. Retorna os dados ao contexto e atualiza estado
  addToContext(userId, "user", mensagemSucesso);
  setState(userId, FLOW_STATES.FINALIZADO);

  return { success: true, accord: { documento, credor, plano, resposta } };
}
```

### 3. **Função `formatarRespostaAcordo`**

Formata a resposta da API para uma mensagem amigável ao usuário:

```javascript
function formatarRespostaAcordo(acordoData) {
  // Mapeia os campos da API (em snake_case ou camelCase)
  // Retorna uma mensagem formatada com:
  // ✅ ID do Acordo
  // ✅ Número do Acordo
  // ✅ Status
  // ✅ Data de Criação
  // ✅ Próxima Parcela
  // ✅ Valor da Primeira Parcela
  // ✅ Total de Parcelas
  // ✅ Valor Total
  // ✅ Desconto Concedido
}
```

---

## 🔄 Fluxo Completo de Fechamento

```
┌─────────────────────────────────────────────────────────────────┐
│ ETAPA 6: Usuário seleciona parcelamento                         │
│ Estado: AGUARDANDO_SELECAO_PLANO                                │
│ Ação: processPlanoSelection() é executado                       │
│ Resultado: Estado muda para AGUARDANDO_FECHAMENTO_ACORDO        │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ ETAPA 7: Próxima mensagem do usuário (qualquer mensagem)        │
│ Estado: AGUARDANDO_FECHAMENTO_ACORDO                            │
│ Ação: processAcordoFechamento() é disparado automaticamente     │
│       (não requer comando específico do usuário)                │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ PROCESSAMENTO DO FECHAMENTO                                     │
│ 1️⃣  Validação de dados (documento, credor, plano)              │
│ 2️⃣  Mensagem de aguardo: "Finalizando o acordo... ⏳"          │
│ 3️⃣  POST https://api.cobrance.online:3030/registro-master-acordo│
│     ├─ Timeout: até 30 segundos (antes era 10s)                │
│     ├─ Promise.race para controle de timeout                   │
│     └─ Payload: { documento, plano }                           │
│ 4️⃣  Recebe resposta da API                                     │
│ 5️⃣  Formata resposta em mensagem legível                       │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ RETORNO AO USUÁRIO                                              │
│                                                                 │
│ ✅ Acordo Finalizado com Sucesso!                              │
│                                                                 │
│ ID do Acordo: 12345                                             │
│ Número do Acordo: ACC-2025-11-25-001                            │
│ Status: ATIVO                                                   │
│ Data de Criação: 25/11/2025 14:30                               │
│ Próxima Parcela: 25/12/2025                                     │
│ Valor da Primeira Parcela: R$ 150,00                            │
│ Total de Parcelas: 12                                           │
│ Valor Total: R$ 1.800,00                                        │
│ Desconto Concedido: 10%                                         │
│                                                                 │
│ 🎉 Seu acordo foi registrado com sucesso!                       │
│    Acompanhe as datas das parcelas.                             │
│                                                                 │
│ Estado: FINALIZADO                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Endpoints Envolvidos

### 1. **GET `/lista-credores`**

```
GET https://api.cobrance.online:3030/lista-credores?documento=12345678901
Resposta: Array de credores com débitos
```

### 2. **GET `/credores/oferta-parcelas`**

```
GET https://api.cobrance.online:3030/credores/oferta-parcelas?iddevedor=123
Resposta: Array de ofertas/planos disponíveis
```

### 3. **POST `/registro-master-acordo`** ⏱️ até 30 segundos

```
POST https://api.cobrance.online:3030/registro-master-acordo
Timeout: 30 segundos (aumentado de 10s)
Body: {
  "documento": "12345678901",
  "plano": { objeto completo do plano selecionado }
}

Resposta esperada:
{
  "id": 12345,
  "numero_acordo": "ACC-2025-11-25-001",
  "status": "ATIVO",
  "data_criacao": "2025-11-25T14:30:00Z",
  "proxima_parcela": "2025-12-25",
  "valor_primeira_parcela": 150.00,
  "quantidade_parcelas": 12,
  "valor_total": 1800.00,
  "desconto": "10%"
}
```

---

## 🔐 Tratamento de Erros

### Erros Validados:

#### 1. **Dados Incompletos**

```javascript
if (!planoSelecionado || !credorSelecionado || !documento) {
  return { success: false, message: "Dados incompletos." };
}
```

#### 2. **Timeout ou Erro de Conectividade** (30 segundos)

```javascript
try {
  // Promise.race aguarda a mais rápida entre a requisição e o timeout
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            "Timeout ao processar acordo. A requisição excedeu 30 segundos."
          )
        ),
      30000 // 30 segundos
    )
  );

  const acordoResponse = await Promise.race([
    postAcordoMaster(documento, planoSelecionado),
    timeoutPromise,
  ]);
} catch (error) {
  console.error(`[${userId}] Erro ao fechar acordo:`, error.message);
  addToContext(userId, "user", `Desculpe, ocorreu um erro: ${error.message}`);
  return {
    success: false,
    message: `Erro ao processar acordo: ${error.message}`,
  };
}
```

#### 3. **Resposta Vazia**

```javascript
if (!acordoData) {
  return "Acordo finalizado com sucesso!";
}
```

---

## 🧪 Cenários de Teste

### Cenário 1: Fluxo Completo com Sucesso

```
Usuário: "Olá"
IA: "Bem-vindo! Qual é seu CPF ou CNPJ?"

Usuário: "12345678901"
IA: "Encontrei as dívidas. Qual você quer resolver?"

Usuário: "1"
IA: "Ótimo! Tenho 3 planos de parcelamento:"

Usuário: "2"
IA: "Excelente! Seu acordo está sendo finalizado..."
    [POST para /registro-master-acordo - aguarda até 30s]
    "✅ Acordo Finalizado com Sucesso!
     ID do Acordo: 12345
     Número: ACC-2025-11-25-001
     ..."
```

### Cenário 2: Erro de Timeout (>30 segundos)

````
Usuário: "2"
IA: "Excelente! Seu acordo está sendo finalizado... ⏳"
    [POST para /registro-master-acordo - timeout após 30s]
    "Desculpe, ocorreu um erro ao finalizar o acordo:
     Timeout ao processar acordo. A requisição excedeu 30 segundos. Tente novamente."
```### Cenário 3: Dados Incompletos

````

// Se usuário não completar alguma etapa
Estado: AGUARDANDO_FECHAMENTO_ACORDO (mas dados faltando)
Resultado: "Informações incompletas para finalizar o acordo.
Por favor, comece novamente."

````

---

## 📝 Estrutura de Dados do Contexto (Final)

```javascript
// Após sucesso no fechamento:
context.data = {
  documento: "12345678901",
  listaCredores: [...],
  credorSelecionado: { nome: "...", empresa: "...", iddevedor: "..." },
  ofertas: [...],
  planoSelecionado: { nome: "...", parcelas: 12, valor: 150, ... },
  acordoFinalizado: {  // ← Novo campo adicionado
    id: 12345,
    numero_acordo: "ACC-2025-11-25-001",
    status: "ATIVO",
    data_criacao: "2025-11-25T14:30:00Z",
    proxima_parcela: "2025-12-25",
    valor_primeira_parcela: 150.00,
    quantidade_parcelas: 12,
    valor_total: 1800.00,
    desconto: "10%"
  }
}

context.state = "finalizado"
````

---

## 🔌 Integração com o `sendToGemini`

A função `processAcordoFechamento` é chamada automaticamente quando:

```javascript
// Em sendToGemini():
else if (currentState === FLOW_STATES.AGUARDANDO_FECHAMENTO_ACORDO) {
  console.log(`[${userId}] Processando fechamento do acordo...`);
  await processAcordoFechamento(userId);
  currentState = getState(userId);
}
```

**Importante:** Não é necessário o usuário enviar um comando específico. Qualquer mensagem após selecionar o plano dispara o fechamento.

---

## ✨ Melhorias Implementadas

| #   | Melhoria                                           | Benefício                         |
| --- | -------------------------------------------------- | --------------------------------- |
| 1️⃣  | Chamada real ao endpoint `/registro-master-acordo` | Integração real com backend       |
| 2️⃣  | Tratamento de timeout (~10s)                       | Aguarda resposta sem bloquear     |
| 3️⃣  | Formatação de resposta amigável                    | Usuário entende claramente        |
| 4️⃣  | Suporte a múltiplos formatos de response           | snake_case e camelCase            |
| 5️⃣  | Armazenamento de dados do acordo                   | Rastreabilidade completa          |
| 6️⃣  | Tratamento robusto de erros                        | Mensagens claras em caso de falha |

---

## 📝 Exemplo de Payload Enviado

```javascript
// POST para https://api.cobrance.online:3030/registro-master-acordo
{
  "documento": "12345678901",
  "plano": {
    "nome": "Parcelamento 12x",
    "quantidadeParcelas": 12,
    "valorTotal": 1800,
    "valor": 150,
    "parcelas": 12,
    // ... outros campos do plano
  }
}
```

---

## 🚀 Status

✅ **Implementação Completa**

- ✅ Importação de `postAcordoMaster`
- ✅ Função `processAcordoFechamento` com chamada real à API
- ✅ Função `formatarRespostaAcordo` com suporte a múltiplos formatos
- ✅ Tratamento de erros e timeouts
- ✅ Integração com `sendToGemini`
- ✅ Armazenamento de dados do acordo no contexto

**Pronto para produção! 🎉**
