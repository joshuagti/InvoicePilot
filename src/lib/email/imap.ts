import { ImapFlow } from "imapflow";
import { logger } from "@/lib/utils/logger";

export type ImapConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
};

/** Connect and open INBOX to verify credentials. */
export async function testImapCredentials(config: ImapConfig): Promise<void> {
  await withImapClient(config, async (client) => {
    await client.mailboxOpen("INBOX");
  });
}

export async function withImapClient<T>(
  config: ImapConfig,
  fn: (client: ImapFlow) => Promise<T>
): Promise<T> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth: { user: config.username, pass: config.password },
    logger: false,
  });

  try {
    await client.connect();
    return await fn(client);
  } catch (e) {
    logger.error({ err: e, host: config.host }, "IMAP connection failed");
    throw e;
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

/** Fetch raw RFC822 for UIDs in mailbox (default INBOX). */
export async function fetchMessagesByUids(
  client: ImapFlow,
  uids: number[],
  mailboxPath = "INBOX"
): Promise<Array<{ uid: number; raw: Buffer; internalDate: Date | undefined }>> {
  if (uids.length === 0) return [];
  const lock = await client.getMailboxLock(mailboxPath);
  try {
    const out: Array<{ uid: number; raw: Buffer; internalDate: Date | undefined }> = [];
    for await (const msg of client.fetch(
      uids,
      { source: true, internalDate: true },
      { uid: true }
    )) {
      if (msg.uid && msg.source) {
        out.push({
          uid: msg.uid,
          raw: Buffer.from(msg.source),
          internalDate: msg.internalDate instanceof Date ? msg.internalDate : undefined,
        });
      }
    }
    return out;
  } finally {
    lock.release();
  }
}

/** UIDs whose internal date is on or after `since` (IMAP SINCE). */
export async function searchUidsSince(
  client: ImapFlow,
  since: Date,
  options: { mailboxPath?: string } = {}
): Promise<number[]> {
  const mailboxPath = options.mailboxPath ?? "INBOX";
  const lock = await client.getMailboxLock(mailboxPath);
  try {
    const result = await client.search({ since }, { uid: true });
    if (result === false) return [];
    return result;
  } finally {
    lock.release();
  }
}

/** List recent UIDs (newest first), capped. */
export async function listRecentUids(
  client: ImapFlow,
  options: { mailboxPath?: string; limit?: number }
): Promise<number[]> {
  const mailboxPath = options.mailboxPath ?? "INBOX";
  const limit = options.limit ?? 100;
  const lock = await client.getMailboxLock(mailboxPath);
  try {
    const status = await client.status(mailboxPath, { messages: true });
    const total = status.messages ?? 0;
    if (total === 0) return [];
    const from = Math.max(1, total - limit + 1);
    const uids: number[] = [];
    for await (const msg of client.fetch(`${from}:*`, { uid: true })) {
      if (msg.uid) uids.push(msg.uid);
    }
    return uids.sort((a, b) => b - a);
  } finally {
    lock.release();
  }
}
