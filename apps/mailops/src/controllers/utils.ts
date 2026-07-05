import type { Response } from "express";

/**
 * Controller result shape — keeps controllers Express-agnostic so they can be
 * unit-tested without supertest (Phase 7).
 *
 * Route handlers turn a ControllerResult back into an Express response via
 * `send(res, result)`.
 */

export type Ok<T> = { status: 200; body: T };
export type Created<T> = { status: 201; body: T };
export type BadRequest = { status: 400; body: { error: string } };
export type NotFound = { status: 404; body: { error: string } };
export type ServerError = { status: 500; body: { error: string } };

export type ControllerResult =
  | Ok<unknown>
  | Created<unknown>
  | BadRequest
  | NotFound
  | ServerError;

export const ok = <T>(body: T): Ok<T> => ({ status: 200, body });
export const created = <T>(body: T): Created<T> => ({ status: 201, body });
export const badRequest = (error: string): BadRequest => ({
  status: 400,
  body: { error },
});
export const notFound = (error: string): NotFound => ({
  status: 404,
  body: { error },
});
export const serverError = (error: string): ServerError => ({
  status: 500,
  body: { error },
});

/** Apply a ControllerResult to an Express response. */
export function send(res: Response, r: ControllerResult) {
  return res.status(r.status).json(r.body);
}
