# QUALITY AUDIT — Study / Review branch

Branch: `audit/study-review`

This branch is isolated from `main`. Do not merge until manual acceptance is complete.

Vercel Git deployment is disabled for non-`main` branches by `vercel.json`, so pushes to this audit branch must not create preview deployments.

## 1. Learning integrity — highest priority

- Daily scheduled review updates FSRS and creates normal `reviewLogs`.
- Course `smart` only updates FSRS for cards actually due inside the selected scope.
- Weak / Favorites / Random / Course `learned` / Course `all` / manual selection are extra practice only.
- Extra practice must never change `dueAt`, stability, difficulty, reps, lapses, or daily review quota.
- Again / Hard in extra practice may add `needs-review` only for a word that was already introduced.
- Exploring a never-seen word must not be recorded as a failure.
- Match / Speed / Boss / reference practice policies remain unchanged.

## 2. Flexible scope

On `/study` and any game with `GamePoolSelector`:

- select one book;
- select no lesson = whole book;
- select one lesson;
- select two lessons;
- select many lessons;
- switch between `Đến hạn`, `Random đã học`, and `Luyện toàn phạm vi`;
- change book and verify incompatible old lessons disappear;
- switch from Study to Game and confirm the same pool is retained.

## 3. Quick mobile review

On phone portrait and landscape:

- Home → 5 / 10 / 20 cards starts with one tap;
- `Bài đang học` reuses the last course scope;
- `2 bài gần nhất` resolves around the most recent selected lesson;
- `Từ yếu 10` and `★ Đánh dấu` are practice-only;
- bottom navigation and safe area do not cover rating controls.

## 4. Flashcard + retrieval modes

From `/study`:

- Flashcard supports recognition / recall / sound and optional verified Usage;
- Quick opens Hán → Nghĩa quiz;
- Recall opens Nghĩa → Hán;
- Type opens Falling;
- Listen opens Audio → Hán;
- all modes retain the shared study pool.

## 5. Vocabulary → study

On `/vocab`:

- select individual words in card view;
- switch to table view and selection remains;
- select all filtered results;
- `Ôn kết quả lọc` creates a manual practice pool;
- sticky selection bar works on mobile;
- `Lưu bộ` can be reopened from Study;
- manual sets never update FSRS.

## 6. Daily new-card source

Settings → Daily & FSRS:

- `Phạm vi đang học`: only brand-new senses are introduced from the last course scope;
- existing due cards outside that scope still appear normally;
- `Toàn bộ kho`: new cards can come from the complete dataset;
- changing this setting does not reset existing cards.

## 7. Sense-level SRS

- A lexeme with multiple senses must not be considered mastered because only one same-reading sense has a card.
- Daily introduction can eventually introduce every sense, including senses sharing one reading.
- Word detail still displays all readings/senses and provenance.

## 8. Progress → action

On `/progress`:

- lesson cards show core mastery and overdue count;
- sorting prioritizes overdue / weak lessons;
- `Ôn đến hạn` opens exact lesson in smart mode;
- `Luyện toàn bài` opens exact lesson in practice mode;
- extra practice does not inflate Review History.

## 9. Context / Usage integrity

- No generated/fake lesson title is treated as context.
- Usage only appears for verified context attached to an unambiguous sense.
- Polysemous/polyphonic imported contexts still require an explicit valid sense when ambiguity exists.

## 10. Automated gate

Run before manual UI testing:

```bash
npm ci
npm run check
```

The audit branch GitHub Actions workflow runs the same `npm run check` command on each push.

Do not test UI if the latest branch check is red.
