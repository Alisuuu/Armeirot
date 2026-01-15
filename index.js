const express = require('express');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer'); // Para enviar o e-mail

const app = express();
// Em produção, configure o CORS de forma restrita para aceitar apenas a origem da sua extensão
// const corsOptions = {
//   origin: 'https://<SEU_ID_DE_EXTENSAO>.ext-twitch.tv',
//   optionsSuccessStatus: 200
// };
// app.use(cors(corsOptions));

app.use(cors()); // Configuração aberta, ideal para início, mas restrinja em produção.
app.use(bodyParser.json());

// --- CONFIGURAÇÕES (Use .env na vida real!) ---
const JWT_SECRET = 'seu_segredo_super_secreto'; // TODO: Mude e coloque em .env
const R2_BUCKET = 'nome-do-seu-bucket'; // TODO: Mude para o seu bucket
const R2_PUBLIC_DOMAIN = 'https://pub-xxxxx.r2.dev'; // TODO: Mude para seu domínio público do R2
const R2_ACCOUNT_ID = '<ID_DA_CONTA>'; // TODO: Mude para o ID da sua conta Cloudflare
const R2_ACCESS_KEY = 'R2_ACCESS_KEY'; // TODO: Mude e coloque em .env
const R2_SECRET_KEY = 'R2_SECRET_KEY'; // TODO: Mude e coloque em .env

// Configuração do R2 (Cliente S3)
const s3 = new AWS.S3({
  endpoint: `https://\${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: R2_ACCESS_KEY,
  secretAccessKey: R2_SECRET_KEY,
  signatureVersion: 'v4',
  region: 'auto'
});

// "Banco de dados" em memória (Use Mongo/Postgres na produção)
const codigosTemporarios = {}; 

// --- ROTAS DE LOGIN ---

// 1. Pedir o código
app.post('/auth/request-code', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'E-mail é obrigatório.' });
  }
  const code = Math.floor(1000 + Math.random() * 9000).toString(); // Gera 4 dígitos
  
  codigosTemporarios[email] = { code, timestamp: Date.now() }; // Salva com timestamp

  // Simulação de envio de e-mail (Configure seu SMTP real aqui)
  console.log(`>>> CÓDIGO PARA \${email}: \${code} <<<`);
  
  // Aqui você usaria o nodemailer para enviar de verdade:
  // const transporter = nodemailer.createTransport({ /* ...seu SMTP */ });
  // await transporter.sendMail({ to: email, text: `Seu código de acesso: \${code}` });

  res.json({ message: 'Código enviado (verifique o console do servidor para testes)' });
});

// 2. Verificar código e gerar Token
app.post('/auth/verify-code', (req, res) => {
  const { email, code } = req.body;
  const stored = codigosTemporarios[email];

  if (stored && stored.code === code) {
    // Opcional: Verificar se o código expirou (ex: 5 minutos)
    const FIVE_MINUTES = 5 * 60 * 1000;
    if (Date.now() - stored.timestamp > FIVE_MINUTES) {
        delete codigosTemporarios[email];
        return res.status(401).json({ error: 'Código expirado.' });
    }

    // Código correto! Gera o token de sessão
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '30d' });
    delete codigosTemporarios[email]; // Limpa o código usado
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Código inválido ou não solicitado.' });
  }
});

// --- ROTA DE UPLOAD ---

// Middleware para proteger a rota (só quem tem Token passa)
const autenticar = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(403).json({ error: 'Token de autenticação não fornecido.' });
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
    req.user = decoded; // Salva dados do usuário (ex: email) no objeto da requisição
    next();
  });
};

// 3. Gerar URL Pré-assinada
app.post('/upload/sign', autenticar, async (req, res) => {
  const { fileType, fileName } = req.body; // ex: 'image/png', 'minha-imagem.png'
  if (!fileType || !fileName) {
    return res.status(400).json({ error: 'fileType e fileName são obrigatórios.' });
  }

  // Gera um nome de arquivo único para evitar sobreposições
  const uniqueFileName = `uploads/\${req.user.email}/\${Date.now()}-\${fileName}`;

  const params = {
    Bucket: R2_BUCKET,
    Key: uniqueFileName,
    Expires: 300, // 5 minutos para iniciar o upload
    ContentType: fileType
  };

  try {
    const uploadURL = await s3.getSignedUrlPromise('putObject', params);
    res.json({
      uploadURL,
      finalUrl: `\${R2_PUBLIC_DOMAIN}/\${uniqueFileName}`
    });
  } catch (err) {
    console.error('Erro ao gerar URL assinada:', err);
    res.status(500).json({ error: 'Erro interno ao gerar URL de upload.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta \${PORT}`));