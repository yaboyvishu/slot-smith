import Image from "next/image";

export default function CatIllustration() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none flex w-8 shrink-0 items-center justify-center rounded-md bg-[#f8c8dc] p-1 shadow-sm sm:w-11 md:w-[52px]"
    >
      <Image
        src="/images/undraw_cat_lqdj.svg"
        alt=""
        aria-hidden="true"
        width={888}
        height={342}
        unoptimized
        loading="lazy"
        draggable={false}
        className="h-auto w-full select-none"
      />
    </div>
  );
}
