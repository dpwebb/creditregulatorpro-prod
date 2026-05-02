type RequestConfig = Omit<RequestInit, "body" | "method">;

class ApiError extends Error {
  public status: number;
  public data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

class ApiService {
  private async request<T>(
    method: string,
    url: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    const headers = new Headers(config?.headers);
    headers.set("Content-Type", "application/json");

    const token = localStorage.getItem("authToken");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          ...config,
          method,
          headers,
          body: data === undefined ? undefined : JSON.stringify(data),
        });

        const responseText = await response.text();
        const responseData = responseText ? JSON.parse(responseText) : null;

        if (!response.ok) {
          throw new ApiError("API call failed", response.status, responseData);
        }

        return responseData as T;
      } catch (error) {
        lastError = error;
        if (attempt === 3 || error instanceof ApiError) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
      }
    }

    throw new ApiError("Max retries reached", 500, lastError);
  }

  public get<T>(url: string, config?: RequestConfig): Promise<T> {
    return this.request<T>("GET", url, undefined, config);
  }

  public post<T>(url: string, data: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>("POST", url, data, config);
  }

  public put<T>(url: string, data: unknown, config?: RequestConfig): Promise<T> {
    return this.request<T>("PUT", url, data, config);
  }

  public delete<T>(url: string, config?: RequestConfig): Promise<T> {
    return this.request<T>("DELETE", url, undefined, config);
  }
}

export default new ApiService();
