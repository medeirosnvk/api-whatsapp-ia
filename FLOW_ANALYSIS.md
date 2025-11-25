# 📊 Análise do Fluxo de Conversação - API WhatsApp IA

**Data da Análise:** 25 de novembro de 2025  
**Status:** ✅ Fluxo validado e corrigido

---

## 🎯 Fluxo Esperado

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USUÁRIO ENTRA EM CONTATO                                     │
│    Estado: INICIAL → AGUARDANDO_DOCUMENTO                       │
│    IA: Solicita CPF/CNPJ de forma natural                       │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. USUÁRIO INFORMA CPF/CNPJ                                     │
│    Estado: AGUARDANDO_DOCUMENTO                                 │
│    Ação: processDocument(userId, documento)                     │
│    - Chama getListaCredores(documento)                          │
│    - Retorna lista de dívidas do usuário                        │
│    - IA apresenta credores disponíveis                          │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. IA RETORNA DÍVIDAS (listaCredores)                           │
│    Estado: AGUARDANDO_SELECAO_CREDOR (ou direto para plano)    │
│    Se apenas 1 credor: busca ofertas automaticamente            │
│    Se múltiplos: aguarda escolha do usuário                    │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. USUÁRIO SELECIONA CREDOR                                     │
│    Estado: AGUARDANDO_SELECAO_CREDOR                            │
│    Ação: processCredorSelection(userId, selectedIndex)          │
│    - Chama getOfertasCredor(iddevedor)                          │
│    - Retorna planos/parcelamentos disponíveis                   │
│    - IA apresenta opções de parcelamento                        │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. IA RETORNA OFERTAS (getOfertasCredor)                        │
│    Estado: AGUARDANDO_SELECAO_PLANO                             │
│    IA: Apresenta planos com:                                    │
│    - Número de parcelas                                         │
│    - Valores                                                    │
│    - Outras informações da oferta                               │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. USUÁRIO SELECIONA PARCELAMENTO                               │
│    Estado: AGUARDANDO_SELECAO_PLANO                             │
│    Ação: processPlanoSelection(userId, selectedIndex)           │
│    - Armazena plano selecionado no contexto                     │
│    - Move para estado AGUARDANDO_FECHAMENTO_ACORDO              │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. IA FECHA O ACORDO                                            │
│    Estado: AGUARDANDO_FECHAMENTO_ACORDO → FINALIZADO            │
│    Ação: processAcordoFechamento(userId)                        │
│    - Valida se todos os dados estão presentes                   │
│    - Gera resumo do acordo:                                     │
│      • Documento (CPF/CNPJ)                                     │
│      • Credor selecionado                                       │
│      • Plano/Parcelamento escolhido                             │
│    - IA confirma: "Acordo finalizado com sucesso"               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Correções Implementadas

### 1. ✅ Saudação Inicial Adicionada

**Problema:** O fluxo não iniciava automaticamente ao usuário enviar a primeira mensagem.  
**Solução:** Ao detectar estado `INICIAL`, o sistema agora:

- Move automaticamente para `AGUARDANDO_DOCUMENTO`
- IA saudação é gerada pelo Gemini com instruções adequadas

```javascript
if (currentState === FLOW_STATES.INICIAL) {
  setState(userId, FLOW_STATES.AGUARDANDO_DOCUMENTO);
  currentState = FLOW_STATES.AGUARDANDO_DOCUMENTO;
}
```

---

### 2. ✅ Detecção Melhorada de Números

**Problema:** Regex original `/\b[1-9][0-9]?\b/` era fraca e falhava frequentemente.  
**Solução:** Nova regex mais robusta:

```javascript
const matches = cleaned.match(/^\d+|\s(\d+)$|^(\d+)\s/);
// Captura: números no início, no fim ou isolados
```

---

### 3. ✅ Validação de Ofertas Vazias

**Problema:** Se `getOfertasCredor` retornasse array vazio, a conversa ficava confusa.  
**Solução:** Agora valida e retorna mensagem clara ao usuário:

```javascript
if (!ofertas || ofertas.length === 0) {
  addToContext(
    userId,
    "user",
    "Desculpe, não há ofertas disponíveis no momento..."
  );
  setState(userId, FLOW_STATES.AGUARDANDO_SELECAO_CREDOR);
  return { success: false, message: "Nenhuma oferta disponível." };
}
```

---

### 4. ✅ Processamento de Fechamento de Acordo

**Problema:** Estado `AGUARDANDO_FECHAMENTO_ACORDO` existia mas não tinha ação correspondente.  
**Solução:** Nova função `processAcordoFechamento()` que:

- Valida presença de: documento, credor, plano selecionado
- Gera resumo completo do acordo
- Move para estado `FINALIZADO`
- Adiciona contexto ao histórico

```javascript
async function processAcordoFechamento(userId) {
  // Valida dados completos
  // Cria resumo do acordo
  // Atualiza estado para FINALIZADO
  // Retorna dados do acordo processado
}
```

---

### 5. ✅ Prioridade de Seleção Credor Clarificada

**Problema:** Conflito entre seleção por ID e por número.  
**Solução:** Ordem clara de processamento:

1. **Prioridade 1:** ID do credor (`findCredorIndexById`)
2. **Prioridade 2:** Número da lista (`selectedNumber`)

```javascript
if (
  credorIndexFromId >= 0 &&
  currentState === FLOW_STATES.AGUARDANDO_SELECAO_CREDOR
) {
  // ID tem prioridade
} else if (
  selectedNumber &&
  currentState === FLOW_STATES.AGUARDANDO_SELECAO_CREDOR
) {
  // Número é fallback
}
```

---

## 📋 Estados do Fluxo

| Estado                         | Descrição                           | Transição                        |
| ------------------------------ | ----------------------------------- | -------------------------------- |
| `INICIAL`                      | Primeiro contato do usuário         | → `AGUARDANDO_DOCUMENTO`         |
| `AGUARDANDO_DOCUMENTO`         | Aguardando CPF/CNPJ                 | → `AGUARDANDO_SELECAO_CREDOR`    |
| `AGUARDANDO_SELECAO_CREDOR`    | Dívidas carregadas, aguarda escolha | → `AGUARDANDO_SELECAO_PLANO`     |
| `AGUARDANDO_SELECAO_PLANO`     | Ofertas do credor disponíveis       | → `AGUARDANDO_FECHAMENTO_ACORDO` |
| `AGUARDANDO_FECHAMENTO_ACORDO` | Plano selecionado, finalizando      | → `FINALIZADO`                   |
| `FINALIZADO`                   | Acordo completado com sucesso       | -                                |

---

## 🔗 Fluxo de Dados por Função

```
sendToGemini(userId, userMessage)
├── Estado INICIAL?
│   └─→ setState(AGUARDANDO_DOCUMENTO)
├── Detecta CPF/CNPJ?
│   └─→ processDocument(userId, documento)
│       ├─→ getListaCredores(documento)
│       ├─→ Atualiza context.data.listaCredores
│       ├─→ Adiciona info ao contexto de conversa
│       └─→ setState(AGUARDANDO_SELECAO_CREDOR ou AGUARDANDO_SELECAO_PLANO)
├── Usuário seleciona credor?
│   └─→ processCredorSelection(userId, selectedIndex)
│       ├─→ getOfertasCredor(credorSelecionado.iddevedor)
│       ├─→ Valida ofertas (não vazio)
│       ├─→ Atualiza context.data.ofertas
│       └─→ setState(AGUARDANDO_SELECAO_PLANO)
├── Usuário seleciona plano?
│   └─→ processPlanoSelection(userId, selectedIndex)
│       ├─→ Valida índice do plano
│       ├─→ Atualiza context.data.planoSelecionado
│       └─→ setState(AGUARDANDO_FECHAMENTO_ACORDO)
└── Fechamento do acordo?
    └─→ processAcordoFechamento(userId)
        ├─→ Valida: documento, credorSelecionado, planoSelecionado
        ├─→ Gera resumo do acordo
        └─→ setState(FINALIZADO)
```

---

## 🧪 Cenários de Teste Validados

### Cenário 1: Fluxo Completo Feliz

```
Usuário: "Olá"
IA: "Bem-vindo! Qual é seu CPF ou CNPJ?"

Usuário: "12345678901"
IA: "Ótimo! Encontrei as seguintes dívidas:
     1. Empresa A | ID: 123
     2. Empresa B | ID: 456
     Qual você gostaria de resolver?"

Usuário: "1"
IA: "Perfeito! Tenho 3 opções de parcelamento:
     1. 12 vezes de R$ 100
     2. 24 vezes de R$ 50
     3. 6 vezes de R$ 200
     Qual você prefere?"

Usuário: "2"
IA: "Excelente! Seu acordo está sendo finalizado...
     Documento: 12345678901
     Credor: Empresa A
     Plano: 24 vezes de R$ 50
     ✓ Acordo fechado com sucesso!"
```

### Cenário 2: Múltiplos Credores

```
Usuário: "12345678901"
IA: "Encontrei dívidas com 3 credores..."
Usuário: "2"
IA: "Busca ofertas para Credor 2..."
```

### Cenário 3: Um Único Credor

```
Usuário: "12345678901"
IA: "Encontrei 1 dívida. Buscando ofertas..."
    "Ofertas disponíveis: [mostra planos]"
    [Pula AGUARDANDO_SELECAO_CREDOR]
```

### Cenário 4: Ofertas Vazias

```
Usuário: "2" (seleciona credor)
IA: "Desculpe, não há ofertas disponíveis no momento.
     Escolha outro credor ou tente mais tarde."
[Volta para AGUARDANDO_SELECAO_CREDOR]
```

---

## 📝 Estrutura de Contexto

```javascript
conversationContexts.get(userId) = {
  userId: "555192261797@c.us",
  state: "aguardando_selecao_plano",
  context: [
    { role: "user", parts: [{ text: "..." }] },
    { role: "model", parts: [{ text: "..." }] },
    ...
  ],
  data: {
    listaCredores: [
      { nome: "...", empresa: "...", iddevedor: "..." },
      ...
    ],
    credorSelecionado: { nome: "...", empresa: "...", iddevedor: "..." },
    ofertas: [
      { nome: "...", parcelas: 12, valor: 100, ... },
      ...
    ],
    planoSelecionado: { nome: "...", parcelas: 24, valor: 50, ... },
    documento: "12345678901"
  },
  flags: {
    saudacaoEnviada: true,
    promptInicialEnviado: true
  },
  createdAt: "2025-11-25T10:30:00Z",
  lastInteraction: "2025-11-25T10:35:00Z"
}
```

---

## ✨ Resumo das Melhorias

| #   | Categoria     | Mudança                        | Impacto              |
| --- | ------------- | ------------------------------ | -------------------- |
| 1   | UX            | Saudação automática ao iniciar | ✅ Fluxo natural     |
| 2   | Parsing       | Melhor detecção de números     | ✅ Seleção confiável |
| 3   | Validação     | Check de ofertas vazias        | ✅ Mensagens claras  |
| 4   | Processamento | Função fechamento acordo       | ✅ Fluxo completo    |
| 5   | Lógica        | Prioridade clara seleção       | ✅ Sem ambiguidade   |

---

## 🚀 Próximos Passos (Opcional)

1. **Persistência:** Salvar contexto em banco de dados (Redis/MongoDB)
2. **Timeout:** Limpar contextos após inatividade (já implementado: `cleanupOldContexts`)
3. **Logging:** Adicionar logs estruturados para auditoria
4. **Retry:** Implementar retry automático para chamadas à API Gemini
5. **Webhooks:** Callback ao sistema de billing quando acordo é fechado

---

**Fluxo validado e pronto para produção! ✅**
