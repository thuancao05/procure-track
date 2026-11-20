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
  return [ngay, maDonHang, maVanDon, tenShop].map(cleanFolderPart).filter(Boolean).join('.');
}
