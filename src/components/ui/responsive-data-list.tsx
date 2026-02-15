import { ReactNode } from "react";

export function ResponsiveDataList<T>({
  items,
  desktop,
  renderCard,
  empty,
}: {
  items: T[] | undefined | null;
  desktop: ReactNode;
  renderCard: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
}) {
  const list = items || [];

  if (list.length === 0) {
    return (
      <>
        <div className="hidden md:block">{desktop}</div>
        <div className="md:hidden">{empty ?? null}</div>
      </>
    );
  }

  return (
    <>
      <div className="hidden md:block">{desktop}</div>
      <div className="md:hidden space-y-3">
        {list.map((item, i) => renderCard(item, i))}
      </div>
    </>
  );
}

