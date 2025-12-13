import { NextResponse } from "next/server";
import type { ProductHuntResponse, ProductHuntMaker } from "@/types/product-hunt";

const PRODUCT_HUNT_API_URL = "https://api.producthunt.com/v2/api/graphql";

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
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        const body = await request.json().catch(() => ({}));
        const selectedDate = body.date;

        if (!selectedDate) {
          sendProgress({
            type: "error",
            message: "日付が指定されていません",
          });
          controller.close();
          return;
        }

        sendProgress({
          type: "start",
          message: "データ取得を開始しています...",
          selectedDate,
        });

        const dateStart = new Date(selectedDate);
        dateStart.setUTCHours(0, 0, 0, 0);
        const dateEnd = new Date(selectedDate);
        dateEnd.setUTCHours(23, 59, 59, 999);

        const allPosts: Array<{ node: any }> = [];
        let hasNextPage = true;
        let cursor: string | null = null;
        let requestCount = 0;
        const maxRequests = 100;

        let rateLimitLimit = 6250;
        let rateLimitRemaining = 6250;
        let rateLimitReset = 0;

        while (hasNextPage && requestCount < maxRequests) {
          requestCount++;

          sendProgress({
            type: "progress",
            message: `リクエスト ${requestCount} を送信中...`,
            requestCount,
            totalPosts: allPosts.length,
            rateLimitRemaining,
            rateLimitLimit,
          });

          const productHuntResponse = await fetch(PRODUCT_HUNT_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              query: GET_POSTS_QUERY,
              variables: {
                first: 50,
                after: cursor,
              },
            }),
          });

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
            if (productHuntResponse.status === 429) {
              const retryAfter = productHuntResponse.headers.get("retry-after");
              let waitSeconds = 0;

              if (retryAfter) {
                waitSeconds = parseInt(retryAfter, 10);
              } else if (rateLimitReset > 0) {
                waitSeconds = rateLimitReset;
              } else {
                waitSeconds = 60;
              }

              sendProgress({
                type: "waiting",
                message: `レート制限に達しました。${waitSeconds}秒待機中...`,
                waitSeconds,
                rateLimitRemaining,
                rateLimitLimit,
              });

              // 待機中に進捗を更新（1秒ごと）
              for (let i = waitSeconds; i > 0; i--) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                sendProgress({
                  type: "waiting",
                  message: `レート制限に達しました。あと${i}秒待機中...`,
                  waitSeconds: i,
                  rateLimitRemaining,
                  rateLimitLimit,
                });
              }

              continue;
            }

            throw new Error(
              `Product Hunt API error: ${productHuntResponse.statusText}`
            );
          }

          const productHuntData: any = await productHuntResponse.json();

          if (productHuntData.errors) {
            const errorMessage = productHuntData.errors
              .map((e: any) => e.message || "Unknown error")
              .join("; ");
            throw new Error(`Product Hunt API error: ${errorMessage}`);
          }

          const posts = productHuntData.data?.posts?.edges || [];
          allPosts.push(...posts);

          hasNextPage =
            productHuntData.data?.posts?.pageInfo?.hasNextPage || false;
          cursor = productHuntData.data?.posts?.pageInfo?.endCursor || null;

          if (posts.length === 0) {
            break;
          }

          if (hasNextPage) {
            const remainingPercentage =
              (rateLimitRemaining / rateLimitLimit) * 100;
            let waitSeconds = 1;

            if (remainingPercentage <= 5) {
              waitSeconds = rateLimitReset > 0 ? rateLimitReset : 900;
            } else if (remainingPercentage <= 10) {
              waitSeconds = 5;
            } else if (remainingPercentage <= 20) {
              waitSeconds = 2;
            }

            if (waitSeconds > 1) {
              sendProgress({
                type: "waiting",
                message: `次のリクエストまで${waitSeconds}秒待機中... (残りクォータ: ${rateLimitRemaining}/${rateLimitLimit})`,
                waitSeconds,
                rateLimitRemaining,
                rateLimitLimit,
              });

              // 待機中に進捗を更新（1秒ごと）
              for (let i = waitSeconds; i > 0; i--) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                sendProgress({
                  type: "waiting",
                  message: `次のリクエストまであと${i}秒待機中... (残りクォータ: ${rateLimitRemaining}/${rateLimitLimit})`,
                  waitSeconds: i,
                  rateLimitRemaining,
                  rateLimitLimit,
                });
              }
            } else {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }

        sendProgress({
          type: "filtering",
          message: "日付でフィルタリング中...",
          totalPosts: allPosts.length,
        });

        const filteredPosts = allPosts.filter((edge) => {
          const post = edge.node;
          if (!post.featuredAt) {
            return false;
          }
          const featuredDate = new Date(post.featuredAt);
          return featuredDate >= dateStart && featuredDate <= dateEnd;
        });

        if (filteredPosts.length === 0) {
          sendProgress({
            type: "error",
            message: `選択された日付（${selectedDate}）の投稿が見つかりませんでした`,
          });
          controller.close();
          return;
        }

        sendProgress({
          type: "generating",
          message: "CSVファイルを生成中...",
          filteredCount: filteredPosts.length,
        });

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

        const rows = filteredPosts.map((edge) => {
          const post = edge.node;
          const makers = (Array.isArray(post.makers) ? post.makers : []).map((maker: any) => maker?.name || "").filter(Boolean).join(", ");
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

        const csvRows = [
          headers.map(escapeCsvValue).join(","),
          ...rows.map((row) => row.map(escapeCsvValue).join(",")),
        ];

        const csvContent = csvRows.join("\n");
        const csvWithBom = "\uFEFF" + csvContent;

        sendProgress({
          type: "complete",
          message: "CSVファイルの準備が完了しました",
          filename: `product-hunt-posts-${selectedDate}.csv`,
          csvData: csvWithBom,
        });

        controller.close();
      } catch (error) {
        sendProgress({
          type: "error",
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
