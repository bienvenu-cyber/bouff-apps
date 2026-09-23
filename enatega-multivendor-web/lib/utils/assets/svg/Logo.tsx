// Logo BOUFF — mot-clé typographique, couleur adaptée au thème.
import { useTheme } from "@/lib/providers/ThemeProvider";

const Logo = ({ fillColor = "#000000", darkmode = "#ffffffff" }) => {
  const { theme } = useTheme();
  const color = theme === "dark" ? darkmode : fillColor;

  return (
    <span
      className="inline-flex items-baseline gap-1 text-[22px] font-extrabold uppercase leading-none tracking-tight md:text-[26px]"
      style={{ color }}
    >
      BOUFF
      <span aria-hidden className="text-primary-color">
        .
      </span>
    </span>
  );
};

export default Logo;
