interface IEmailIconProps {
  lightColor?: string;
  darkColor?: string;
  width?: number;
  height?: number;
  className?: string;
}

export default function EmailIcon({
  lightColor = "#000000",
  darkColor = "#FFFFFF",
  width = 20,
  height = 20,
  className = "",
}: IEmailIconProps) {
  return (
    <>
      <svg
        width={width}
        height={height}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`dark:hidden ${className}`}
        aria-hidden="true"
      >
        <rect
          x="2.5"
          y="4.5"
          width="19"
          height="15"
          rx="2.5"
          stroke={lightColor}
          strokeWidth="1.5"
        />
        <path
          d="M3 6.5L12 13L21 6.5"
          stroke={lightColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        width={width}
        height={height}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`hidden dark:block ${className}`}
        aria-hidden="true"
      >
        <rect
          x="2.5"
          y="4.5"
          width="19"
          height="15"
          rx="2.5"
          stroke={darkColor}
          strokeWidth="1.5"
        />
        <path
          d="M3 6.5L12 13L21 6.5"
          stroke={darkColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
}
