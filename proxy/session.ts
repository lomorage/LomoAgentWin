import { v4 as uuidv4 } from 'uuid';

const DEFAULT_LOMO_URL = process.env.LOMO_BACKEND_URL || 'http://192.168.1.73:8000';

export interface Session {
  lomoToken: string;
  userId: string;
  username: string;
  serverUrl: string;
  createdAt: number;
}

const sessions = new Map<string, Session>();

export function createSession(lomoToken: string, userId: string, username: string, serverUrl?: string): string {
  const sessionId = uuidv4();
  sessions.set(sessionId, { lomoToken, userId, username, serverUrl: serverUrl || DEFAULT_LOMO_URL, createdAt: Date.now() });
  return sessionId;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Extract lomo token from request.
 * Checks: lomo_session cookie -> Authorization header
 */
export function getLomoToken(req: any): { token: string; userId: string; username: string; serverUrl: string } | null {
  const sessionId = req.cookies?.lomo_session;
  if (sessionId) {
    const session = getSession(sessionId);
    if (session) {
      return { token: session.lomoToken, userId: session.userId, username: session.username, serverUrl: session.serverUrl };
    }
  }
  return null;
}
