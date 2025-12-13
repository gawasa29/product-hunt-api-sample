import ProductHuntTable from "./components/ProductHuntTable";
import type {
  ProductHuntResponse,
  ProductHuntPost,
} from "@/types/product-hunt";

async function getProductHuntPosts(): Promise<ProductHuntPost[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/product-hunt`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage =
        errorData.error || "Failed to fetch Product Hunt posts";
      const errorDetails = errorData.details || null;

      console.error("Error fetching Product Hunt posts:", {
        message: errorMessage,
        details: errorDetails,
        status: response.status,
      });

      // エラー情報を保持してUIで表示できるようにする
      throw new Error(
        errorDetails ? `${errorMessage}\n\n${errorDetails}` : errorMessage
      );
    }

    const data: ProductHuntResponse = await response.json();
    return data.data.posts.edges.map((edge) => edge.node);
  } catch (error) {
    console.error("Error fetching Product Hunt posts:", error);
    return [];
  }
}

export default async function Home() {
  const posts = await getProductHuntPosts();

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {posts.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-black">
            <h1 className="mb-4 text-2xl font-semibold text-black dark:text-zinc-50">
              Product Hunt 投稿一覧
            </h1>
            <div className="space-y-4 text-left">
              <p className="text-zinc-600 dark:text-zinc-400">
                データの取得に失敗しました。
              </p>
              <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-900/20">
                <p className="mb-2 font-semibold text-yellow-800 dark:text-yellow-400">
                  アクセストークンの設定が必要です
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Product Hunt API のアクセストークンを取得するには：
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-yellow-700 dark:text-yellow-300">
                  <li>
                    <a
                      href="https://www.producthunt.com/developers"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      Product Hunt API ダッシュボード
                    </a>
                    にアクセス
                  </li>
                  <li>アプリケーションを作成または選択</li>
                  <li>開発者トークン（Developer Token）を取得</li>
                  <li>
                    `.env.local` ファイルの `PRODUCT_HUNT_ACCESS_TOKEN` に設定
                  </li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <ProductHuntTable posts={posts} />
        )}
      </main>
    </div>
  );
}
