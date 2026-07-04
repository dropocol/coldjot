/**
 * Convert a value to a plain, serializable object safe to pass from a Server
 * Component to a Client Component.
 *
 * Prisma query results (and other library objects) carry non-enumerable /
 * Symbol properties (e.g. `nodejs.util.inspect.custom`, internal Prisma tags).
 * React's Server → Client serializer rejects anything that isn't a plain
 * object, throwing:
 *   "Only plain objects can be passed to Client Components from Server
 *    Components. Objects with symbol properties like
 *    nodejs.util.inspect.custom are not supported."
 *
 * Round-tripping through JSON drops those symbols while preserving the data
 * shape ( Dates become ISO strings, BigInts/undefined are lost — be aware ).
 *
 * Use this at the server boundary right before passing db results as props.
 */
export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
