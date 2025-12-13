import { NextResponse } from "next/server";
import type {
  ProductHuntResponse,
  ProductHuntMaker,
} from "@/types/product-hunt";

const PRODUCT_HUNT_API_URL = "https://api.producthunt.com/v2/api/graphql";

type GraphQLError = { message?: string };
type PostsQueryResponse = {
  data?: {
    posts?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      edges?: ProductHuntResponse["data"]["posts"]["edges"];
    };
  };
  errors?: GraphQLError[];
};

const GET_POSTS_QUERY = `
  query GetPosts($first: Int!, $after: String) {
    posts(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          tagline
          url
          description
          website
          featuredAt
          user {
            name
            username
          }
          makers {
            name
            username
          }
        }
      }
    }
  }
`;

// CSV形式のエスケープ処理
function escapeCsvValue(value: string): string {
  // カンマ、改行、ダブルクォートが含まれる場合はダブルクォートで囲む
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    // ダブルクォートをエスケープ（""に変換）
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function POST(request: Request) {
  const accessToken = process.env.PRODUCT_HUNT_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Product Hunt access token is not configured" },
      { status: 500 }
    );
  }

  try {
    // リクエストボディから日付を取得
    const body = await request.json().catch(() => ({}));
    const selectedDate = body.date;

    if (!selectedDate) {
      return NextResponse.json(
        { error: "日付が指定されていません" },
        { status: 400 }
      );
    }

    // 選択された日付の開始時刻と終了時刻を計算（UTC）
    const dateStart = new Date(selectedDate);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(selectedDate);
    dateEnd.setUTCHours(23, 59, 59, 999);

    // 取得しながら対象日付に絞り込み（不要な全件保持/後段フィルタを避ける）
    const filteredPosts: ProductHuntResponse["data"]["posts"]["edges"] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let requestCount = 0;
    const maxRequests = 100; // 安全のための上限
    // featuredAt の降順ソートが成立している場合に限り、対象日より古いページに到達したら早期終了する
    let olderPageStreak = 0;
    const maxOlderPagesBeforeStop = 2;

    // レート制限情報を追跡
    let rateLimitLimit = 6250; // デフォルト値（GraphQLエンドポイントの複雑度制限）
    let rateLimitRemaining = 6250;
    let rateLimitReset = 0;

    while (hasNextPage && requestCount < maxRequests) {
      requestCount++;

      const productHuntResponse = await fetch(PRODUCT_HUNT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: GET_POSTS_QUERY,
          variables: {
            first: 50, // 一度に取得する件数
            after: cursor,
          },
        }),
      });

      // レート制限ヘッダーを取得（参考: https://api.producthunt.com/v2/docs/rate_limits/headers）
      const rateLimitLimitHeader =
        productHuntResponse.headers.get("X-Rate-Limit-Limit");
      const rateLimitRemainingHeader = productHuntResponse.headers.get(
        "X-Rate-Limit-Remaining"
      );
      const rateLimitResetHeader =
        productHuntResponse.headers.get("X-Rate-Limit-Reset");

      if (rateLimitLimitHeader) {
        rateLimitLimit = parseInt(rateLimitLimitHeader, 10);
      }
      if (rateLimitRemainingHeader) {
        rateLimitRemaining = parseInt(rateLimitRemainingHeader, 10);
      }
      if (rateLimitResetHeader) {
        rateLimitReset = parseInt(rateLimitResetHeader, 10);
      }

      if (!productHuntResponse.ok) {
        // レート制限エラーの場合、retry-afterヘッダーまたはX-Rate-Limit-Resetを確認して待機
        if (productHuntResponse.status === 429) {
          const retryAfter = productHuntResponse.headers.get("retry-after");
          let waitSeconds = 0;

          if (retryAfter) {
            waitSeconds = parseInt(retryAfter, 10);
          } else if (rateLimitReset > 0) {
            // X-Rate-Limit-Resetヘッダーを使用（リセットまでの秒数）
            waitSeconds = rateLimitReset;
          } else {
            // デフォルトで60秒待機
            waitSeconds = 60;
          }

          // 待機時間を追加してリトライ
          await new Promise((resolve) =>
            setTimeout(resolve, waitSeconds * 1000)
          );
          continue;
        }

        throw new Error(
          `Product Hunt API error: ${productHuntResponse.statusText}`
        );
      }

      const productHuntData =
        (await productHuntResponse.json()) as PostsQueryResponse;

      if (productHuntData.errors) {
        const errorMessage = productHuntData.errors
          .map((e) => e.message || "Unknown error")
          .join("; ");
        throw new Error(`Product Hunt API error: ${errorMessage}`);
      }

      const posts = productHuntData.data?.posts?.edges || [];
      // 取得したページ内で日付範囲に入る投稿のみ収集
      for (const edge of posts) {
        const post = edge?.node;
        if (!post?.featuredAt) continue;
        const featuredDate = new Date(post.featuredAt);
        if (featuredDate >= dateStart && featuredDate <= dateEnd) {
          filteredPosts.push(edge);
        }
      }

      // ページネーション情報を更新
      hasNextPage =
        productHuntData.data?.posts?.pageInfo?.hasNextPage || false;
      cursor = productHuntData.data?.posts?.pageInfo?.endCursor || null;

      // 無限ループを防ぐため、十分なデータが取得できた場合は終了
      // または、選択された日付より前のデータが来たら終了（日付が降順の場合）
      if (posts.length === 0) {
        break;
      }

      // featuredAt の並びが降順っぽい場合のみ、対象日より古いページに到達したら早期終了
      let firstFeaturedAtMs: number | null = null;
      let lastFeaturedAtMs: number | null = null;
      for (let i = 0; i < posts.length; i++) {
        const featuredAt = posts[i]?.node?.featuredAt;
        if (!featuredAt) continue;
        const ms = Date.parse(featuredAt);
        if (Number.isNaN(ms)) continue;
        if (firstFeaturedAtMs === null) firstFeaturedAtMs = ms;
        lastFeaturedAtMs = ms;
      }
      const orderingLooksDesc =
        firstFeaturedAtMs !== null &&
        lastFeaturedAtMs !== null &&
        firstFeaturedAtMs >= lastFeaturedAtMs;
      if (orderingLooksDesc && lastFeaturedAtMs !== null) {
        if (lastFeaturedAtMs < dateStart.getTime()) {
          olderPageStreak++;
        } else {
          olderPageStreak = 0;
        }
        if (olderPageStreak >= maxOlderPagesBeforeStop) {
          break;
        }
      } else {
        olderPageStreak = 0;
      }

      // レート制限に基づいて動的に待機時間を調整（固定1秒待機を撤廃）
      if (hasNextPage) {
        const remainingPercentage =
          rateLimitLimit > 0 ? (rateLimitRemaining / rateLimitLimit) * 100 : 0;
        let waitMs = 0;

        if (remainingPercentage <= 5) {
          waitMs = rateLimitReset > 0 ? rateLimitReset * 1000 : 900000;
        } else if (remainingPercentage <= 10) {
          waitMs = 5000;
        } else if (remainingPercentage <= 20) {
          waitMs = 2000;
        } else {
          // クォータが十分な場合は最小限（マナーとしてごく短い待機）
          waitMs = 150;
        }

        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }

    if (filteredPosts.length === 0) {
      return NextResponse.json(
        {
          error: `選択された日付（${selectedDate}）の投稿が見つかりませんでした`,
        },
        { status: 404 }
      );
    }

    // ヘッダー行を準備
    const headers = [
      "name",
      "tagline",
      "url",
      "makers",
      "description",
      "website",
      "featuredAt",
      "user",
    ];

    // データ行を準備
    const rows = filteredPosts.map((edge) => {
      const post = edge.node;
      const makers = post.makers
        .map((maker: ProductHuntMaker) => maker.name)
        .join(", ");
      const user = post.user ? post.user.name : "";

      return [
        post.name || "",
        post.tagline || "",
        post.url || "",
        makers || "",
        post.description || "",
        post.website || "",
        post.featuredAt
          ? new Date(post.featuredAt).toLocaleString("ja-JP")
          : "",
        user,
      ];
    });

    // CSV形式の文字列を生成
    const csvRows = [
      headers.map(escapeCsvValue).join(","),
      ...rows.map((row) => row.map(escapeCsvValue).join(",")),
    ];

    const csvContent = csvRows.join("\n");

    // BOMを追加してExcelで正しく表示されるようにする（UTF-8）
    const csvWithBom = "\uFEFF" + csvContent;

    // ファイル名に選択された日付を含める
    const filename = `product-hunt-posts-${selectedDate}.csv`;

    // CSVファイルをダウンロードレスポンスとして返す
    return new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting to CSV:", error);
    return NextResponse.json(
      {
        error: "Failed to export to CSV",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
