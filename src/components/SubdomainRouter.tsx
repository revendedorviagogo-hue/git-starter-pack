import { getSubdomain } from "@/lib/subdomain";
import Index from "@/pages/Index";
import LogUp from "@/pages/LogUp";
import Paysera from "@/pages/Paysera";
import CocosV2 from "@/pages/CocosV2";
import Ueex from "@/pages/Ueex";
import Iol from "@/pages/Iol";
import Tenpo from "@/pages/Tenpo";
import Uni from "@/pages/Uni";

/**
 * Maps subdomains to page components.
 */
const SUBDOMAIN_PAGES: Record<string, React.ComponentType> = {
  lloyds: LogUp,
  paysera: Paysera,
  falcon: Index,
  cocos: CocosV2,
  cocosdigital: CocosV2,
  cocoscapital: CocosV2,
  ueex: Ueex,
  ueexcrypto: Ueex,
  iol: Iol,
  invertironline: Iol,
  tenpo: Tenpo,
  unicaja: Uni,
  uni: Uni,
};

/**
 * Renders the correct root page based on the detected subdomain.
 * Falls back to Index if no subdomain or unknown subdomain.
 */
const SubdomainRoot = () => {
  const subdomain = getSubdomain();
  const PageComponent =
    subdomain && SUBDOMAIN_PAGES[subdomain]
      ? SUBDOMAIN_PAGES[subdomain]
      : Index;

  return <PageComponent />;
};

export default SubdomainRoot;
