const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// --- CONFIGURAÇÃO DO FIREBASE ---
let serviceAccountConfig;
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  serviceAccountConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle private key newlines
  };
} else {
  console.warn('Firebase environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are not set. Attempting to load from serviceAccountKey.json for local development.');
  try {
    serviceAccountConfig = require('./serviceAccountKey.json');
  } catch (error) {
    console.error('Error loading serviceAccountKey.json:', error.message);
    console.error('Firebase Admin SDK credentials are not configured. Please set environment variables or provide serviceAccountKey.json.');
    process.exit(1); // Exit if no credentials are found
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountConfig)
});

const db = admin.firestore();
const app = express();

const TWITCH_EXTENSION_SECRET = process.env.TWITCH_EXTENSION_SECRET;
if (TWITCH_EXTENSION_SECRET) {
  console.log('Twitch Extension Secret is loaded from environment variables.');
  // In a real application, you would use this secret to verify JWTs from Twitch,
  // or to sign requests to the Twitch API from your EBS.
} else {
  console.warn('TWITCH_EXTENSION_SECRET environment variable is not set. Twitch API interactions requiring this secret will not function.');
}
// CORS agora configurado via vercel.json
app.use(express.json());

const PORT = process.env.PORT || 8080;

// --- ENDPOINTS DA API ---

// Endpoint para criar um novo post
app.post('/posts', async (req, res) => {
  try {
    const { weaponName, username, imageUrl } = req.body;

    if (!weaponName || !username || !imageUrl) {
      return res.status(400).send('Dados incompletos. É necessário weaponName, username e imageUrl.');
    }

    const newPost = {
      weaponName,
      username,
      imageUrl,
      likes: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const postRef = await db.collection('posts').add(newPost);
    res.status(201).send({ id: postRef.id, ...newPost });
  } catch (error) {
    console.error('Erro ao criar post:', error);
    res.status(500).send('Erro no servidor ao criar post.');
  }
});

// Endpoint para buscar todos os posts (ranking)
app.get('/posts', async (req, res) => {
  try {
    const postsSnapshot = await db.collection('posts').orderBy('likes', 'desc').get();
    const posts = [];
    postsSnapshot.forEach((doc) => {
      posts.push({ id: doc.id, ...doc.data() });
    });
    res.status(200).json(posts);
  } catch (error) {
    console.error('Erro ao buscar posts:', error);
    res.status(500).send('Erro no servidor ao buscar posts.');
  }
});

// Endpoint para curtir um post
app.post('/posts/:postId/like', async (req, res) => {
    try {
      const { postId } = req.params;
      const postRef = db.collection('posts').doc(postId);
  
      await postRef.update({
        likes: admin.firestore.FieldValue.increment(1)
      });
  
      res.status(200).send({ message: 'Post curtido com sucesso!' });
    } catch (error) {
      console.error('Erro ao curtir post:', error);
      res.status(500).send('Erro no servidor ao curtir post.');
    }
  });
  
// Endpoint de busca
app.get('/search', async (req, res) => {
    try {
      const { term } = req.query;
  
      if (!term) {
        return res.status(400).send('É necessário um termo para a busca.');
      }
  
      const weaponNamePromise = db.collection('posts').where('weaponName', '==', term).get();
      const usernamePromise = db.collection('posts').where('username', '==', term).get();
  
      const [weaponNameSnapshot, usernameSnapshot] = await Promise.all([
        weaponNamePromise,
        usernamePromise,
      ]);
  
      const posts = new Map();
      weaponNameSnapshot.forEach((doc) => {
        posts.set(doc.id, { id: doc.id, ...doc.data() });
      });
      usernameSnapshot.forEach((doc) => {
        posts.set(doc.id, { id: doc.id, ...doc.data() });
      });
  
      res.status(200).json(Array.from(posts.values()));
    } catch (error) {
      console.error('Erro ao buscar:', error);
      res.status(500).send('Erro no servidor ao buscar.');
    }
});


app.listen(PORT, () => {
  console.log(`Servidor Firebase Backend rodando na porta ${PORT}`);
});
