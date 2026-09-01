# Vocab Universe v2.2 — GAME SYSTEM RC

## Mục tiêu

Không thêm mini-game mới. Bản này tập trung sửa bug hiển thị và nâng Falling thành game flagship thật.

## Bug fix quan trọng

### Kho từ
- Bỏ virtualizer gây màn trắng khi lifecycle/ref không attach đúng.
- Card/Table dùng incremental rendering 72 từ mỗi lượt.
- IntersectionObserver tải tiếp khi cuộn.
- Filter/search/view đổi sẽ reset batch.
- Không còn dependency TanStack Virtual.

### Falling / Panda Dojo
- Mascot dùng asset high-resolution riêng, không còn panda hình học vẽ trực tiếp trong Phaser.
- Continuous speed ramp theo:
  - thời gian active
  - tiến độ màn
  - combo
- Có 4 stage với curve khác nhau.
- Combo milestone sinh power-up.
- Power-up:
  - Slow
  - hồi tim
  - khiên
- Slow kéo ~5.5 giây.
- Khiên chặn 1 lần mất mạng.
- Hồi tim chỉ xuất hiện ở stage cho phép.
- Có 3 nhiệm vụ mỗi màn:
  - hoàn thành mục tiêu
  - accuracy
  - combo
- 0–3 sao.
- Personal best score + best stars lưu theo stage.
- Có countdown 3 → 2 → 1 → GO.
- Projectile, trail, impact burst, reaction đúng/sai và ambient scene được nâng.

### Game Hub
- Có nhiệm vụ hằng ngày:
  - retrieval đúng
  - hoàn thành arcade
  - scheduled reviews
- Tiến độ dựa trên gameEvents/gameSessions/reviewLogs thật.

### Shooter / Audio Bomb
- Dùng chung stage progression và stage personal best.
- Continuous speed ramp theo stage.
- Prompt/HUD nằm trong game surface.
- Desktop 1–4, touch tap trực tiếp.
- Audio timer chỉ chạy sau khi TTS prompt kết thúc.

## Learning integrity

Power-up và mission không được tự tăng mastery.

FSRS policy giữ nguyên:
- scheduled clean retrieval mới cập nhật FSRS;
- weak/favorite/random/course-all là practice;
- Match/Speed/Boss/reference drills không đẩy lịch;
- Falling chỉ Hán/Audio → Pinyin.

## Quality gate

Trước khi test UI:

```bash
npm install
npm run check
```

Nếu `check` đỏ, dừng test UI và gửi nguyên output.
