// Logo BOUFF — image officielle de la marque.
const Logo = ({ height = 40 }: { height?: number }) => {
  return (
    <img
      src="/bouff-logo.jpg"
      alt="BOUFF"
      style={{ height, width: "auto" }}
      className="rounded-md object-contain"
    />
  );
};

export default Logo;
