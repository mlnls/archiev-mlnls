"use client";

import { use, useEffect, useState } from "react";
import { Editor } from "@/components/Editor";
import { RequireAdmin } from "@/components/RequireAdmin";
import { api } from "@/lib/client";
import type { Post } from "@/lib/types";

function EditLoader({ id }: { id: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Post>(`/admin/posts/${id}`).then(setPost).catch((e: Error) => setError(e.message));
  }, [id]);
  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  return post ? <Editor post={post} /> : null;
}

export default function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequireAdmin><EditLoader id={id} /></RequireAdmin>;
}
