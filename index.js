const { verificarFabrizio } = require('./fabrizio');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const parser = new Parser();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CHANNEL_ID = process.env.CHANNEL_ID;
const TOKEN = process.env.BOT_TOKEN;

const noticiasPublicadas = new Set();

// Palavras que DEVEM aparecer para publicar
const PALAVRAS_TRANSFERENCIA = [
  'reforço', 'contratado', 'assina', 'oficializa contratação',
  'fecha acordo', 'transfere', 'emprestado', 'cedido',
  'contrato até', 'acordo fechado', 'oficializa reforço',
  'apresentado', 'novo reforço', 'chega ao', 'chega a',
  'acerta contrato', 'vincula', 'assina por'
];

// Palavras que BLOQUEIAM a notícia mesmo que passe o filtro anterior
const PALAVRAS_BLOQUEIO = [
  'treinador', 'seleção', 'lesão', 'suspenso', 'convocado',
  'declarações', 'entrevista', 'antevisão', 'confere',
  'jogo', 'resultado', 'derrota', 'vitória', 'empate',
  'golos', 'expulso', 'cartão', 'árbitro', 'liga',
  'champions', 'taça', 'supertaça', 'mundial'
];

const FEEDS = [
  {
    nome: 'A Bola',
    url: 'https://www.abola.pt/rss/mercado',
    cor: 0xFF0000,
    emoji: '🔴'
  },
  {
    nome: 'A Bola Internacional',
    url: 'https://www.abola.pt/rss/internacional',
    cor: 0xFF0000,
    emoji: '🌍'
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
  },
  {
    nome: 'Maisfutebol',
    url: 'https://maisfutebol.iol.pt/rss/transferencias',
    cor: 0x0099FF,
    emoji: '🔵'
  }
];


// Limpa o CDATA e outros artefactos do XML
function limparTexto(texto) {
  if (!texto) return '';
  return texto
    .replace(/<!\[CDATA\[|\]\]>/gi, '')  // remove CDATA
    .replace(/<[^>]+>/g, '')              // remove tags HTML
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function eTransferencia(titulo, descricao) {
  const texto = (titulo + ' ' + descricao).toLowerCase();

  // Bloqueia se tiver palavras de bloqueio
  if (PALAVRAS_BLOQUEIO.some(p => texto.includes(p))) return false;

  // Só passa se tiver palavras de transferência
  return PALAVRAS_TRANSFERENCIA.some(p => texto.includes(p));
}

async function verificarFeed(feed, channel) {
  try {
    const dados = await parser.parseURL(feed.url);

    for (const item of dados.items.slice(0, 15)) {
      const titulo = limparTexto(item.title);
      const link = item.link || '';
      const descricao = limparTexto(item.contentSnippet || item.content || '');

      if (!titulo) continue;
      if (noticiasPublicadas.has(titulo)) continue;
      if (!eTransferencia(titulo, descricao)) continue;

      noticiasPublicadas.add(titulo);

      const embed = new EmbedBuilder()
        .setTitle(`${feed.emoji} ${titulo}`)
        .setColor(feed.cor)
        .setURL(link)
        .setFooter({ text: `📰 ${feed.nome}` })
        .setTimestamp();

      if (descricao) {
        embed.setDescription(
          descricao.length > 250 ? descricao.substring(0, 250) + '...' : descricao
        );
      }

      await channel.send({ embeds: [embed] });
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

  // Pré-carrega notícias existentes sem publicar
  console.log('A carregar notícias existentes...');
  for (const feed of FEEDS) {
    try {
      const dados = await parser.parseURL(feed.url);
      for (const item of dados.items.slice(0, 15)) {
        const titulo = limparTexto(item.title);
        if (titulo) noticiasPublicadas.add(titulo);
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
