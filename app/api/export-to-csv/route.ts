import { NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
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
  query GetPosts($first: Int!, $after: String, $postedAfter: DateTime, $postedBefore: DateTime) {
    posts(first: $first, after: $after, postedAfter: $postedAfter, postedBefore: $postedBefore) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          name
          tagline
          url
          description
          website
          votesCount
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

// コールドメール生成関数
async function generateColdEmail(
  name: string,
  description: string
): Promise<string> {
  const emailTemplate = `I saw {SaaS} on Product Hunt—congrats on the launch!
I especially liked {specific point} and bookmarked it right away :)

Right after launch, it can be surprisingly effective to increase the number of entry points for organic search traffic. I'm building a SaaS that lets you paste a URL and automatically generate and publish a site for a related free tool (e.g., a free ROI calculator).

It's currently in closed beta, and I'm iterating based on feedback from a small group of SaaS founders.

Would it be okay if I send you an invite link for the beta test? (A simple "OK" or "No" is totally fine.)

Best,
Yusei`;

  try {
    const { text } = await generateText({
      model: openai("gpt-5-nano"),
      prompt: `You are generating a personalized cold email based on a Product Hunt listing.

Product name: ${name}
Product description: ${description}

Use the following email template. Replace {SaaS} with the product name and {specific point} with a specific, natural, and human-like point from the description that flows naturally with the context. Keep all other parts of the template exactly as they are.

Email template:
${emailTemplate}

Generate the complete email with {SaaS} and {specific point} replaced appropriately. The {specific point} should be a natural, conversational phrase that fits seamlessly into the sentence.`,
    });

    return text;
  } catch (error) {
    console.error("Error generating cold email:", error);
    throw error;
  }
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
    const body = await request.json().catch(() => ({}));
    const selectedDate = body.date;

    if (!selectedDate) {
      return NextResponse.json(
        { error: "日付が指定されていません" },
        { status: 400 }
      );
    }

    const dateStart = new Date(selectedDate);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(selectedDate);
    dateEnd.setUTCHours(23, 59, 59, 999);

    // ISO 8601形式に変換
    const postedAfter = dateStart.toISOString();
    const postedBefore = dateEnd.toISOString();

    // APIリクエスト関数（リトライ回数制限付き）
    const fetchPosts = async (
      cursor: string | null = null,
      retryCount = 0
    ): Promise<Response> => {
      const MAX_RETRIES = 3; // 最大リトライ回数

      const response = await fetch(PRODUCT_HUNT_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: GET_POSTS_QUERY,
          variables: {
            first: 20, // Product Hunt APIの最大値は20件
            after: cursor,
            postedAfter,
            postedBefore,
          },
        }),
      });

      if (!response.ok) {
        if (response.status === 429 && retryCount < MAX_RETRIES) {
          const retryAfter = response.headers.get("retry-after");
          const rateLimitReset = response.headers.get("X-Rate-Limit-Reset");
          const waitSeconds = retryAfter
            ? parseInt(retryAfter, 10)
            : rateLimitReset
            ? parseInt(rateLimitReset, 10)
            : 60;

          // 最大待機時間を30秒に制限（タイムアウト対策）
          const actualWaitSeconds = Math.min(waitSeconds, 30);

          await new Promise((resolve) =>
            setTimeout(resolve, actualWaitSeconds * 1000)
          );

          // リトライ
          return fetchPosts(cursor, retryCount + 1);
        }

        throw new Error(`Product Hunt API error: ${response.statusText}`);
      }

      return response;
    };

    // ページネーションで全件取得
    const allPosts: ProductHuntResponse["data"]["posts"]["edges"] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    const maxPages = 10; // 最大10ページ（200件）まで取得

    for (let page = 0; page < maxPages && hasNextPage; page++) {
      const productHuntResponse = await fetchPosts(cursor);
      const productHuntData =
        (await productHuntResponse.json()) as PostsQueryResponse;

      if (productHuntData.errors) {
        const errorMessage = productHuntData.errors
          .map((e) => e.message || "Unknown error")
          .join("; ");
        throw new Error(`Product Hunt API error: ${errorMessage}`);
      }

      const posts = productHuntData.data?.posts?.edges || [];
      allPosts.push(...posts);

      hasNextPage = productHuntData.data?.posts?.pageInfo?.hasNextPage || false;
      cursor = productHuntData.data?.posts?.pageInfo?.endCursor || null;

      if (posts.length === 0) {
        break;
      }

      // 次のページ取得前に短い待機（レートリミット対策）
      if (hasNextPage) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const posts = allPosts;

    if (posts.length === 0) {
      return NextResponse.json(
        {
          error: `選択された日付（${selectedDate}）の投稿が見つかりませんでした`,
        },
        { status: 404 }
      );
    }

    console.log(`合計取得した投稿数: ${posts.length}件`);

    // ヘッダー行を準備
    const headers = [
      "name",
      "tagline",
      "url",
      "makers",
      "description",
      "website",
      "votesCount",
      "content",
    ];

    // OpenAI APIキーの確認
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.warn(
        "OPENAI_API_KEY is not configured. Cold emails will not be generated."
      );
    }

    // データ行を準備（コールドメール生成を含む）
    const rows = await Promise.all(
      posts.map(async (edge) => {
        const post = edge.node;
        const makers = post.makers
          .map((maker: ProductHuntMaker) => maker.name)
          .join(", ");

        let content = "";
        // nameとdescriptionが存在する場合のみコールドメールを生成
        if (openaiApiKey && post.name && post.description) {
          try {
            content = await generateColdEmail(post.name, post.description);
            // レートリミット対策：リクエスト間に待機時間を設ける
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error) {
            console.error(
              `Error generating cold email for ${post.name}:`,
              error
            );
            content = `Error: Failed to generate cold email`;
          }
        }

        return [
          post.name || "",
          post.tagline || "",
          post.url || "",
          makers || "",
          post.description || "",
          post.website || "",
          post.votesCount?.toString() || "0",
          content,
        ];
      })
    );

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
