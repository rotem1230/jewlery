export type ApiFieldError = {
  field: string;
  message: string;
};

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ApiFieldError[];
  code?: string;
};
