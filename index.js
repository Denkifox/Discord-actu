require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    REST, 
    Routes,
    EmbedBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const BRAIN_FILE = path.join(__dirname, 'cerebro.json');
let cerebro = {};

// Estado global de la IA (Encendida por defecto)
let iaActiva = true;

if (fs.existsSync(BRAIN_FILE)) {
    try {
        cerebro = JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf8'));
    } catch (e) {
        cerebro = {};
    }
}

function guardarCerebro() {
    fs.writeFileSync(BRAIN_FILE, JSON.stringify(cerebro, null, 2));
}

// Aprende de lo que escriben los usuarios conectando palabras
function aprenderTexto(texto) {
    const palabras = texto.split(/\s+/).filter(p => p.length > 0);
    for (let i = 0; i < palabras.length - 1; i++) {
        const palabraActual = palabras[i];
        const siguientePalabra = palabras[i + 1];

        if (!cerebro[palabraActual]) {
            cerebro[palabraActual] = [];
        }
        cerebro[palabraActual].push(siguientePalabra);
    }
    guardarCerebro();
}

// Inventa oraciones uniendo las palabras que ha aprendido
function generarOracion(palabraInicial = null) {
    const llaves = Object.keys(cerebro);
    if (llaves.length === 0) return "no se nada todavia hablen mas";

    let palabra = (palabraInicial && cerebro[palabraInicial]) 
        ? palabraInicial 
        : llaves[Math.floor(Math.random() * llaves.length)];

    let resultado = [palabra];
    let longitudMax = Math.floor(Math.random() * 6) + 2; 

    for (let i = 0; i < longitudMax; i++) {
        const opciones = cerebro[palabra];
        if (!opciones || opciones.length === 0) break;

        palabra = opciones[Math.floor(Math.random() * opciones.length)];
        resultado.push(palabra);
    }

    return resultado.join(' ');
}

const estadosHumanos = [
    "esperen estoy cagando",
    "estoy comiendo xd dps hablo",
    "q",
    "se me cayo la comida al piso lpm",
    "aguanta q me estan llamando"
];

// -------------------------------------------------------------
// DEFINICIÓN DE COMANDOS SLASH
// -------------------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('mensaje')
        .setDescription('El bot envía un mensaje de texto por ti (Solo rol 𝓣𝓬𝓬).')
        .addStringOption(option => 
            option.setName('texto')
                .setDescription('Contenido del mensaje')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('imagen')
        .setDescription('El bot envía una imagen por ti (Solo rol 𝓣𝓬𝓬).')
        .addAttachmentOption(option => 
            option.setName('archivo')
                .setDescription('Selecciona la imagen')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('ia')
        .setDescription('Activa o desactiva las respuestas automáticas (Solo rol owner).')
        .addStringOption(option =>
            option.setName('estado')
                .setDescription('¿Encender o apagar?')
                .setRequired(true)
                .addChoices(
                    { name: 'Encender (SI)', value: 'si' },
                    { name: 'Apagar (NO)', value: 'no' }
                )
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.once('ready', async () => {
    console.log(`🤖 Bot encendido como: ${client.user.tag}`);
    try {
        console.log('Registrando comandos Slash...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Comandos registrados exitosamente.');
    } catch (error) {
        console.error('Error al registrar comandos:', error);
    }

    // Tarea automática cada 2 horas
    const INTERVALO_TIEMPO = 2 * 60 * 60 * 1000;
    setInterval(async () => {
        const canalId = process.env.CANAL_INSTRUCCIONES_ID;
        if (!canalId) return;

        try {
            const canal = await client.channels.fetch(canalId);
            if (canal) {
                const embedAyuda = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('🤖 Guía de Uso del Bot')
                    .setDescription('Comandos disponibles:')
                    .addFields(
                        { name: '/mensaje [texto]', value: 'Envía texto en nombre del bot (Requiere rol 𝓣𝓬𝓬).' },
                        { name: '/imagen [archivo]', value: 'Envía una imagen (Requiere rol 𝓣𝓬𝓬).' },
                        { name: '/ia [si/no]', value: 'Enciende o apaga el bot (Requiere rol owner).' }
                    )
                    .setTimestamp();

                await canal.send({ embeds: [embedAyuda] });
            }
        } catch (err) {
            console.error('Error al enviar instrucciones:', err);
        }
    }, INTERVALO_TIEMPO);
});

// -------------------------------------------------------------
// MANEJO DE COMANDOS SLASH Y VALIDACIÓN DE ROLES
// -------------------------------------------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // Validación para /mensaje y /imagen (Requiere rol 𝓣𝓬𝓬)
    if (commandName === 'mensaje' || commandName === 'imagen') {
        const nombreRolTcc = '𝓣𝓬𝓬';
        const tieneTcc = interaction.member.roles.cache.some(role => role.name === nombreRolTcc);
        const esAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!tieneTcc && !esAdmin) {
            return await interaction.reply({ 
                content: '❌ No tienes el rol **𝓣𝓬𝓬** autorizado para usar este comando.', 
                ephemeral: true 
            });
        }
    }

    // Validación para /ia (Requiere rol owner)
    if (commandName === 'ia') {
        const nombreRolOwner = 'owner';
        const tieneOwner = interaction.member.roles.cache.some(role => role.name.toLowerCase() === nombreRolOwner);
        const esAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!tieneOwner && !esAdmin) {
            return await interaction.reply({ 
                content: '❌ No tienes el rol **owner** para encender o apagar el bot.', 
                ephemeral: true 
            });
        }
    }

    if (commandName === 'mensaje') {
        const texto = interaction.options.getString('texto');
        await interaction.reply({ content: 'Mensaje enviado.', ephemeral: true });
        await interaction.channel.send(texto);
    } 
    
    else if (commandName === 'imagen') {
        const attachment = interaction.options.getAttachment('archivo');
        await interaction.reply({ content: 'Imagen enviada.', ephemeral: true });
        await interaction.channel.send({ files: [attachment.url] });
    } 
    
    else if (commandName === 'ia') {
        const estado = interaction.options.getString('estado');
        if (estado === 'si') {
            iaActiva = true;
            await interaction.reply({ content: '🧠 El cerebro automático y las reacciones han sido **activadas**.' });
        } else {
            iaActiva = false;
            await interaction.reply({ content: '💤 El comportamiento automático ha sido **desactivado**.' });
        }
    }
});

// -------------------------------------------------------------
// INTERACCIÓN Y APRENDIZAJE DEL CHAT
// -------------------------------------------------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content) return;

    const texto = message.content.toLowerCase().trim();

    if (texto.length > 2 && !texto.startsWith('http')) {
        aprenderTexto(texto);
    }

    if (!iaActiva) return;

    if (Math.random() < 0.20) {
        const emojis = ['🤡', '💀', '🤣', '😭', '🫵', '👀', '💩'];
        const emojiRandom = emojis[Math.floor(Math.random() * emojis.length)];
        message.react(emojiRandom).catch(() => {});
    }

    if (Math.random() < 0.03) {
        return message.channel.send(estadosHumanos[Math.floor(Math.random() * estadosHumanos.length)]);
    }

    const fueMencionado = message.mentions.has(client.user);
    const hablarCuandoQuiera = Math.random() < 0.15; 

    if (fueMencionado || hablarCuandoQuiera) {
        const palabrasEntrada = texto.split(/\s+/);
        const palabraConocida = palabrasEntrada.find(p => cerebro[p]);

        const oracionGenerada = generarOracion(palabraConocida);
        message.reply(oracionGenerada).catch(() => {});
    }
});

client.login(process.env.DISCORD_TOKEN);

