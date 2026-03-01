export const APP_NAME = "Knowledge Build";

export const ARTICLE_STATUS_LABELS: Record<string, string> = {
  draft: "Concept",
  in_review: "Ter beoordeling",
  published: "Gepubliceerd",
};

export const ARTICLE_STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export const ARTICLE_STATUS_ICON_COLORS: Record<string, string> = {
  draft: "text-yellow-600 dark:text-yellow-400",
  in_review: "text-blue-600 dark:text-blue-400",
  published: "text-green-600 dark:text-green-400",
};

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
];

export const ITEMS_PER_PAGE = 20;
