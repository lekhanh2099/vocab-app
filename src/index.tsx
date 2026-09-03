import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { seedDatabase } from "./db/seed";
import { db } from "./db/database";
import { AppShell } from "./app/AppShell";
import "./styles/app.css";

const Home = lazy(() => import("./routes/Home"));
const Study = lazy(() => import("./routes/Study"));
const Games = lazy(() => import("./routes/Games"));
const Vocabulary = lazy(() => import("./routes/Vocabulary"));
const WordDetail = lazy(() => import("./routes/WordDetail"));
const Progress = lazy(() => import("./routes/Progress"));
const Settings = lazy(() => import("./routes/Settings"));
const Speed = lazy(() => import("./routes/games/Speed"));
const MatchGame = lazy(() => import("./routes/games/MatchGame"));
const Boss = lazy(() => import("./routes/games/Boss"));
const ContextClash = lazy(() => import("./routes/games/ContextClash"));
const Falling = lazy(() => import("./routes/games/Falling"));
const Shooter = lazy(() => import("./routes/games/Shooter"));
const Quiz = lazy(() => import("./routes/games/Quiz"));

const rootElement = document.getElementById("root");
if (!(rootElement instanceof HTMLElement)) throw new Error("Missing #root");
const root: HTMLElement = rootElement;

function showBootstrapError(error: unknown) {
  console.error("Vocab Universe bootstrap failed", error);
  root.innerHTML = `
    <main class="grid min-h-dvh place-items-center bg-app-bg p-5 text-slate-900">
      <section class="w-full max-w-xl rounded-2xl border border-red-200 bg-white p-5 shadow-sm sm:p-7">
        <div class="text-xs font-extrabold uppercase tracking-[0.12em] text-red-700">Không tải được dữ liệu</div>
        <h1 class="mt-2 text-2xl font-black tracking-[-0.035em]">Chưa đọc được Google Sheet từ vựng.</h1>
        <p class="mt-2 text-sm leading-6 text-slate-500">Bản này đọc Sheet private qua Apps Script. Lần mở đầu tiên cần cấu hình URL Web App và secret ở server. Sau lần đồng bộ thành công, IndexedDB sẽ giữ dữ liệu để dùng offline.</p>
        <div class="mt-5 flex flex-col gap-2 sm:flex-row">
          <button id="vu-reload" class="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white">Reload</button>
          <button id="vu-reset-db" class="min-h-12 rounded-xl bg-red-50 px-4 text-sm font-extrabold text-red-700">Reset local database</button>
        </div>
      </section>
    </main>`;
  document.getElementById("vu-reload")?.addEventListener("click", () => location.reload());
  document.getElementById("vu-reset-db")?.addEventListener("click", () => {
    const button = document.getElementById("vu-reset-db") as HTMLButtonElement | null;
    if (button) { button.disabled = true; button.textContent = "Đang reset…"; }
    void db.delete().then(() => location.reload()).catch((resetError) => {
      console.error("Database reset failed", resetError);
      if (button) { button.disabled = false; button.textContent = "Reset thất bại — thử lại"; }
    });
  });
}

root.innerHTML = '<div class="grid min-h-dvh place-items-center bg-app-bg p-6 text-center text-slate-900"><div><b class="block text-2xl font-black tracking-[-0.04em]">Vocab Universe</b><span class="mt-2 block text-sm text-slate-500">Đang đồng bộ dữ liệu từ Google Sheet…</span></div></div>';

try {
  await seedDatabase();
  root.innerHTML = "";
  render(
    () => (
      <Router root={AppShell}>
        <Route path="/" component={Home} />
        <Route path="/study" component={Study} />
        <Route path="/games" component={Games} />
        <Route path="/games/speed" component={Speed} />
        <Route path="/games/match" component={MatchGame} />
        <Route path="/games/boss" component={Boss} />
        <Route path="/games/context" component={ContextClash} />
        <Route path="/games/falling" component={Falling} />
        <Route path="/games/shooter" component={Shooter} />
        <Route path="/games/quiz/:mode" component={Quiz} />
        <Route path="/vocab" component={Vocabulary} />
        <Route path="/vocab/:id" component={WordDetail} />
        <Route path="/progress" component={Progress} />
        <Route path="/settings" component={Settings} />
      </Router>
    ),
    root
  );
} catch (error) {
  showBootstrapError(error);
}
