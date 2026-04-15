import express from 'express';

const router = express.Router();

/**
 * Webhook SigiloPay
 * URL esperada:
 * POST /api/webhooks/sigilopay
 */
router.post('/sigilopay', (req, res) => {
  try {
    console.log('WEBHOOK SIGILOPAY RECEBIDO:', JSON.stringify(req.body, null, 2));

    const { token, transaction, event, data } = req.body || {};

    const tokenRecebido = token || req.headers['x-sigilopay-token'] || '';
    const tokenEsperado = process.env.SIGILOPAY_WEBHOOK_TOKEN || '';

    if (!tokenEsperado) {
      console.error('SIGILOPAY_WEBHOOK_TOKEN não configurado no .env');
      return res.status(500).json({ erro: 'Token do webhook não configurado.' });
    }

    if (tokenRecebido !== tokenEsperado) {
      console.warn('Webhook inválido: token divergente');
      return res.status(401).json({ erro: 'Webhook inválido.' });
    }

    const payloadTransacao = transaction || data || {};

    const transactionId =
      payloadTransacao.id ||
      payloadTransacao.txid ||
      payloadTransacao.transaction_id ||
      payloadTransacao.transactionId ||
      null;

    const identifier =
      payloadTransacao.identifier ||
      payloadTransacao.external_reference ||
      payloadTransacao.reference ||
      payloadTransacao.metadata?.pedidoId ||
      req.body?.identifier ||
      req.body?.metadata?.pedidoId ||
      null;

    const transactionStatus = String(
      payloadTransacao.status || event || req.body?.status || ''
    ).toLowerCase();

    if (!transactionId && !identifier) {
      console.warn('Webhook recebido sem transactionId e sem identifier:', req.body);
      return res.sendStatus(200);
    }

    const pedidos = global.pedidos || [];

    const pedido = pedidos.find((item) => {
      const bateTxid =
        item.pagamento &&
        item.pagamento.txid &&
        String(item.pagamento.txid) === String(transactionId);

      const bateIdentifier =
        item.id &&
        String(item.id) === String(identifier);

      return bateTxid || bateIdentifier;
    });

    if (!pedido) {
      console.warn('Nenhum pedido encontrado para o webhook:', {
        transactionId,
        identifier
      });
      return res.sendStatus(200);
    }

    pedido.pagamento = {
      ...pedido.pagamento,
      ultimoWebhookEm: new Date().toISOString(),
      rawStatus: transactionStatus,
      rawWebhook: req.body
    };

    const statusPago = [
      'paid',
      'pago',
      'approved',
      'aprovado',
      'completed',
      'concluido',
      'concluído',
      'confirmado',
      'success',
      'successful'
    ];

    const statusPendente = [
      'pending',
      'pendente',
      'waiting_payment',
      'aguardando_pagamento',
      'waiting',
      'processing',
      'processando',
      'created',
      'generated'
    ];

    const statusCancelado = [
      'cancelled',
      'canceled',
      'cancelado',
      'expired',
      'expirado',
      'failed',
      'falhou',
      'refused',
      'recusado'
    ];

    if (statusPago.includes(transactionStatus)) {
      pedido.pagamento.status = 'pago';
      pedido.pagamento.pagoEm = new Date().toISOString();

      if (
        pedido.status === 'pendente_pagamento' ||
        pedido.status === 'comprovante_enviado' ||
        !pedido.status
      ) {
        pedido.status = 'pago';
      }
    } else if (statusPendente.includes(transactionStatus)) {
      pedido.pagamento.status = 'pendente';

      if (!pedido.status || pedido.status === 'pendente_pagamento') {
        pedido.status = 'pendente_pagamento';
      }
    } else if (statusCancelado.includes(transactionStatus)) {
      pedido.pagamento.status = 'cancelado';

      if (pedido.status !== 'emitido') {
        pedido.status = 'cancelado';
      }
    } else {
      console.warn('Status de webhook não mapeado:', transactionStatus);
    }

    console.log('Webhook SigiloPay processado com sucesso:', {
      pedidoId: pedido.id,
      transactionId,
      identifier,
      transactionStatus,
      statusPedido: pedido.status,
      statusPagamento: pedido.pagamento.status
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar webhook SigiloPay:', error);
    return res.status(500).json({
      erro: 'Erro interno ao processar webhook.'
    });
  }
});

export default router;