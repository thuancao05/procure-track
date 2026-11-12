import { NextResponse } from 'next/server';
import { publicUser, requireUser } from '@/lib/auth';

export async function GET() {
  const { user, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  return NextResponse.json({ success: true, user: publicUser(user) });
}
