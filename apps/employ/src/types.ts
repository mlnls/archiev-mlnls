export interface Job {
  id: string;
  source: string;
  url: string;
  title: string;
  company: string;
  location: string | null;
  categories: string[];
  techStacks: string[];
  minCareer: number | null;
  maxCareer: number | null;
  newcomer: boolean;
  employmentType: string | null;
  deadline: string | null;
  alwaysOpen: boolean;
  salaryText: string | null;
  educationText: string | null;
  description: Partial<Record<"intro" | "responsibilities" | "qualifications" | "preferred" | "benefits" | "process", string | null>> | null;
}

export interface Match {
  score: number;
  track: "frontend" | "infra" | null;
  matchedSkills: string[];
  missingSkills: string[];
  missingPreferred: string[];
  reasons: string[];
  warnings: string[];
}

export interface JobListItem {
  job: Job;
  firstSeenAt: string;
  match: Match | null;
  status: string | null;
}

export type ResumeStatus = "queued" | "running" | "done" | "failed";

export interface ResumeContent {
  title: string;
  headline: string;
  summary: string;
  skills: { label: string; items: string[] }[];
  experience: { company: string; role: string; period: string; projects: { name: string; bullets: string[] }[] }[];
  activities: { name: string; role: string; period: string; bullets: string[] }[];
  education: string[];
  certifications: string[];
  tailoringNotes: string[];
  gaps: string[];
}

export interface ResumeJob {
  id: number;
  jobId: string;
  status: ResumeStatus;
  content: ResumeContent | null;
  figmaUrl: string | null;
  figmaError: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ResumeListItem {
  id: number;
  jobId: string;
  status: ResumeStatus;
  figmaUrl: string | null;
  error: string | null;
  createdAt: string;
  company: string;
  title: string;
}

export interface BatchRun {
  id: number;
  trigger: string;
  status: "running" | "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string | null;
  errors: string[];
  stats: {
    sources: Record<string, { fetched: number; new: number; error?: string; durationMs: number }>;
    newJobs: number;
    totalActive: number;
    deactivated: number;
  } | null;
}

export interface StatusResponse {
  worker: { online: boolean; lastSeen: string | null };
  batchRunning: boolean;
  runs: BatchRun[];
  counts: { active: number; newSince: number; closingSoon: number };
}
