/**
 * Pure helpers for the admin preview feature.
 * No server-side dependencies — safe to import from server components.
 */

export function previewStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "published":
      return "Published";
    case "scheduled":
      return "Scheduled";
    default:
      return status;
  }
}
