import { describe, expect, it, vi } from "vitest";
import {
  VocabularySourceConfigError,
  fetchVocabularyCsv,
  valuesToCsv
} from "../server/appsScript.mjs";

const env = {
  APPS_SCRIPT_VOCAB_URL: "https://script.google.com/macros/s/test-deployment/exec",
  APPS_SCRIPT_VOCAB_SECRET: "0123456789abcdef0123456789abcdef"
};

describe("private Apps Script vocabulary source", () => {
  it("serializes returned values to CSV without corrupting commas or quotes", () => {
    expect(valuesToCsv([
      ["Nguồn", "Từ", "Nghĩa"],
      ["Thương mại 2", "订购", "đặt hàng"],
      ["Đọc hiểu", "示例", "có, dấu phẩy"],
      ["Đọc hiểu", "引号", "có \"ngoặc kép\""]
    ])).toBe(
      'Nguồn,Từ,Nghĩa\nThương mại 2,订购,đặt hàng\nĐọc hiểu,示例,"có, dấu phẩy"\nĐọc hiểu,引号,"có ""ngoặc kép"""'
    );
  });

  it("fails closed when Apps Script config is missing", async () => {
    await expect(fetchVocabularyCsv({ env: {} })).rejects.toBeInstanceOf(VocabularySourceConfigError);
  });

  it("posts the secret in the request body and converts Apps Script values", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(env.APPS_SCRIPT_VOCAB_URL);
      expect(init?.method).toBe("POST");
      expect(String(init?.body)).toContain(`token=${env.APPS_SCRIPT_VOCAB_SECRET}`);
      expect(String(url)).not.toContain(env.APPS_SCRIPT_VOCAB_SECRET);
      return new Response(JSON.stringify({
        ok: true,
        values: [
          ["Nguồn", "Bài/Unit", "Tên bài", "Từ", "Pinyin", "Nghĩa"],
          ["Thương mại 2", "Bài 1", "订购真丝面料", "订购", "dìnggòu", "đặt hàng"]
        ]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const csv = await fetchVocabularyCsv({ env, fetchImpl });
    expect(csv).toContain("Thương mại 2,Bài 1,订购真丝面料,订购,dìnggòu,đặt hàng");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects an Apps Script response when the secret is rejected", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 200 }));
    await expect(fetchVocabularyCsv({ env, fetchImpl })).rejects.toThrow("Unauthorized");
  });
});
