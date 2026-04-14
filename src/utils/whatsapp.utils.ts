import { WASocket } from '@whiskeysockets/baileys';

export function isWhatsAppReady(sock: WASocket): boolean {
    return !!sock.user;
}