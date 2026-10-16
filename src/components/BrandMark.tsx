interface Props {
  size?: number;
  className?: string;
}

/** The InterviewVeil mark; the CSS `--logo` token picks the light- or dark-theme variant. */
export function BrandMark({ size = 16, className = "" }: Props) {
  return (
    <span
      role="img"
      aria-label="InterviewVeil"
      className={`inline-block shrink-0 bg-no-repeat bg-center bg-contain ${className}`}
      style={{ width: size, height: size, backgroundImage: "var(--logo)" }}
    />
  );
}
