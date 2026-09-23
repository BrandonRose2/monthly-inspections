// Starts the "Scrape monthly inspections" workflow on the self-hosted Mac
// runner. The portal cannot scrape by itself: the MyLoneWorkers session lives
// in the runner's browser profile.
//
// GITHUB_TOKEN: fine-grained token with "Actions: Read and write" on the repo.
export const GITHUB_DEFAULTS = {
  repository: "BrandonRose2/monthly-inspections",
  workflow: "scrape-inspections.yml",
  ref: "main",
};

export type DispatchInputs = {
  runId: number;
  startMonthKey: string;
  endMonthKey: string;
  only?: string[];
};

export class DispatchError extends Error {}

export async function dispatchScrape(inputs: DispatchInputs, fetchImpl: typeof fetch = fetch) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new DispatchError(
      "The portal can't start the scraper yet: GITHUB_TOKEN is not set on Railway. Add a GitHub token with Actions read/write access to this repo.",
    );
  }
  const repo = process.env.GITHUB_REPOSITORY || GITHUB_DEFAULTS.repository;
  const workflow = process.env.GITHUB_WORKFLOW_FILE || GITHUB_DEFAULTS.workflow;
  const ref = process.env.GITHUB_WORKFLOW_REF || GITHUB_DEFAULTS.ref;

  const res = await fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "monthly-inspections-portal",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        run_id: String(inputs.runId),
        start_month: inputs.startMonthKey,
        end_month: inputs.endMonthKey,
        only: (inputs.only ?? []).join(","),
        dry_run: false,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const hint =
      res.status === 401 ? " (the token is invalid or expired)"
      : res.status === 403 || res.status === 404 ? " (the token needs Actions read/write access to " + repo + ")"
      : res.status === 422 ? " (the workflow on GitHub is missing the run_id/start_month/end_month inputs — push the updated workflow file)"
      : "";
    throw new DispatchError(`GitHub refused to start the scraper: ${res.status}${hint}. ${text.slice(0, 200)}`.trim());
  }
}
