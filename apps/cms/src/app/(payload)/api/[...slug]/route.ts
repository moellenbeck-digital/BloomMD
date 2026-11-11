import config from "@payload-config";
import "@payloadcms/next/css";
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from "@payloadcms/next/routes";
import { guarded } from "@/lib/rest-guard";

// Every REST verb passes the guard (404 without an operator session). OPTIONS carries no data.
export const GET = guarded(REST_GET(config));
export const POST = guarded(REST_POST(config));
export const DELETE = guarded(REST_DELETE(config));
export const PATCH = guarded(REST_PATCH(config));
export const PUT = guarded(REST_PUT(config));
export const OPTIONS = REST_OPTIONS(config);
