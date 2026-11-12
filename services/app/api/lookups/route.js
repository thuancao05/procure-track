import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createUserClient } from '@/lib/supabase';

// Danh mục cho form nhập hàng: Hàng hóa (SKU + tên), Kênh mua, Phương thức thanh toán
export async function GET() {
  const { accessToken, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const supabase = createUserClient(accessToken);

  const [productsRes, channelsRes, paymentsRes] = await Promise.all([
    supabase.from('products').select('sku, ten_hang_hoa').order('sku'),
    supabase.from('purchase_channels').select('name').order('sort_order').order('name'),
    supabase.from('payment_methods').select('name').order('sort_order').order('name'),
  ]);

  const error = productsRes.error || channelsRes.error || paymentsRes.error;
  if (error) {
    console.error('Lỗi tải danh mục Supabase:', error);
    return NextResponse.json(
      { success: false, error: `Không thể tải danh mục: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    products: productsRes.data.map((p) => ({ sku: p.sku, tenHangHoa: p.ten_hang_hoa })),
    kenhMua: channelsRes.data.map((c) => c.name),
    phuongThucThanhToan: paymentsRes.data.map((m) => m.name),
  });
}
