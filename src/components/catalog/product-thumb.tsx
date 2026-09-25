import { SafeImage } from "@/components/safe-image";
/**
 * Превью товара 1:1. Пока в БД нет image_url — рендерим серый плейсхолдер,
 * чтобы строки таблицы не «прыгали» по высоте. Появится фото — заменится само.
 */
export function ProductThumb({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <span
      className={`group grid aspect-square w-full place-items-center overflow-hidden rounded-[6px] bg-muted shadow-sm ${className}`}
    >
      {src ? (
        <SafeImage
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-110"
        />
      ) : (
        <svg
          viewBox="0 0 48 48"
          role="img"
          aria-label={`${alt} — фото готовится`}
          className="size-[62%] text-[#D1D5DB]"
          fill="none"
        >
          <path
            d="M24 5 41 14v20L24 43 7 34V14L24 5Z"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path d="M7 14l17 9 17-9M24 23v20" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
