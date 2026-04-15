import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import webhookRoutes from './routes/webhookRoutes.js';
import pedidoRoutes from './routes/pedidoRoutes.js';
import validacaoRoutes from './routes/validacao.js';

dotenv.config();

console.log('SigiloPay configurado:', !!process.env.SIGILOPAY_PUBLIC_KEY);
console.log('BASE URL:', process.env.SIGILOPAY_BASE_URL || 'https://app.sigilopay.com.br/api/v1');

const app = express();
const PORT = process.env.PORT || 3000;

// Corrige __dirname no ESModules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Frontend
app.use(express.static(path.resolve(__dirname, '../../frontend')));

// Arquivos gerados
app.use('/pdfs', express.static(path.resolve(__dirname, 'pdfs')));
app.use('/comprovantes', express.static(path.resolve(__dirname, 'comprovantes')));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'medflix-backend' });
});

// Rotas
app.use('/', pedidoRoutes);
app.use('/api/validacao', validacaoRoutes);
app.use('/api/webhooks', webhookRoutes);

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../frontend/index.html'));
});

// Start servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});