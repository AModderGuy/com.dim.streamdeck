import { WebSocket, WebSocketServer } from 'ws';
import { sd } from './index';
import { ExtWebSocket } from './interfaces';
import {
  checkAuthorizationFlow,
  initChallenge,
  sharedKeyById,
} from './authorization/authorization';
import { encrypt } from './authorization/encryption';
import { copyHandler } from './util';
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { SSL_PATH } from './constant';
import { join } from 'path';

const server = createServer({
  cert: readFileSync(join(SSL_PATH, './cert.pem')),
  key: readFileSync(join(SSL_PATH, './key.pem')),
});

const wss = new WebSocketServer({ server });

export const sendToDIM = (action: string, args: Record<string, any> = {}) => {
  const baseMsg = JSON.stringify({ action, ...args });
  wss.clients.forEach((ws) => {
    const sharedKey = sharedKeyById(ws.protocol);
    if (sharedKey && ws.readyState === WebSocket.OPEN) {
      ws.send(encrypt(baseMsg, sharedKey));
    }
  });
};

wss.on('error', () => {
  sd.logMessage('There is another instance of this plugin running');
  process.exit();
});

export const init = () => {
  wss.on('connection', (ws: ExtWebSocket) => {
    // disallow any not identified connection
    if (!ws.protocol) {
      return ws.close();
    }

    ws.sharedKey = sharedKeyById(ws.protocol);

    if (!ws.sharedKey) {
      initChallenge(ws);
    }

    sd.setPluginSettings({ connected: true });

    ws.on('message', (data: string) => {
      try {
        // check if data is an authentication flow or not
        // and return the decrypted message if valid
        const json = checkAuthorizationFlow(data.toString(), ws);
        // if json is valid
        if (json && !copyHandler(json)) {
          sd.setPluginSettings(json);
        }
      } catch (e) {
        // ignore message
      }
    });

    ws.on('close', () => {
      sd.setPluginSettings({ connected: false });
    });
  });
};

server.listen(9119, 'localhost');
