import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { gerarPdfAtestado } from '../services/pdfService.js';
import { criarPix } from '../services/pagamentoService.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!global.pedidos) {
  global.pedidos = [];
}

const comprovantesDir = path.resolve(__dirname, '..', 'comprovantes');

if (!fs.existsSync(comprovantesDir)) {
  fs.mkdirSync(comprovantesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, comprovantesDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `comprovante-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'image/jpg',
      'image/webp'
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Formato de arquivo não permitido.'));
    }

    cb(null, true);
  }
});

/**
 * Criar pedido + gerar PIX automaticamente
 */
router.post('/pedido', async (req, res) => {
  try {
    const {
      nome,
      cpf,
      telefone,
      nascimento,
      email,
      sintomas,
      detalhes,
      textoAtestado,
      diasAfastamento,
      dias,
      estado,
      cidade,
      dataInicioSintomas,
      validadeAtestadoAPartirDe
    } = req.body;

    if (!nome || !cpf || !telefone) {
      return res.status(400).json({
        mensagem: 'Nome, CPF e telefone são obrigatórios.'
      });
    }

    const diasSelecionados = Number(diasAfastamento || dias || 1);
    const observacoes = detalhes || sintomas || '';

    const pedido = {
      id: `PED-${Date.now()}`,
      paciente: {
        nome,
        cpf,
        telefone: telefone || '',
        nascimento: nascimento || '',
        email: email || '',
        estado: estado || '',
        cidade: cidade || ''
      },
      documento: {
        tipo: 'Atestado Médico',
        texto:
          textoAtestado ||
          `Atesto, para os devidos fins, que ${nome} foi atendido(a) em consulta médica, apresentando relato clínico compatível com a necessidade de afastamento temporário de suas atividades.`,
        diasAfastamento: diasSelecionados,
        dataEmissao: new Date().toISOString(),
        observacoes,
        cid: '',
        dataInicioSintomas: dataInicioSintomas || '',
        validadeAtestadoAPartirDe: validadeAtestadoAPartirDe || dataInicioSintomas || ''
      },
      medico: {
        nome: '',
        crm: '',
        uf: '',
        cidade: '',
        assinatura: ''
      },
      status: 'pendente_pagamento',
      comprovante: null,
      pdf: null,
      pagamento: null,
      criadoEm: new Date().toISOString()
    };

    const pix = await criarPix(pedido);

    pedido.pagamento = {
      txid: pix.txid,
      valor: pix.valor,
      status: 'pendente',
      qrCode: pix.qrCode,
      copiaECola: pix.copiaECola,
      criadoEm: new Date().toISOString(),
      raw: pix.raw || null
    };

    global.pedidos.push(pedido);

    return res.status(201).json({
      mensagem: 'Pedido criado com sucesso.',
      pedidoId: pedido.id,
      status: pedido.status,
      pagamento: pedido.pagamento
    });
  } catch (error) {
    console.error('Erro ao criar pedido:', error);

    return res.status(500).json({
      mensagem: 'Erro ao criar pedido.',
      detalhe: error.message
    });
  }
});

/**
 * Upload de comprovante (fallback/manual)
 */
router.post('/pedido/:id/comprovante', upload.single('comprovante'), (req, res) => {
  try {
    const { id } = req.params;

    const pedido = global.pedidos.find((item) => item.id === id);

    if (!pedido) {
      return res.status(404).json({
        mensagem: 'Pedido não encontrado.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        mensagem: 'Envie um comprovante.'
      });
    }

    pedido.comprovante = {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      url: `/comprovantes/${req.file.filename}`,
      enviadoEm: new Date().toISOString()
    };

    if (pedido.status === 'pendente_pagamento') {
      pedido.status = 'comprovante_enviado';
    }

    return res.json({
      mensagem: 'Comprovante enviado com sucesso.',
      pedidoId: pedido.id,
      status: pedido.status,
      comprovanteUrl: pedido.comprovante.url
    });
  } catch (error) {
    console.error('Erro ao enviar comprovante:', error);

    return res.status(500).json({
      mensagem: 'Erro ao enviar comprovante.'
    });
  }
});

/**
 * Listar pedidos
 */
router.get('/pedidos', (req, res) => {
  return res.json(global.pedidos || []);
});

/**
 * Buscar pedido por ID
 */
router.get('/pedido/:id', (req, res) => {
  const { id } = req.params;

  const pedido = global.pedidos.find((item) => item.id === id);

  if (!pedido) {
    return res.status(404).json({
      mensagem: 'Pedido não encontrado.'
    });
  }

  return res.json({
    id: pedido.id,
    status: pedido.status,
    paciente: pedido.paciente,
    documento: {
      tipo: pedido.documento?.tipo,
      texto: pedido.documento?.texto,
      observacoes: pedido.documento?.observacoes,
      diasAfastamento: pedido.documento?.diasAfastamento,
      cid: pedido.documento?.cid,
      dataEmissao:
        pedido.documento?.dataEmissaoFormatada || pedido.documento?.dataEmissao,
      codigoValidacao: pedido.documento?.codigoValidacao,
      dataInicioSintomas: pedido.documento?.dataInicioSintomas,
      validadeAtestadoAPartirDe: pedido.documento?.validadeAtestadoAPartirDe
    },
    medico: pedido.medico,
    comprovante: pedido.comprovante,
    pagamento: pedido.pagamento,
    pdf: pedido.pdf,
    urlValidacao: pedido.pdf?.urlValidacao || ''
  });
});

/**
 * Aprovar pedido, gerar PDF e liberar documento
 */
router.post('/pedido/:id/aprovar', async (req, res) => {
  try {
    const { id } = req.params;

    const pedido = global.pedidos.find((item) => item.id === id);

    if (!pedido) {
      return res.status(404).json({
        mensagem: 'Pedido não encontrado.'
      });
    }

    if (
      pedido.pagamento?.status !== 'pago' &&
      pedido.status !== 'comprovante_enviado'
    ) {
      return res.status(400).json({
        mensagem: 'Pagamento ainda não confirmado.'
      });
    }

    const {
      medico,
      crm,
      cidade,
      uf,
      dias,
      cid,
      assinatura,
      medicoId,
      observacaoAdmin,
      adminUsuario,
      aprovadoEm
    } = req.body;

    pedido.medico = {
      id: medicoId || '',
      nome: medico || pedido.medico?.nome || '',
      crm: crm || pedido.medico?.crm || '',
      uf: uf || pedido.medico?.uf || '',
      cidade: cidade || pedido.medico?.cidade || '',
      assinatura: assinatura || pedido.medico?.assinatura || ''
    };

    pedido.documento = {
      ...pedido.documento,
      diasAfastamento: Number(dias || pedido.documento?.diasAfastamento || 1),
      cid: cid || pedido.documento?.cid || '',
      dataEmissao: new Date().toISOString()
    };

    pedido.status = 'emitido';
    pedido.aprovadoEm = aprovadoEm || new Date().toISOString();
    pedido.adminUsuario = adminUsuario || 'admin';
    pedido.observacaoAdmin = observacaoAdmin || '';

    if (pedido.pagamento) {
      pedido.pagamento.status = 'pago';
    }

    const baseUrlValidacao = process.env.SITE_URL
      ? `${process.env.SITE_URL.replace(/\/$/, '')}/consultar.html`
      : 'http://localhost:3000/consultar.html';

    const assinaturaPath = pedido.medico?.assinatura
      ? path.resolve(__dirname, '..', pedido.medico.assinatura.replace(/^\/+/, ''))
      : path.resolve(__dirname, '..', 'assets', 'assinatura-medico.png');

    const pdfInfo = await gerarPdfAtestado(pedido, {
      outputDir: path.resolve(__dirname, '..', 'pdfs'),
      logoPath: path.resolve(__dirname, '..', 'assets', 'logo.png'),
      assinaturaPath,
      baseUrlValidacao
    });

    pedido.pdf = {
      fileName: pdfInfo.fileName,
      path: pdfInfo.outputPath,
      url: `/pdfs/${pdfInfo.fileName}`,
      urlValidacao: pdfInfo.urlValidacao
    };

    return res.json({
      mensagem: 'Pedido aprovado e documento emitido com sucesso.',
      pedidoId: pedido.id,
      status: pedido.status,
      codigoValidacao: pedido.documento?.codigoValidacao,
      pdfUrl: pedido.pdf.url,
      urlValidacao: pedido.pdf.urlValidacao
    });
  } catch (error) {
    console.error('Erro ao aprovar pedido:', error);

    return res.status(500).json({
      mensagem: 'Erro ao aprovar pedido.',
      detalhe: error.message
    });
  }
});

/**
 * Reprovar pedido
 */
router.post('/pedido/:id/reprovar', (req, res) => {
  const { id } = req.params;
  const { motivo, adminUsuario, reprovadoEm } = req.body;

  const pedido = global.pedidos.find((item) => item.id === id);

  if (!pedido) {
    return res.status(404).json({
      mensagem: 'Pedido não encontrado.'
    });
  }

  pedido.status = 'reprovado';
  pedido.motivoReprovacao = motivo || '';
  pedido.reprovadoEm = reprovadoEm || new Date().toISOString();
  pedido.adminUsuario = adminUsuario || 'admin';

  return res.json({
    mensagem: 'Pedido reprovado com sucesso.',
    pedidoId: pedido.id,
    status: pedido.status
  });
});

export default router;