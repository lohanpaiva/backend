import { criarPix } from '../services/pagamentoService.js';
import { gerarPDF } from '../services/pdfService.js';

let pedidos = [];

export async function criarPedido(req, res) {
  try {
    const pedido = {
      id: Date.now(),
      nome: req.body.nome || '',
      cpf: req.body.cpf || '',
      telefone: req.body.telefone || '',
      email: req.body.email || '',
      estado: req.body.estado || '',
      cidade: req.body.cidade || '',
      sintomas: req.body.sintomas || '',
      detalhes: req.body.detalhes || '',
      dataInicioSintomas: req.body.dataInicioSintomas || '',
      diasAfastamento: req.body.diasAfastamento || req.body.dias || '',
      validadeAtestadoAPartirDe: req.body.validadeAtestadoAPartirDe || '',
      status: 'pendente_pagamento',
      criadoEm: new Date().toISOString()
    };

    const pix = await criarPix(pedido);

    const pedidoCompleto = {
      ...pedido,
      pagamento: {
        status: 'pendente',
        txid: pix.txid || '',
        copiaECola: pix.copiaECola || '',
        qrCode: pix.qrCode || '',
        valor: pix.valor || 0,
        criadoEm: new Date().toISOString(),
        raw: pix.raw || null
      }
    };

    pedidos.push(pedidoCompleto);

    res.json({
      pedidoId: pedidoCompleto.id,
      status: pedidoCompleto.status,
      pagamento: pedidoCompleto.pagamento
    });

  } catch (err) {
    console.error('ERRO AO CRIAR PEDIDO:', err);
    res.status(500).json({
      erro: 'Erro ao gerar PIX',
      detalhe: err.message
    });
  }
}

export function listarPedidos(req, res) {
  res.json(pedidos);
}

export function buscarPedido(req, res) {
  const { id } = req.params;

  const pedido = pedidos.find(p => p.id == id);

  if (!pedido) {
    return res.status(404).json({ erro: 'Pedido não encontrado' });
  }

  res.json(pedido);
}

export async function aprovarPedido(req, res) {
  try {
    const { id } = req.params;

    const pedido = pedidos.find(p => p.id == id);

    if (!pedido) {
      return res.status(404).json({ erro: 'Pedido não encontrado' });
    }

    pedido.status = 'emitido';

    pedido.medico = {
      id: req.body.medicoId || '',
      nome: req.body.medico || 'Médico Responsável',
      crm: req.body.crm || 'CRM/UF 000000',
      cidade: req.body.cidade || 'São Paulo',
      uf: req.body.uf || 'SP',
      assinatura: req.body.assinatura || ''
    };

    pedido.documento = {
      ...pedido.documento,
      diasAfastamento: req.body.dias || pedido.diasAfastamento || 1,
      cid: req.body.cid || 'Não informado',
      tipo: 'Atestado Médico',
      texto:
        pedido.documento?.texto ||
        `Atesto, para os devidos fins, que o(a) paciente acima identificado(a) foi submetido(a) à avaliação médica, podendo necessitar de afastamento de suas atividades pelo período indicado, conforme análise clínica realizada.`,
      dataEmissao: new Date().toISOString(),
      codigoValidacao: pedido.documento?.codigoValidacao || `MED-${pedido.id}`
    };

    pedido.aprovadoEm = req.body.aprovadoEm || new Date().toISOString();
    pedido.adminUsuario = req.body.adminUsuario || 'admin';
    pedido.observacaoAdmin = req.body.observacaoAdmin || '';

    const pdfGerado = await gerarPDF(pedido);

    pedido.pdf = {
      url: `/pdfs/${pdfGerado.fileName}`,
      urlValidacao: pdfGerado.urlValidacao
    };

    res.json(pedido);

  } catch (err) {
    console.error('ERRO AO APROVAR PEDIDO:', err);
    res.status(500).json({
      erro: 'Erro ao aprovar pedido',
      detalhe: err.message
    });
  }
}

export function reprovarPedido(req, res) {
  const { id } = req.params;

  const pedido = pedidos.find(p => p.id == id);

  if (!pedido) {
    return res.status(404).json({ erro: 'Pedido não encontrado' });
  }

  pedido.status = 'reprovado';
  pedido.motivoReprovacao = req.body.motivo || '';
  pedido.reprovadoEm = req.body.reprovadoEm || new Date().toISOString();
  pedido.adminUsuario = req.body.adminUsuario || 'admin';

  res.json(pedido);
}