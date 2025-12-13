This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 概要

Product Hunt API を使用して投稿一覧を表示し、CSV ファイルとしてダウンロードできるアプリケーションです。

## セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 環境変数の設定

`.env.local` ファイルをプロジェクトルートに作成し、以下の環境変数を設定してください：

```env
# Product Hunt API
PRODUCT_HUNT_ACCESS_TOKEN=your_product_hunt_access_token_here
```

#### Product Hunt API アクセストークンの取得方法

**方法 1: 開発者トークン（推奨）**

1. [Product Hunt API ダッシュボード](https://www.producthunt.com/developers) にアクセス
2. アプリケーションを作成または選択
3. ダッシュボードから「開発者トークン（Developer Token）」を取得（期限なし）
4. `.env.local` の `PRODUCT_HUNT_ACCESS_TOKEN` に設定

**方法 2: OAuth2 クライアント認証（公開データのみ）**

公開データのみにアクセスする場合、以下のコマンドでトークンを取得できます：

```bash
curl --header "Content-Type: application/json" \
  --request POST \
  --data '{"client_id":"YOUR_CLIENT_ID","client_secret":"YOUR_CLIENT_SECRET","grant_type":"client_credentials"}' \
  https://api.producthunt.com/v2/oauth/token
```

取得した `access_token` を `.env.local` の `PRODUCT_HUNT_ACCESS_TOKEN` に設定してください。

**注意**: トークンが無効な場合は、上記の方法で新しいトークンを取得してください。

### 3. 開発サーバーの起動

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
