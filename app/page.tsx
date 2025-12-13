"use client";

import { useState } from "react";

interface ProgressData {
  type:
    | "start"
    | "progress"
    | "waiting"
    | "filtering"
    | "generating"
    | "complete"
    | "error";
  message: string;
  requestCount?: number;
  totalPosts?: number;
  waitSeconds?: number;
  rateLimitRemaining?: number;
  rateLimitLimit?: number;
  filteredCount?: number;
  filename?: string;
  csvData?: string;
  selectedDate?: string;
}

export default function Home() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
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
    setProgress(null);

    try {
      const response = await fetch("/api/export-to-csv-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedDate,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start export");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Failed to read response");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        }

        if (done) {
          // ストリームが終了したら、バッファに残っているデータを処理
          const lines = buffer.split("\n");
          for (const line of lines) {
            if (line.trim() && line.startsWith("data: ")) {
              try {
                const data: ProgressData = JSON.parse(line.slice(6));
                setProgress(data);

                if (data.type === "error") {
                  setExportError(data.message);
                  setIsExporting(false);
                  return;
                }

                if (data.type === "complete" && data.csvData && data.filename) {
                  // CSVファイルをダウンロード
                  const blob = new Blob([data.csvData], {
                    type: "text/csv; charset=utf-8",
                  });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = data.filename;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                  setIsExporting(false);
                  setProgress(null);
                  return;
                }
              } catch (e) {
                console.error("Failed to parse progress data:", e);
              }
            }
          }
          break;
        }

        // ストリーム継続中は、完全な行のみを処理
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() && line.startsWith("data: ")) {
            try {
              const data: ProgressData = JSON.parse(line.slice(6));
              setProgress(data);

              if (data.type === "error") {
                setExportError(data.message);
                setIsExporting(false);
                return;
              }

              if (data.type === "complete" && data.csvData && data.filename) {
                // CSVファイルをダウンロード
                const blob = new Blob([data.csvData], {
                  type: "text/csv; charset=utf-8",
                });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = data.filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                setIsExporting(false);
                setProgress(null);
                return;
              }
            } catch (e) {
              console.error("Failed to parse progress data:", e);
            }
          }
        }
      }
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      setIsExporting(false);
      setProgress(null);
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

          {progress && (
            <div className="mb-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {progress.message}
                </p>
                {progress.waitSeconds !== undefined && (
                  <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                    {progress.waitSeconds}秒
                  </span>
                )}
              </div>

              {progress.requestCount && (
                <div className="mb-2 text-xs text-blue-700 dark:text-blue-300">
                  リクエスト数: {progress.requestCount} | 取得済み投稿数:{" "}
                  {progress.totalPosts || 0}
                </div>
              )}

              {progress.rateLimitRemaining !== undefined &&
                progress.rateLimitLimit !== undefined && (
                  <div className="mb-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-blue-700 dark:text-blue-300">
                      <span>レート制限クォータ</span>
                      <span>
                        {progress.rateLimitRemaining} /{" "}
                        {progress.rateLimitLimit}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300 dark:bg-blue-400"
                        style={{
                          width: `${
                            (progress.rateLimitRemaining /
                              progress.rateLimitLimit) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}

              {progress.filteredCount !== undefined && (
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  フィルタリング後: {progress.filteredCount}件
                </div>
              )}
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
