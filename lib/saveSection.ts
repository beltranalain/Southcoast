import { getIdToken } from "./firebase";

export type SaveResult = { saved: boolean; demo?: boolean };

// Client helper: POST an edited section to the API with the admin's ID token.
export async function saveSection(
  section: "content" | "branding" | "schedule",
  data: Record<string, unknown>
): Promise<SaveResult> {
  const token = await getIdToken();
  const res = await fetch("/api/site-config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ section, data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Save failed.");
  return json as SaveResult;
}

export async function loadConfig(): Promise<any> {
  const res = await fetch("/api/site-config", { cache: "no-store" });
  return res.json();
}
