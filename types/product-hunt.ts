// Product Hunt APIの型定義

export interface ProductHuntMaker {
  name: string;
  username: string;
}

export interface ProductHuntProduct {
  id: string;
  name: string;
  tagline: string;
  url: string;
  makers: ProductHuntMaker[];
  votesCount: number;
  commentsCount: number;
  createdAt: string;
}

export interface ProductHuntPost {
  id: string;
  name: string;
  tagline: string;
  url: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  makers: ProductHuntMaker[];
}

export interface ProductHuntResponse {
  data: {
    posts: {
      edges: Array<{
        node: ProductHuntPost;
      }>;
    };
  };
}

export interface FormattedProduct {
  name: string;
  tagline: string;
  url: string;
  maker: string; // カンマ区切りのメーカー名
}
