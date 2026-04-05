import { prisma } from "@/lib/db/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret";

export const OPENAI_API_KEY_SETTING_KEY = "openai_api_key";

export async function getOpenAIApiKeyFromStore(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: OPENAI_API_KEY_SETTING_KEY },
  });
  if (!row?.valueEnc) return null;
  try {
    return decryptSecret(row.valueEnc);
  } catch {
    return null;
  }
}

export async function setOpenAIApiKeyInStore(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    await prisma.appSetting.deleteMany({ where: { key: OPENAI_API_KEY_SETTING_KEY } });
    return;
  }
  const valueEnc = encryptSecret(trimmed);
  await prisma.appSetting.upsert({
    where: { key: OPENAI_API_KEY_SETTING_KEY },
    create: { key: OPENAI_API_KEY_SETTING_KEY, valueEnc },
    update: { valueEnc },
  });
}

export async function isOpenAIApiKeyConfigured(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({
    where: { key: OPENAI_API_KEY_SETTING_KEY },
    select: { key: true },
  });
  return !!row;
}
