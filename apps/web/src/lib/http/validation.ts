import { NextResponse } from "next/server";
import { ZodType, z } from "zod";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * Parse and validate a JSON request body against a zod schema.
 *
 * Returns either the validated data or a ready-to-return 400 NextResponse.
 * Invalid JSON and schema failures both produce a structured 400 response
 * (previously these threw and surfaced as 500s).
 *
 * Usage:
 *   const body = await parseBody(req, createContactSchema);
 *   if (!body.ok) return body.response;
 *   const { firstName, lastName, email } = body.data;
 */
export async function parseBody<Output>(
  req: Request,
  schema: ZodType<Output, z.ZodTypeDef, unknown>
): Promise<ParseResult<Output>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Parse and validate URL search params against a zod schema. All values are
 * coerced from strings (z.coerce.*), so this is suited to query schemas.
 */
export function parseQuery<Output>(
  searchParams: URLSearchParams,
  schema: ZodType<Output, z.ZodTypeDef, unknown>
): ParseResult<Output> {
  // zod's coerce handles string→number/etc.; pass the raw string record.
  const obj: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    obj[key] = value;
  }

  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid query parameters",
          issues: parsed.error.flatten(),
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export type InferSchemaInput<S> = S extends ZodType<infer Output>
  ? Output
  : never;
