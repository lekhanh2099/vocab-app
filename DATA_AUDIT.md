# Data audit — 2026-09-01

Nguồn seed được xây từ 4 bảng từ vựng do user cung cấp. Build pipeline không bổ sung nghĩa/pinyin từ kiến thức ngoài.

- Hán thương mại 2: **171** occurrences
- Hán thương mại 3: **233** occurrences
- Nhịp cầu Hán ngữ: **831** occurrences
- Đọc hiểu: **1,240** occurrences
- Tổng: **2,475** occurrences
- Lexeme theo mặt chữ: **2,300**
- Nhóm mặt chữ xuất hiện >1 occurrence: **165**
- Canonical senses giữ theo nguồn: **2,463**
- Source-backed contexts từ **tên bài có chứa chính từ đó**: **37**

## Pinyin/readings cần phân biệt

Pipeline chỉ chuẩn hóa khoảng trắng/dấu nối, không tự hòa giải khác biệt thanh điệu.

- `传`: `chuán` / `zhuàn` — giữ riêng vì là hai âm đọc thực sự trong nguồn.
- `热闹`: `rènào` / `rènao` — giữ riêng và coi là **source pinyin conflict**; không tự sửa.

Chạy lại kiểm tra bằng:

```bash
npm run audit:data
```
