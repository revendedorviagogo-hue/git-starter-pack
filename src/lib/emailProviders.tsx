import React from "react";

export interface EmailProvider {
  id: string;
  name: string;
  domains: string[];
  icon: React.ReactNode;
  color: string;
  url: string;
}

const GmailIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <path fill="#4285F4" d="M44 24c0-1.1-.1-2.2-.3-3.2H24v6.4h11.3c-.5 2.6-2 4.8-4.2 6.3v5.2h6.8C41.5 35.2 44 30 44 24z" />
    <path fill="#34A853" d="M24 44c5.7 0 10.5-1.9 14-5.2l-6.8-5.3c-1.9 1.3-4.3 2-7.2 2-5.5 0-10.2-3.7-11.8-8.7H5.2v5.5C8.7 39.6 15.8 44 24 44z" />
    <path fill="#FBBC05" d="M12.2 26.8c-.4-1.3-.7-2.6-.7-4s.3-2.7.7-4v-5.5H5.2C3.8 16 3 19.9 3 24s.8 8 2.2 10.7l7-5.5z" />
    <path fill="#EA4335" d="M24 9.5c3.1 0 5.9 1.1 8.1 3.2l6.1-6.1C34.5 3.3 29.7 1 24 1 15.8 1 8.7 5.4 5.2 12.3l7 5.5C13.8 13.2 18.5 9.5 24 9.5z" />
  </svg>
);

const OutlookIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <path fill="#1976D2" d="M28 13h14v22H28z" />
    <path fill="#2196F3" d="M28 13l14 11-14 11z" />
    <path fill="#1E88E5" d="M28 13H6l22 11z" />
    <path fill="#1565C0" d="M6 13v22l22-11z" />
    <path fill="#42A5F5" d="M28 35l14-11v11z" />
    <path fill="#1E88E5" d="M6 35h22l-22-11z" />
    <ellipse cx="17" cy="24" rx="8" ry="7" fill="#1565C0" />
    <ellipse cx="17" cy="24" rx="6" ry="5" fill="#1976D2" />
    <path fill="#fff" d="M17 20c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4zm0 6.5c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z" />
  </svg>
);

const YahooIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#6001D2" width="48" height="48" rx="8" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="Arial">Y!</text>
  </svg>
);

const ICloudIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#3693F5" width="48" height="48" rx="8" />
    <path fill="white" d="M34 30H16c-3.3 0-6-2.7-6-6 0-2.8 1.9-5.2 4.5-5.8C15.3 14.9 18.4 12 22 12c3.1 0 5.8 1.9 6.9 4.6.4-.1.7-.1 1.1-.1 3.3 0 6 2.7 6 6s-2.7 6-6 6h2z" opacity="0.9" />
  </svg>
);

const AOLIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#000" width="48" height="48" rx="8" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial">AOL</text>
  </svg>
);

const ProtonIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#6D4AFF" width="48" height="48" rx="8" />
    <path fill="white" d="M14 18h20v2H14zM14 22h16v2H14zM14 26h20v2H14zM14 30h12v2H14z" opacity="0.9" />
  </svg>
);

const ZohoIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#E42527" width="48" height="48" rx="8" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">ZOHO</text>
  </svg>
);

const MailRuIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#005FF9" width="48" height="48" rx="8" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">@</text>
  </svg>
);

const YandexIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#FC3F1D" width="48" height="48" rx="8" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="22" fontWeight="bold" fontFamily="Arial">Я</text>
  </svg>
);

const GMXIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#1C449B" width="48" height="48" rx="8" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="Arial">GMX</text>
  </svg>
);

const UOLIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#F7941E" width="48" height="48" rx="8" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">UOL</text>
  </svg>
);

const TerraIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#0DA948" width="48" height="48" rx="8" />
    <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial">Terra</text>
  </svg>
);

const DefaultMailIcon = () => (
  <svg viewBox="0 0 48 48" className="h-full w-full">
    <rect fill="#64748B" width="48" height="48" rx="8" />
    <path fill="white" d="M10 16l14 10 14-10v18H10V16zm0-2h28l-14 10L10 14z" opacity="0.9" />
  </svg>
);

export const emailProviders: EmailProvider[] = [
  {
    id: "gmail",
    name: "Gmail",
    domains: ["gmail.com", "googlemail.com"],
    icon: <GmailIcon />,
    color: "#EA4335",
    url: "https://mail.google.com",
  },
  {
    id: "outlook",
    name: "Outlook",
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.com.br"],
    icon: <OutlookIcon />,
    color: "#0078D4",
    url: "https://outlook.live.com",
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    domains: ["yahoo.com", "yahoo.com.br", "yahoo.co.uk", "yahoo.co.jp", "ymail.com", "rocketmail.com"],
    icon: <YahooIcon />,
    color: "#6001D2",
    url: "https://mail.yahoo.com",
  },
  {
    id: "icloud",
    name: "iCloud Mail",
    domains: ["icloud.com", "me.com", "mac.com"],
    icon: <ICloudIcon />,
    color: "#3693F5",
    url: "https://www.icloud.com/mail",
  },
  {
    id: "aol",
    name: "AOL Mail",
    domains: ["aol.com", "aim.com"],
    icon: <AOLIcon />,
    color: "#000000",
    url: "https://mail.aol.com",
  },
  {
    id: "proton",
    name: "ProtonMail",
    domains: ["protonmail.com", "proton.me", "pm.me"],
    icon: <ProtonIcon />,
    color: "#6D4AFF",
    url: "https://mail.proton.me",
  },
  {
    id: "zoho",
    name: "Zoho Mail",
    domains: ["zoho.com", "zohomail.com"],
    icon: <ZohoIcon />,
    color: "#E42527",
    url: "https://mail.zoho.com",
  },
  {
    id: "mailru",
    name: "Mail.ru",
    domains: ["mail.ru", "inbox.ru", "list.ru", "bk.ru"],
    icon: <MailRuIcon />,
    color: "#005FF9",
    url: "https://e.mail.ru",
  },
  {
    id: "yandex",
    name: "Yandex Mail",
    domains: ["yandex.com", "yandex.ru", "ya.ru"],
    icon: <YandexIcon />,
    color: "#FC3F1D",
    url: "https://mail.yandex.com",
  },
  {
    id: "gmx",
    name: "GMX Mail",
    domains: ["gmx.com", "gmx.net", "gmx.de"],
    icon: <GMXIcon />,
    color: "#1C449B",
    url: "https://www.gmx.com",
  },
  {
    id: "uol",
    name: "UOL",
    domains: ["uol.com.br", "bol.com.br"],
    icon: <UOLIcon />,
    color: "#F7941E",
    url: "https://email.uol.com.br",
  },
  {
    id: "terra",
    name: "Terra",
    domains: ["terra.com.br"],
    icon: <TerraIcon />,
    color: "#0DA948",
    url: "https://mail.terra.com.br",
  },
];

export const defaultProvider: EmailProvider = {
  id: "default",
  name: "Email",
  domains: [],
  icon: <DefaultMailIcon />,
  color: "#64748B",
  url: "",
};

export function getEmailProvider(email: string): EmailProvider {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return emailProviders.find((p) => p.domains.includes(domain)) || {
    ...defaultProvider,
    name: domain || "Email",
    url: `https://${domain}`,
  };
}

export function getProviderIcon(email: string, size: string = "h-8 w-8"): React.ReactNode {
  const provider = getEmailProvider(email);
  return <div className={size}>{provider.icon}</div>;
}
