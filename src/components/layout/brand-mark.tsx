import Image from "next/image";

/** The Valiant Firm mark. Transparent background, so it works on light and dark themes. */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/valiant-icon.png"
      alt="Valiant Firm"
      width={size}
      height={size}
      priority
      unoptimized
      className={className}
    />
  );
}
