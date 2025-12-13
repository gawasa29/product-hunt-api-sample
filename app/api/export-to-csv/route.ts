import { NextResponse } from "next/server";
import type { ProductHuntResponse } from "@/types/product-hunt";

const PRODUCT_HUNT_API_URL = "https://api.producthunt.com/v2/api/graphql";

const GET_POSTS_QUERY = `
  query GetPosts($first: Int!) {
    posts(first: $first) {
      edges {
        node {
          id
          name
          tagline
          url
          votesCount
          commentsCount
          createdAt
          makers {
            edges {
              node {
                name
                username
              }
            }
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

export async function POST() {
  const accessToken = process.env.PRODUCT_HUNT_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Product Hunt access token is not configured" },
      { status: 500 }
    );
  }

  try {
    // Product Hunt APIから直接データを取得
    const productHuntResponse = await fetch(PRODUCT_HUNT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: GET_POSTS_QUERY,
        variables: {
          first: 20,
        },
      }),
    });

    if (!productHuntResponse.ok) {
      throw new Error(
        `Product Hunt API error: ${productHuntResponse.statusText}`
      );
    }

    const productHuntData: ProductHuntResponse =
      await productHuntResponse.json();

    if (productHuntData.errors) {
      throw new Error("Product Hunt API error");
    }

    // ヘッダー行を準備
    const headers = [
      "名前",
      "タグライン",
      "URL",
      "メーカー",
      "投票数",
      "コメント数",
      "作成日時",
    ];

    // データ行を準備
    const rows = productHuntData.data.posts.edges.map((edge) => {
      const post = edge.node;
      const makers = post.makers.map((maker) => maker.name).join(", ");

      return [
        post.name,
        post.tagline,
        post.url,
        makers,
        post.votesCount.toString(),
        post.commentsCount.toString(),
        new Date(post.createdAt).toLocaleString("ja-JP"),
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

    // ファイル名に日付を含める
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const filename = `product-hunt-posts-${dateStr}.csv`;

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
