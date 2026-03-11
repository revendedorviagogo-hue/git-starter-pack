export const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    login_success: "bg-green-500/20 text-green-400",
    login_failed: "bg-red-500/20 text-red-400",
    signup_success: "bg-blue-500/20 text-blue-400",
    signup_failed: "bg-orange-500/20 text-orange-400",
    success: "bg-green-500/20 text-green-400",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] || "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
};

export const parseBrowser = (ua: string | null) => {
  if (!ua) return "Desconhecido";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return "Outro";
};

export const parseOS = (ua: string | null) => {
  if (!ua) return "Desconhecido";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Outro";
};
