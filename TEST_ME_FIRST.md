# TEST ME FIRST — v2.2

## 1. Quality gate

```bash
npm install
npm run check
```

Chỉ test UI khi tất cả xanh.

## 2. Chạy

```bash
npm run dev
```

iPad/mobile cùng Wi-Fi:

```bash
npm run dev -- --host 0.0.0.0
```

## 3. Test ưu tiên

### Kho từ
- mở Thẻ: phải thấy từ ngay;
- đổi Bảng: phải thấy row ngay;
- search/filter;
- cuộn sâu để load batch tiếp;
- đổi filter khi đang cuộn.

### Falling desktop
- Màn 1 → 4;
- Hán → Pinyin;
- Audio → Pinyin;
- speed phải tăng dần ngay trong một màn;
- combo 5/10/... phải sinh power-up;
- test Slow / Heart / Shield;
- sai khi có Shield không mất mạng;
- pause/resume;
- background tab rồi quay lại;
- result stars + PB;
- next stage.

### Falling iPad/mobile
- portrait;
- landscape;
- touch keyboard;
- rotate giữa màn;
- không mở native keyboard;
- safe area không che console/control.

### Shooter / Audio
- 4 stage;
- target 1–4 desktop;
- tap trực tiếp iPad;
- continuous ramp;
- Audio prompt xong mới chạy timer.

### Game Hub
- daily missions tăng theo activity thật.
