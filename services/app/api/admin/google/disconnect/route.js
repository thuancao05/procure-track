import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { disableGoogleConnection } from '@/lib/google-auth';

export async function POST() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    await disableGoogleConnection();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
