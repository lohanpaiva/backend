import { Router } from 'express';

const router = Router();

function formatarDataHoraBR(data) {
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return data || '-';
  return d.toLocaleString('pt-BR');
}

router.get('/:codigo', (req, res) => {
  const { codigo } = req.params;

  const pedidos = global.pedidos || [];

  const pedido = pedidos.find(
    (item) =>
      item.documento &&
      item.documento.codigoValidacao &&
      String(item.documento.codigoValidacao).toUpperCase() === String(codigo).toUpperCase()
  );

  if (!pedido) {
    return res.status(404).json({
      valido: false,
      mensagem: 'Nenhum documento encontrado para este código.'
    });
  }

  const status = String(pedido.status || '').toLowerCase();

  const payloadBase = {
    status: pedido.status || 'emitido',
    paciente: {
      nome: pedido.paciente?.nome || pedido.nome || '-',
      cpf: pedido.paciente?.cpf || pedido.cpf || '-'
    },
    medico: {
      nome: pedido.medico?.nome || pedido.medico || '-',
      crm: pedido.medico?.crm || pedido.crm || '-',
      uf: pedido.medico?.uf || pedido.uf || '-'
    },
    documento: {
      tipo: pedido.documento?.tipo || 'Atestado Médico',
      dataEmissao:
        pedido.documento?.dataEmissaoFormatada ||
        formatarDataHoraBR(pedido.documento?.dataEmissao),
      codigoValidacao: pedido.documento?.codigoValidacao || '-',
      diasAfastamento:
        pedido.documento?.diasAfastamento ||
        pedido.diasAfastamento ||
        pedido.dias ||
        '-'
    }
  };

  if (status === 'cancelado' || status === 'reprovado') {
    return res.status(200).json({
      valido: false,
      ...payloadBase,
      mensagem:
        status === 'reprovado'
          ? 'Este documento foi reprovado e não possui validade.'
          : 'Este documento foi cancelado.'
    });
  }

  if (status !== 'emitido') {
    return res.status(200).json({
      valido: false,
      ...payloadBase,
      mensagem: 'Este documento ainda não foi emitido oficialmente.'
    });
  }

  return res.json({
    valido: true,
    ...payloadBase,
    mensagem: 'Documento válido.'
  });
});

export default router;