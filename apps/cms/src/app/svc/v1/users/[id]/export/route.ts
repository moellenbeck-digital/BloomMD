import { exportUser, findUser, isUuid } from "@/lib/identity";
import { SvcError, handleApp } from "@/lib/svc";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleApp(request, async ({ payload }) => {
    const { id } = await context.params;
    if (!isUuid(id)) throw new SvcError(404, "not_found");
    const user = await findUser(payload, id);
    if (!user) throw new SvcError(404, "not_found");
    return { body: { export: await exportUser(payload, user) } };
  });
}
