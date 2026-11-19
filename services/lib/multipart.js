const MULTIPART_CONTENT_TYPE = /^multipart\/form-data(?:\s*;|$)/i;
const MULTIPART_BOUNDARY = /(?:^|;)\s*boundary=(?:"[^"]+"|[^;\s]+)/i;

export async function parseMultipartFormData(request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!MULTIPART_CONTENT_TYPE.test(contentType) || !MULTIPART_BOUNDARY.test(contentType)) {
    return { error: 'Yêu cầu tải ảnh lên thiếu định dạng multipart hoặc boundary hợp lệ.' };
  }

  try {
    return { formData: await request.formData() };
  } catch {
    return { error: 'Dữ liệu tải ảnh lên không đầy đủ hoặc bị lỗi. Vui lòng thử lại.' };
  }
}
