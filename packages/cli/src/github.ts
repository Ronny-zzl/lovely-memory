/**
 * GitHub REST API の最小クライアント（Actions 上の GITHUB_TOKEN / GITHUB_REPOSITORY を使う）。
 */
export type GitHubIssue = { number: number; title: string; body: string | null; state: string };

export class GitHub {
  readonly repo: string;
  readonly #token: string;

  // パラメータプロパティは Node の型ストリップで動かないので使わない（erasableSyntaxOnly）
  constructor(token: string, repo: string) {
    this.#token = token;
    this.repo = repo;
  }

  static fromEnv(): GitHub | undefined {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    return token && repo ? new GitHub(token, repo) : undefined;
  }

  get owner(): string {
    return this.repo.split("/")[0]!;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; data: T }> {
    const res = await fetch(`https://api.github.com/repos/${this.repo}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.#token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body && { "Content-Type": "application/json" }),
      },
    });
    if (!res.ok && res.status !== 404) throw new Error(`GitHub API ${res.status} ${path}: ${await res.text()}`);
    return { status: res.status, data: res.status === 404 ? (undefined as T) : ((await res.json()) as T) };
  }

  /** ラベル付きの Issue を全件（open / closed とも）取得 */
  async listIssues(label: string): Promise<GitHubIssue[]> {
    const all: GitHubIssue[] = [];
    for (let page = 1; ; page++) {
      const { data } = await this.api<GitHubIssue[]>(`/issues?labels=${encodeURIComponent(label)}&state=all&per_page=100&page=${page}`);
      all.push(...data);
      if (data.length < 100) return all;
    }
  }

  async ensureLabel(name: string, color: string, description: string): Promise<void> {
    const { status } = await this.api(`/labels/${encodeURIComponent(name)}`);
    if (status === 404) {
      await this.api("/labels", { method: "POST", body: JSON.stringify({ name, color, description }) });
    }
  }

  async createIssue(issue: { title: string; body: string; labels: string[]; assignees?: string[] }): Promise<number> {
    const { data } = await this.api<{ number: number }>("/issues", { method: "POST", body: JSON.stringify(issue) });
    return data.number;
  }
}
