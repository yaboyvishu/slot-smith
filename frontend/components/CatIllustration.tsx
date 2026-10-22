import Image from "next/image";

export default function CatIllustration({
  size,
}: {
  size: "hero" | "logo";
}) {
  const isHero = size === "hero";

  return (
    <div
      aria-hidden="true"
      className={
        isHero
          ? "pointer-events-none mx-auto flex min-h-72 w-full max-w-[34rem] items-center justify-center rounded-3xl border border-white/70 bg-brand-pink p-5 shadow-xl sm:min-h-80 sm:p-8"
          : "pointer-events-none flex w-8 shrink-0 items-center justify-center rounded-md bg-brand-pink p-1 shadow-sm sm:w-11 md:w-[52px]"
      }
    >
      <Image
        src="/images/undraw_cat_lqdj.svg"
        alt=""
        aria-hidden="true"
        width={888}
        height={342}
        unoptimized
        priority={isHero}
        loading={isHero ? "eager" : "lazy"}
        draggable={false}
        className={
          isHero
            ? "h-auto w-full max-w-[32rem] select-none"
            : "h-auto w-full select-none"
        }
      />
    </div>
  );
}
