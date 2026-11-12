// Cấu hình các trang quản lý danh mục (khớp với services/lib/admin-lookups.js)

const nameAndOrderFields = (nameLabel, placeholder) => [
  { key: 'name', label: nameLabel, type: 'text', required: true, placeholder },
  {
    key: 'sortOrder',
    label: 'Thứ tự hiển thị',
    type: 'number',
    placeholder: '0',
    hint: 'Số nhỏ hiển thị trước trong danh sách chọn.',
  },
];

export const LOOKUP_CONFIGS = {
  products: {
    resource: 'products',
    title: '📦 Hàng hóa',
    itemLabel: 'hàng hóa',
    fields: [
      { key: 'sku', label: 'Mã SKU', type: 'text', required: true, placeholder: 'VD: 18650-CELL-3000', autoCapitalize: 'characters' },
      { key: 'tenHangHoa', label: 'Tên hàng hóa', type: 'text', required: true, placeholder: 'VD: Pin sạc 18650' },
    ],
    emptyItem: { sku: '', tenHangHoa: '', isActive: true },
    primary: (item) => item.tenHangHoa,
    secondary: (item) => `SKU: ${item.sku}`,
  },
  purchaseChannels: {
    resource: 'purchase-channels',
    title: '🛒 Kênh mua',
    itemLabel: 'kênh mua',
    fields: nameAndOrderFields('Tên kênh mua', 'VD: Shopee'),
    emptyItem: { name: '', sortOrder: 0, isActive: true },
    primary: (item) => item.name,
    secondary: (item) => `Thứ tự: ${item.sortOrder}`,
  },
  paymentMethods: {
    resource: 'payment-methods',
    title: '💳 Phương thức thanh toán',
    itemLabel: 'phương thức thanh toán',
    fields: nameAndOrderFields('Tên phương thức', 'VD: Chuyển khoản'),
    emptyItem: { name: '', sortOrder: 0, isActive: true },
    primary: (item) => item.name,
    secondary: (item) => `Thứ tự: ${item.sortOrder}`,
  },
};
