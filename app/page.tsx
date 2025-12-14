"use client";

import { useState } from "react";

export default function Home() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  const handleDownload = async () => {
    if (!selectedDate) {
      setExportError("日付を選択してください");
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      // タイムアウトを5分に設定（コールドメール生成に時間がかかるため）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      const response = await fetch("/api/export-to-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedDate,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to export CSV");
      }

      // CSVファイルをダウンロード
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `product-hunt-posts-${selectedDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setIsExporting(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setExportError(
          "リクエストがタイムアウトしました。しばらく待ってから再度お試しください。"
        );
      } else {
        setExportError(
          error instanceof Error ? error.message : "Unknown error occurred"
        );
      }
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-md px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-black">
          <h1 className="mb-4 text-2xl font-semibold text-black dark:text-zinc-50">
            Product Hunt CSV ダウンロード
          </h1>
          <p className="mb-6 text-zinc-600 dark:text-zinc-400">
            Product Hunt の投稿データを CSV ファイルとしてダウンロードできます。
          </p>

          <div className="mb-6">
            <label
              htmlFor="date-select"
              className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-50"
            >
              ダウンロードする日付を選択
            </label>
            <input
              id="date-select"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400"
            />
          </div>

          {exportError && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
              <p className="font-medium">エラー: {exportError}</p>
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={isExporting}
            className="w-full flex h-12 items-center justify-center rounded-full bg-blue-600 px-6 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isExporting ? "ダウンロード中..." : "CSVファイルをダウンロード"}
          </button>
        </div>
      </main>
    </div>
  );
}
