# Hệ thống Quản lý Kho hàng (Inventory)

## Giới thiệu
Đề tài 5 - Triển khai và Quản trị Hệ thống Phần mềm.

## Chức năng
- Quản lý sản phẩm
- Quản lý nhà cung cấp
- Nhập kho và xuất kho
- Thống kê tồn kho
- Lưu lịch sử giao dịch

## Công nghệ
- Ubuntu và Docker Compose
- Node.js / Express
- MySQL
- phpMyAdmin

## Hướng dẫn triển khai

### 1. Clone dự án
```bash
git clone https://github.com/tanh0806/inventory-management.git
cd inventory-management
```

### 2. Cấu hình môi trường
```bash
cp .env.example .env
nano .env
chmod 600 .env
```

Thay các mật khẩu mẫu bằng mật khẩu mạnh.

### 3. Khởi động
```bash
docker compose up -d --build
```

### 4. Kiểm tra
```bash
docker compose ps
```

### 5. Truy cập
- Website: http://localhost:3008
- phpMyAdmin: http://localhost:8088

## Lưu ý bảo mật
Không đưa file `.env` lên GitHub.
Không sử dụng `docker compose down -v` nếu muốn giữ dữ liệu.
