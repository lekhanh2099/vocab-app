# Data audit — Google Sheet source

Runtime vocabulary no longer comes from a bundled JSON dataset. The source of truth is the `Tất cả từ` tab in `Quản lý từ vựng – 4 giáo trình`.

Verified on 2026-09-03 against the current Sheet structure:

- Hán thương mại 2: **171** occurrences
- Hán thương mại 3: **233** occurrences
- Nhịp cầu Hán ngữ: **831** occurrences
- Đọc hiểu: **1,240** occurrences
- Total: **2,475** occurrences

The current Sheet snapshot parses to:

- **2,300** lexemes by Hanzi surface form
- **2,302** readings
- **2,465** source-backed senses
- **0** fabricated lesson-title contexts

Runtime guards reject missing required headers, unknown source labels, invalid lesson labels, missing Hanzi/Pinyin/meaning, or a severely truncated source group. Compatible study progress remains in IndexedDB/FSRS and is not read from management columns in the Sheet.

The old `src/data/seed.json`, `scripts/raw-occurrences.json`, and JSON build/audit pipeline were removed on `feature/google-sheet-data-source`.
