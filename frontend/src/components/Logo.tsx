import logoImage from "../assets/logo.png";

interface LogoProps {
  size?: number;
}

export default function Logo({ size = 40 }: LogoProps) {
  return <img src={logoImage} alt="TCM logo" width={size} height={size} style={{ display: "block" }} />;
}
