import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { parseMultipartFormData } from '@/lib/multipart';

const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';
const MAX_FILE_SIZE = 1024 * 1024;

export async function POST(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const parsedBody = await parseMultipartFormData(request);
  if (parsedBody.error) return NextResponse.json({ success: false, error: parsedBody.error }, { status: 400 });

  const file = parsedBody.formData.get('file');
  if (!file || typeof file.arrayBuffer !== 'function' || Number(file.size) <= 0) {
    return NextResponse.json({ success: false, error: 'Vui lòng chọn một ảnh để OCR.' }, { status: 400 });
  }
  if (Number(file.size) > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, error: 'Ảnh sau khi nén vẫn lớn hơn 1 MB, vượt giới hạn gói OCR miễn phí.' }, { status: 413 });
  }

  try {
    const requestBody = new FormData();
    requestBody.append('file', new Blob([await file.arrayBuffer()], { type: file.type || 'image/jpeg' }), file.name || 'ocr.jpg');
    requestBody.append('language', 'auto');
    requestBody.append('OCREngine', '2');
    requestBody.append('isOverlayRequired', 'false');
    requestBody.append('isTable', 'true');
    requestBody.append('detectOrientation', 'true');
    requestBody.append('scale', 'true');

    const response = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: { apikey: process.env.OCR_SPACE_API_KEY || 'helloworld' },
      body: requestBody,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OCR.Space trả về HTTP ${response.status}.`);
    if (payload.IsErroredOnProcessing) {
      const details = Array.isArray(payload.ErrorMessage) ? payload.ErrorMessage.join(' ') : payload.ErrorMessage;
      throw new Error(details || payload.ErrorDetails || 'OCR.Space không thể xử lý ảnh này.');
    }

    const text = (payload.ParsedResults ?? []).map((result) => result.ParsedText ?? '').join('\n').trim();
    if (!text) throw new Error('OCR.Space không nhận diện được văn bản trong ảnh.');
    return NextResponse.json({ success: true, text });
  } catch (error) {
    console.error('Lỗi OCR.Space:', error);
    return NextResponse.json({ success: false, error: error.message || 'Không thể nhận diện ảnh.' }, { status: 502 });
  }
}
