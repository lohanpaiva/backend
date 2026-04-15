import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import {
  gerarCodigoValidacao,
  gerarHashIntegridade,
  mascararCpf,
  formatarDataBR,
  formatarDataHoraBR
} from '../utils/hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function obterPaciente(pedido) {
  return {
    nome: pedido.paciente?.nome || pedido.nome || '',
    cpf: pedido.paciente?.cpf || pedido.cpf || '',
    telefone: pedido.paciente?.telefone || pedido.telefone || '',
    email: pedido.paciente?.email || pedido.email || '',
    nascimento: pedido.paciente?.nascimento || pedido.nascimento || '',
    estado: pedido.paciente?.estado || pedido.estado || '',
    cidade: pedido.paciente?.cidade || pedido.cidade || ''
  };
}

function obterMedico(pedido) {
  return {
    nome: pedido.medico?.nome || pedido.medico || 'Médico Responsável',
    crm: pedido.medico?.crm || pedido.crm || '-',
    uf: pedido.medico?.uf || pedido.uf || '-',
    cidade: pedido.medico?.cidade || pedido.cidadeMedico || pedido.cidade || '-',
    assinatura: pedido.medico?.assinatura || ''
  };
}

function obterDocumento(pedido) {
  return {
    tipo: pedido.documento?.tipo || 'Atestado Médico',
    texto:
      pedido.documento?.texto ||
      `Atesto, para os devidos fins, que o(a) paciente acima identificado(a) foi submetido(a) à avaliação médica, podendo necessitar de afastamento de suas atividades pelo período indicado, conforme análise clínica realizada.`,
    diasAfastamento:
      pedido.documento?.diasAfastamento ||
      pedido.diasAfastamento ||
      pedido.dias ||
      0,
    cid: pedido.documento?.cid || pedido.cid || '',
    dataEmissao: pedido.documento?.dataEmissao || pedido.aprovadoEm || new Date().toISOString(),
    codigoValidacao: pedido.documento?.codigoValidacao || gerarCodigoValidacao(),
    hashIntegridade: pedido.documento?.hashIntegridade || ''
  };
}

export async function gerarPdfAtestado(pedido, options = {}) {
  const outputDir = options.outputDir || path.join(__dirname, '..', 'pdfs');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const paciente = obterPaciente(pedido);
  const medico = obterMedico(pedido);
  const documentoBase = obterDocumento(pedido);

  const payloadHash = {
    pedidoId: pedido.id,
    paciente: {
      nome: paciente.nome,
      cpf: paciente.cpf,
      telefone: paciente.telefone,
      nascimento: paciente.nascimento,
      estado: paciente.estado,
      cidade: paciente.cidade
    },
    documento: {
      tipo: documentoBase.tipo,
      texto: documentoBase.texto,
      diasAfastamento: documentoBase.diasAfastamento,
      dataEmissao: documentoBase.dataEmissao,
      codigoValidacao: documentoBase.codigoValidacao,
      cid: documentoBase.cid
    },
    medico: {
      nome: medico.nome,
      crm: medico.crm,
      uf: medico.uf
    }
  };

  const hashIntegridade =
    documentoBase.hashIntegridade || gerarHashIntegridade(payloadHash);

  pedido.documento = {
    ...pedido.documento,
    tipo: documentoBase.tipo,
    texto: documentoBase.texto,
    diasAfastamento: documentoBase.diasAfastamento,
    cid: documentoBase.cid,
    dataEmissao: documentoBase.dataEmissao,
    dataEmissaoFormatada: formatarDataHoraBR(documentoBase.dataEmissao),
    codigoValidacao: documentoBase.codigoValidacao,
    hashIntegridade
  };

  const nomeArquivo = `${pedido.id}.pdf`;
  const outputPath = path.join(outputDir, nomeArquivo);

  const baseUrlValidacao =
    options.baseUrlValidacao || 'http://localhost:3000/consultar.html';

  const urlValidacao = `${baseUrlValidacao}?codigo=${encodeURIComponent(
    pedido.documento.codigoValidacao
  )}`;

  const qrCodeDataUrl = await QRCode.toDataURL(urlValidacao, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 260
  });

  const qrCodeBase64 = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
  const qrCodeBuffer = Buffer.from(qrCodeBase64, 'base64');

  const logoPath =
    options.logoPath || path.join(__dirname, '..', 'assets', 'logo.png');

  const assinaturaPath =
    options.assinaturaPath ||
    (medico.assinatura
      ? path.join(__dirname, '..', medico.assinatura.replace(/^\/+/, ''))
      : path.join(__dirname, '..', 'assets', 'assinatura-medico.png'));

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: 40,
        left: 45,
        right: 45,
        bottom: 45
      }
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const colors = {
      primary: '#1554c0',
      primaryDark: '#0f3f92',
      secondary: '#11b874',
      text: '#17324d',
      textSoft: '#5f748b',
      border: '#dbe6f2',
      softBg: '#f7fbff',
      white: '#ffffff',
      authBg: '#eef6ff'
    };

    function drawRoundedPanel(x, y, w, h, fill, stroke = colors.border, radius = 12) {
      doc.roundedRect(x, y, w, h, radius).fillAndStroke(fill, stroke);
    }

    function drawLabelValue(label, value, x, y, width = 220) {
      doc.fillColor(colors.primaryDark).fontSize(9).text(label, x, y, { width });
      doc.fillColor(colors.text).fontSize(11).text(value || '-', x, y + 14, { width });
    }

    function drawHeader() {
      doc.roundedRect(35, 28, 525, 78, 18).fillAndStroke(colors.white, colors.border);

      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 48, 42, {
          fit: [54, 54],
          align: 'center',
          valign: 'center'
        });
      }

      doc.fillColor(colors.primaryDark).fontSize(20).text('MEDFLIX TELEMEDICINA', 116, 42);

      doc
        .fillColor(colors.textSoft)
        .fontSize(10)
        .text('Documento médico digital com autenticação e validação online', 116, 68);

      doc
        .fillColor(colors.secondary)
        .fontSize(9)
        .text('VALIDAÇÃO DIGITAL ATIVA', 420, 50, {
          width: 110,
          align: 'right'
        });
    }

    function drawTitle() {
      doc.fillColor(colors.primaryDark).fontSize(24).text('ATESTADO MÉDICO', 45, 128);

      doc
        .fillColor(colors.textSoft)
        .fontSize(11)
        .text(
          'Documento emitido eletronicamente com código de validação e QR Code de autenticidade.',
          45,
          158,
          { width: 500 }
        );
    }

    function drawDocSummary() {
      drawRoundedPanel(45, 192, 505, 78, colors.softBg);

      drawLabelValue('Número do documento', pedido.id, 60, 208, 145);
      drawLabelValue('Data de emissão', pedido.documento.dataEmissaoFormatada, 220, 208, 170);
      drawLabelValue('Código de validação', pedido.documento.codigoValidacao, 405, 208, 125);
    }

    function drawPaciente() {
      doc.fillColor(colors.primaryDark).fontSize(11).text('DADOS DO PACIENTE', 45, 292);

      drawRoundedPanel(45, 315, 505, 128, colors.white);

      drawLabelValue('Nome completo', paciente.nome, 60, 332, 265);
      drawLabelValue('CPF', mascararCpf(paciente.cpf || ''), 340, 332, 95);
      drawLabelValue('Nascimento', formatarDataBR(paciente.nascimento || ''), 445, 332, 85);

      drawLabelValue('Telefone', paciente.telefone, 60, 370, 180);
      drawLabelValue('Cidade / UF', `${paciente.cidade || '-'} / ${paciente.estado || '-'}`, 250, 370, 180);

      drawLabelValue('Status do pedido', pedido.status || 'emitido', 60, 408, 180);
      drawLabelValue(
        'Período de afastamento',
        `${pedido.documento?.diasAfastamento || 0} dia(s)`,
        250,
        408,
        180
      );
    }

    function drawConteudo() {
      doc.fillColor(colors.primaryDark).fontSize(11).text('CONTEÚDO DO DOCUMENTO', 45, 462);

      drawRoundedPanel(45, 485, 505, 145, colors.white);

      doc.fillColor(colors.text).fontSize(12).text(pedido.documento?.texto || '', 60, 505, {
        width: 475,
        align: 'justify',
        lineGap: 4
      });

      if (pedido.documento?.cid) {
        doc
          .fillColor(colors.textSoft)
          .fontSize(10)
          .text(`CID informado: ${pedido.documento.cid}`, 60, 605);
      }
    }

    function drawAssinatura() {
      doc.fillColor(colors.primaryDark).fontSize(11).text('ASSINATURA MÉDICA', 45, 650);

      drawRoundedPanel(45, 673, 275, 112, colors.white);

      if (assinaturaPath && fs.existsSync(assinaturaPath)) {
        doc.image(assinaturaPath, 60, 690, {
          fit: [125, 42],
          align: 'left',
          valign: 'center'
        });
      }

      doc
        .fillColor(colors.text)
        .fontSize(11)
        .text(medico.nome || 'Médico Responsável', 60, 736)
        .text(`CRM: ${medico.crm || '-'} / ${medico.uf || '-'}`, 60, 753);

      doc
        .fillColor(colors.textSoft)
        .fontSize(9)
        .text('Documento emitido digitalmente pela plataforma MedFlix.', 60, 770, {
          width: 220
        });
    }

    function drawAuthBox() {
      doc.fillColor(colors.primaryDark).fontSize(11).text('AUTENTICAÇÃO DO DOCUMENTO', 340, 650);

      drawRoundedPanel(330, 673, 220, 112, colors.authBg);

      doc.image(qrCodeBuffer, 345, 686, { width: 78 });

      doc
        .fillColor(colors.primaryDark)
        .fontSize(9)
        .text('Escaneie para validar', 430, 690, { width: 105 });

      doc
        .fillColor(colors.text)
        .fontSize(10)
        .text('Código de validação:', 430, 716)
        .fontSize(10)
        .text(pedido.documento.codigoValidacao, 430, 731, { width: 105 });

      doc
        .fillColor(colors.secondary)
        .fontSize(8)
        .text('Validação online ativa', 430, 760, { width: 105 });
    }

    function drawHashFooter() {
      doc
        .fillColor(colors.textSoft)
        .fontSize(7.5)
        .text(`Hash de integridade: ${pedido.documento.hashIntegridade}`, 45, 800, {
          width: 505,
          align: 'left'
        });

      doc
        .moveTo(45, 820)
        .lineTo(550, 820)
        .lineWidth(1)
        .strokeColor(colors.border)
        .stroke();

      doc
        .fillColor(colors.textSoft)
        .fontSize(8.5)
        .text(`Valide este documento em: ${urlValidacao}`, 45, 828, {
          width: 505,
          align: 'center'
        });
    }

    drawHeader();
    drawTitle();
    drawDocSummary();
    drawPaciente();
    drawConteudo();
    drawAssinatura();
    drawAuthBox();
    drawHashFooter();

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return {
    outputPath,
    fileName: nomeArquivo,
    codigoValidacao: pedido.documento.codigoValidacao,
    hashIntegridade: pedido.documento.hashIntegridade,
    urlValidacao
  };
}

export async function gerarPDF(pedido, options = {}) {
  return gerarPdfAtestado(pedido, options);
}