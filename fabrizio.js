const { EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const parser = new Parser();

// Palavras em inglês que indicam transferência/rumor
const PALAVRAS_TRANSFER = [
  'transfer', 'sign', 'deal', 'contract', 'loan', 'fee',
  'bid', 'move', 'here we go', 'agreement', 'negotiation',
  'medical', 'talks', 'offer', 'sell', 'buy', 'swap',
  'release clause', 'option', 'agent'
];

// Palavras que NÃO são transferências (excluir)
const EXCLUIR = [
  'injury', 'goal', 'match', 'preview', 'result',
  'lineup', 'tactical', 'press conference', 'podcast'
];

function eTransferencia(texto) {
  const t = texto.toLowerCase();
  const temTransfer = PALAVRAS_TRANSFER.some(p => t.includes(p));
  const temExclusao = EXCLUIR.some(p => t.includes(p));
  return temTransfer && !temExclusao;
}

async function traduzirParaPortugues(texto) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Traduz este texto de futebol para português de Portugal. Responde APENAS com a tradução, sem explicações:\n\n${texto}`
        }]
      })
    });
    const data = await response.json();
    return data.content?.[0]?.text || texto;
  } catch (e) {
    return texto; // Se falhar, devolve o original
  }
}

async function verificarFabrizio(channel, noticiasPublicadas) {
  const FEED_URL = 'https://caughtoffside.substack.com/feed';

  try {
    const dados = await parser.parseURL(FEED_URL);

    for (const item of dados.items.slice(0, 8)) {
      const titulo = item.title || '';
      const descricao = item.contentSnippet || '';
      const link = item.link || '';

      if (noticiasPublicadas.has(titulo)) continue;
      if (!eTransferencia(titulo) && !eTransferencia(descricao)) continue;

      noticiasPublicadas.add(titulo);

      // Traduz título e descrição
      const tituloTraduzido = await traduzirParaPortugues(titulo);
      const descTraduzida = descricao
        ? await traduzirParaPortugues(
            descricao.length > 300
              ? descricao.substring(0, 300) + '...'
              : descricao
          )
        : null;

      const embed = new EmbedBuilder()
        .setTitle(`🚨 ${tituloTraduzido}`)
        .setColor(0x1DA1F2)
        .setURL(link)
        .setFooter({ text: '📡 CaughtOffside / Fabrizio Romano' })
        .setTimestamp();

      if (descTraduzida) embed.setDescription(descTraduzida);

      await channel.send({ embeds: [embed] });
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (e) {
    console.error('Erro Fabrizio feed:', e.message);
  }
}

module.exports = { verificarFabrizio };
