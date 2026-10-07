import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SpeakerRow = {
  id: string;
  full_name: string;
  title: string | null;
  bio: string | null;
  topics: string[];
  availability: string | null;
  email: string | null;
  photo_url: string | null;
  organization: string | null;
  is_external: boolean;
  created_at: string;
  updated_at: string;
};

export type SubmissionSpeakerRow = {
  submission_id: string;
  speaker_id: string;
  role: string | null;
  speakers: SpeakerRow | null;
};

/** Roles a speaker can hold on a single submission. */
export const SPEAKER_ROLES = [
  "Primary speaker",
  "Co-presenter",
  "Panelist",
  "Moderator",
  "Nominee",
  "Subject matter expert",
] as const;

export function useSpeakers() {
  return useQuery({
    queryKey: ["speakers"],
    queryFn: async (): Promise<SpeakerRow[]> => {
      const { data, error } = await supabase
        .from("speakers")
        .select("*")
        .order("is_external", { ascending: true })
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SpeakerRow[];
    },
  });
}

export function useSubmissionSpeakers(submissionId: string) {
  return useQuery({
    queryKey: ["submission_speakers", submissionId],
    queryFn: async (): Promise<SubmissionSpeakerRow[]> => {
      const { data, error } = await supabase
        .from("submission_speakers")
        .select("submission_id, speaker_id, role, speakers(*)")
        .eq("submission_id", submissionId);
      if (error) throw error;
      return (data ?? []) as unknown as SubmissionSpeakerRow[];
    },
  });
}

/** Rough count of how many submissions each speaker is attached to. */
export function useSpeakerUsage() {
  return useQuery({
    queryKey: ["speaker_usage"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("submission_speakers").select("speaker_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { speaker_id: string }[]) {
        counts[row.speaker_id] = (counts[row.speaker_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function parseTopics(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
