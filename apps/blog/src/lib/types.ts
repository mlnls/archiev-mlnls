export interface PostSummary {
  id: number;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  coverImage: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readingMinutes: number;
}

export interface Post extends Omit<PostSummary, "readingMinutes"> {
  body: string;
}

export interface Comment {
  id: number;
  body: string;
  createdAt: string;
  username: string;
}
