# Importador JSON — Banco de Questões Nós Passa

## Objetivo

Importar lotes de questões originais para o Supabase preservando a taxonomia acadêmica e criando automaticamente `questions → question_applicability → question_applicability_content`.

## JSON de entrada

```json
{
  "schema_version": "1.0",
  "batch": {
    "id": "transpetro-2026-03-admin-controle-lote-001",
    "created_at": "2026-09-10T00:00:00Z",
    "author": "editorial",
    "source": "original"
  },
  "preparation_slug": "transpetro-2026-03-administra-o-e-controle",
  "questions": [
    {
      "external_id": "ADMCTRL-001",
      "statement": "Enunciado original...",
      "alternatives": {"A":"...","B":"...","C":"...","D":"...","E":"..."},
      "answer": "C",
      "explanation": "Explicação objetiva do gabarito.",
      "discipline": "Conhecimentos Específicos",
      "topic": "Administração",
      "subtopic": "Planejamento",
      "difficulty": "medium",
      "cognitive_level": "L3",
      "question_type": "multiple_choice",
      "source_type": "original",
      "source_reference": null,
      "year": 2026,
      "is_original": true,
      "active": false,
      "status": "draft"
    }
  ]
}
```

## Campos obrigatórios

`schema_version`, `preparation_slug`, `questions[]`, `statement`, alternativas A-E, `answer`, `explanation`, `discipline`, `difficulty`, `cognitive_level`, `source_type` e `is_original`.

## Enums

- `difficulty`: `easy | medium | hard | very_hard`
- `cognitive_level`: `L1 | L2 | L3 | L4 | L5`
- `question_type`: `multiple_choice`
- `source_type`: `original | adapted | public_domain`

Para o banco editorial do Nós Passa, conteúdo novo deve usar `is_original=true`. Questões de terceiros não podem ser marcadas como originais.

## Fluxo

```text
JSON → parse → schema validation → preparation → discipline → topic/subtopic → duplicate check → business rules → DRY-RUN → aprovação → transação → resultado
```

## Validações estruturais

Rejeitar lote/linha se houver JSON inválido, array vazio, enunciado vazio, alternativa ausente/duplicada, resposta fora de A-E, explicação vazia ou enum inválido.

## Validações acadêmicas

Rejeitar se a preparação não existir/estiver inativa, se disciplina não existir na preparação, se assunto/subassunto não existir ou se a combinação não estiver prevista na matriz editorial.

## Qualidade

Enviar para revisão quando houver ambiguidade, mais de uma resposta defensável, explicação incompatível com o gabarito, baixa aderência ao edital, duplicidade semântica ou dependência de conteúdo fora do programa.

## Deduplicação

1. Exata: hash do enunciado normalizado.
2. Semântica: comparação de enunciado + alternativas para detectar reformulações muito próximas.

Duplicatas nunca são republicadas.

## Dry-run

O primeiro comando da interface deve ser **VALIDAR LOTE**. O dry-run não grava nada.

Exemplo:

```text
Lote: ADMCTRL-001
Recebidas: 50
✓ Válidas: 44
⚠ Duplicadas: 3
✕ Rejeitadas: 3

[IMPORTAR 44 QUESTÕES]
```

## Importação efetiva

A importação deve ser atômica por lote. Para cada questão: inserir em `questions`; criar `question_applicability`; localizar o `academic_content_item`; criar `question_applicability_content`. Qualquer falha obrigatória deve provocar rollback do lote.

## Status editorial

`draft → validated → technical_review → pedagogical_review → approved → published`, com `rejected` e `archived` como estados finais alternativos.

A importação padrão entra como `draft`. Publicação automática de conteúdo não revisado é proibida.

## Auditoria

Registrar batch id, operador, data/hora, preparação, recebidas, válidas, rejeitadas, duplicadas, importadas, publicadas, erros por linha e versão do schema.

## Limite de lote

Padrão: 50. De 51 a 100, mostrar alerta. Acima de 100, exigir confirmação administrativa.

## Segurança

O importador deve ficar em área administrativa e exigir `is_admin()`. O navegador não deve receber permissão de inserção direta irrestrita em `questions`, `question_applicability` ou `question_applicability_content`. A validação final deve ocorrer server-side, preferencialmente em Edge Function administrativa/transacional.

## Mapeamento para o schema atual

- `statement` → `questions.statement`
- `alternatives` → `questions.alternatives`
- `answer` → `questions.answer`
- `explanation` → `questions.explanation`
- `source_type` → `questions.source_type`
- `source_reference` → `questions.source_reference`
- `year` → `questions.year`
- `is_original` → `questions.is_original`
- `active` → `questions.active`
- `preparation_slug` → resolve `preparations.id`
- `discipline/topic/subtopic` → resolve `academic_content_items`

Os campos editoriais adicionais (`difficulty`, `cognitive_level`, `quality_score`, `status`, `review_status`, `external_id`) devem ser persistidos em colunas editoriais próprias ou em tabela de metadados antes da publicação do importador final. Não sobrecarregar campos existentes com significados diferentes.

## Resultado

```json
{
  "batch_id": "ADMCTRL-001",
  "status": "completed",
  "received": 50,
  "valid": 44,
  "duplicates": 3,
  "rejected": 3,
  "imported": 44,
  "published": 0,
  "errors": []
}
```

## Próxima implementação

1. Criar tabelas de auditoria/importação.
2. Adicionar metadados editoriais das questões.
3. Criar Edge Function administrativa `import-question-batch`.
4. Criar tela `/admin/importar-questoes.html` com seleção de JSON, dry-run, erros por linha e confirmação.
5. Criar painel de cobertura baseado em `data/question-bank-matrix.json`.
