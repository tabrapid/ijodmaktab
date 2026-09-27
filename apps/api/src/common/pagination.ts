export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const pageArgs = (query: { page: number; pageSize: number }) => ({
  skip: (query.page - 1) * query.pageSize,
  take: query.pageSize,
});

export const toPage = <T>(items: T[], total: number, query: { page: number; pageSize: number }): Page<T> => ({
  items,
  total,
  page: query.page,
  pageSize: query.pageSize,
});
