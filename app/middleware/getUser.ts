'use server';
import { getUser } from '@/data/users';
import { NextMiddleware } from 'next/server';

export async function getUserMiddleware(ctx: any, next: NextMiddleware) {
  const user = await getUser();
  ctx.user = user;
  return next(ctx.request, ctx);
}
