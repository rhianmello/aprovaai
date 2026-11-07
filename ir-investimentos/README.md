# IR Ações — auditoria preliminar de operações comuns

URL publicada: https://www.nospassa.com.br/ir-investimentos/

Módulo isolado em `/ir-investimentos/` do repositório `rhianmello/aprovaai`, com três tabelas de dados RLS e um bucket privado no Supabase `aprovaai`.

## O que funciona
- Cadastro e login pelo Supabase Auth.
- Upload privado e gerenciamento de extratos CSV, XLS, XLSX e PDF.
- Importação de operações de planilhas com mapeamento de colunas, validação e alerta sobre linhas ignoradas.
- Lançamentos manuais de compras/vendas, posições iniciais e custos históricos.
- Saldo de ações em 31/12, preço médio, resultados por mês, regra de isenção de até R$ 20 mil de vendas por mês e IR bruto *indicativo* de 15%.
- Bloqueio da estimativa fiscal quando há venda sem custo, day trade potencial, operação fora de escopo ou importação parcial.
- Exportação CSV e impressão/salvamento em PDF pelo navegador.
- Compartimentação por usuário (RLS e Storage); os arquivos **não ficam no repositório público**.

## Limitações fundamentais
- **PDF da posição histórica Clear**: extração local de tabela de posições (quantidade, última cotação, posição financeira e data-base). Isso NÃO converte o PDF em notas de corretagem, operações, custo histórico ou lucro realizado. Outros modelos de PDF ficam arquivados sem análise.
- A apuração inicial suporta somente operações comuns à vista com ações brasileiras reconhecidas, inclusive código B3SA3. ETFs, FIIs, FIAGRO, BDRs, units, opções, derivativos, exterior, day trade e proventos exigem tratamento adicional. **Unidades como KLBN11 aparecem na posição histórica, mas não são incluídas na simulação simplificada de IR.**
- **Template Mycapital**: detecta as abas VISTA, ALUGUEL (BTC) e IRRF-PREJUIZO ACUMULADO. Importa quantidades por mercado, permite reconciliação com o PDF e nunca presume que '18' ou custos zerados sejam preços históricos. Ainda não reconstrói o custo por notas; a entrada manual do custo total validado é feita em Valorização.
- Não importamos dados das notas de corretagem, informes de rendimentos, DARFs, IRRF ou declaração transmitida; também não validamos eventos societários.
- Não considera imposto já retido, DARF recolhido, juros, multas, dados anteriores à data inicial informada ou compensações fiscais não documentadas.
- **Valorização não realizada** = mercado (na data do PDF) menos custo histórico informado, com percentual. Não é cotação ao vivo, não é ganho efetivamente realizado, não inclui dividendos/JCP e não corresponde diretamente ao imposto devido.
- Os valores são auxiliares, não definitivos. O contador deve validar o histórico completo e as regras do ano-base.
- Use preferencialmente um CSV com os campos do arquivo `modelo-operacoes.csv` (apenas **dados fictícios**). O sistema permite mapear nomes de colunas diferentes.

## Estrutura do banco (já instalada)
- `public.ir_uploads`: metadados do documento (inclui hash SHA-256 por usuário).
- `public.ir_trades`: operações vinculadas ou inseridas manualmente.
- `public.ir_opening_positions`: posição inicial com custo de aquisição.
- Bucket privado `storage.ir-extratos` com arquivos sob `<auth.uid()>/...`, RLS por dono.
- Migração `ir_investimentos_v1_private`.

## Como usar esta versão
1. Entrar / criar conta.
2. Ir a **Importar extratos** e selecionar o PDF de **Posição Consolidada** da Clear. Confirmar os ativos reconhecidos; em seguida abrir **Valorização**.
3. Enviar o modelo Excel **saldo_inicial** da Mycapital. Informar a mesma data de referência do PDF. Conferir os totais VISTA + ALUGUEL (BTC), sem duplicar as ações emprestadas.
4. Os campos zerados e o marcador 18 não são evidências de preço médio. Obter notas de corretagem, extrato histórico completo ou informe anterior com preço/custo de aquisição; em **Valorização**, clicar **Informar custo** e cadastrar o custo total comprovado de cada ativo.
5. O sistema calcula o preço médio e a valorização/desvalorização histórica apenas quando o custo completo existe; sem custo, mostra pendência. Para apuração fiscal completa, trazer notas de operações, proventos, IRRF, DARFs e eventos societários.

Os documentos enviados pelo usuário ao chat **não são** automaticamente enviados ao site nem ao banco de dados. Faça upload diretamente na conta que deve ter acesso.

## Próxima etapa recomendada
Adicionar suporte à leitura automática de histórico de compras/vendas em notas de corretagem e extrato B3, custos e eventos societários, IRRF e DARFs, e conferência efetiva com a declaração transmitida antes de emitir cálculo definitivo.

Referências oficiais:
- https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/isencoes
- https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/demonstrativo-de-apuracao-de-ganhos

Ajuda oficial Mycapital: https://mycapital.movidesk.com/kb/pt-br/article/600429/como-preencher-os-custos-de-aquisicao-por-meio-da-planilha
