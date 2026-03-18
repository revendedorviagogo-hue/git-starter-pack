const IolIllustration = () => {
  return (
    <div className="relative hidden h-[360px] w-[420px] lg:block" aria-hidden="true">
      <div className="iol-art-hex absolute left-4 top-24 h-40 w-36" />

      <div className="absolute right-10 top-2 flex h-24 w-24 items-center justify-center rounded-full border-[10px] border-primary/45 bg-background">
        <div className="iol-art-grid absolute inset-0 rounded-full" />
        <div className="relative h-10 w-10 rounded-full bg-background" />
      </div>

      <div className="iol-card-shadow absolute right-8 top-24 h-[220px] w-[150px] rotate-[2deg] rounded-[24px] border-[6px] border-accent bg-background">
        <div className="absolute inset-[14px] rounded-[18px] border border-border/70 bg-secondary/30" />
        <div className="absolute bottom-0 left-1/2 h-[165px] w-[72px] -translate-x-1/2 rounded-t-[38px] bg-primary/50 rotate-[-12deg] origin-bottom" />
        <div className="absolute left-[52px] top-[84px] h-9 w-9 rounded-full border-[3px] border-primary/90 bg-transparent" />
        <div className="absolute left-[37px] top-[106px] h-[3px] w-12 rounded-full bg-primary/90 rotate-[22deg]" />
        <div className="absolute left-[54px] top-[94px] h-[52px] w-[3px] rounded-full bg-primary/90 rotate-[24deg]" />
        <div className="absolute left-[76px] top-[90px] h-[46px] w-[3px] rounded-full bg-primary/80 rotate-[12deg]" />
        <div className="absolute left-[90px] top-[95px] h-[38px] w-[3px] rounded-full bg-primary/75 rotate-[4deg]" />
      </div>
    </div>
  );
};

export default IolIllustration;
