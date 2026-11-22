export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateRelative(ts: number) {
  const now = new Date();
  const date = new Date(ts);

  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} Sekunden`;
  }

  if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)} Minuten`;
  }

  if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)} Stunden`;
  }

  return date.toLocaleDateString();
}
