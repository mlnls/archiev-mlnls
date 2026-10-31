import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { normalizeProfile, ProfileSchema, type Profile } from "@archiev/core";
import { getProfile, repoRoot, saveProfile, type Db } from "@archiev/db";

/** data/profile.local.json → 없으면 data/profile.example.json */
export function loadProfileFile(): { profile: Profile; file: string } | null {
  const root = repoRoot();
  for (const name of ["profile.local.json", "profile.example.json"]) {
    const file = path.join(root, "data", name);
    if (!existsSync(file)) continue;
    const parsed = ProfileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    return { profile: normalizeProfile(parsed), file };
  }
  return null;
}

/** DB에 프로필이 없으면 파일에서 채워 넣고, 사용할 프로필을 돌려줍니다 */
export async function ensureProfile(db: Db, log: (m: string) => void = () => {}): Promise<Profile> {
  const existing = await getProfile(db);
  if (existing) return normalizeProfile(existing);
  const loaded = loadProfileFile();
  if (!loaded) throw new Error("프로필이 없습니다. 웹의 '프로필' 화면에서 이력서를 올리거나 data/profile.local.json을 만들어 주세요.");
  await saveProfile(db, loaded.profile);
  log(`프로필을 ${path.basename(loaded.file)}에서 불러왔습니다.`);
  return loaded.profile;
}
