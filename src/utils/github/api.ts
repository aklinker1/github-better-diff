import { defineProxyService } from "@webext-core/proxy-service";
import { ofetch, $Fetch, FetchError } from "ofetch";
import { extensionStorage } from "../storage";
import {
  DiffEntry,
  DiffSummary,
  EncodedFile,
  PullRequest,
  RecalculateResult,
  User,
} from "./types";
import { createKeyValueCache } from "../cache";
import { HOUR } from "../time";
import { GitAttributes } from "../gitattributes";

class GithubApi {
  private static async getFetch(): Promise<$Fetch> {
    const headers: Record<string, string> = {
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
    };

    // A PAT is required for private repos
    // https://github.com/settings/tokens/new?description=Simple%20GitHub&20Diffs&scopes=repo
    const token = await extensionStorage.getItem("githubPat");
    if (token) headers.Authorization = `Bearer ${token}`;

    return ofetch.create({
      baseURL: "https://api.github.com",
      headers,
    });
  }

  cache = createKeyValueCache<RecalculateResult>("commit-hash-diffs");

  /**
   * Throws an error if the PAT is not valid
   */
  async getUser(): Promise<User> {
    const fetch = await GithubApi.getFetch();
    return await fetch<User>("/user");
  }

  async recalculateDiff(options: {
    repo: string;
    owner: string;
    pr: number;
  }): Promise<RecalculateResult> {
    const ref = await this.getPrCommit(options);
    const cached = await this.cache.get(ref);
    if (cached) {
      console.debug("[recalculateDiff] Using cached result");
      return cached;
    }

    // 10s sleep for testing loading UI
    // await sleep(10e3);

    const [gitAttributes, prFiles] = await Promise.all([
      this.getGitAttributes({
        owner: options.owner,
        repo: options.repo,
        ref,
      }),
      this.getPrFiles(options),
    ]);

    const include: DiffEntry[] = [];
    const exclude: DiffEntry[] = [];
    prFiles.forEach((diff) => {
      if (gitAttributes == null) {
        include.push(diff);
        return;
      }

      const evaluation = gitAttributes.evaluate(diff.filename);
      const isGenerated = !!evaluation.attributes["linguist-generated"];
      console.debug("Is generated?", diff.filename, isGenerated);
      console.debug("Evaluation:", evaluation);
      if (isGenerated) exclude.push(diff);
      else include.push(diff);
    });

    const result: RecalculateResult = {
      all: this.calculateDiffForFiles(prFiles),
      exclude: this.calculateDiffForFiles(exclude),
      include: this.calculateDiffForFiles(include),
    };
    await this.cache.set(ref, result, 2 * HOUR);
    return result;
  }
  /**
   * Returns a list of generated files that should be excluded from diff counts.
   *
   * Eventually, this will be based on your .gitattributes file.
   */
  private async getGitAttributes({
    ref,
    repo,
    owner,
  }: {
    ref: string;
    repo: string;
    owner: string;
  }): Promise<GitAttributes | undefined> {
    const fetch = await GithubApi.getFetch();

    try {
      const encodedFile = await fetch<EncodedFile>(
        `/repos/${owner}/${repo}/contents/.gitattributes`,
        {
          query: { ref },
        }
      );
      console.debug(encodedFile);
      const text = atob(encodedFile.content);
      const gitAttributes = new GitAttributes(text);
      console.debug("Git Attributes:");
      console.debug(gitAttributes.text);
      console.debug(gitAttributes.ast);
      return gitAttributes;
    } catch (err) {
      if (err instanceof FetchError && err.statusCode === 404) {
        console.debug("No .gitattributes file for this repo");
      } else {
        console.error("Unknown error while loading gitattributes:", err);
      }
      return undefined;
    }
  }

  /**
   * Get the commit sha the PR is on.
   */
  private async getPrCommit({
    repo,
    owner,
    pr,
  }: {
    repo: string;
    owner: string;
    pr: number;
  }): Promise<string> {
    const fetch = await GithubApi.getFetch();
    const fullPr = await fetch<PullRequest>(
      `/repos/${owner}/${repo}/pulls/${pr}`
    );
    console.debug("Full PR:", fullPr);
    return fullPr.head.sha;
  }

  /**
   * List all the files in a PR, paginating through to load all of them. Each file includes a count,
   * which will be used to recompute the diff.
   */
  private async getPrFiles({
    repo,
    owner,
    pr,
  }: {
    repo: string;
    owner: string;
    pr: number;
  }): Promise<DiffEntry[]> {
    const fetch = await GithubApi.getFetch();

    const results: DiffEntry[] = [];
    let pageResults: DiffEntry[] = [];
    let page = 1;
    const perPage = 100;

    do {
      console.debug("Fetching PR page:", page);
      pageResults = await fetch<DiffEntry[]>(
        `/repos/${owner}/${repo}/pulls/${pr}/files?page=${page}&per_page=${perPage}`
      );
      results.push(...pageResults);
      page++;
    } while (pageResults.length === perPage);

    console.debug("Found", results.length, "files");
    return results;
  }

  private calculateDiffForFiles(files: DiffEntry[]): DiffSummary {
    let changes = 0,
      additions = 0,
      deletions = 0;

    for (const file of files) {
      changes += file.changes;
      additions += file.additions;
      deletions += file.deletions;
    }

    return { changes, additions, deletions };
  }
}

export const [registerGithubApi, getGithubApi] = defineProxyService(
  "GithubApi",
  () => new GithubApi()
);
