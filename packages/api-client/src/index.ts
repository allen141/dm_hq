import type { components, paths } from "./generated/schema";

export type ApiSchema = paths;
export type User = components["schemas"]["UserOut"];
export type Campaign = components["schemas"]["CampaignOut"];

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function cookie(name: string): string {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((value) => value.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

export function createApiClient(fetcher: typeof fetch = (...args) => fetch(...args)) {
  let csrfToken = "";
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = init.method?.toUpperCase() ?? "GET";
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("X-CSRFToken", cookie("csrftoken") || csrfToken);
    }

    const response = await fetcher(path, {
      ...init,
      credentials: "include",
      headers,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      throw new ApiError(response.status, body?.detail ?? "The request could not be completed.");
    }
    return response.json() as Promise<T>;
  }

  return {
    csrf: async () => {
      const response = await request<{ csrfToken: string }>("/api/v1/auth/csrf");
      csrfToken = response.csrfToken;
      return response;
    },
    me: () => request<User>("/api/v1/auth/me"),
    login: (username: string, password: string) =>
      request<User>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    logout: () =>
      request<{ status: string }>("/api/v1/auth/logout", {
        method: "POST",
      }),
    campaigns: () => request<Campaign[]>("/api/v1/campaigns"),
    campaign: (campaignId: string) => request<Campaign>(`/api/v1/campaigns/${campaignId}`),
    createCampaign: (name: string) =>
      request<Campaign>("/api/v1/campaigns", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
  };
}
