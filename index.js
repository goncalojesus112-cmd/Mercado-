const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');

const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' }
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CHANNEL_ID = process.env.CHANNEL_ID;
const TOKEN = process.env.BOT_TOKEN;

const noticiasPublicadas = new Set();

// Palavras-chave em português para jornais nacionais
const PALAVRAS_CHAVE_PT = [
  'mercado', 'transfere', 'reforço', 'assina', 'contrato',
  'oficial', 'emprestado', 'contratado', 'negociação',
  'proposta', 'acordo', 'saída', 'chegada'
];

// Palavras-chave em inglês para Fabrizio Romano
const PALAVRAS_TRANSFER_EN = [
  'transfer', 'sign', 'deal', 'contract', 'loan', 'fee',
  'bid', 'move', 'here we go', 'agreement', 'negotiation',
  'medical', 'talks', 'offer', 'sell', 'buy', 'swap',
  'release clause', 'option', 'agent'
];

const EXCLUIR_EN = [
  'injury', 'goal', 'match', 'preview', 'result',
  'lineup', 'tactical', 'press conference', 'podcast'
];

const FEEDS_PT = [
  { nome: 'Record', url: 'https://www.record.pt/rss', cor: 0x006400, emoji: '🟢' },
  { nome: 'Maisfutebol', url: 'https://maisfutebol.iol.pt/rss/transferencias', cor: 0x0099FF, emoji: '🔵' }
];

// Limpa CDATA, tags HTML e espaços extra de qualquer texto vindo do RSS
function limparTexto(texto) {
  if (!texto) return '';
  return texto
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function contemPalavraChavePT(texto) {
  const t = texto.toLowerCase();
  return PALAVRAS_CHAVE_PT.some(p => t.includes(p));
}

function eTransferenciaEN(texto) {
  const t = texto.toLowerCase();
  const temTransfer = PALAVRAS_TRANSFER_EN.some(p => t.includes(p));
  const temExclusao = EXCLUIR_EN.some(p => t.includes(p));
  return temTransfer && !temExclusao;
}

// Tradução gratuita via API pública do Google Translate (sem chave, sem custo)
async function traduzirParaPortugues(texto) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(texto)}`;
    const response = await fetch(url);
    const data = await response.json();
    const traducao = data[0].map(parte => parte[0]).join('');
    return limparTexto(traducao);
  } catch (e) {
    console.error('Erro na tradução:', e.message);
    return texto; // se falhar, devolve o texto original em inglês
  }
}

async function verificarFeedPT(feed, channel) {
  try {
    const dados = await parser.parseURL(feed.url);

    for (const item of dados.items.slice(0, 10)) {
      const tituloRaw = item.title || '';
      const titulo = limparTexto(tituloRaw);
      const link = item.link || '';
      const descricao = limparTexto(item.contentSnippet || item.content || '');

      if (noticiasPublicadas.has(titulo)) continue;
      // Filtro mais estrito: só valida pelo título, não pela descrição
      if (!contemPalavraChavePT(titulo)) continue;

      noticiasPublicadas.add(titulo);

      const embed = new EmbedBuilder()
        .setTitle(`${feed.emoji} ${titulo}`)
        .setColor(feed.cor)
        .setURL(link)
        .setFooter({ text: `📰 ${feed.nome}` })
        .setTimestamp();

      if (descricao) {
        embed.setDescription(
          descricao.length > 200 ? descricao.substring(0, 200) + '...' : descricao
        );
      }

      await channel.send({ embeds: [embed] });
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error(`Erro no feed ${feed.nome}:`, e.message);
  }
}

async function verificarFabrizio(channel) {
  const FEED_URL = 'https://caughtoffside.substack.com/feed';
  console.log('A verificar feed do Fabrizio...');

  try {
    const dados = await parser.parseURL(FEED_URL);
    console.log(`Fabrizio: ${dados.items.length} itens encontrados no feed.`);

    for (const item of dados.items.slice(0, 8)) {
      const tituloRaw = item.title || '';
      const titulo = limparTexto(tituloRaw);
      const descricao = limparTexto(item.contentSnippet || '');
      const link = item.link || '';

     if (noticiasPublicadas.has(titulo)) {
        console.log(`Fabrizio: já visto antes — "${titulo}"`);
        continue;
      }
      if (!eTransferenciaEN(titulo) && !eTransferenciaEN(descricao)) {
        console.log(`Fabrizio: NOVO mas não bate nas palavras-chave — "${titulo}"`);
        continue;
      }
      console.log(`Fabrizio: NOVO e relevante, a publicar — "${titulo}"`);
      
      noticiasPublicadas.add(titulo);

      const tituloTraduzido = await traduzirParaPortugues(titulo);
      const descTraduzida = descricao
        ? await traduzirParaPortugues(descricao.length > 300 ? descricao.substring(0, 300) + '...' : descricao)
        : null;

      const embed = new EmbedBuilder()
        .setTitle(`🚨 ${tituloTraduzido}`)
        .setColor(0x1DA1F2)
        .setURL(link)
        .setFooter({ text: '📡 CaughtOffside / Fabrizio Romano' })
        .setTimestamp();

      if (descTraduzida) embed.setDescription(descTraduzida);

      await channel.send({ embeds: [embed] });
      console.log(`Fabrizio: PUBLICADO — "${titulo}"`);
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (e) {
    console.error('Erro Fabrizio feed:', e.message);
  }
}

async function verificarTodos() {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) return;

    for (const feed of FEEDS_PT) {
      await verificarFeedPT(feed, channel);
    }

    await verificarFabrizio(channel);
  } catch (e) {
    console.error('Erro geral:', e.message);
  }
}

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);

  console.log('A carregar notícias existentes...');
  const todosFeeds = [
    ...FEEDS_PT.map(f => f.url),
    'https://caughtoffside.substack.com/feed'
  ];

  for (const url of todosFeeds) {
    try {
      const dados = await parser.parseURL(url);
      for (const item of dados.items.slice(0, 10)) {
        if (item.title) noticiasPublicadas.add(limparTexto(item.title));
      }
    } catch (e) {
      console.error(`Erro ao pré-carregar ${url}:`, e.message);
    }
  }

  console.log(`${noticiasPublicadas.size} notícias carregadas. Bot pronto!`);

  setInterval(verificarTodos, 30 * 60 * 1000);
});

client.login(TOKEN);
