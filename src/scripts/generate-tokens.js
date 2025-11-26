import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Script interactivo para obtener tokens OAuth de Google
 * Ejecutar: npm run auth
 */

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  // Descomentar si necesitas escribir eventos:
  // 'https://www.googleapis.com/auth/calendar.events',
  // 'https://www.googleapis.com/auth/calendar',
];

async function generateTokens() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback';

  if (!clientId || !clientSecret) {
    console.error('\n❌ Error: Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env\n');
    console.log('Pasos para obtener credenciales:');
    console.log('1. Ve a https://console.cloud.google.com/apis/credentials');
    console.log('2. Crea un proyecto (si no tienes uno)');
    console.log('3. Habilita Google Calendar API');
    console.log('4. Crea credenciales OAuth 2.0 (tipo: Aplicación web)');
    console.log('5. Añade URI de redirección:', redirectUri);
    console.log('6. Copia Client ID y Client Secret al archivo .env\n');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Importante: obtiene refresh_token
    scope: SCOPES,
    prompt: 'consent' // Fuerza mostrar pantalla de consentimiento
  });

  console.log('\n🔐 Autenticación OAuth de Google Calendar\n');
  console.log('═'.repeat(50));

  // Extraer puerto del redirect URI
  const redirectUrl = new URL(redirectUri);
  const port = parseInt(redirectUrl.port) || 3000;
  const callbackPath = redirectUrl.pathname;

  // Crear servidor temporal para capturar el callback
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://localhost:${port}`);

    if (reqUrl.pathname === callbackPath) {
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>❌ Error: ${error}</h1><p>Cierra esta ventana.</p>`);
        console.error('\n❌ Error en autorización:', error);
        server.close();
        process.exit(1);
      }

      if (code) {
        try {
          const { tokens } = await oauth2Client.getToken(code);

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>✅ Autenticación exitosa</h1>
                <p>Tokens generados correctamente. Puedes cerrar esta ventana.</p>
                <p style="color: #666;">Revisa la terminal para copiar los tokens.</p>
              </body>
            </html>
          `);

          console.log('\n✅ Tokens obtenidos exitosamente!\n');
          console.log('═'.repeat(50));
          console.log('\nAñade estas líneas a tu archivo .env:\n');
          console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
          console.log('\n═'.repeat(50));

          console.log('\n📋 Tokens completos (para referencia):\n');
          console.log(JSON.stringify(tokens, null, 2));

          if (!tokens.refresh_token) {
            console.log('\n⚠️  NOTA: No se recibió refresh_token.');
            console.log('Esto puede ocurrir si ya autorizaste esta app antes.');
            console.log('Para obtener un nuevo refresh_token:');
            console.log('1. Ve a https://myaccount.google.com/permissions');
            console.log('2. Revoca el acceso a esta aplicación');
            console.log('3. Ejecuta este script nuevamente\n');
          }

          server.close();
          process.exit(0);

        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>❌ Error obteniendo tokens</h1><pre>${err.message}</pre>`);
          console.error('\n❌ Error:', err.message);
          server.close();
          process.exit(1);
        }
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`\n📡 Servidor temporal escuchando en puerto ${port}`);
    console.log('\n👉 Abre esta URL en tu navegador:\n');
    console.log(authUrl);
    console.log('\n⏳ Esperando autorización...\n');

    // Intentar abrir el navegador automáticamente
    import('open').then(({ default: open }) => {
      open(authUrl).catch(() => {
        // Si falla, el usuario puede abrir manualmente
      });
    }).catch(() => {
      // Módulo open no disponible, el usuario abre manualmente
    });
  });

  // Timeout de 5 minutos
  setTimeout(() => {
    console.log('\n⏰ Timeout: No se recibió autorización en 5 minutos');
    server.close();
    process.exit(1);
  }, 5 * 60 * 1000);
}

generateTokens();
