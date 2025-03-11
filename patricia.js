const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

require('dotenv').config();


const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1024,
        topP: 0.9,
        topK: 10
    }
});
const mime = require('mime-types');

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    console.log('Digitalize o código QR abaixo para iniciar a sessão');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Autenticado com sucesso.');
});


let lastProcessedAudio = null
const BOAS_VINDAS = `Olá! Eu sou a Patricia.
Fui criada para transcrever e descrever os áudios e as imagens enviadas.

Eu sou um projeto de código aberto e você pode me encontrar no GitHub.

Além disso, é importante você saber que sou baseada no Gemini 2.0 Flash, modelo de inteligência artificial do Google. Por isso, ao me utilizar, você concorda com os termos de uso e privacidade do Google, que podem ser encontrados em.`;

/**
 * Função para descrever imagens usando a API do Gemini
 * @param {string} imgBase64 - Imagem em formato base64
 * @param {string} mimeType - Tipo MIME da imagem
 * @returns {Promise<string>}
 */
async function descreveImagem(imgBase64, mimeType) {
    try {
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: imgBase64
                            }
                        },
                        {
                            text: "Descreva esta imagem em detalhes."
                        }
                    ]
                }
            ]
        });

        return result.response.text(); // Verifique se a resposta contém `.text()`
    } catch (error) {
        console.error("Erro ao descrever a imagem:", error);
        return "Desculpe, não consegui analisar a imagem.";
    }
}


async function descreveAudio(audioBase64, mimeType) {
    try {
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: audioBase64
                            }
                        },
                        {
                            text: "Transcreva o áudio de forma fiel, eliminando apenas elementos que não contribuem para o significado da mensagem, como hesitações e palavras de preenchimento. A pontuação original deve ser preservada."
                        }
                    ]
                }
            ]
        });

        return result.response.text();
    } catch (error) {
        console.error("Erro ao descrever o áudio:", error);
        return "Desculpe, não consegui descrever o áudio.";
    }
}

client.on('group_join', async (notification) => {
    if (notification.recipientIds.includes(client.info.wid._serialized)) {
        const chat = await notification.getChat();
        console.log("entrou no grupo")
        await chat.sendMessage(BOAS_VINDAS);
    }
});


client.on('message', async msg => {
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        if (!media || !media.data) {
            console.error("Erro: Falha ao baixar a mídia.");
            return msg.reply("Não consegui processar a imagem. Tente novamente.");
        }

        if (media.mimetype.startsWith('image/')) {
            try {
                const descricao = await descreveImagem(media.data, media.mimetype);
                await msg.reply(descricao);
            } catch (error) {
                console.error("Erro ao processar imagem:", error);
                await msg.reply("Ocorreu um erro ao analisar a imagem.");
            }
        } else if (media.mimetype.startsWith('audio/')) {
            try {
                const audioSizeInMB = media.data.length / (1024 * 1024);
                if (audioSizeInMB > 20) {
                    await msg.reply('Desculpe, só posso processar áudios de até 20MB.');
                    return;
                }

                const isPTT = media.mimetype === 'audio/ogg; codecs=opus';
                console.debug(`Processando arquivo de áudio: ${isPTT ? 'PTT' : 'Áudio regular'}`);

                const audioHash = crypto.createHash('md5').update(media.data).digest('hex');
                if (lastProcessedAudio === audioHash) {
                    await msg.reply('Este áudio já foi processado recentemente. Por favor, envie um novo áudio.');
                    return;
                }
                lastProcessedAudio = audioHash;

                const base64AudioFile = media.data.toString('base64');
                const result = await descreveAudio(base64AudioFile, media.mimetype)
                await msg.reply(result);
                console.info(`Áudio processado com sucesso: ${audioHash}`);

            } catch (error) {
                console.error(`Erro ao processar mensagem de áudio: ${error.message}`, { error });
                await msg.reply('Desculpe, ocorreu um erro ao processar o áudio.');
            }

        }
    }
});

client.initialize();
