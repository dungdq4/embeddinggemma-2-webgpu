# ⚡ Gemma-2 .f16 Image & Vector Studio (React + Vite)

Ứng dụng web React chuyên dụng để **hiển thị, đối soát và tìm kiếm tương đồng ngữ nghĩa** từ các tệp nhị phân **`.f16`** (768 chiều, IEEE 754 half-precision float16) được tạo ra từ mô hình Google EmbeddingGemma-2 thông qua ứng dụng Python tăng tốc bằng GPU RTX 4060 Ti.

---

## 🌟 Tính năng nổi bật

1. **Hiển thị & Giải mã trực tiếp `.f16` trong trình duyệt**:
   - Bộ giải mã IEEE 754 float16 hiệu năng cao bằng JavaScript / TypedArray.
   - Không cần nạp mô hình nặng hay WebGPU phức tạp; giải mã hàng nghìn vector và ánh xạ với hình ảnh trong mili-giây.

2. **Ánh xạ linh hoạt với dữ liệu từ Python**:
   - Tương thích 100% với tệp `embeddings.f16` và `catalog.json` xuất từ `DatasetPipeline` / `app_gui.py` của Python.
   - Hỗ trợ kéo thả thư mục hình ảnh để khớp trực tiếp với vector.
   - Hỗ trợ nạp gói nén `.zip` xuất từ app Python.

3. **Tìm kiếm tương đồng ngữ nghĩa tức thì (Semantic Similarity Search)**:
   - Nhấn **"🎯 Find Similar"** trên bất kỳ hình ảnh nào để tính toán Cosine Similarity với toàn bộ kho ảnh trong tích tắc.
   - Tự động sắp xếp và hiển thị tỷ lệ trùng khớp (`98.5% Match`, `82.1% Match`...).

4. **Trực quan hóa Vector 768 chiều (Vector Heatmap Signature)**:
   - Mỗi ảnh hiển thị dải heatmap quang phổ thể hiện mẫu kích hoạt của 768 chiều vector.
   - Phân tích chi tiết độ chuẩn hóa L2 norm ($||v|| = 1.000$), min, max, mean.

5. **Ma trận tương đồng (Pairwise Cosine Similarity Matrix)**:
   - Chế độ xem ma trận $N \times N$ hiển thị mức độ tương đồng giữa từng cặp ảnh với nhau.

6. **Điều hướng tiện lợi (Keyboard Navigation)**:
   - Dùng phím mũi tên **←** và **→** để chuyển nhanh giữa các hình ảnh trong Lightbox modal.
   - Phím **Esc** để đóng modal.

---

## 🚀 Khởi chạy ứng dụng

### Cách 1: Nhấp đúp vào tệp Batch (Windows)
Nhấp đúp chuột vào tệp:
```
new_react\run_new_react.bat
```
Trình duyệt sẽ mở tại địa chỉ: **`http://localhost:5174`**

### Cách 2: Bằng dòng lệnh terminal
```powershell
cd e:\embeddinggemma-2-webgpu\new_react
npm run dev
```

---

## 📥 Cách nạp dữ liệu `.f16` từ app Python

1. **Nạp dữ liệu mẫu có sẵn**:
   - Nhấn nút **`⚡ Python .f16 Data`** ở thanh Import để nạp ngay bộ 10 vector được tạo trên GPU RTX 4060 Ti.
2. **Kéo thả từ thư mục Python Output**:
   - Mở thư mục `python\output_f16`.
   - Chọn đồng thời tệp `embeddings.f16` và `catalog.json` (kèm các tệp ảnh nếu có), sau đó kéo thả thẳng vào vùng nét đứt của ứng dụng.
3. **Nạp tệp ZIP**:
   - Nếu bạn đã nén thư mục dataset từ Python thành `.zip`, chỉ cần kéo thả file `.zip` vào ứng dụng.

