export async function resolveSearchParams<T>(
  searchParamsPromise: Promise<T> | undefined,
): Promise<T | undefined> {
  return searchParamsPromise ? await searchParamsPromise : undefined;
}
