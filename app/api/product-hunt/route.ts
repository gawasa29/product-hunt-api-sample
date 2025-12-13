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
            name
            username
          }
        }
      }
    }
  }
`;

export async function GET() {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/4c283c0b-f032-4c65-82c6-d5c7ac93be64", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/api/product-hunt/route.ts:32",
      message: "GET function entry",
      data: {
        hasToken: !!process.env.PRODUCT_HUNT_ACCESS_TOKEN,
        tokenLength: process.env.PRODUCT_HUNT_ACCESS_TOKEN?.length || 0,
        tokenStartsWith:
          process.env.PRODUCT_HUNT_ACCESS_TOKEN?.substring(0, 10) || "N/A",
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion
  const accessToken = process.env.PRODUCT_HUNT_ACCESS_TOKEN;

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/4c283c0b-f032-4c65-82c6-d5c7ac93be64", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/api/product-hunt/route.ts:35",
      message: "Token check result",
      data: {
        accessTokenExists: !!accessToken,
        accessTokenLength: accessToken?.length || 0,
        accessTokenHasWhitespace: accessToken?.trim() !== accessToken,
        accessTokenStartsWithQuote:
          accessToken?.startsWith('"') || accessToken?.startsWith("'") || false,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "C",
    }),
  }).catch(() => {});
  // #endregion

  if (!accessToken) {
    return NextResponse.json(
      { error: "Product Hunt access token is not configured" },
      { status: 500 }
    );
  }

  try {
    const trimmedToken = accessToken.trim();
    const authHeader = `Bearer ${trimmedToken}`;

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/4c283c0b-f032-4c65-82c6-d5c7ac93be64", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/product-hunt/route.ts:50",
        message: "Before API request",
        data: {
          apiUrl: PRODUCT_HUNT_API_URL,
          authHeaderLength: authHeader.length,
          authHeaderPrefix: authHeader.substring(0, 20),
          requestBodySize: JSON.stringify({
            query: GET_POSTS_QUERY,
            variables: { first: 20 },
          }).length,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "D",
      }),
    }).catch(() => {});
    // #endregion

    const response = await fetch(PRODUCT_HUNT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        query: GET_POSTS_QUERY,
        variables: {
          first: 20, // 最初の20件を取得
        },
      }),
    });

    // #region agent log
    const responseStatus = response.status;
    const responseStatusText = response.statusText;
    const responseHeaders = Object.fromEntries(response.headers.entries());
    fetch("http://127.0.0.1:7242/ingest/4c283c0b-f032-4c65-82c6-d5c7ac93be64", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/product-hunt/route.ts:70",
        message: "After API request",
        data: {
          status: responseStatus,
          statusText: responseStatusText,
          headers: responseHeaders,
          ok: response.ok,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion

    if (!response.ok) {
      // #region agent log
      const responseClone = response.clone();
      let errorBody = "";
      try {
        errorBody = await responseClone.text();
      } catch (e) {
        errorBody = "Could not read error body";
      }
      fetch(
        "http://127.0.0.1:7242/ingest/4c283c0b-f032-4c65-82c6-d5c7ac93be64",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "app/api/product-hunt/route.ts:78",
            message: "API error response",
            data: {
              status: responseStatus,
              statusText: responseStatusText,
              errorBody: errorBody.substring(0, 500),
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "B",
          }),
        }
      ).catch(() => {});
      // #endregion

      // エラーレスポンスを解析して詳細なメッセージを返す
      let errorMessage = `Product Hunt API error: ${response.statusText}`;
      let errorDetails = null;

      try {
        const errorData = JSON.parse(errorBody);
        if (errorData.errors && errorData.errors.length > 0) {
          const firstError = errorData.errors[0];
          errorMessage = firstError.error || errorMessage;
          errorDetails = firstError.error_description || null;

          // invalid_oauth_token の場合、より詳細なメッセージを提供
          if (firstError.error === "invalid_oauth_token") {
            errorMessage = "Product Hunt API のアクセストークンが無効です";
            errorDetails = `詳細: ${
              firstError.error_description ||
              "トークンが無効、期限切れ、または必要なスコープが不足しています。"
            }\n\n解決方法:\n1. Product Hunt API ダッシュボード (https://www.producthunt.com/developers) から開発者トークンを取得\n2. または、OAuth2 フローを使用して新しいトークンを取得\n3. .env.local ファイルの PRODUCT_HUNT_ACCESS_TOKEN を更新`;
          }
        }
      } catch (e) {
        // JSON解析に失敗した場合は元のエラーメッセージを使用
      }

      return NextResponse.json(
        {
          error: errorMessage,
          details: errorDetails,
          status: responseStatus,
        },
        { status: responseStatus }
      );
    }

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/4c283c0b-f032-4c65-82c6-d5c7ac93be64", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/product-hunt/route.ts:88",
        message: "Before parsing response JSON",
        data: { responseOk: response.ok },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "E",
      }),
    }).catch(() => {});
    // #endregion

    const data: ProductHuntResponse = await response.json();

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/4c283c0b-f032-4c65-82c6-d5c7ac93be64", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/product-hunt/route.ts:92",
        message: "After parsing response JSON",
        data: {
          hasData: !!data,
          hasErrors: !!data.errors,
          errorsCount: data.errors?.length || 0,
          postsCount: data.data?.posts?.edges?.length || 0,
          errors: data.errors
            ? JSON.stringify(data.errors).substring(0, 500)
            : null,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "E",
      }),
    }).catch(() => {});
    // #endregion

    if (data.errors) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7242/ingest/4c283c0b-f032-4c65-82c6-d5c7ac93be64",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "app/api/product-hunt/route.ts:222",
            message: "GraphQL errors detected",
            data: {
              errors: JSON.stringify(data.errors),
              errorsCount: data.errors.length,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run1",
            hypothesisId: "F",
          }),
        }
      ).catch(() => {});
      // #endregion
      return NextResponse.json(
        { error: "Product Hunt API error", details: data.errors },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching Product Hunt data:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch Product Hunt data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
