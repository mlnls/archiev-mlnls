"use client";

import { Editor } from "@/components/Editor";
import { RequireAdmin } from "@/components/RequireAdmin";

export default function WritePage() {
  return <RequireAdmin><Editor /></RequireAdmin>;
}
