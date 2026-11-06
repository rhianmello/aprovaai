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
- **PDF fica guardado para auditoria e não é convertido automaticamente em operações.** Isso exige desenvolvimento guiado por um modelo real de extrato de corretora; não invente linhas.
- A apuração inicial suporta somente operações comuns à vista com ações brasileiras de código típico final 3/4/5/6/7/8; ETFs, FIIs, FIAGRO, BDRs, units, opções, derivativos, exterior, day trade e proventos exigem tratamento adicional.
- Não importamos dados das notas de corretagem, informes de rendimentos, DARFs, IRRF ou declaração transmitida; também não validamos eventos societários.
- Não considera imposto já retido, DARF recolhido, juros, multas, dados anteriores à data inicial informada ou compensações fiscais não documentadas.
- Os valores são auxiliares, não definitivos. O contador deve validar o histórico completo e as regras do ano-base.
- Use preferencialmente um CSV com os campos do arquivo `modelo-operacoes.csv` (apenas **dados fictícios**). O sistema permite mapear nomes de colunas diferentes.

## Estrutura do banco (já instalada)
- `public.ir_uploads`: metadados do documento (inclui hash SHA-256 por usuário).
- `public.ir_trades`: operações vinculadas ou inseridas manualmente.
- `public.ir_opening_positions`: posição inicial com custo de aquisição.
- Bucket privado `storage.ir-extratos` com arquivos sob `<auth.uid()>/...`, RLS por dono.
- Migração `ir_investimentos_v1_private`.

## Próxima etapa recomendada
Solicitar um extrato anonimizado real da corretora e implementar uma rotina de parser específica para ele; acrescentar conciliação de notas, IRRF e DARFs, histórico societário e comparação com a DIRPF antes de chamar o cálculo de imposto devido definitivo.

Referências oficiais:
- https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/isencoes
- https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/pagamento/renda-variavel/bolsa-de-valores-1/demonstrativo-de-apuracao-de-ganhos
