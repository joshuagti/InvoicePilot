import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isOpenAIApiKeyConfigured,
  setOpenAIApiKeyInStore,
} from "@/lib/settings/openai-key";

export async function GET() {
  const configured = await isOpenAIApiKeyConfigured();
  return NextResponse.json({ configured });
}

const PutSchema = z.object({
  apiKey: z.string(),
});

export async function PUT(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { apiKey } = parsed.data;

  await setOpenAIApiKeyInStore(apiKey);
  const configured = await isOpenAIApiKeyConfigured();
  return NextResponse.json({ ok: true, configured });
}
