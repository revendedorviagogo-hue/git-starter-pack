import logo from "@/assets/global66-logo.avif";

const Global66Logo = ({ size = 56 }: { size?: number }) => (
  <img
    src={logo}
    alt="Global66"
    style={{ height: size, width: "auto" }}
    className="object-contain"
  />
);

export default Global66Logo;
