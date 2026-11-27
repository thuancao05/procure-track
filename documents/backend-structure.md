# Cấu trúc backend của Procure Track

Backend nằm trong thư mục `services`. Đây là ứng dụng Next.js sử dụng App Router để cung cấp REST API cho frontend, kết nối với Supabase, Google Drive và Google Sheets.

## 1. Cấu trúc tổng quan

```text
services/
├── app/
│   ├── layout.tsx                # Layout Next.js mặc định
│   ├── page.tsx                  # Trang gốc mặc định của Next.js
│   └── api/                      # Các REST API route
├── lib/                          # Logic dùng chung cho nhiều API
├── public/                       # Tài nguyên tĩnh
├── next.config.ts                # Cấu hình Next.js
├── vite.config.ts                # Cấu hình Vinext/Vite/Cloudflare
├── cloudflare.config.ts          # Cấu hình deploy Cloudflare
└── package.json                  # Dependency và script backend
```

Trong dự án này, thư mục `app/api` là phần quan trọng nhất. Mỗi thư mục có file `route.js` tương ứng với một endpoint HTTP.

## 2. Công nghệ và vai trò

- **Next.js App Router**: định nghĩa API bằng cấu trúc thư mục.
- **Supabase Auth**: đăng nhập, session và quản lý user.
- **Supabase Database**: lưu danh mục, tùy chọn Drive và thông tin kết nối Google.
- **Google APIs**: thao tác với Google Drive và Google Sheets.
- **Axios ở frontend**: gọi các API backend.
- **Vinext/Cloudflare**: hỗ trợ build và deploy backend lên Cloudflare Workers.

## 3. Luồng xử lý request

```text
Frontend
   ↓ HTTP request + cookie session
app/api/.../route.js
   ↓ requireUser() hoặc requireAdmin()
   ↓ validate dữ liệu
   ↓ gọi Supabase / Google API
   ↓ trả NextResponse.json(...)
Frontend nhận kết quả
```

Các API thường xác thực người dùng trước khi xử lý. API quản trị dùng `requireAdmin()`, còn API nghiệp vụ dùng `requireUser()`.

## 4. Nhóm API xác thực

### `app/api/auth/login/route.js`

Xử lý đăng nhập:

- Nhận username và password.
- Tìm tài khoản tương ứng trong Supabase Auth.
- Xác thực thông tin đăng nhập.
- Tạo session.
- Lưu access token và refresh token vào cookie `httpOnly`.
- Trả về thông tin user an toàn cho frontend.

### `app/api/auth/logout/route.js`

Xử lý đăng xuất:

- Lấy access token hiện tại.
- Đăng xuất khỏi Supabase nếu cần.
- Xóa cookie access token và refresh token.

### `app/api/auth/me/route.js`

Kiểm tra session hiện tại:

- Gọi `requireUser()`.
- Nếu session hợp lệ, trả về thông tin user.
- Nếu access token hết hạn, hệ thống thử refresh bằng refresh token.
- Nếu không thể refresh, trả HTTP 401.

### `app/api/auth/callback/route.js`

Re-export handler callback Google từ route quản trị Google. Đây là alias tương thích cho đường dẫn callback khác.

## 5. Nhóm API quản trị

### `app/api/admin/users/route.js`

Quản lý danh sách user dành cho admin:

- `GET`: lấy danh sách user.
- `POST`: tạo user mới.
- Kiểm tra quyền admin bằng `requireAdmin()`.
- Sử dụng Supabase Admin API để quản lý tài khoản.

### `app/api/admin/users/[id]/route.js`

Quản lý một user theo UUID:

- `PATCH`: đổi username, role hoặc đặt lại password.
- `DELETE`: xóa user.
- Không cho admin tự hạ quyền admin của chính mình.
- Không cho user tự xóa tài khoản của chính mình.
- Kiểm tra username, password, role và UUID trước khi cập nhật.

### `app/api/admin/lookups/[resource]/route.js`

Quản lý danh mục theo resource động:

- `GET`: lấy toàn bộ danh mục.
- `POST`: thêm danh mục mới.
- Hỗ trợ các resource như `products`, `purchase-channels`, `payment-methods`.
- Chỉ admin mới được sử dụng.

### `app/api/admin/lookups/[resource]/[id]/route.js`

Quản lý một bản ghi danh mục:

- `PATCH`: cập nhật danh mục.
- `DELETE`: xóa danh mục.
- Kiểm tra resource và ID.
- Đảm bảo chỉ có một mục mặc định trong các danh mục hỗ trợ `is_default`.

### `app/api/admin/google/connect/route.js`

Bắt đầu quy trình OAuth với Google:

- Kiểm tra quyền admin.
- Tạo Google authorization URL.
- Yêu cầu quyền truy cập Google Drive và Google Sheets.
- Trả URL để frontend chuyển hướng người dùng.

### `app/api/admin/google/callback/route.js`

Nhận callback sau khi admin đồng ý kết nối Google:

- Đọc authorization code.
- Đổi code lấy refresh token.
- Mã hóa refresh token.
- Lưu token vào Supabase.
- Chuyển hướng về frontend kèm trạng thái thành công hoặc lỗi.

### `app/api/admin/google/status/route.js`

Kiểm tra trạng thái kết nối Google:

- Cho biết đã kết nối hay chưa.
- Trả email Google đã kết nối sau khi che bớt thông tin.
- Phát hiện refresh token đã hết hạn hoặc bị thu hồi.

### `app/api/admin/google/disconnect/route.js`

Ngắt kết nối Google bằng cách vô hiệu hóa thông tin OAuth đã lưu trong Supabase.

## 6. Nhóm API danh mục dùng chung

### `app/api/lookups/route.js`

API dành cho các màn hình nghiệp vụ thông thường:

- Lấy danh sách hàng hóa.
- Lấy danh sách kênh mua.
- Lấy danh sách phương thức thanh toán.
- Lấy danh sách shop đã lưu.
- Chỉ trả các mục đang hoạt động hoặc phù hợp với nghiệp vụ.

Khác với API `/admin/lookups`, endpoint này dành cho user nhập đơn hàng và chỉ đọc dữ liệu.

## 7. Nhóm API Google Drive và Google Sheets

### `app/api/drive/folders/route.js`

Lấy danh sách folder từ Google Drive của tài khoản đã kết nối. Có hỗ trợ dữ liệu mock khi bật `DRIVE_FOLDERS_MOCK` trong môi trường local.

### `app/api/drive/spreadsheets/route.js`

Lấy danh sách spreadsheet trong một folder Google Drive cụ thể.

### `app/api/drive/sheet-data/route.js`

Đọc dữ liệu trong một sheet:

- Kiểm tra `spreadsheetId` và tên sheet.
- Đọc header và các dòng dữ liệu.
- Hỗ trợ offset/limit để phân trang.
- Trả dữ liệu cho màn hình chỉnh sửa đơn hàng.

### `app/api/drive/attention/route.js`

Kiểm tra các đơn hàng hoặc folder cần lưu ý:

- `GET`: quét dữ liệu Drive/Sheets để tìm vấn đề.
- `DELETE`: xóa bản ghi cảnh báo hoặc cây folder liên quan.
- So sánh dữ liệu trong sheet với folder chứng từ trên Drive.
- Phát hiện folder thiếu hoặc dữ liệu không khớp.

### `app/api/preferences/drive/route.js`

Lưu lựa chọn Drive riêng của từng user:

- `GET`: lấy folder/spreadsheet đang được ghi nhớ.
- `PATCH`: cập nhật lựa chọn.
- Kiểm tra định dạng ID Drive trước khi lưu.

## 8. Nhóm API nhập và chỉnh sửa đơn hàng

### `app/api/procure/route.js`

API tạo đơn hàng mới:

- Nhận dữ liệu dạng multipart vì có thể kèm ảnh.
- Xác thực user.
- Kiểm tra ngày, mã đơn, mã vận đơn và các trường đầu vào.
- Tạo hoặc tìm sheet tháng tương ứng.
- Ghi dữ liệu vào Google Sheets.
- Tạo folder chứng từ cho đơn hàng trên Google Drive.
- Upload ảnh vào folder đó.
- Lưu tên shop vào danh mục nếu cần.

### `app/api/procure/edit/route.js`

API đọc, sửa và xóa một đơn hàng trong Google Sheet:

- `GET`: lấy chi tiết dòng cần sửa và danh sách ảnh hiện có.
- `PATCH`: cập nhật dữ liệu dòng, thêm ảnh mới và xóa ảnh được chọn.
- `DELETE`: xóa đơn hàng và xử lý folder chứng từ liên quan.
- Có thể tạo sheet tháng hoặc folder tháng nếu chưa tồn tại.

### `app/api/procure/edit/image/route.js`

Đọc một file ảnh chứng từ từ Google Drive:

- Kiểm tra quyền user.
- Kiểm tra file ID.
- Tải file từ Drive.
- Trả ảnh về frontend dưới dạng dữ liệu binary/blob.

## 9. Thư mục `lib`

### `lib/auth.js`

Logic xác thực và phân quyền dùng chung:

- Tạo và xóa cookie session.
- Đọc access token từ cookie.
- Kiểm tra user với Supabase Auth.
- Tự refresh session khi access token hết hạn.
- `requireUser()` yêu cầu user đã đăng nhập.
- `requireAdmin()` yêu cầu user có role `admin`.
- `publicUser()` loại bỏ thông tin nhạy cảm trước khi trả về frontend.

Cookie session gồm:

- `pt-access-token` — access token ngắn hạn.
- `pt-refresh-token` — refresh token dùng để lấy session mới.

Token được lưu trong cookie `httpOnly`, vì vậy JavaScript phía frontend không đọc trực tiếp được token.

### `lib/supabase.js`

Tạo các loại Supabase client:

- `createAuthClient()`: đăng nhập, refresh session và kiểm tra token.
- `createAdminClient()`: dùng secret key để quản trị user và dữ liệu hệ thống.
- `createUserClient(accessToken)`: truy vấn với quyền của user hiện tại để RLS được áp dụng.

Các biến môi trường chính:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

### `lib/google-auth.js`

Quản lý OAuth và refresh token của Google:

- Khai báo quyền Drive và Sheets.
- Tạo OAuth client.
- Mã hóa refresh token bằng AES-256-GCM trước khi lưu.
- Đọc và giải mã refresh token.
- Lưu hoặc vô hiệu hóa kết nối Google trong bảng `google_oauth_connections`.
- Tạo OAuth client đã gắn refresh token cho các API Drive/Sheets.

### `lib/admin-lookups.js`

Cấu hình và tiện ích cho API danh mục:

- Khai báo resource `products`.
- Khai báo resource `purchase-channels`.
- Khai báo resource `payment-methods`.
- Map tên field API camelCase sang tên cột database snake_case.
- Validate body request.
- Chuyển dữ liệu database thành dữ liệu API.
- Chuẩn hóa lỗi database, bao gồm lỗi trùng dữ liệu.

### `lib/admin-users.js`

Tiện ích quản lý user:

- Validate username.
- Validate password tối thiểu 8 ký tự.
- Validate role `admin` hoặc `staff`.
- Kiểm tra UUID.
- Chuyển user Supabase thành object an toàn cho API.
- Chuẩn hóa lỗi từ Supabase Auth.

### `lib/multipart.js`

Xử lý request upload ảnh dạng `multipart/form-data`:

- Kiểm tra content type.
- Kiểm tra boundary.
- Đọc `FormData`.
- Trả lỗi rõ ràng nếu dữ liệu upload không hợp lệ.

### `lib/order-folder.js`

Tạo tên folder chứng từ cho đơn hàng.

Tên folder được tạo từ:

```text
ngày.mã-đơn-hàng.mã-vận-đơn.tên-shop
```

Hàm này cũng loại bỏ ký tự không hợp lệ đối với tên file/folder trên Google Drive.

## 10. Các file cấu hình và giao diện mặc định

### `app/layout.tsx`

Layout mặc định của Next.js. File này:

- Khai báo metadata.
- Nạp font Geist.
- Nạp `globals.css`.
- Bọc nội dung các page bằng layout HTML cơ bản.

### `app/page.tsx`

Trang gốc mặc định được tạo từ template Next.js. Frontend nghiệp vụ chính hiện nằm trong thư mục `apps`, vì vậy file này không chứa logic API.

### `app/globals.css`

CSS toàn cục của ứng dụng backend/Next.js.

### `next.config.ts`

Cấu hình Next.js, bao gồm origin frontend dùng cho một số thiết lập tích hợp.

### `vite.config.ts`

Cấu hình Vinext, Vite, Tailwind và Cloudflare plugin cho hướng build/deploy trên Cloudflare.

### `cloudflare.config.ts`

Cấu hình binding và worker khi deploy backend lên Cloudflare.

## 11. Biến môi trường local quan trọng

```env
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
GOOGLE_TOKEN_ENCRYPTION_KEY=...

LOCAL_AUTH_BYPASS=true
LOCAL_AUTH_EMAIL=local@localhost
LOCAL_AUTH_ROLE=admin
DRIVE_FOLDERS_MOCK=true
```

`LOCAL_AUTH_BYPASS` và `DRIVE_FOLDERS_MOCK` chỉ nên dùng trong môi trường phát triển local, không bật trong production.

## 12. Tóm tắt kiến trúc

```text
Frontend apps/
    ↓ Axios + session cookies
Backend services/app/api/
    ├── auth       → Supabase Auth
    ├── admin      → User, danh mục, Google OAuth
    ├── drive      → Google Drive/Sheets
    ├── procure    → Tạo, sửa, xóa đơn hàng
    └── lookups    → Đọc danh mục cho màn hình nhập hàng

services/lib/
    ├── auth.js
    ├── supabase.js
    ├── google-auth.js
    ├── admin-lookups.js
    ├── admin-users.js
    ├── multipart.js
    └── order-folder.js
```

Tóm lại, backend đóng vai trò lớp trung gian bảo mật giữa frontend và các dịch vụ bên ngoài. Frontend không truy cập trực tiếp Supabase Secret Key hoặc Google refresh token; mọi thao tác xác thực, database, Google Drive và Google Sheets đều được xử lý trong các API route của `services`.
