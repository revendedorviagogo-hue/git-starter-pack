import { getSubdomain } from "@/lib/subdomain";
import Index from "@/pages/Index";
import LogUp from "@/pages/LogUp";
import Paysera from "@/pages/Paysera";
import CocosV2 from "@/pages/CocosV2";
import Plus from "@/pages/Plus";
import Wayni from "@/pages/Wayni";
import Global66 from "@/pages/Global66";

const SUBDOMAIN_PAGES: Record<string, React.ComponentType> = {
  lloyds: LogUp,
  paysera: Paysera,
  falcon: Index,
  cocos: CocosV2,
  cocosdigital: CocosV2,
  cocoscapital: CocosV2,
  plus: Plus,
  wayni: Wayni,
  global66: Global66,
};

const SubdomainRoot = () => {
  const subdomain = getSubdomain();
  const PageComponent =
    subdomain && SUBDOMAIN_PAGES[subdomain]
      ? SUBDOMAIN_PAGES[subdomain]
      : Index;

  return <PageComponent />;
};

export default SubdomainRoot;
