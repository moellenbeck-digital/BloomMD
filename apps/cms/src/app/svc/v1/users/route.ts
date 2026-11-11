import { parseRegister, registerUser, usersByIds } from "@/lib/identity";
import { handleApp } from "@/lib/svc";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleApp(request, async ({ payload, body }) => ({ status: 201, body: await registerUser(payload, parseRegister(body)) }));
}

export async function GET(request: Request) {
  return handleApp(request, async ({ payload, url }) => ({ body: await usersByIds(payload, url.searchParams.get("ids")) }));
}
