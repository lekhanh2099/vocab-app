# Vocab Universe

SolidJS + TypeScript learning app cho bộ từ vựng 4 giáo trình.

## Stack

- SolidJS + TypeScript + Vite
- Tailwind CSS v4
- Dexie / IndexedDB
- ts-fsrs
- Phaser 4 cho realtime game loop
- TanStack Solid Virtual
- PWA / offline-first

## Nguyên tắc UI

- Mobile-first nhưng không mobile-only: web, iPad và phone đều là first-class targets.
- App/game DOM dùng Tailwind; spacing/typography theo rem scale.
- Phaser là ngoại lệ dùng pixel-coordinate nội bộ cho canvas/game objects.
- Touch capability (`any-pointer: coarse`) quyết định touch controls, không suy đoán device chỉ bằng viewport width.
- Game realtime có flow `setup → playing/paused → result`; không auto-start khi vừa vào route.

## Learning logic

- FSRS tách recognition / recall / sound / usage.
- Một encounter chỉ commit một outcome: first-try Good, retry-success Hard, unresolved Again.
- Match 6 là warm-up, không tăng mastery.
- Boss gộp Pinyin + Audio thành một sound outcome.

## Audio

Web Speech là zero-backend provider. Mặc định app ưu tiên **native/local Mainland Mandarin voice** từ OS để ổn định trên Safari/iPad/iPhone và desktop. Settings cho phép chọn/test voice cụ thể. Network/premium browser voice là opt-in.

Muốn neural TTS đồng nhất tuyệt đối giữa mọi thiết bị cần pre-generated audio hoặc backend; không đặt cloud API key ở frontend.

## Data audit

- Hán thương mại 2: 171
- Hán thương mại 3: 233
- Nhịp cầu Hán ngữ: 831
- Đọc hiểu: 1240
- Tổng: 2475 occurrences
- 2300 unique Hanzi

## Run

```bash
npm install
npm run dev
```

Test bằng iPad/iPhone thật cùng Wi-Fi:

```bash
npm run dev -- --host 0.0.0.0
```

## Checks

```bash
npm run audit:data
npm test
npm run build
```

Xem `QUALITY_AUDIT.md` cho criteria game / web / iPad / mobile.
