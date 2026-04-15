import crypto from 'crypto';

export function gerarCodigoValidacao() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';

  for (let i = 0; i < 8; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `MED-${codigo}`;
}

export function gerarHashIntegridade(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

export function mascararCpf(cpf = '') {
  const numeros = String(cpf).replace(/\D/g, '');

  if (numeros.length !== 11) return cpf;

  return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6, 9)}-${numeros.slice(9)}`;
}

export function formatarDataBR(data) {
  const d = new Date(data);

  if (Number.isNaN(d.getTime())) return '';

  return d.toLocaleDateString('pt-BR');
}

export function formatarDataHoraBR(data) {
  const d = new Date(data);

  if (Number.isNaN(d.getTime())) return '';

  return d.toLocaleString('pt-BR');
}