const INVALID_DRIVE_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

function cleanFolderPart(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(INVALID_DRIVE_NAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');
  return cleaned;
}

export function buildOrderFolderName(ngay, maDonHang, maVanDon, tenShop) {
  // Giữ nguyên đủ 4 vị trí để biết trường nào đang bị bỏ trống.
  // Ví dụ thiếu mã vận đơn: 2026-11-21.LZD2200..Shop 2
  return [ngay, maDonHang, maVanDon, tenShop].map(cleanFolderPart).join('.');
}
