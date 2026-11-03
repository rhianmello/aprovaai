# ChainWatch — Alertas automáticos (etapa 2 / beta)

## Estado
- Radar público Binance e seu cron preservados, sem alteração.
- Painel autenticado: /btc-radar/app/#alerts
- Novo cron chainwatch-personal-alerts, a cada 2 minutos, em lotes de até 3 endereços elegíveis.
- Reconsulta individual agendada para aproximadamente 5 minutos; pode atrasar por filas e limites de API.
- Primeira checagem forma baseline, sem disparar alertas retroativos.
- Alerta de saída: endereço observado participa dos inputs e há diminuição líquida de BTC. Depósitos de poeira recebidos não geram aviso.
- Deduplicação por endereço + TXID e por usuário + endereço + TXID + canal. Fila com até cinco tentativas e backoff.
- Estado sent significa aceito pelo provedor, NÃO necessariamente entregue na caixa de entrada.
- Todos os monitoramentos estão desligados até o usuário autorizar. Sem cobrança.

## E-mail via Resend
1. Criar conta no https://resend.com/ e verificar domínio próprio de envio.
2. Em Supabase Dashboard > Edge Functions > Secrets configurar CHAINWATCH_RESEND_API_KEY e CHAINWATCH_EMAIL_FROM (remetente validado, por exemplo: ChainWatch <alertas@seu-dominio.com>).
3. Verificar se GET https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/chainwatch-telegram-webhook retorna email_ready true.
4. Ativar e-mail pelo painel com uma conta que tenha e-mail confirmado no Supabase Auth.

## Telegram via BotFather
1. Criar bot no @BotFather. Não publicar token em código ou compartilhá-lo por chat.
2. No Supabase > Edge Functions > Secrets configurar:
   CHAINWATCH_TELEGRAM_BOT_TOKEN
   CHAINWATCH_TELEGRAM_BOT_USERNAME (sem @)
   CHAINWATCH_TELEGRAM_WEBHOOK_SECRET (segredo aleatório, letras/números/sublinhado/hífen)
3. Configurar webhook Telegram:
   URL: https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/chainwatch-telegram-webhook
   Método: POST via Telegram setWebhook
   Parametro secret_token: CHAINWATCH_TELEGRAM_WEBHOOK_SECRET
   Permitir mensagens (allowed_updates ["message"]).
4. Conferir telegram_ready true no endpoint GET e abrir o painel para gerar link de vínculo.
5. Clique Iniciar no bot para consumir código aleatório de uso único, com expiração em 10 minutos.
6. Retorne ao ChainWatch e ative a carteira e o canal no painel.

Exemplo PowerShell (usar variáveis de ambiente locais, não revelar a chave):
```powershell
$body = @{
 url = "https://ztqtcbzjesrkuaijmylm.supabase.co/functions/v1/chainwatch-telegram-webhook"
 secret_token = $env:CHAINWATCH_TELEGRAM_WEBHOOK_SECRET
 allowed_updates = '["message"]'
}
Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$env:CHAINWATCH_TELEGRAM_BOT_TOKEN/setWebhook" -Body $body
```

## Validações antes de cobrar
- O endereço é privado por RLS, mas a blockchain é pública; nunca solicitar chave privada ou seed.
- Sem alertas históricos na primeira sincronização.
- Após transação real de saída, conferir valor, hash, estado confirmado/pendente, canal e link externo.
- No máximo um registro por combinação de usuário, endereço, transação e canal.
- Testar fluxo com o Telegram/e-mail realmente configurados, antes de alegar entrega completa.
- Alertas podem demorar e a API pública pode bloquear por limite HTTP 429.
- Para escala, substituir APIs públicas por provedor dedicado e ampliar paginação.
- Plano de cobrança permanece DESLIGADO.

## Banco de dados
Tabelas: chainwatch_alert_settings, chainwatch_alert_scan_state, chainwatch_alert_seen, chainwatch_alert_events, chainwatch_alert_deliveries, chainwatch_telegram_codes.
Coluna de controle: chainwatch_user_wallets.monitor_enabled.
As tabelas internas são restritas ao service_role; as preferências e o histórico são protegidos por políticas RLS do usuário.
