import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface UsePaginationOptions {
  enableInfiniteScroll?: boolean;
}

export function usePagination(options: UsePaginationOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const mode = options.enableInfiniteScroll
    ? (searchParams.get("mode") ?? "pagination")
    : "pagination";

  const createQueryString = (params: Record<string, string | null>) => {
    const newSearchParams = new URLSearchParams(searchParams.toString());

    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });

    return newSearchParams.toString();
  };

  const handlePageChange = (newPage: number) => {
    router.push(
      `${pathname}?${createQueryString({
        page: newPage.toString(),
      })}`
    );
  };

  const handlePageSizeChange = (newLimit: number) => {
    router.push(
      `${pathname}?${createQueryString({
        page: "1",
        limit: newLimit.toString(),
      })}`
    );
  };

  const handleScrollModeToggle = options.enableInfiniteScroll
    ? () => {
        router.push(
          `${pathname}?${createQueryString({
            mode: mode === "pagination" ? "infinite" : "pagination",
            page: "1",
          })}`
        );
      }
    : undefined;

  return {
    page,
    limit,
    isInfiniteScroll: mode === "infinite",
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,
    onScrollModeToggle: handleScrollModeToggle,
  };
}
