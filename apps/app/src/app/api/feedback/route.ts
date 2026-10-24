import { handleFeedbackPost } from "./feedback-handler";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleFeedbackPost(request);
}
