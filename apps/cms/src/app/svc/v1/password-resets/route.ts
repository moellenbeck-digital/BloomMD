import { requestPasswordReset } from "@/lib/identity";
import { handleApp } from "@/lib/svc";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleApp(request, async ({ payload, body }) => ({ body: await requestPasswordReset(payload, body) }));
}
