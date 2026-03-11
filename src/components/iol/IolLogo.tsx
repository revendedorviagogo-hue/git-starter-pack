import iolLogo from "@/assets/iol-logo.png";

interface IolLogoProps {
  size?: "sm" | "md" | "lg";
}

const IolLogo = ({ size = "md" }: IolLogoProps) => {
  const sizes = {
    sm: "h-8",
    md: "h-10",
    lg: "h-16",
  };
  return (
    <img
      src={iolLogo}
      alt="IOL invertironline"
      className={`${sizes[size]} w-auto object-contain`}
    />
  );
};

export default IolLogo;
