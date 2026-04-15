import fetch from 'node-fetch';

const BASE_URL = process.env.SIGILOPAY_BASE_URL || 'https://app.sigilopay.com.br/api/v1';

const PRECOS_POR_DIAS = {
  1: 29.67,
  2: 39.43,
  3: 49.87,
  5: 59.31,
  7: 69.72,
  10: 79.46,
  15: 89.23
};

function obterValorPorDias(dias) {
  const diasNumero = Number(dias || 1);
  return PRECOS_POR_DIAS[diasNumero] || PRECOS_POR_DIAS[1];
}

function limparDocumento(valor = '') {
  return String(valor).replace(/\D/g, '');
}

function limparTexto(valor = '') {
  return String(valor || '').trim();
}

function normalizarTelefoneSigiloPay(valor = '') {
  let numero = String(valor || '').replace(/\D/g, '');

  // remove código do país Brasil se vier no início
  if (numero.startsWith('55') && (numero.length === 12 || numero.length === 13)) {
    numero = numero.slice(2);
  }

  return numero;
}

export async function criarPix(pedido) {
  const dias = Number(
    pedido.documento?.diasAfastamento ||
    pedido.diasAfastamento ||
    pedido.dias ||
    1
  );

  const valor = obterValorPorDias(dias);

  const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;
  const secretKey = process.env.SIGILOPAY_SECRET_KEY;
  const callbackUrl = `${process.env.SITE_URL}/api/webhooks/sigilopay`;

  if (!publicKey || !secretKey) {
    throw new Error('Credenciais da SigiloPay não configuradas no arquivo .env');
  }

  const nomeCliente = limparTexto(
    pedido.paciente?.nome ||
    pedido.nome ||
    'Cliente MedFlix'
  );

  const emailCliente = limparTexto(
    pedido.paciente?.email ||
    pedido.email ||
    'cliente@medflix.local'
  );

  const documentoCliente = limparDocumento(
    pedido.paciente?.cpf ||
    pedido.cpf ||
    ''
  );

  const telefoneCliente = normalizarTelefoneSigiloPay(
    pedido.paciente?.telefone ||
    pedido.telefone ||
    ''
  );

  if (!telefoneCliente) {
    throw new Error('Telefone do cliente não informado no pedido.');
  }

  if (telefoneCliente.length < 10 || telefoneCliente.length > 11) {
    throw new Error('Telefone do cliente em formato inválido para a SigiloPay.');
  }

  if (!documentoCliente) {
    throw new Error('CPF do cliente não informado no pedido.');
  }

  const payload = {
    identifier: String(pedido.id),
    amount: valor,
    client: {
      name: nomeCliente,
      email: emailCliente,
      document: documentoCliente,
      phone: telefoneCliente
    },
    callbackUrl,
    metadata: {
      pedidoId: String(pedido.id),
      dias: String(dias),
      descricao: `Atestado Online MedFlix - ${dias} dia(s)`
    }
  };

  console.log('PAYLOAD SIGILOPAY:', JSON.stringify(payload, null, 2));

  const response = await fetch(`${BASE_URL}/gateway/pix/receive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-public-key': publicKey,
      'x-secret-key': secretKey
    },
    body: JSON.stringify(payload)
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Resposta inválida da SigiloPay. Status HTTP: ${response.status}`);
  }

  console.log('RESPOSTA SIGILOPAY:', JSON.stringify(data, null, 2));

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      JSON.stringify(data?.details || data) ||
      `Erro ao criar cobrança PIX na SigiloPay. Status HTTP: ${response.status}`
    );
  }

  return {
    txid: data?.transactionId || data?.id || data?.txid || pedido.id,
    copiaECola:
      data?.pix?.copyPaste ||
      data?.pix?.code ||
      data?.pix_code ||
      data?.copy_paste ||
      '',
    qrCode:
      data?.pix?.qrCode ||
      data?.pix?.qr_code ||
      data?.qr_code ||
      data?.pix_code ||
      '',
    valor,
    raw: data
  };
}