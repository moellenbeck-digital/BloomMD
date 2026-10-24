import { NextResponse } from "next/server";
import { getTemplate } from "../../../../../lib/templates";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const template = await getTemplate(slug);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return new NextResponse(template.markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${template.slug}.md"`,
    },
  });
}
