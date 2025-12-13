"use client";

import { useState } from "react";
import type { ProductHuntPost } from "@/types/product-hunt";

interface ProductHuntTableProps {
  posts: ProductHuntPost[];
}

export default function ProductHuntTable({ posts }: ProductHuntTableProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      const response = await fetch("/api/export-to-csv", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to export to CSV");
      }

      // CSVファイルをBlobとして取得
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Content-Dispositionヘッダーからファイル名を取得
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch
        ? filenameMatch[1]
        : `product-hunt-posts-${new Date().toISOString().split("T")[0]}.csv`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess(true);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Product Hunt 投稿一覧
        </h1>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex h-12 items-center justify-center rounded-full bg-blue-600 px-6 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {isExporting ? "出力中..." : "CSVファイルをダウンロード"}
        </button>
      </div>

      {exportError && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/20 dark:text-red-400">
          <p className="font-medium">エラー: {exportError}</p>
        </div>
      )}

      {exportSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 p-4 text-green-800 dark:bg-green-900/20 dark:text-green-400">
          <p className="font-medium">CSVファイルをダウンロードしました</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-800">
              <th className="border-b border-zinc-200 px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                名前
              </th>
              <th className="border-b border-zinc-200 px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                タグライン
              </th>
              <th className="border-b border-zinc-200 px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                URL
              </th>
              <th className="border-b border-zinc-200 px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                メーカー
              </th>
              <th className="border-b border-zinc-200 px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                投票数
              </th>
              <th className="border-b border-zinc-200 px-4 py-3 text-right text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                コメント数
              </th>
              <th className="border-b border-zinc-200 px-4 py-3 text-left text-sm font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
                作成日時
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  データがありません
                </td>
              </tr>
            ) : (
              posts.map((post) => {
                const makers = post.makers
                  .map((maker) => maker.name)
                  .join(", ");

                return (
                  <tr
                    key={post.id}
                    className="border-b border-zinc-200 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {post.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {post.tagline}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {post.url}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {makers || "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-50">
                      {post.votesCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-zinc-900 dark:text-zinc-50">
                      {post.commentsCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {new Date(post.createdAt).toLocaleString("ja-JP")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
