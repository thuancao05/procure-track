import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createUserClient } from '@/lib/supabase';

const json = (status, error) => NextResponse.json({ success: false, error }, { status });
const isValidDriveId = (value) => value === null || (typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value));

export async function GET() {
  const { user, accessToken, errorResponse, isLocalAuthBypass } = await requireUser();
  if (errorResponse) return errorResponse;
  if (isLocalAuthBypass) {
    return NextResponse.json({
      success: true,
      localOnly: true,
      preferences: { defaultFolderId: '', defaultSpreadsheetId: '' },
    });
  }

  const { data, error } = await createUserClient(accessToken)
    .from('user_drive_preferences')
    .select('default_folder_id, default_spreadsheet_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Không thể tải thiết lập Drive:', error);
    return json(500, 'Không thể tải thiết lập Drive. Hãy kiểm tra migration user_drive_preferences đã được áp dụng.');
  }

  return NextResponse.json({
    success: true,
    preferences: {
      defaultFolderId: data?.default_folder_id ?? '',
      defaultSpreadsheetId: data?.default_spreadsheet_id ?? '',
    },
  });
}

export async function PATCH(request) {
  const { user, accessToken, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, 'Dữ liệu không hợp lệ.');
  }

  const updates = {};
  if (Object.hasOwn(body ?? {}, 'defaultFolderId')) {
    if (!isValidDriveId(body.defaultFolderId)) return json(400, 'Folder ID không hợp lệ.');
    updates.default_folder_id = body.defaultFolderId;
  }
  if (Object.hasOwn(body ?? {}, 'defaultSpreadsheetId')) {
    if (!isValidDriveId(body.defaultSpreadsheetId)) return json(400, 'Spreadsheet ID không hợp lệ.');
    updates.default_spreadsheet_id = body.defaultSpreadsheetId;
  }
  if (!Object.keys(updates).length) return json(400, 'Không có thiết lập nào để lưu.');

  const supabase = createUserClient(accessToken);
  const { data: current, error: readError } = await supabase
    .from('user_drive_preferences')
    .select('default_folder_id, default_spreadsheet_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError) {
    console.error('Không thể đọc thiết lập Drive:', readError);
    return json(500, 'Không thể đọc thiết lập Drive. Hãy kiểm tra migration user_drive_preferences đã được áp dụng.');
  }

  const { error } = await supabase.from('user_drive_preferences').upsert({
    user_id: user.id,
    default_folder_id: Object.hasOwn(updates, 'default_folder_id') ? updates.default_folder_id : current?.default_folder_id ?? null,
    default_spreadsheet_id: Object.hasOwn(updates, 'default_spreadsheet_id') ? updates.default_spreadsheet_id : current?.default_spreadsheet_id ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('Không thể lưu thiết lập Drive:', error);
    return json(500, 'Không thể lưu thiết lập Drive.');
  }

  return NextResponse.json({ success: true });
}
