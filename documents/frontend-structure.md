# Cấu trúc frontend của Procure Track

Frontend nằm trong thư mục `apps/src`, sử dụng React, Vite, React Router và Tailwind CSS.

## 1. Cấu trúc tổng quan

```text
apps/
└── src/
    ├── main.jsx                 # Điểm khởi động React
    ├── App.jsx                  # Quản lý session và routing
    ├── ui.js                    # Class CSS dùng chung
    ├── components/              # Component giao diện dùng lại
    ├── pages/                   # Các màn hình/chức năng chính
    ├── services/                # Gọi API, Supabase
    └── utils/                   # Hàm tiện ích
```

Luồng khởi động:

```text
main.jsx → NotificationProvider → App.jsx → Login hoặc Layout → Page/component
```

## 2. Các file JSX chính

### `src/main.jsx`

Điểm bắt đầu của frontend. File này:

- Tạo React root tại phần tử HTML có id là `root`.
- Bọc ứng dụng bằng `React.StrictMode`.
- Kích hoạt `BrowserRouter` để sử dụng routing.
- Bọc ứng dụng bằng `NotificationProvider`.
- Nạp CSS chính từ `index.css`.

### `src/App.jsx`

Component điều phối trung tâm của ứng dụng. File này:

- Kiểm tra session qua API `/auth/me`.
- Lưu thông tin user hiện tại.
- Hiển thị loading khi đang kiểm tra session.
- Hiển thị `Login` nếu chưa đăng nhập.
- Xử lý đăng xuất và session hết hạn.
- Khai báo các route.
- Giới hạn route quản trị cho user có role `admin`.
- Xử lý riêng trang `/reset-password`.

Các route chính:

| URL | Component | Chức năng |
|---|---|---|
| `/` | `HomeDashboard` | Nhập phiếu/đơn hàng |
| `/orders/edit` | `EditOrdersPage` | Xem và sửa đơn hàng |
| `/orders/attention` | `AttentionOrdersPage` | Kiểm tra đơn hàng cần lưu ý |
| `/admin/products` | `LookupManager` | Quản lý hàng hóa |
| `/admin/purchase-channels` | `LookupManager` | Quản lý kênh mua |
| `/admin/payment-methods` | `LookupManager` | Quản lý phương thức thanh toán |
| `/admin/users` | `UsersPage` | Quản lý tài khoản |
| `/admin/google` | `GoogleSettingsPage` | Cấu hình kết nối Google |
| `/reset-password` | `ResetPassword` | Đổi mật khẩu |

## 3. Thư mục `components`

### `src/components/Layout.jsx`

Layout dùng chung cho các trang sau khi đăng nhập:

- Hiển thị sidebar/menu điều hướng.
- Hiển thị thông tin user và nút đăng xuất.
- Ẩn/hiện menu quản trị theo quyền admin.
- Lưu trạng thái đóng/mở menu vào `localStorage`.
- Hỗ trợ giao diện responsive.
- Dùng `<Outlet />` để render page con.

### `src/components/Login.jsx`

Màn hình đăng nhập:

- Nhận username và password.
- Gọi `POST /auth/login`.
- Hiển thị lỗi đăng nhập.
- Cho phép ẩn/hiện mật khẩu.
- Gọi callback `onLogin` khi đăng nhập thành công.

### `src/components/HomeDashboard.jsx`

Màn hình nhập đơn hàng chính:

- Nhập thông tin đơn hàng.
- Chọn hàng hóa, kênh mua và phương thức thanh toán.
- Chọn folder/spreadsheet Google Drive.
- Đọc dữ liệu từ Google Sheet.
- Gửi đơn hàng qua API `/procure`.
- Upload và nén ảnh chứng từ.
- Chụp ảnh bằng camera.
- Quét QR/barcode bằng `html5-qrcode`.
- Hiển thị một số dòng dữ liệu gần nhất trong spreadsheet.
- Lưu tùy chọn Drive của user.

### `src/components/EditOrderModal.jsx`

Modal chỉnh sửa hoặc xóa một đơn hàng, được gọi từ `EditOrdersPage`:

- Tải dữ liệu chi tiết của một dòng trong Google Sheet.
- Cho phép sửa thông tin đơn hàng.
- Thêm hoặc xóa ảnh.
- Chụp và nén ảnh.
- Gọi `PATCH /procure/edit` để lưu.
- Gọi `DELETE /procure/edit` để xóa.
- Hiển thị xác nhận trước khi xóa.

### `src/components/LookupManager.jsx`

Component quản lý danh mục dùng chung cho:

- Hàng hóa.
- Kênh mua.
- Phương thức thanh toán.

Chức năng gồm tải danh sách, tìm kiếm, phân trang, thêm, sửa, bật/tắt hoạt động và xóa. Component nhận prop `config` để tái sử dụng cho nhiều loại danh mục.

### `src/components/Modal.jsx`

Modal giao diện dùng chung:

- Hiển thị giữa màn hình desktop và dạng bottom sheet trên mobile.
- Đóng khi bấm nút, bấm ra ngoài hoặc nhấn `Escape`.
- Khóa scroll của trang khi modal mở.
- Nhận nội dung qua prop `children`.

### `src/components/NotificationProvider.jsx`

Context quản lý thông báo toàn ứng dụng. Cung cấp hook `useNotification()` với:

- `showAlert(message)` để hiển thị thông báo.
- `showConfirm(message)` để yêu cầu xác nhận.

### `src/components/Pagination.jsx`

Component phân trang dùng chung:

- Hiển thị số lượng bản ghi.
- Hiển thị trang hiện tại.
- Có nút `Trước` và `Sau`.
- Gọi callback `onChange` khi chuyển trang.

## 4. Thư mục `pages`

### `src/pages/EditOrdersPage.jsx`

Trang xem và chỉnh sửa các đơn hàng đã lưu:

- Chọn năm, tháng, folder và spreadsheet.
- Đọc dữ liệu từ Google Sheet.
- Hiển thị dữ liệu dạng bảng.
- Phân trang dữ liệu sheet.
- Format ngày tháng và tiền tệ.
- Mở `EditOrderModal` khi chọn một dòng.

### `src/pages/AttentionOrdersPage.jsx`

Trang kiểm tra các đơn hàng cần xử lý:

- Chọn folder và spreadsheet cần kiểm tra.
- Gọi API `/drive/attention`.
- Hiển thị folder thiếu hoặc dữ liệu có vấn đề.
- Xóa bản ghi cảnh báo hoặc folder liên quan.
- Phân trang kết quả.

### `src/pages/UsersPage.jsx`

Trang quản trị người dùng:

- Hiển thị danh sách tài khoản.
- Tìm kiếm và phân trang.
- Tạo, sửa và xóa user.
- Phân quyền `admin` hoặc `staff`.
- Dùng `Modal` cho form và xác nhận xóa.

### `src/pages/GoogleSettingsPage.jsx`

Trang cấu hình Google:

- Kiểm tra trạng thái kết nối Google.
- Hiển thị email đã kết nối với thông tin được che bớt.
- Bắt đầu kết nối OAuth.
- Ngắt kết nối Google.
- Xử lý tham số callback sau OAuth.

### `src/pages/ResetPassword.jsx`

Trang đặt lại mật khẩu:

- Đọc token recovery từ URL/hash.
- Kiểm tra session Supabase.
- Nhập và xác nhận mật khẩu mới.
- Cập nhật mật khẩu qua Supabase.
- Đăng nhập lại qua backend sau khi đổi mật khẩu.

### `src/pages/lookupConfigs.js`

Đây là file JavaScript cấu hình cho `LookupManager`, không phải JSX. File định nghĩa resource backend, tiêu đề, các field form, giá trị mặc định và cách hiển thị từng loại danh mục.

## 5. Các file hỗ trợ

### `src/services/api.js`

Cấu hình Axios dùng để gọi backend, bao gồm base URL, cookie/session và interceptor xử lý session hết hạn.

### `src/services/supabase.js`

Khởi tạo Supabase client, chủ yếu dùng trong `ResetPassword.jsx`.

### `src/utils/imageCompression.js`

Cung cấp hàm nén và xử lý ảnh trước khi upload. Được dùng trong `HomeDashboard.jsx` và `EditOrderModal.jsx`.

### `src/ui.js`

Chứa các class Tailwind dùng chung cho input, select, button, label, error box và hàm chuẩn hóa lỗi API.

## 6. Tóm tắt kiến trúc

```text
App.jsx
├── Authentication và routing
└── Layout.jsx
    ├── HomeDashboard.jsx
    ├── EditOrdersPage.jsx
    │   └── EditOrderModal.jsx
    ├── AttentionOrdersPage.jsx
    ├── LookupManager.jsx
    ├── UsersPage.jsx
    └── GoogleSettingsPage.jsx
```

- `App.jsx` chịu trách nhiệm điều hướng và quyền truy cập.
- `Layout.jsx` chịu trách nhiệm khung giao diện chung.
- `pages/` chứa các màn hình nghiệp vụ.
- `components/` chứa các thành phần có thể tái sử dụng.
- `services/` tách phần gọi backend khỏi giao diện.
- `LookupManager.jsx` dùng cấu hình để quản lý nhiều loại danh mục.
