BEGIN;
DO $$
DECLARE
  v_prep uuid;
BEGIN
  SELECT id INTO v_prep FROM preparations WHERE slug='transpetro-2026-analise-de-sistemas-sap';
  IF v_prep IS NULL THEN RAISE EXCEPTION 'Preparation Transpetro SAP not found'; END IF;

  INSERT INTO academic_content_item_subtopics(content_item_id,subtopic_id,sort_order)
  SELECT ci.id,st.id,st.sort_order
  FROM academic_content_items ci
  JOIN academic_subtopics st ON st.topic_id=ci.topic_id AND st.active
  WHERE ci.preparation_id=v_prep
  ON CONFLICT DO NOTHING;

  UPDATE academic_content_items ci
  SET subtopic_id=x.subtopic_id
  FROM (
    SELECT content_item_id,(array_agg(subtopic_id ORDER BY sort_order,subtopic_id))[1] subtopic_id
    FROM academic_content_item_subtopics GROUP BY content_item_id HAVING count(*)=1
  ) x WHERE ci.id=x.content_item_id AND ci.preparation_id=v_prep;

  INSERT INTO questions(statement,alternatives,answer,explanation,source_type,source_reference,year,is_original,active)
  SELECT v.statement,v.alternatives::jsonb,v.answer,v.explanation,'edital',v.source_reference,2026,true,true
  FROM (VALUES
  ('Em uma solução ERP, qual característica melhor representa a principal finalidade de integrar processos de diferentes áreas da organização?','[{"letra":"A","texto":"Manter cada área com uma base de dados isolada"},{"letra":"B","texto":"Integrar processos e informações em um ambiente comum"},{"letra":"C","texto":"Eliminar a necessidade de regras de negócio"},{"letra":"D","texto":"Substituir todos os usuários por automações"},{"letra":"E","texto":"Impedir o compartilhamento de dados"}]','B','A integração de processos e informações é uma característica central de sistemas ERP.','Nos Passa | Transpetro 2026 SAP | conceitos de ERP'),
  ('No contexto de sistemas corporativos, qual alternativa melhor descreve o objetivo de uma solução integrada para informações gerenciais?','[{"letra":"A","texto":"Produzir informação sem considerar o processo de negócio"},{"letra":"B","texto":"Apoiar decisões utilizando informações consolidadas e relevantes"},{"letra":"C","texto":"Restringir relatórios à área de infraestrutura"},{"letra":"D","texto":"Eliminar indicadores estratégicos"},{"letra":"E","texto":"Impedir análises financeiras"}]','B','Soluções de informações gerenciais devem apoiar a análise e a tomada de decisão.','Nos Passa | Transpetro 2026 SAP | modelagem de soluções para informações gerenciais'),
  ('No SAP, FI-AP está relacionado principalmente a qual processo?','[{"letra":"A","texto":"Contas a pagar"},{"letra":"B","texto":"Gestão de materiais"},{"letra":"C","texto":"Vendas"},{"letra":"D","texto":"Recursos humanos"},{"letra":"E","texto":"Manutenção preventiva"}]','A','FI-AP corresponde a Accounts Payable, isto é, contas a pagar.','Nos Passa | Transpetro 2026 SAP | FI-AP / FI-AR / FI-GL'),
  ('Em uma arquitetura SAP, qual combinação representa módulos de logística?','[{"letra":"A","texto":"MM e SD"},{"letra":"B","texto":"FI e CO"},{"letra":"C","texto":"HCM e TRM"},{"letra":"D","texto":"BCS e CO"},{"letra":"E","texto":"GL e AR"}]','A','MM trata de materiais e SD de vendas e distribuição, compondo processos de logística.','Nos Passa | Transpetro 2026 SAP | SAP MM e SAP SD'),
  ('Em sistemas corporativos, o HCM está associado principalmente à gestão de qual recurso?','[{"letra":"A","texto":"Rede elétrica"},{"letra":"B","texto":"Pessoas e recursos humanos"},{"letra":"C","texto":"Banco de dados geográfico"},{"letra":"D","texto":"Ativos financeiros exclusivamente"},{"letra":"E","texto":"Servidores físicos"}]','B','HCM significa Human Capital Management e está relacionado à gestão de pessoas.','Nos Passa | Transpetro 2026 SAP | SAP HCM'),
  ('Qual é uma vantagem da integração entre SAP-BI e processos funcionais do SAP-ERP?','[{"letra":"A","texto":"Separar completamente os dados operacionais dos analíticos"},{"letra":"B","texto":"Facilitar a análise de informações originadas nos processos corporativos"},{"letra":"C","texto":"Eliminar toda necessidade de indicadores"},{"letra":"D","texto":"Impedir consolidação de dados"},{"letra":"E","texto":"Restringir consultas ao cadastro de usuários"}]','B','A integração favorece a exploração analítica de informações produzidas pelos processos do ERP.','Nos Passa | Transpetro 2026 SAP | SAP-BI e integrações'),
  ('Um Sistema de Informação pode ser entendido, de forma geral, como um conjunto organizado de recursos destinado a:','[{"letra":"A","texto":"Processar informações para apoiar operações, controle ou decisão"},{"letra":"B","texto":"Executar apenas tarefas sem dados"},{"letra":"C","texto":"Substituir exclusivamente equipamentos de rede"},{"letra":"D","texto":"Impedir o fluxo de informação"},{"letra":"E","texto":"Eliminar processos organizacionais"}]','A','Sistemas de Informação organizam recursos para coletar, processar, armazenar e disponibilizar informação.','Nos Passa | Transpetro 2026 SAP | conceitos e tipos de Sistemas de Informação'),
  ('Qual exemplo corresponde melhor a um requisito funcional de um sistema?','[{"letra":"A","texto":"O sistema deve permitir cadastrar clientes"},{"letra":"B","texto":"O servidor deve possuir determinado nível de disponibilidade"},{"letra":"C","texto":"A interface deve responder em até determinado tempo"},{"letra":"D","texto":"O sistema deve utilizar criptografia de determinado padrão"},{"letra":"E","texto":"A aplicação deve suportar determinada carga"}]','A','Requisitos funcionais descrevem serviços ou comportamentos que o sistema deve oferecer.','Nos Passa | Transpetro 2026 SAP | tipos de requisitos'),
  ('Na BPMN 2.0, qual elemento é usado para representar uma atividade ou trabalho executado em um processo?','[{"letra":"A","texto":"Tarefa"},{"letra":"B","texto":"Evento de início"},{"letra":"C","texto":"Gateway exclusivamente"},{"letra":"D","texto":"Pool obrigatoriamente"},{"letra":"E","texto":"Mensagem"}]','A','A tarefa representa uma atividade executada dentro do processo BPMN.','Nos Passa | Transpetro 2026 SAP | BPMN 2.0'),
  ('Em um processo ETL, qual etapa normalmente envolve a obtenção dos dados nas fontes de origem?','[{"letra":"A","texto":"Extração"},{"letra":"B","texto":"Apresentação"},{"letra":"C","texto":"Visualização"},{"letra":"D","texto":"Pivotagem"},{"letra":"E","texto":"Classificação"}]','A','A extração é a etapa responsável por obter os dados das fontes de origem.','Nos Passa | Transpetro 2026 SAP | extração de dados'),
  ('Qual característica diferencia conceitualmente um Data Warehouse de uma fonte operacional?','[{"letra":"A","texto":"O Data Warehouse é orientado à análise e integração histórica de dados"},{"letra":"B","texto":"O Data Warehouse existe apenas para registrar transações em tempo real"},{"letra":"C","texto":"O Data Warehouse não armazena dados históricos"},{"letra":"D","texto":"O Data Warehouse elimina a necessidade de modelagem"},{"letra":"E","texto":"O Data Warehouse é obrigatoriamente um arquivo de texto"}]','A','Data Warehouses são construídos para suportar análise, integração e histórico de dados.','Nos Passa | Transpetro 2026 SAP | Data Warehouse'),
  ('Em OLAP, a operação drill-down normalmente permite ao usuário:','[{"letra":"A","texto":"Ir para um nível mais detalhado da informação"},{"letra":"B","texto":"Excluir a dimensão analisada"},{"letra":"C","texto":"Desativar o banco de dados"},{"letra":"D","texto":"Converter dados em código-fonte"},{"letra":"E","texto":"Remover todos os fatos"}]','A','Drill-down navega de um nível mais agregado para outro mais detalhado.','Nos Passa | Transpetro 2026 SAP | OLAP e modelagem multidimensional'),
  ('Em mineração de dados, qual é o objetivo típico de uma tarefa de classificação?','[{"letra":"A","texto":"Atribuir registros a categorias ou classes conhecidas"},{"letra":"B","texto":"Excluir todos os atributos"},{"letra":"C","texto":"Criar somente relatórios financeiros"},{"letra":"D","texto":"Armazenar metadados sem análise"},{"letra":"E","texto":"Desativar modelos preditivos"}]','A','Classificação busca atribuir observações a classes predefinidas.','Nos Passa | Transpetro 2026 SAP | classificação de dados'),
  ('Qual é uma finalidade do Balanced Scorecard?','[{"letra":"A","texto":"Traduzir objetivos estratégicos em perspectivas e indicadores de desempenho"},{"letra":"B","texto":"Substituir todos os sistemas transacionais"},{"letra":"C","texto":"Eliminar indicadores não financeiros por definição"},{"letra":"D","texto":"Gerenciar somente servidores"},{"letra":"E","texto":"Modelar exclusivamente bancos relacionais"}]','A','O Balanced Scorecard apoia a gestão estratégica por meio de perspectivas, objetivos e indicadores.','Nos Passa | Transpetro 2026 SAP | Balanced Scorecard'),
  ('No PMBOK 7ª edição, os princípios orientam principalmente:','[{"letra":"A","texto":"A forma de pensar e agir na gestão de projetos"},{"letra":"B","texto":"Uma sequência obrigatória e imutável de processos"},{"letra":"C","texto":"Somente a configuração de ferramentas de software"},{"letra":"D","texto":"Exclusivamente o controle financeiro"},{"letra":"E","texto":"Somente projetos de tecnologia"}]','A','A sétima edição enfatiza princípios e domínios de desempenho.','Nos Passa | Transpetro 2026 SAP | princípios do PMBoK 7ª edição'),
  ('No Scrum, qual evento é utilizado para inspecionar o incremento e adaptar o Product Backlog quando necessário?','[{"letra":"A","texto":"Sprint Review"},{"letra":"B","texto":"Daily Scrum"},{"letra":"C","texto":"Sprint Planning exclusivamente"},{"letra":"D","texto":"Retrospective"},{"letra":"E","texto":"Refinement obrigatório"}]','A','A Sprint Review inspeciona o resultado da Sprint com stakeholders e pode gerar adaptações no backlog.','Nos Passa | Transpetro 2026 SAP | SCRUM'),
  ('Ao interpretar um texto, uma inferência corresponde a:','[{"letra":"A","texto":"Uma conclusão obtida a partir de informações e relações presentes no texto"},{"letra":"B","texto":"Uma informação necessariamente escrita com as mesmas palavras"},{"letra":"C","texto":"Uma opinião sem relação com o texto"},{"letra":"D","texto":"Uma alteração do texto original"},{"letra":"E","texto":"Uma tradução automática"}]','A','Inferir é chegar a uma conclusão sustentada pelas informações e relações apresentadas.','Nos Passa | Transpetro 2026 SAP | interpretação e inferência de informações'),
  ('Em português, a ocorrência de crase está diretamente relacionada à fusão de:','[{"letra":"A","texto":"Preposição a com artigo ou pronome iniciado por a"},{"letra":"B","texto":"Dois verbos"},{"letra":"C","texto":"Dois artigos indefinidos"},{"letra":"D","texto":"Consoante com vogal"},{"letra":"E","texto":"Pronome com advérbio"}]','A','A crase ocorre, em regra, quando a preposição a se funde com artigo ou pronome iniciado por a.','Nos Passa | Transpetro 2026 SAP | crase'),
  ('Em língua inglesa, ao identificar a ideia principal de um texto, o leitor deve priorizar:','[{"letra":"A","texto":"O sentido global e as informações centrais do texto"},{"letra":"B","texto":"Somente a tradução palavra por palavra"},{"letra":"C","texto":"Apenas o primeiro substantivo"},{"letra":"D","texto":"Somente os cognatos"},{"letra":"E","texto":"A ordem alfabética das palavras"}]','A','A compreensão global considera o sentido central e as relações entre as informações do texto.','Nos Passa | Transpetro 2026 SAP | compreensão de texto escrito em língua inglesa'),
  ('Na colocação pronominal, a escolha entre próclise, mesóclise e ênclise depende, entre outros fatores, de:','[{"letra":"A","texto":"Regras sintáticas e elementos que atraem o pronome"},{"letra":"B","texto":"Somente do tamanho da frase"},{"letra":"C","texto":"Apenas da quantidade de substantivos"},{"letra":"D","texto":"Somente da pontuação final"},{"letra":"E","texto":"Da ordem alfabética do verbo"}]','A','A colocação dos pronomes átonos é condicionada por regras sintáticas e por fatores de atração.','Nos Passa | Transpetro 2026 SAP | colocação dos pronomes átonos')
  ) v(statement,alternatives,answer,explanation,source_reference)
  WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.source_reference=v.source_reference);

  INSERT INTO question_applicability(question_id,preparation_id,active)
  SELECT q.id,v_prep,true FROM questions q
  WHERE q.is_original AND q.source_reference LIKE 'Nos Passa | Transpetro 2026 SAP |%'
  AND NOT EXISTS(SELECT 1 FROM question_applicability qa WHERE qa.question_id=q.id AND qa.preparation_id=v_prep);

  INSERT INTO question_applicability_content(applicability_id,content_item_id,preparation_id)
  SELECT qa.id,ci.id,v_prep
  FROM question_applicability qa JOIN questions q ON q.id=qa.question_id
  JOIN academic_content_items ci ON ci.preparation_id=v_prep
  JOIN academic_subtopics st ON st.topic_id=ci.topic_id
  WHERE qa.preparation_id=v_prep AND q.is_original AND (
   (q.source_reference LIKE '%conceitos de ERP' AND st.name='Conceitos de ERP') OR
   (q.source_reference LIKE '%modelagem de soluções%' AND st.name='Modelagem de soluções para informações gerenciais') OR
   (q.source_reference LIKE '%FI-AP%' AND st.name='FI-AP / FI-AR / FI-GL') OR
   (q.source_reference LIKE '%SAP MM%' AND st.name='SAP MM') OR
   (q.source_reference LIKE '%SAP HCM%' AND st.name='SAP HCM') OR
   (q.source_reference LIKE '%SAP-BI e integrações%' AND st.name='SAP-BI e integrações entre módulos') OR
   (q.source_reference LIKE '%conceitos e tipos de Sistemas%' AND st.name='Conceitos e tipos de Sistemas de Informação') OR
   (q.source_reference LIKE '%tipos de requisitos%' AND st.name='Tipos de requisitos') OR
   (q.source_reference LIKE '%BPMN 2.0%' AND st.name='BPMN 2.0') OR
   (q.source_reference LIKE '%extração de dados%' AND st.name='Extração de dados') OR
   (q.source_reference LIKE '%Data Warehouse%' AND st.name='Data Warehouse') OR
   (q.source_reference LIKE '%OLAP%' AND st.name='OLAP e modelagem multidimensional') OR
   (q.source_reference LIKE '%classificação de dados%' AND st.name='Classificação de dados') OR
   (q.source_reference LIKE '%Balanced Scorecard%' AND st.name='Balanced Scorecard') OR
   (q.source_reference LIKE '%princípios do PMBoK%' AND st.name='Princípios do PMBoK 7ª edição') OR
   (q.source_reference LIKE '%SCRUM%' AND st.name='SCRUM') OR
   (q.source_reference LIKE '%interpretação e inferência%' AND st.name='Interpretação e inferência de informações') OR
   (q.source_reference LIKE '%crase%' AND st.name='Crase') OR
   (q.source_reference LIKE '%compreensão de texto escrito em língua inglesa%' AND st.name='Compreensão de texto escrito em língua inglesa') OR
   (q.source_reference LIKE '%colocação dos pronomes%' AND st.name='Colocação dos pronomes átonos')
  ) ON CONFLICT DO NOTHING;
END $$;
COMMIT;