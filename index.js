const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const parser = new Parser();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CHANNEL_ID = process.env.CHANNEL_ID;
const TOKEN = process.env.BOT_TOKEN;

// Guarda os títulos já publicados para não repetir
const noticiasPublicadas = new Set();

// Palavras-chave que filtram só notícias de mercado/transferências
const PALAVRAS_CHAVE = [
  'mercado', 'transfere', 'reforço', 'assina', 'contrato',
  'oficial', 'emprestado', 'contratado', 'negociação',
  'proposta', 'acordo', 'saída', 'chegada'
];

const FEEDS = [
  {
    nome: 'A Bola',
    url: 'https://www.abola.pt/rss/mercado',
    cor: 0xFF0000,
    emoji: '🔴'
  },
  {
    nome: 'Record',
    url: 'https://www.record.pt/rss',
    cor: 0x006400,
    emoji: '🟢'
  },
  {
    nome: 'O Jogo',
    url: 'https://www.ojogo.pt/rss/Noticias.rss',
    cor: 0xFF8C00,
    emoji: '🟠'
  }
];

function contemPalavraChave(texto) {
  const textoLower = texto.toLowerCase();
  return PALAVRAS_CHAVE.some(palavra => textoLower.includes(palavra));
}

async function verificarFeed(feed, channel) {
  try {
    const dados = await parser.parseURL(feed.url);

    for (const item of dados.items.slice(0, 10)) {
      const titulo = item.title || '';
      const link = item.link || '';
      const descricao = item.contentSnippet || item.content || '';

      // Ignora se já foi publicado
      if (noticiasPublicadas.has(titulo)) continue;

      // Filtra só notícias relevantes de mercado
      if (!contemPalavraChave(titulo) && !contemPalavraChave(descricao)) continue;

      // Marca como publicado
      noticiasPublicadas.add(titulo);

      // Cria o embed
      const embed = new EmbedBuilder()
        .setTitle(`${feed.emoji} ${titulo}`)
        .setColor(feed.cor)
        .setURL(link)
        .setFooter({ text: `📰 ${feed.nome}` })
        .setTimestamp();

      if (descricao) {
        embed.setDescription(descricao.length > 200
          ? descricao.substring(0, 200) + '...'
          : descricao
        );
      }

      await channel.send({ embeds: [embed] });

      // Pequena pausa entre mensagens para não sobrecarregar
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error(`Erro no feed ${feed.nome}:`, e.message);
  }
}

async function verificarTodos() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return;

    for (const feed of FEEDS) {
      await verificarFeed(feed, channel);
    }
  } catch (e) {
    console.error('Erro geral:', e.message);
  }
}

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);

  // Primeira verificação ao arrancar (sem publicar — só marca como já vistas)
  // Isto evita que ao ligar o bot publique 30 notícias antigas de uma vez
  console.log('A carregar notícias já existentes...');
  for (const feed of FEEDS) {
    try {
      const dados = await parser.parseURL(feed.url);
      for (const item of dados.items.slice(0, 10)) {
        if (item.title) noticiasPublicadas.add(item.title);
      }
    } catch (e) {
      console.error(`Erro ao pré-carregar ${feed.nome}:`, e.message);
    }
  }
  console.log(`${noticiasPublicadas.size} notícias carregadas. Bot pronto!`);

  // Verifica a cada 30 minutos
  setInterval(verificarTodos, 30 * 60 * 1000);
});

client.login(TOKEN);
